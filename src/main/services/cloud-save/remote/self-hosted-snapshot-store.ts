import { randomBytes } from "node:crypto";

import type {
  CommitSnapshotRequest,
  CommitSnapshotResponse,
  GameShop,
  PrepareSnapshotFile,
  PrepareSnapshotRequest,
  PrepareSnapshotResponse,
  RemoteSnapshotSummary,
  RestoreDownloadUrlFile,
  RestoreManifestResponse,
  SnapshotFile,
  SnapshotVariant,
} from "@types";

/**
 * Minimal object storage used by the self-hosted Cloud Save backend. Paths are
 * POSIX-style and relative to the configured remote root.
 */
export interface RemoteObjectStore {
  readJson(path: string): Promise<unknown | null>;
  writeJson(path: string, value: unknown): Promise<void>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  /** HTTP URL the native addon can PUT to and GET from for a blob path. */
  blobUrl(path: string): string;
}

export interface StoredSnapshot {
  schemaVersion: 1;
  id: string;
  version: number;
  shop: GameShop;
  objectId: string;
  createdAt: string;
  updatedAt: string;
  aggregateHash: string;
  platform: PrepareSnapshotRequest["platform"];
  hostname?: string;
  customPathRawPaths: string[];
  variants: SnapshotVariant[];
  files: SnapshotFile[];
}

interface PendingSnapshot {
  request: PrepareSnapshotRequest;
  expiresAt: number;
}

/**
 * Error shaped like the Hydra API errors the sync pipeline already understands
 * (`status` + `code`), so retry and conflict policies keep working unchanged.
 */
export class SelfHostedCloudSaveError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
    this.name = "SelfHostedCloudSaveError";
  }
}

const PENDING_SNAPSHOT_TTL_MS = 60 * 60 * 1000;
const MAX_CONCURRENT_EXISTENCE_CHECKS = 8;

export const blobPath = (hash: string) => `blobs/${hash}`;

const encodeObjectId = (objectId: string) =>
  Buffer.from(objectId, "utf8").toString("hex");

export const snapshotDocumentPath = (shop: GameShop, objectId: string) =>
  `games/${shop}/${encodeObjectId(objectId)}.json`;

/**
 * Snapshot ids carry the game identity so a manifest can be resolved from the
 * id alone. Only `[A-Za-z0-9_-]` is used: the native addon turns the id into a
 * temp folder name and rejects anything else.
 */
export const buildSnapshotId = (shop: GameShop, objectId: string) =>
  `${shop}_${encodeObjectId(objectId)}_${randomBytes(8).toString("hex")}`;

export const parseSnapshotId = (snapshotId: string) => {
  const [shop, encodedObjectId, generation, ...rest] = snapshotId.split("_");
  if (
    rest.length > 0 ||
    !shop ||
    !generation ||
    !encodedObjectId ||
    !/^(?:[a-f0-9]{2})+$/.test(encodedObjectId)
  ) {
    throw new SelfHostedCloudSaveError(
      404,
      "game/cloud-save-snapshot-not-found"
    );
  }
  return {
    shop: shop as GameShop,
    objectId: Buffer.from(encodedObjectId, "hex").toString("utf8"),
  };
};

const toSummary = (snapshot: StoredSnapshot): RemoteSnapshotSummary => ({
  id: snapshot.id,
  version: snapshot.version,
  createdAt: snapshot.createdAt,
  updatedAt: snapshot.updatedAt,
  fileCount: snapshot.files.length,
  totalSizeBytes: snapshot.files.reduce(
    (total, file) => total + file.sizeBytes,
    0
  ),
  aggregateHash: snapshot.aggregateHash,
});

const isStoredSnapshot = (value: unknown): value is StoredSnapshot =>
  !!value &&
  typeof value === "object" &&
  (value as StoredSnapshot).schemaVersion === 1 &&
  typeof (value as StoredSnapshot).id === "string" &&
  Array.isArray((value as StoredSnapshot).files);

const mapLimited = async <T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>
) => {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await run(items[index]);
      }
    })
  );
  return results;
};

/**
 * Implements the Hydra Cloud Save snapshot protocol (prepare → upload blobs →
 * commit, manifest, download URLs, delete) on top of any object store.
 *
 * Layout on the remote:
 *   blobs/<sha256>                         content-addressed save file data
 *   games/<shop>/<hex(objectId)>.json      the game's single active snapshot
 */
export class SelfHostedSnapshotStore {
  private readonly pending = new Map<string, PendingSnapshot>();

  constructor(
    private readonly store: RemoteObjectStore,
    private readonly now: () => number = Date.now
  ) {}

  private async readSnapshot(shop: GameShop, objectId: string) {
    const value = await this.store.readJson(
      snapshotDocumentPath(shop, objectId)
    );
    if (value === null) return null;
    if (!isStoredSnapshot(value)) {
      throw new Error("Invalid self-hosted Cloud Save snapshot document");
    }
    return value;
  }

  private assertBaseVersion(
    current: StoredSnapshot | null,
    baseVersion: number
  ) {
    if ((current?.version ?? 0) !== baseVersion) {
      throw new SelfHostedCloudSaveError(
        409,
        "game/cloud-save-snapshot-version-conflict"
      );
    }
  }

  private prunePending() {
    const now = this.now();
    for (const [id, pending] of this.pending) {
      if (pending.expiresAt <= now) this.pending.delete(id);
    }
  }

  async listSnapshots(
    objectId: string,
    shop: GameShop
  ): Promise<RemoteSnapshotSummary[]> {
    const snapshot = await this.readSnapshot(shop, objectId);
    return snapshot ? [toSummary(snapshot)] : [];
  }

  async prepareSnapshot(
    request: PrepareSnapshotRequest
  ): Promise<PrepareSnapshotResponse> {
    this.prunePending();
    const current = await this.readSnapshot(request.shop, request.objectId);
    this.assertBaseVersion(current, request.baseVersion);

    const hashes = [...new Set(request.files.map((file) => file.hash))];
    const existing = new Set(
      (
        await mapLimited(
          hashes,
          MAX_CONCURRENT_EXISTENCE_CHECKS,
          async (hash) =>
            [hash, await this.store.exists(blobPath(hash))] as const
        )
      ).flatMap(([hash, exists]) => (exists ? [hash] : []))
    );

    const files: PrepareSnapshotFile[] = request.files.map((file) => {
      const identity = {
        variantId: file.variantId,
        rawPath: file.rawPath,
        relativePath: file.relativePath,
      };
      if (existing.has(file.hash)) return { ...identity, status: "skip" };
      return {
        ...identity,
        status: "upload",
        uploadUrl: this.store.blobUrl(blobPath(file.hash)),
        requiredHeaders: {
          "Content-Length": String(file.sizeBytes),
          "x-amz-checksum-sha256": Buffer.from(file.hash, "hex").toString(
            "base64"
          ),
        },
      };
    });

    const pendingSnapshotId = randomBytes(16).toString("hex");
    this.pending.set(pendingSnapshotId, {
      request,
      expiresAt: this.now() + PENDING_SNAPSHOT_TTL_MS,
    });

    return { pendingSnapshotId, snapshotHash: request.snapshotHash, files };
  }

  async commitSnapshot({
    pendingSnapshotId,
  }: CommitSnapshotRequest): Promise<CommitSnapshotResponse> {
    this.prunePending();
    const pending = this.pending.get(pendingSnapshotId);
    if (!pending) {
      throw new SelfHostedCloudSaveError(
        404,
        "game/cloud-save-pending-snapshot-not-found"
      );
    }
    const { request } = pending;

    const missing = await mapLimited(
      [...new Set(request.files.map((file) => file.hash))],
      MAX_CONCURRENT_EXISTENCE_CHECKS,
      async (hash) => !(await this.store.exists(blobPath(hash)))
    );
    if (missing.some(Boolean)) {
      throw new SelfHostedCloudSaveError(
        409,
        "game/cloud-save-pending-snapshot-incomplete"
      );
    }

    const current = await this.readSnapshot(request.shop, request.objectId);
    this.assertBaseVersion(current, request.baseVersion);

    const timestamp = new Date(this.now()).toISOString();
    const snapshot: StoredSnapshot = {
      schemaVersion: 1,
      id: current?.id ?? buildSnapshotId(request.shop, request.objectId),
      version: request.baseVersion + 1,
      shop: request.shop,
      objectId: request.objectId,
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
      aggregateHash: request.snapshotHash,
      platform: request.platform,
      ...(request.hostname ? { hostname: request.hostname } : {}),
      customPathRawPaths: request.customPathRawPaths,
      variants: request.variants,
      files: request.files,
    };
    await this.store.writeJson(
      snapshotDocumentPath(request.shop, request.objectId),
      snapshot
    );
    this.pending.delete(pendingSnapshotId);

    const summary = toSummary(snapshot);
    return {
      snapshotId: summary.id,
      version: summary.version,
      fileCount: summary.fileCount,
      totalSizeBytes: summary.totalSizeBytes,
      aggregateHash: summary.aggregateHash,
    };
  }

  private async readSnapshotById(snapshotId: string) {
    const { shop, objectId } = parseSnapshotId(snapshotId);
    const snapshot = await this.readSnapshot(shop, objectId);
    if (!snapshot || snapshot.id !== snapshotId) {
      throw new SelfHostedCloudSaveError(
        404,
        "game/cloud-save-snapshot-not-found"
      );
    }
    return snapshot;
  }

  async getRestoreManifest(
    snapshotId: string
  ): Promise<RestoreManifestResponse> {
    const snapshot = await this.readSnapshotById(snapshotId);
    return {
      snapshot: {
        id: snapshot.id,
        version: snapshot.version,
        shop: snapshot.shop,
        objectId: snapshot.objectId,
      },
      customPathRawPaths: snapshot.customPathRawPaths,
      variants: snapshot.variants,
      files: snapshot.files,
    };
  }

  async getSnapshotDownloadUrls(
    snapshotId: string
  ): Promise<RestoreDownloadUrlFile[]> {
    const snapshot = await this.readSnapshotById(snapshotId);
    return snapshot.files.map((file) => ({
      ...file,
      downloadUrl: this.store.blobUrl(blobPath(file.hash)),
    }));
  }

  /**
   * Removes the game's active snapshot. Blobs are content-addressed and may be
   * shared with other games, so they are left in place.
   */
  async deleteSnapshots(objectId: string, shop: GameShop) {
    await this.store.delete(snapshotDocumentPath(shop, objectId));
  }
}
