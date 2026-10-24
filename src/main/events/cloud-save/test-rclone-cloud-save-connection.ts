import { CloudSaveRemotes } from "@main/services/cloud-save/remote/cloud-save-remote";

import { registerEvent } from "../register-event";

registerEvent(
  "testRcloneCloudSaveConnection",
  async (
    _event: Electron.IpcMainInvokeEvent,
    remote: string,
    binaryPath: string | null
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      await CloudSaveRemotes.testSelfHostedConnection({
        remote: remote.trim(),
        binaryPath,
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);
