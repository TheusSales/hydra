import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LinkExternalIcon } from "@primer/octicons-react";

import { Button, Link, TextField } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import type { PcPortInstallProgress, PcPortSummary } from "@types";

import "./settings-context-pc-ports.scss";

const KNOWN_ERRORS = new Set([
  "pc_port_game_dir_missing_files",
  "pc_port_game_dir_unsupported_title",
  "pc_port_update_dir_same_as_game",
  "pc_port_update_dir_missing_files",
  "pc_port_update_dir_title_mismatch",
  "pc_port_checksum_mismatch",
  "pc_port_no_build_for_platform",
  "pc_port_not_installed",
]);

const splitError = (error: string) => {
  const [code, ...detail] = error.split(": ");
  return KNOWN_ERRORS.has(code)
    ? { code, detail: detail.join(": ") }
    : { code: "pc_port_error_generic", detail: error };
};

const formatProgress = ({
  receivedBytes,
  totalBytes,
}: PcPortInstallProgress) =>
  totalBytes
    ? `${Math.floor((receivedBytes / totalBytes) * 100)}%`
    : `${(receivedBytes / 1024 / 1024).toFixed(0)} MB`;

function PcPortCard({
  port,
  onChanged,
}: Readonly<{ port: PcPortSummary; onChanged: () => void }>) {
  const { t } = useTranslation("settings");
  const { showSuccessToast, showErrorToast } = useToast();
  const [gameDir, setGameDir] = useState(port.gameDir ?? "");
  const [updateDir, setUpdateDir] = useState(port.updateDir ?? "");
  const [progress, setProgress] = useState<PcPortInstallProgress | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(
    () =>
      window.electron.onPcPortInstallProgress((payload) => {
        if (payload.portId === port.id) setProgress(payload);
      }),
    [port.id]
  );

  const showError = (error: string) => {
    const { code, detail } = splitError(error);
    showErrorToast(t(code, { detail }), detail || undefined);
  };

  const chooseFolder = async (current: string, set: (path: string) => void) => {
    const { filePaths } = await window.electron.showOpenDialog({
      defaultPath: current || undefined,
      properties: ["openDirectory"],
    });
    if (filePaths?.[0]) set(filePaths[0]);
  };

  const install = async () => {
    setIsBusy(true);
    setProgress(null);
    try {
      const result = await window.electron.installPcPort(port.id);
      if (!result.ok) return showError(result.error);
      showSuccessToast(
        t("pc_port_installed_toast", {
          port: port.portName,
          version: result.value,
        })
      );
      onChanged();
    } finally {
      setIsBusy(false);
      setProgress(null);
    }
  };

  const configure = async () => {
    setIsBusy(true);
    try {
      const result = await window.electron.configurePcPort(
        port.id,
        gameDir,
        updateDir || null
      );
      if (!result.ok) return showError(result.error);
      showSuccessToast(t("pc_port_saved", { title: port.title }));
      onChanged();
    } finally {
      setIsBusy(false);
    }
  };

  let installLabel = port.installedVersion
    ? t("pc_port_update")
    : t("pc_port_install");
  if (progress) {
    installLabel = t("pc_port_installing", {
      progress: formatProgress(progress),
    });
  }

  return (
    <section className="settings-pc-ports__card">
      <header className="settings-pc-ports__card-header">
        <div>
          <h3 className="settings-pc-ports__card-title">{port.title}</h3>
          <p className="settings-pc-ports__card-meta">
            {port.portName} · {t(`pc_port_kind_${port.kind}`)} · {port.license}
            {port.installedVersion &&
              ` · ${t("pc_port_installed_version", {
                version: port.installedVersion,
              })}`}
            {port.isInLibrary && ` · ${t("pc_port_in_library")}`}
          </p>
        </div>
        <Link to={port.homepage} className="settings-pc-ports__source">
          <LinkExternalIcon />
          {t("pc_port_view_source")}
        </Link>
      </header>

      {!port.isAvailable ? (
        <p className="settings-pc-ports__hint">{t("pc_port_not_available")}</p>
      ) : (
        <>
          <Button
            theme={port.installedVersion ? "outline" : "primary"}
            className="settings-pc-ports__install"
            onClick={install}
            disabled={isBusy}
          >
            {installLabel}
          </Button>

          {port.installedVersion && (
            <>
              <TextField
                label={t("pc_port_game_dir")}
                value={gameDir}
                readOnly
                disabled
                hint={port.gameDataHint}
                rightContent={
                  <Button
                    theme="outline"
                    onClick={() => chooseFolder(gameDir, setGameDir)}
                  >
                    {t("change")}
                  </Button>
                }
              />
              {port.supportsUpdateFolder && (
                <TextField
                  label={t("pc_port_update_dir")}
                  value={updateDir}
                  readOnly
                  disabled
                  rightContent={
                    <Button
                      theme="outline"
                      onClick={() => chooseFolder(updateDir, setUpdateDir)}
                    >
                      {t("change")}
                    </Button>
                  }
                />
              )}
              <Button
                className="settings-pc-ports__save"
                onClick={configure}
                disabled={isBusy || !gameDir}
              >
                {t("pc_port_save")}
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}

export function SettingsContextPcPorts() {
  const { t } = useTranslation("settings");
  const [ports, setPorts] = useState<PcPortSummary[] | null>(null);

  const refresh = useCallback(() => {
    window.electron.listPcPorts().then(setPorts);
  }, []);

  useEffect(refresh, [refresh]);

  return (
    <div className="settings-context-panel settings-pc-ports">
      <p className="settings-pc-ports__description">
        {t("pc_ports_description")}
      </p>
      {ports?.map((port) => (
        <PcPortCard key={port.id} port={port} onChanged={refresh} />
      ))}
    </div>
  );
}
