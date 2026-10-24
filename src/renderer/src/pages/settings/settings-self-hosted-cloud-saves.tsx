import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, CheckboxField, TextField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useToast } from "@renderer/hooks";
import type { UserPreferences } from "@types";

import "./settings-self-hosted-cloud-saves.scss";

const formFromPreferences = (userPreferences: UserPreferences | null) => ({
  enabled: userPreferences?.cloudSaveBackend === "rclone",
  remote: userPreferences?.rcloneCloudSaveRemote ?? "",
  binaryPath: userPreferences?.rcloneBinaryPath ?? "",
});

export function SettingsSelfHostedCloudSaves() {
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const { updateUserPreferences } = useContext(settingsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const { t } = useTranslation("settings");

  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState(() => formFromPreferences(userPreferences));

  useEffect(() => {
    if (userPreferences) setForm(formFromPreferences(userPreferences));
  }, [userPreferences]);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (
    event
  ) => {
    event.preventDefault();
    const remote = form.remote.trim();
    const binaryPath = form.binaryPath.trim() || null;
    setIsLoading(true);

    try {
      const result = await window.electron.testRcloneCloudSaveConnection(
        remote,
        binaryPath
      );
      if (!result.ok) {
        showErrorToast(
          result.error.includes("cloud_save_rclone_not_found")
            ? t("self_hosted_cloud_saves_rclone_not_found")
            : t("self_hosted_cloud_saves_connection_failed"),
          result.error.includes("cloud_save_rclone_not_found")
            ? undefined
            : result.error
        );
        return;
      }

      await updateUserPreferences({
        cloudSaveBackend: "rclone",
        rcloneCloudSaveRemote: remote,
        rcloneBinaryPath: binaryPath,
      });
      showSuccessToast(t("self_hosted_cloud_saves_connected", { remote }));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleEnabled = () => {
    const enabled = !form.enabled;
    setForm((previous) => ({ ...previous, enabled }));
    if (!enabled) updateUserPreferences({ cloudSaveBackend: "hydra" });
  };

  return (
    <form
      className="settings-self-hosted-cloud-saves__form"
      onSubmit={handleSubmit}
    >
      <p className="settings-self-hosted-cloud-saves__description">
        {t("self_hosted_cloud_saves_description")}
      </p>

      <CheckboxField
        label={t("enable_self_hosted_cloud_saves")}
        checked={form.enabled}
        onChange={toggleEnabled}
      />

      {form.enabled && (
        <>
          <TextField
            label={t("rclone_remote")}
            value={form.remote}
            onChange={(event) =>
              setForm({ ...form, remote: event.target.value })
            }
            placeholder="vps:hydra-saves"
            hint={t("rclone_remote_hint")}
          />

          <TextField
            label={t("rclone_binary_path")}
            value={form.binaryPath}
            onChange={(event) =>
              setForm({ ...form, binaryPath: event.target.value })
            }
            placeholder="rclone"
            hint={t("rclone_binary_path_hint")}
          />

          <Button
            type="submit"
            className="settings-self-hosted-cloud-saves__submit-button"
            disabled={!form.remote.trim() || isLoading}
          >
            {t("test_and_save")}
          </Button>
        </>
      )}
    </form>
  );
}
