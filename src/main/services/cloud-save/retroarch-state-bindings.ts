import path from "node:path";

import {
  cloudSaveRetroArchBindingsSublevel,
  type RetroArchBindingRecord,
} from "@main/level";
import type { Game } from "@types";
import { getCloudSaveLocalUserId } from "./local-user-id.js";

export {
  legacyRetroArchStateId,
  remoteRetroArchStateId,
  reconcileRetroArchStateBindings,
  retroArchStateCloudIdentity,
  type RetroArchObservedState,
} from "./retroarch-state-binding-policy.js";

const bindingKey = async (game: Game) => {
  return JSON.stringify([
    await getCloudSaveLocalUserId("cloud_save_user_required"),
    game.shop,
    game.objectId,
    "retroarch-v2",
  ]);
};

export const loadRetroArchBindings = async (
  game: Game
): Promise<RetroArchBindingRecord> => {
  const stored = await cloudSaveRetroArchBindingsSublevel.get(
    await bindingKey(game)
  );
  if (
    stored?.version === 1 &&
    Array.isArray(stored.states) &&
    stored.states.every(
      (state) =>
        /^[a-f0-9]{64}$/.test(state.id) &&
        path.isAbsolute(state.path) &&
        /^\.state(?:\d+|\.auto)?$/.test(state.slot) &&
        /^[a-f0-9]{64}$/.test(state.hash)
    )
  ) {
    return stored;
  }
  return { version: 1, activeRomPath: null, states: [] };
};

export const saveRetroArchBindings = async (
  game: Game,
  record: RetroArchBindingRecord
) => {
  await cloudSaveRetroArchBindingsSublevel.put(await bindingKey(game), record);
};
