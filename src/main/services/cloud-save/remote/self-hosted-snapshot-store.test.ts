import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PrepareSnapshotRequest } from "@types";

// @ts-ignore The Node ESM test runner requires the source extension.
import {
  validateRemoteSnapshotSummary,
  validateRestoreDownloadUrls,
  validateRestoreManifest,
} from "../cloud-save-contract.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import { validatePrepareResponse } from "../upload-local-game-snapshot-helpers.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import {
  shouldReprepareCloudSaveSnapshot,
  shouldRetryCloudSaveConflict,
} from "../snapshot-retry-policy.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import {
  blobPath,
  parseSnapshotId,
  SelfHostedCloudSaveError,
  SelfHostedSnapshotStore,
  type RemoteObjectStore,
} from "./self-hosted-snapshot-store.ts";

class MemoryStore implements RemoteObjectStore {
  readonly objects = new Map<string, string>();

  async readJson(path: string) {
    const value = this.objects.get(path);
    return value === undefined ? null : (JSON.parse(value) as unknown);
  }

  async writeJson(path: string, value: unknown) {
    this.objects.set(path, JSON.stringify(value));
  }

  async exists(path: string) {
    return this.objects.has(path);
  }

  async delete(path: string) {
    this.objects.delete(path);
  }

  blobUrl(path: string) {
    return `http://127.0.0.1:1234/token/${path}`;
  }

  upload(hash: string) {
    this.objects.set(blobPath(hash), "blob");
  }
}

const variantId = "a".repeat(64);
const hashA = "b".repeat(64);
const hashB = "c".repeat(64);
const aggregate = "d".repeat(64);

const request = (
  overrides: Partial<PrepareSnapshotRequest> = {}
): PrepareSnapshotRequest => ({
  shop: "steam",
  objectId: "1234",
  platform: "linux",
  hostname: "desktop",
  snapshotHash: aggregate,
  baseVersion: 0,
  customPathRawPaths: [],
  variants: [{ variantId, kind: "default" }],
  files: [
    {
      variantId,
      rawPath: "<home>/saves",
      relativePath: "slot1.sav",
      hash: hashA,
      sizeBytes: 10,
      lastModifiedAt: "2026-10-23T00:00:00.000Z",
    },
    {
      variantId,
      rawPath: "<home>/saves",
      relativePath: "slot2.sav",
      hash: hashB,
      sizeBytes: 20,
      lastModifiedAt: "2026-10-23T00:00:00.000Z",
    },
  ],
  ...overrides,
});

const commitNew = async (
  store: SelfHostedSnapshotStore,
  memory: MemoryStore,
  overrides: Partial<PrepareSnapshotRequest> = {}
) => {
  const prepared = await store.prepareSnapshot(request(overrides));
  for (const file of request(overrides).files) memory.upload(file.hash);
  return store.commitSnapshot({
    pendingSnapshotId: prepared.pendingSnapshotId,
  });
};

describe("self-hosted cloud save snapshot store", () => {
  it("prepares uploads that pass the Hydra prepare contract", async () => {
    const memory = new MemoryStore();
    memory.upload(hashA);
    const store = new SelfHostedSnapshotStore(memory);

    const response = validatePrepareResponse(
      await store.prepareSnapshot(request())
    );

    assert.equal(response.snapshotHash, aggregate);
    assert.deepEqual(
      response.files.map((file) => file.status),
      ["skip", "upload"]
    );
    const upload = response.files[1];
    assert.ok(upload.status === "upload");
    assert.equal(upload.requiredHeaders["Content-Length"], "20");
    assert.equal(
      upload.requiredHeaders["x-amz-checksum-sha256"],
      Buffer.from(hashB, "hex").toString("base64")
    );
    assert.equal(upload.uploadUrl, memory.blobUrl(blobPath(hashB)));
  });

  it("commits, lists and restores snapshots through the Hydra contracts", async () => {
    const memory = new MemoryStore();
    const store = new SelfHostedSnapshotStore(memory);

    const committed = await commitNew(store, memory);
    assert.equal(committed.version, 1);
    assert.equal(committed.fileCount, 2);
    assert.equal(committed.totalSizeBytes, 30);

    const [summary] = await store.listSnapshots("1234", "steam");
    validateRemoteSnapshotSummary(summary);
    assert.equal(summary.id, committed.snapshotId);

    const manifest = validateRestoreManifest(
      await store.getRestoreManifest(committed.snapshotId)
    );
    assert.deepEqual(manifest.snapshot, {
      id: committed.snapshotId,
      version: 1,
      shop: "steam",
      objectId: "1234",
    });
    assert.equal(manifest.files.length, 2);

    const urls = validateRestoreDownloadUrls(
      await store.getSnapshotDownloadUrls(committed.snapshotId)
    );
    assert.deepEqual(
      urls.map((file) => file.downloadUrl),
      [memory.blobUrl(blobPath(hashA)), memory.blobUrl(blobPath(hashB))]
    );
  });

  it("keeps the snapshot id stable across versions", async () => {
    const memory = new MemoryStore();
    const store = new SelfHostedSnapshotStore(memory);

    const first = await commitNew(store, memory);
    const second = await commitNew(store, memory, { baseVersion: 1 });

    assert.equal(second.snapshotId, first.snapshotId);
    assert.equal(second.version, 2);
  });

  it("rejects stale base versions as a retryable conflict", async () => {
    const memory = new MemoryStore();
    const store = new SelfHostedSnapshotStore(memory);
    await commitNew(store, memory);

    await assert.rejects(
      store.prepareSnapshot(request({ baseVersion: 0 })),
      (error: unknown) =>
        error instanceof SelfHostedCloudSaveError &&
        error.status === 409 &&
        shouldRetryCloudSaveConflict(error, 0)
    );
  });

  it("detects a concurrent commit between prepare and commit", async () => {
    const memory = new MemoryStore();
    const store = new SelfHostedSnapshotStore(memory);
    const prepared = await store.prepareSnapshot(request());
    await commitNew(store, memory);

    await assert.rejects(
      store.commitSnapshot({ pendingSnapshotId: prepared.pendingSnapshotId }),
      (error: unknown) =>
        error instanceof SelfHostedCloudSaveError && error.status === 409
    );
  });

  it("asks for a re-prepare when blobs are missing or the pending id is unknown", async () => {
    const memory = new MemoryStore();
    const store = new SelfHostedSnapshotStore(memory);
    const prepared = await store.prepareSnapshot(request());

    await assert.rejects(
      store.commitSnapshot({ pendingSnapshotId: prepared.pendingSnapshotId }),
      (error: unknown) => shouldReprepareCloudSaveSnapshot(error)
    );
    await assert.rejects(
      store.commitSnapshot({ pendingSnapshotId: "unknown" }),
      (error: unknown) => shouldReprepareCloudSaveSnapshot(error)
    );
  });

  it("expires pending snapshots", async () => {
    const memory = new MemoryStore();
    let now = 0;
    const store = new SelfHostedSnapshotStore(memory, () => now);
    const prepared = await store.prepareSnapshot(request());
    for (const file of request().files) memory.upload(file.hash);
    now += 2 * 60 * 60 * 1000;

    await assert.rejects(
      store.commitSnapshot({ pendingSnapshotId: prepared.pendingSnapshotId }),
      (error: unknown) => shouldReprepareCloudSaveSnapshot(error)
    );
  });

  it("deletes only the snapshot document and keeps shared blobs", async () => {
    const memory = new MemoryStore();
    const store = new SelfHostedSnapshotStore(memory);
    await commitNew(store, memory);

    await store.deleteSnapshots("1234", "steam");

    assert.deepEqual(await store.listSnapshots("1234", "steam"), []);
    assert.equal(await memory.exists(blobPath(hashA)), true);
  });

  it("encodes snapshot ids with native-addon-safe characters only", async () => {
    const memory = new MemoryStore();
    const store = new SelfHostedSnapshotStore(memory);
    const { snapshotId } = await commitNew(store, memory, {
      shop: "launchbox",
      objectId: "God of War III: Remastered/ü",
    });

    assert.match(snapshotId, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(parseSnapshotId(snapshotId), {
      shop: "launchbox",
      objectId: "God of War III: Remastered/ü",
    });
    assert.throws(() => parseSnapshotId("steam_zz_1"));
  });
});
