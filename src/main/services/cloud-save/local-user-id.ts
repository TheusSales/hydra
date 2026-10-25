import { db, levelKeys } from "@main/level";
import type { User } from "@types";

import { CloudSaveRemotes } from "./remote/cloud-save-remote";

/**
 * Self-hosted saves need no Hydra account, and their snapshots live on a
 * different remote than Hydra Cloud's, so their local state (anchors, custom
 * path bindings, pending deletions…) gets a scope of its own.
 */
export const SELF_HOSTED_CLOUD_SAVE_USER_ID = "self-hosted";

export const getCloudSaveLocalUserId = async (missingUserError: string) => {
  if (CloudSaveRemotes.isSelfHosted()) return SELF_HOSTED_CLOUD_SAVE_USER_ID;
  const user = await db.get<string, User>(levelKeys.user, {
    valueEncoding: "json",
  });
  if (!user?.id) throw new Error(missingUserError);
  return user.id;
};
