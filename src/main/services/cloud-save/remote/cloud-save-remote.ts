import { HydraApi } from "@main/services/hydra-api";
import { logger } from "@main/services/logger";
import { isSelfHostedCloudSaveConfigured } from "@shared";
import type {
  CommitSnapshotRequest,
  GameShop,
  PrepareSnapshotRequest,
  UserPreferences,
} from "@types";

import { buildDeleteGameCloudSaveSnapshotsUrl } from "../delete-game-cloud-save-data-policy";
import { RcloneWebdavServer } from "./rclone-webdav-server";
import { SelfHostedSnapshotStore } from "./self-hosted-snapshot-store";

/**
 * Where Cloud Save snapshots live. Responses are returned unvalidated: callers
 * keep running the same contract validators for every backend.
 */
export interface CloudSaveRemote {
  readonly kind: "hydra" | "rclone";
  listSnapshots(objectId: string, shop: GameShop): Promise<unknown>;
  prepareSnapshot(request: PrepareSnapshotRequest): Promise<unknown>;
  commitSnapshot(request: CommitSnapshotRequest): Promise<unknown>;
  getRestoreManifest(snapshotId: string): Promise<unknown>;
  getSnapshotDownloadUrls(snapshotId: string): Promise<unknown>;
  deleteSnapshots(objectId: string, shop: GameShop): Promise<void>;
}

const hydraOptions = { needsAuth: true, needsSubscription: true } as const;

const hydraCloudSaveRemote: CloudSaveRemote = {
  kind: "hydra",
  listSnapshots: (objectId, shop) =>
    HydraApi.get<unknown>(
      "/profile/cloud-saves/snapshots",
      { shop, objectId },
      hydraOptions
    ),
  prepareSnapshot: (request) =>
    HydraApi.post<unknown>(
      "/profile/cloud-saves/prepare-snapshot",
      request,
      hydraOptions
    ),
  commitSnapshot: (request) =>
    HydraApi.post<unknown>(
      "/profile/cloud-saves/commit-snapshot",
      request,
      hydraOptions
    ),
  getRestoreManifest: (snapshotId) =>
    HydraApi.get<unknown>(
      "/profile/cloud-saves/snapshot-restore-manifest",
      { snapshotId },
      hydraOptions
    ),
  getSnapshotDownloadUrls: (snapshotId) =>
    HydraApi.get<unknown>(
      "/profile/cloud-saves/snapshot-download-urls",
      { snapshotId },
      hydraOptions
    ),
  deleteSnapshots: (objectId, shop) =>
    HydraApi.delete<void>(
      buildDeleteGameCloudSaveSnapshotsUrl(objectId, shop),
      hydraOptions
    ),
};

const createRcloneCloudSaveRemote = (
  server: RcloneWebdavServer
): CloudSaveRemote => {
  const store = new SelfHostedSnapshotStore(server);
  return {
    kind: "rclone",
    listSnapshots: (objectId, shop) => store.listSnapshots(objectId, shop),
    prepareSnapshot: (request) => store.prepareSnapshot(request),
    commitSnapshot: (request) => store.commitSnapshot(request),
    getRestoreManifest: (snapshotId) => store.getRestoreManifest(snapshotId),
    getSnapshotDownloadUrls: (snapshotId) =>
      store.getSnapshotDownloadUrls(snapshotId),
    deleteSnapshots: (objectId, shop) => store.deleteSnapshots(objectId, shop),
  };
};

export class CloudSaveRemotes {
  private static rclone: {
    server: RcloneWebdavServer;
    remote: CloudSaveRemote;
  } | null = null;

  /** Mirrors the stored preferences; call on startup and on every update. */
  public static syncUserPreferences(userPreferences: UserPreferences | null) {
    const remote = userPreferences?.rcloneCloudSaveRemote?.trim();
    const binaryPath = userPreferences?.rcloneBinaryPath?.trim() || null;
    const enabled = isSelfHostedCloudSaveConfigured(userPreferences);

    const current = this.rclone?.server.config;
    if (
      enabled &&
      current &&
      current.remote === remote &&
      (current.binaryPath ?? null) === binaryPath
    ) {
      return;
    }

    this.rclone?.server.stop();
    this.rclone = null;
    if (!enabled || !remote) return;

    const server = new RcloneWebdavServer({ remote, binaryPath }, (message) =>
      logger.log(message)
    );
    this.rclone = { server, remote: createRcloneCloudSaveRemote(server) };
  }

  /** True when saves go to the user's own rclone remote instead of Hydra Cloud. */
  public static isSelfHosted() {
    return this.rclone !== null;
  }

  public static current(): CloudSaveRemote {
    return this.rclone?.remote ?? hydraCloudSaveRemote;
  }

  /**
   * Starts a throwaway rclone server; startup creates the remote's `blobs/`
   * and `games/` folders, so success proves the remote is reachable and
   * writable.
   */
  public static async testSelfHostedConnection(config: {
    remote: string;
    binaryPath?: string | null;
  }) {
    const server = new RcloneWebdavServer(config);
    try {
      await server.ensureStarted();
    } finally {
      server.stop();
    }
  }

  public static stop() {
    this.rclone?.server.stop();
  }
}
