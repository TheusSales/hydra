import { PcPorts } from "@main/services/ports/pc-ports";
import { logger } from "@main/services/logger";
import { WindowManager } from "@main/services/window-manager";

import { registerEvent } from "../register-event";
import "./pc-release-updates";

type PcPortResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { value: T }))
  | { ok: false; error: string };

const toError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

registerEvent("listPcPorts", () => PcPorts.list());

registerEvent(
  "installPcPort",
  async (
    _event: Electron.IpcMainInvokeEvent,
    portId: string
  ): Promise<PcPortResult<string>> => {
    try {
      const version = await PcPorts.install(portId, (progress) =>
        WindowManager.sendToAppWindows("on-pc-port-install-progress", progress)
      );
      return { ok: true, value: version };
    } catch (error) {
      logger.error(`[PC ports] install ${portId} failed`, error);
      return { ok: false, error: toError(error) };
    }
  }
);

registerEvent(
  "configurePcPort",
  async (
    _event: Electron.IpcMainInvokeEvent,
    portId: string,
    gameDir: string,
    updateDir: string | null
  ): Promise<PcPortResult> => {
    try {
      await PcPorts.configure(portId, gameDir, updateDir || null);
      return { ok: true };
    } catch (error) {
      logger.error(`[PC ports] configure ${portId} failed`, error);
      return { ok: false, error: toError(error) };
    }
  }
);
