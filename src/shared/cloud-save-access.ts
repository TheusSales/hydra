export type CloudSaveAccessAction = "sign-in" | "paywall" | "open";

export const getCloudSaveAccessAction = (
  isAuthenticated: boolean,
  hasActiveSubscription: boolean,
  isSelfHosted = false
): CloudSaveAccessAction => {
  // Self-hosted saves go to the user's own remote: no Hydra account needed.
  if (isSelfHosted) return "open";
  if (!isAuthenticated) return "sign-in";
  if (!hasActiveSubscription) return "paywall";
  return "open";
};

export const isSelfHostedCloudSaveConfigured = (
  userPreferences:
    | {
        cloudSaveBackend?: "hydra" | "rclone";
        rcloneCloudSaveRemote?: string | null;
      }
    | null
    | undefined
) =>
  userPreferences?.cloudSaveBackend === "rclone" &&
  Boolean(userPreferences.rcloneCloudSaveRemote?.trim());
