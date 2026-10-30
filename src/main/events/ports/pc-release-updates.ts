import { logger } from "@main/services/logger";
import { listPcReleaseCatalog } from "@main/services/pc-release-catalog";
import {
  getPcReleaseUpdateStatus,
  restorePcReleaseBackup,
  updatePcRelease,
} from "@main/services/pc-release-updates";
import type { GameShop } from "@types";
import { registerEvent } from "../register-event";

const toError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

registerEvent(
  "getPcReleaseUpdateStatus",
  (
    _event: Electron.IpcMainInvokeEvent,
    shop: GameShop,
    objectId: string,
    force?: boolean
  ) => getPcReleaseUpdateStatus(shop, objectId, force ?? false)
);

registerEvent(
  "updatePcRelease",
  async (
    _event: Electron.IpcMainInvokeEvent,
    shop: GameShop,
    objectId: string
  ) => {
    try {
      return {
        ok: true as const,
        value: await updatePcRelease(shop, objectId),
      };
    } catch (error) {
      logger.error(`[PC releases] update ${shop}:${objectId} failed`, error);
      return { ok: false as const, error: toError(error) };
    }
  }
);

registerEvent(
  "restorePcReleaseBackup",
  async (
    _event: Electron.IpcMainInvokeEvent,
    shop: GameShop,
    objectId: string
  ) => {
    try {
      await restorePcReleaseBackup(shop, objectId);
      return { ok: true as const };
    } catch (error) {
      logger.error(`[PC releases] restore ${shop}:${objectId} failed`, error);
      return { ok: false as const, error: toError(error) };
    }
  }
);

registerEvent("listPcReleaseCatalog", () => listPcReleaseCatalog());
