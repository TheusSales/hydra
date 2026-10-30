import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LinkExternalIcon } from "@primer/octicons-react";
import cn from "classnames";
import { Button, Link, TextField } from "@renderer/components";
import { buildGameDetailsPath } from "@renderer/helpers";
import type { PcReleaseCatalogEntry } from "@types";

import "./settings-context-pc-releases.scss";

type Filter = "all" | "library" | "auto_update" | string;

function CatalogCard({ entry }: Readonly<{ entry: PcReleaseCatalogEntry }>) {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const [coverFailed, setCoverFailed] = useState(false);

  const openInLibrary = () => {
    if (!entry.libraryGame) return;
    navigate(
      buildGameDetailsPath({ ...entry.libraryGame, title: entry.title })
    );
  };

  return (
    <article className="settings-pc-releases__card">
      <div className="settings-pc-releases__cover">
        {entry.coverUrl && !coverFailed ? (
          <img
            src={entry.coverUrl}
            alt=""
            loading="lazy"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <span className="settings-pc-releases__cover-title">
            {entry.title}
          </span>
        )}
        <span className="settings-pc-releases__tag">{entry.tag}</span>
      </div>

      <div className="settings-pc-releases__body">
        <h3 className="settings-pc-releases__title">{entry.title}</h3>
        <div className="settings-pc-releases__badges">
          {entry.libraryGame && (
            <span className="settings-pc-releases__badge settings-pc-releases__badge--library">
              {t("pc_releases_in_library")}
            </span>
          )}
          {entry.autoUpdate && (
            <span className="settings-pc-releases__badge">
              {t("pc_releases_auto_update")}
            </span>
          )}
        </div>
        <div className="settings-pc-releases__actions">
          {entry.libraryGame && (
            <Button theme="outline" onClick={openInLibrary}>
              {t("pc_releases_open_game")}
            </Button>
          )}
          {entry.repositoryUrl && (
            <Link
              to={entry.repositoryUrl}
              className="settings-pc-releases__source"
            >
              <LinkExternalIcon />
              {t("pc_releases_project_page")}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function SettingsContextPcReleases() {
  const { t } = useTranslation("settings");
  const [entries, setEntries] = useState<PcReleaseCatalogEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    window.electron
      .listPcReleaseCatalog()
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  const platforms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries ?? []) {
      counts.set(
        entry.originalPlatform,
        (counts.get(entry.originalPlatform) ?? 0) + 1
      );
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (entries ?? []).filter((entry) => {
      if (filter === "library" && !entry.libraryGame) return false;
      if (filter === "auto_update" && !entry.autoUpdate) return false;
      if (
        filter !== "all" &&
        filter !== "library" &&
        filter !== "auto_update" &&
        entry.originalPlatform !== filter
      ) {
        return false;
      }
      return !search || entry.title.toLowerCase().includes(search);
    });
  }, [entries, filter, query]);

  const filters: { id: Filter; label: string }[] = [
    {
      id: "all",
      label: t("pc_releases_filter_all", { count: entries?.length ?? 0 }),
    },
    {
      id: "library",
      label: t("pc_releases_filter_library", {
        count: entries?.filter((entry) => entry.libraryGame).length ?? 0,
      }),
    },
    {
      id: "auto_update",
      label: t("pc_releases_filter_auto_update", {
        count: entries?.filter((entry) => entry.autoUpdate).length ?? 0,
      }),
    },
    ...platforms.map(([platform, count]) => ({
      id: platform,
      label: `${platform} (${count})`,
    })),
  ];

  return (
    <div className="settings-context-panel settings-pc-releases">
      <p className="settings-pc-releases__description">
        {t("pc_releases_description")}
      </p>

      <TextField
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("pc_releases_search")}
        theme="dark"
      />

      <div
        className="settings-pc-releases__filters"
        role="group"
        aria-label={t("pc_releases_filters")}
      >
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn("settings-pc-releases__filter", {
              "settings-pc-releases__filter--active": filter === item.id,
            })}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {entries === null ? (
        <p className="settings-pc-releases__hint">{t("pc_releases_loading")}</p>
      ) : visible.length === 0 ? (
        <p className="settings-pc-releases__hint">{t("pc_releases_empty")}</p>
      ) : (
        <div className="settings-pc-releases__grid">
          {visible.map((entry) => (
            <CatalogCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
