import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import axios from "axios";

import { gamesSublevel, levelKeys } from "@main/level";
import {
  downloadToFile,
  removeFileQuietly,
} from "@main/services/download-to-file";
import { isGameRunning } from "@main/services/game-running-state";
import { logger } from "@main/services/logger";
import { SevenZip } from "@main/services/7zip";
import { SystemPath } from "@main/services/system-path";
import { WindowManager } from "@main/services/window-manager";
import { resolvePcRelease } from "@shared";
import type {
  Game,
  GameShop,
  PcReleaseUpdateProgress,
  PcReleaseUpdateStatus,
} from "@types";

import {
  PC_RELEASE_UPDATE_SOURCES,
  displayVersion,
  findPackageExecutable,
  isSameVersion,
  packageFilesUnder,
  parseAssetDigest,
  selectUpdateAsset,
  toUpdatePlatform,
  updatePackageKind,
  type GithubRelease,
} from "./plan";

const GITHUB_HEADERS = {
  "User-Agent": "HydraLauncher",
  Accept: "application/vnd.github+json",
};

// Unauthenticated GitHub requests are limited to 60 an hour.
const RELEASE_CACHE_TTL = 6 * 60 * 60 * 1000;
const releaseCache = new Map<string, { at: number; release: GithubRelease }>();

/** Games with an update, read by the library without touching the network. */
const updateAvailableByGame = new Map<string, boolean>();
const inFlight = new Set<string>();

interface InstalledVersions {
  [gameKey: string]: { tag: string; updatedAt: string };
}

interface BackupManifest {
  previousTag: string | null;
  executablePath: string;
  /** Files that existed before the update, copied into the backup. */
  replaced: string[];
  /** Files the update added, removed again on restore. */
  added: string[];
}

const dataRoot = () =>
  path.join(SystemPath.getPath("userData"), "pc-release-updates");
const versionsPath = () => path.join(dataRoot(), "versions.json");
const backupDir = (key: string) =>
  path.join(dataRoot(), "backups", key.replace(/[^A-Za-z0-9._-]/g, "_"));

const readJson = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
};

const writeJsonAtomic = async (file: string, value: unknown) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2));
  await fs.rename(temp, file);
};

const readVersions = async () =>
  (await readJson<InstalledVersions>(versionsPath())) ?? {};

const setInstalledVersion = async (key: string, tag: string | null) => {
  const versions = await readVersions();
  if (tag) versions[key] = { tag, updatedAt: new Date().toISOString() };
  else delete versions[key];
  await writeJsonAtomic(versionsPath(), versions);
};

const pathExists = (file: string) =>
  fs.access(file).then(
    () => true,
    () => false
  );

const sha256File = (file: string) =>
  new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });

const listFiles = async (root: string, prefix = ""): Promise<string[]> => {
  const entries = await fs.readdir(path.join(root, prefix), {
    withFileTypes: true,
  });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(root, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
};

const fetchLatestRelease = async (repository: string, force: boolean) => {
  const cached = releaseCache.get(repository);
  if (!force && cached && Date.now() - cached.at < RELEASE_CACHE_TTL) {
    return cached.release;
  }

  const { data } = await axios.get<GithubRelease>(
    `https://api.github.com/repos/${repository}/releases/latest`,
    { headers: GITHUB_HEADERS }
  );
  releaseCache.set(repository, { at: Date.now(), release: data });
  return data;
};

const loadGame = async (shop: GameShop, objectId: string) => {
  const key = levelKeys.game(shop, objectId);
  const game = await gamesSublevel.get(key).catch(() => null);
  if (!game || game.isDeleted) return null;
  return { key, game };
};

const sourceFor = (game: Game) => {
  const release = resolvePcRelease(game);
  const source = release ? PC_RELEASE_UPDATE_SOURCES[release.id] : undefined;
  return release && source ? { release, source } : null;
};

const sendProgress = (progress: PcReleaseUpdateProgress) =>
  WindowManager.sendToAppWindows("on-pc-release-update-progress", progress);

export const isPcReleaseUpdateAvailable = (gameKey: string) =>
  updateAvailableByGame.get(gameKey) ?? false;

export const getPcReleaseUpdateStatus = async (
  shop: GameShop,
  objectId: string,
  force = false
): Promise<PcReleaseUpdateStatus | null> => {
  const loaded = await loadGame(shop, objectId);
  if (!loaded) return null;
  const match = sourceFor(loaded.game);
  if (!match) return null;

  const { key, game } = loaded;
  const installedTag = (await readVersions())[key]?.tag ?? null;
  const hasBackup = await pathExists(path.join(backupDir(key), "backup.json"));
  const base: PcReleaseUpdateStatus = {
    releaseId: match.release.id,
    repository: match.source.repository,
    installedVersion: installedTag ? displayVersion(installedTag) : null,
    latestVersion: null,
    releaseUrl: null,
    updateAvailable: false,
    canUpdate: false,
    hasBackup,
  };

  let latest: GithubRelease;
  try {
    latest = await fetchLatestRelease(match.source.repository, force);
  } catch (error) {
    logger.warn(`[PC releases] could not check ${match.source.repository}`, {
      error: error instanceof Error ? error.message : error,
    });
    return base;
  }

  const platform = toUpdatePlatform(process.platform);
  const asset = platform
    ? selectUpdateAsset(match.source, platform, latest)
    : null;
  const canUpdate = Boolean(
    asset &&
      parseAssetDigest(asset.digest) &&
      updatePackageKind(asset.name) &&
      game.executablePath &&
      (await pathExists(game.executablePath))
  );
  const updateAvailable =
    !installedTag || !isSameVersion(installedTag, latest.tag_name);

  updateAvailableByGame.set(key, canUpdate && updateAvailable);

  return {
    ...base,
    latestVersion: displayVersion(latest.tag_name),
    releaseUrl: latest.html_url,
    updateAvailable,
    canUpdate,
  };
};

/** Checks every recomp and port in the library, for the library badges. */
export const refreshPcReleaseUpdates = async () => {
  let available = 0;
  for await (const [, game] of gamesSublevel.iterator()) {
    if (game.isDeleted || game.shop !== "custom" || !sourceFor(game)) continue;
    const status = await getPcReleaseUpdateStatus(game.shop, game.objectId);
    if (status?.canUpdate && status.updateAvailable) available += 1;
  }
  if (available > 0) {
    logger.info(`[PC releases] ${available} update(s) available`);
    WindowManager.sendToAppWindows("on-library-batch-complete");
  }
};

const copyFiles = async (
  fromRoot: string,
  toRoot: string,
  files: readonly string[]
) => {
  for (const file of files) {
    const target = path.join(toRoot, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(fromRoot, file), target);
  }
};

const restoreFromBackup = async (key: string, gameDir: string) => {
  const dir = backupDir(key);
  const manifest = await readJson<BackupManifest>(
    path.join(dir, "backup.json")
  );
  if (!manifest) throw new Error("pc_release_no_backup");

  await copyFiles(path.join(dir, "files"), gameDir, manifest.replaced);
  for (const file of manifest.added) {
    await removeFileQuietly(path.join(gameDir, file));
  }
  return manifest;
};

/**
 * Downloads the latest release, checks its GitHub checksum, backs up the files
 * it replaces and copies the package over the game folder. Files that are not
 * in the package (settings, mods, saves) are left as they are.
 */
export const updatePcRelease = async (shop: GameShop, objectId: string) => {
  const loaded = await loadGame(shop, objectId);
  if (!loaded) throw new Error("pc_release_game_not_found");
  const { key, game } = loaded;
  const match = sourceFor(game);
  if (!match || !game.executablePath) {
    throw new Error("pc_release_not_updatable");
  }
  if (isGameRunning(objectId, shop)) throw new Error("pc_release_game_running");
  if (inFlight.has(key)) throw new Error("pc_release_update_in_progress");

  const platform = toUpdatePlatform(process.platform);
  if (!platform) throw new Error("pc_release_not_updatable");

  inFlight.add(key);
  const workDir = path.join(
    SystemPath.getPath("temp"),
    "hydra-pc-release",
    randomUUID()
  );

  try {
    const latest = await fetchLatestRelease(match.source.repository, true);
    const asset = selectUpdateAsset(match.source, platform, latest);
    const digest = parseAssetDigest(asset?.digest);
    const kind = asset ? updatePackageKind(asset.name) : null;
    if (!asset || !digest || !kind) {
      throw new Error("pc_release_not_updatable");
    }

    const report = (
      phase: PcReleaseUpdateProgress["phase"],
      receivedBytes = 0,
      totalBytes: number | null = null
    ) => sendProgress({ shop, objectId, phase, receivedBytes, totalBytes });

    const download = path.join(workDir, asset.name);
    await downloadToFile(
      asset.browser_download_url,
      download,
      (loaded, total) => report("downloading", loaded, total ?? asset.size)
    );

    report("verifying");
    // An antivirus that quarantines the download makes it unreadable (Windows
    // reports ERROR_VIRUS_INFECTED as UNKNOWN) or removes it outright.
    const downloadedHash = await sha256File(download).catch((error) => {
      logger.warn(`[PC releases] ${asset.name} became unreadable`, error);
      throw new Error("pc_release_download_blocked");
    });
    if (downloadedHash !== digest) {
      throw new Error("pc_release_checksum_mismatch");
    }

    const gameDir = path.dirname(game.executablePath);
    const currentName = path.basename(game.executablePath);
    let packageRoot: string;
    let files: string[];
    let executable: string;

    if (kind === "file") {
      // A single AppImage replaces the executable and keeps its file name.
      packageRoot = path.join(workDir, "package");
      await fs.mkdir(packageRoot, { recursive: true });
      await fs.rename(download, path.join(packageRoot, currentName));
      files = [currentName];
      executable = currentName;
    } else {
      report("extracting");
      const extractDir = path.join(workDir, "extracted");
      await SevenZip.extractFile({
        filePath: download,
        outputPath: extractDir,
      });
      const extracted = await listFiles(extractDir);
      const found = findPackageExecutable(
        extracted,
        currentName,
        match.release.executablePattern,
        platform
      );
      if (!found) throw new Error("pc_release_executable_not_found");

      const rootPrefix = found.includes("/")
        ? found.slice(0, found.lastIndexOf("/"))
        : "";
      packageRoot = path.join(extractDir, rootPrefix);
      files = packageFilesUnder(extracted, found);
      executable = found.slice(rootPrefix ? rootPrefix.length + 1 : 0);
    }

    report("installing");
    const previousTag = (await readVersions())[key]?.tag ?? null;
    const existing = await Promise.all(
      files.map(
        async (file) =>
          [file, await pathExists(path.join(gameDir, file))] as const
      )
    );
    const replaced = existing
      .filter(([, exists]) => exists)
      .map(([file]) => file);
    const added = existing
      .filter(([, exists]) => !exists)
      .map(([file]) => file);

    const backup = backupDir(key);
    await fs.rm(backup, { force: true, recursive: true });
    await copyFiles(gameDir, path.join(backup, "files"), replaced);
    await writeJsonAtomic(path.join(backup, "backup.json"), {
      previousTag,
      executablePath: game.executablePath,
      replaced,
      added,
    } satisfies BackupManifest);

    try {
      await copyFiles(packageRoot, gameDir, files);
    } catch (error) {
      logger.error("[PC releases] update failed, restoring backup", error);
      await restoreFromBackup(key, gameDir).catch((restoreError) =>
        logger.error("[PC releases] restore failed", restoreError)
      );
      throw new Error("pc_release_install_failed");
    }

    const executablePath = path.join(gameDir, executable);
    if (platform === "linux") await fs.chmod(executablePath, 0o755);
    if (executablePath !== game.executablePath) {
      await gamesSublevel.put(key, {
        ...game,
        executablePath,
        executablePathUpdatedAt: new Date(),
      });
    }

    await setInstalledVersion(key, latest.tag_name);
    updateAvailableByGame.set(key, false);
    WindowManager.sendToAppWindows("on-library-batch-complete");
    logger.info(
      `[PC releases] ${match.release.id} updated to ${latest.tag_name}`
    );
    return displayVersion(latest.tag_name);
  } finally {
    inFlight.delete(key);
    await fs.rm(workDir, { force: true, recursive: true }).catch(() => {});
  }
};

/** Puts back the files the last update replaced and removes the ones it added. */
export const restorePcReleaseBackup = async (
  shop: GameShop,
  objectId: string
) => {
  const loaded = await loadGame(shop, objectId);
  if (!loaded) throw new Error("pc_release_game_not_found");
  const { key, game } = loaded;
  if (isGameRunning(objectId, shop)) throw new Error("pc_release_game_running");
  if (!game.executablePath) throw new Error("pc_release_not_updatable");

  const manifest = await restoreFromBackup(
    key,
    path.dirname(game.executablePath)
  );
  if (manifest.executablePath !== game.executablePath) {
    await gamesSublevel.put(key, {
      ...game,
      executablePath: manifest.executablePath,
      executablePathUpdatedAt: new Date(),
    });
  }
  await setInstalledVersion(key, manifest.previousTag);
  await fs.rm(backupDir(key), { force: true, recursive: true });
  // Back on the older build, so the latest release is an update again.
  updateAvailableByGame.set(key, true);
  WindowManager.sendToAppWindows("on-library-batch-complete");
};
