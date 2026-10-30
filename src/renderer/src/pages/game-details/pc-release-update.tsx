import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  GameShop,
  PcReleaseUpdateProgress,
  PcReleaseUpdateStatus,
} from "@types";
import { useToast } from "@renderer/hooks";

import "./pc-release-update.scss";

const KNOWN_ERRORS = new Set([
  "pc_release_game_running",
  "pc_release_checksum_mismatch",
  "pc_release_download_blocked",
  "pc_release_executable_not_found",
  "pc_release_install_failed",
  "pc_release_no_backup",
  "pc_release_update_in_progress",
]);

const percent = (progress: PcReleaseUpdateProgress) =>
  progress.totalBytes
    ? Math.min(
        100,
        Math.round((progress.receivedBytes / progress.totalBytes) * 100)
      )
    : null;

export interface PcReleaseUpdateProps {
  shop: GameShop;
  objectId: string;
  title: string;
}

/** Update button for recomps and ports whose GitHub releases Hydra trusts. */
export function PcReleaseUpdate({
  shop,
  objectId,
  title,
}: Readonly<PcReleaseUpdateProps>) {
  const { t } = useTranslation("game_details");
  const { showSuccessToast, showErrorToast } = useToast();
  const [status, setStatus] = useState<PcReleaseUpdateStatus | null>(null);
  const [progress, setProgress] = useState<PcReleaseUpdateProgress | null>(
    null
  );
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(
    (force = false) =>
      window.electron
        .getPcReleaseUpdateStatus(shop, objectId, force)
        .then(setStatus)
        .catch(() => setStatus(null)),
    [shop, objectId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () =>
      window.electron.onPcReleaseUpdateProgress((payload) => {
        if (payload.shop === shop && payload.objectId === objectId) {
          setProgress(payload);
        }
      }),
    [shop, objectId]
  );

  const showError = (error: string) =>
    showErrorToast(
      t(KNOWN_ERRORS.has(error) ? error : "pc_release_update_failed")
    );

  const update = async () => {
    setIsBusy(true);
    setProgress(null);
    const result = await window.electron.updatePcRelease(shop, objectId);
    setIsBusy(false);
    setProgress(null);
    if (result.ok) {
      showSuccessToast(
        t("pc_release_updated", { title, version: result.value })
      );
    } else {
      showError(result.error);
    }
    await load();
  };

  const restore = async () => {
    setIsBusy(true);
    const result = await window.electron.restorePcReleaseBackup(shop, objectId);
    setIsBusy(false);
    if (result.ok) showSuccessToast(t("pc_release_restored"));
    else showError(result.error);
    await load();
  };

  if (!status?.latestVersion) return null;

  const hasUpdate = status.canUpdate && status.updateAvailable;

  const busyLabel = () => {
    if (!progress) return t("pc_release_updating");
    if (progress.phase !== "downloading") {
      return t(`pc_release_phase_${progress.phase}`);
    }
    const value = percent(progress);
    return value === null
      ? t("pc_release_phase_downloading")
      : t("pc_release_downloading_percent", { percent: value });
  };

  return (
    <div className="pc-release-update">
      {hasUpdate ? (
        <span className="pc-release-update__chip pc-release-update__chip--available">
          {status.installedVersion
            ? t("pc_release_update_available", {
                version: status.latestVersion,
              })
            : t("pc_release_latest_version", { version: status.latestVersion })}
        </span>
      ) : (
        status.installedVersion && (
          <span className="pc-release-update__chip">
            {t("pc_release_up_to_date", { version: status.installedVersion })}
          </span>
        )
      )}

      {hasUpdate && (
        <button
          type="button"
          className="pc-release-update__button"
          onClick={update}
          disabled={isBusy}
          title={t("pc_release_update_hint", {
            repository: status.repository,
          })}
        >
          {isBusy
            ? busyLabel()
            : status.installedVersion
              ? t("pc_release_update")
              : t("pc_release_update_to", { version: status.latestVersion })}
        </button>
      )}

      {status.hasBackup && !isBusy && (
        <button
          type="button"
          className="pc-release-update__link"
          onClick={restore}
        >
          {t("pc_release_restore")}
        </button>
      )}
    </div>
  );
}
