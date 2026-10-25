import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import axios from "axios";

import { ASSETS_PATH } from "@main/constants";
import { gamesShopAssetsSublevel, gamesSublevel, levelKeys } from "@main/level";
import { logger } from "@main/services/logger";
import { SystemPath } from "@main/services/system-path";
import { WindowManager } from "@main/services/window-manager";
import { PC_PORT_PLATFORM, pcPortObjectId } from "@shared";
import type { Game, PcPortInstallProgress, PcPortSummary } from "@types";

import {
  encodeCloudSaveCustomPath,
  getCurrentCloudSaveCustomPathContext,
} from "../cloud-save/custom-path";
import { registerCloudSaveCustomPaths } from "../cloud-save/custom-path-store";
import { downloadToFile, removeFileQuietly } from "../download-to-file";
import { findPcPort, pcPortCatalog, type PcPortDefinition } from "./catalog";
import { validatePcPortGameData } from "./port-game-data";
import {
  buildPcPortLaunchOptions,
  mergePcPortSettings,
  parseSha256Sidecar,
  selectPcPortReleaseAsset,
  type GithubReleaseAsset,
} from "./port-runtime";

interface PcPortState {
  version: string;
  binaryPath: string;
  gameDir?: string | null;
  updateDir?: string | null;
}

const GITHUB_HEADERS = {
  "User-Agent": "HydraLauncher",
  Accept: "application/vnd.github+json",
};

const portRoot = (portId: string) =>
  path.join(SystemPath.getPath("userData"), "ports", portId);
const statePath = (portId: string) => path.join(portRoot(portId), "port.json");
const dataDir = (portId: string) => path.join(portRoot(portId), "data");
const gameKey = (portId: string) =>
  levelKeys.game("custom", pcPortObjectId(portId));

const readJson = async (file: string): Promise<unknown> => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
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

const readState = async (portId: string) =>
  (await readJson(statePath(portId))) as PcPortState | null;

const sha256File = (file: string) =>
  new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });

const pathExists = (file: string) =>
  fs.access(file).then(
    () => true,
    () => false
  );

const copyArtwork = async (
  port: PcPortDefinition,
  gameDir: string,
  name: "icon" | "hero"
) => {
  const source = port.gameData.artwork?.[name];
  if (!source) return null;
  const from = path.join(gameDir, source);
  if (!(await pathExists(from))) return null;
  const to = path.join(
    ASSETS_PATH,
    "pc-ports",
    port.id,
    `${name}${path.extname(source)}`
  );
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
  return `local:${to}`;
};

export class PcPorts {
  static async list(): Promise<PcPortSummary[]> {
    return Promise.all(
      pcPortCatalog.map(async (port) => {
        const state = await readState(port.id);
        const game = await gamesSublevel
          .get(gameKey(port.id))
          .catch(() => null);
        return {
          id: port.id,
          title: port.title,
          portName: port.portName,
          kind: port.kind,
          homepage: port.homepage,
          license: port.license,
          gameDataHint: port.gameData.hint,
          supportsUpdateFolder: Boolean(port.gameData.update),
          isAvailable: Boolean(port.assets[process.platform]),
          installedVersion: state?.version ?? null,
          gameDir: state?.gameDir ?? null,
          updateDir: state?.updateDir ?? null,
          isInLibrary: Boolean(game && !game.isDeleted),
        };
      })
    );
  }

  /** Downloads the port's latest release for this platform and verifies it. */
  static async install(
    portId: string,
    onProgress: (progress: PcPortInstallProgress) => void
  ) {
    const port = findPcPort(portId);
    const { data: release } = await axios.get<{
      tag_name: string;
      assets: GithubReleaseAsset[];
    }>(`https://api.github.com/repos/${port.githubRepo}/releases/latest`, {
      headers: GITHUB_HEADERS,
    });
    const selected = selectPcPortReleaseAsset(
      port,
      process.platform,
      release.assets
    );
    if (!selected) throw new Error("pc_port_no_build_for_platform");

    const binDir = path.join(portRoot(portId), "bin");
    const destination = path.join(binDir, selected.asset.name);
    const partial = `${destination}.part`;
    try {
      await downloadToFile(
        selected.asset.browser_download_url,
        partial,
        (receivedBytes, totalBytes) =>
          onProgress({ portId, receivedBytes, totalBytes })
      );

      if (selected.checksum) {
        const { data: sidecar } = await axios.get<string>(
          selected.checksum.browser_download_url,
          { headers: GITHUB_HEADERS, responseType: "text" }
        );
        const expected = parseSha256Sidecar(sidecar);
        if (!expected || expected !== (await sha256File(partial))) {
          throw new Error("pc_port_checksum_mismatch");
        }
      } else {
        logger.warn(`[PC ports] ${portId} release has no .sha256 sidecar`);
      }

      await fs.rename(partial, destination);
      await fs.chmod(destination, 0o755);
    } catch (error) {
      await removeFileQuietly(partial);
      throw error;
    }

    for (const entry of await fs.readdir(binDir)) {
      if (entry !== selected.asset.name) {
        await fs.rm(path.join(binDir, entry), { force: true, recursive: true });
      }
    }

    const previous = await readState(portId);
    await writeJsonAtomic(statePath(portId), {
      ...previous,
      version: release.tag_name,
      binaryPath: destination,
    } satisfies PcPortState);

    // A configured game keeps working after an update: point it at the new build.
    if (previous?.gameDir) {
      await this.configure(
        portId,
        previous.gameDir,
        previous.updateDir ?? null
      );
    }

    return release.tag_name;
  }

  /**
   * Validates the user's game files, points the port at them and adds (or
   * refreshes) the library entry, with its save folder tracked by Cloud Save.
   */
  static async configure(
    portId: string,
    gameDir: string,
    updateDir: string | null
  ) {
    const port = findPcPort(portId);
    const state = await readState(portId);
    if (!state?.binaryPath || !(await pathExists(state.binaryPath))) {
      throw new Error("pc_port_not_installed");
    }
    await validatePcPortGameData(port, gameDir, updateDir);

    const portDataDir = dataDir(portId);
    const settingsPath = path.join(portDataDir, port.runtime.settingsFile);
    await writeJsonAtomic(
      settingsPath,
      mergePcPortSettings(
        port,
        await readJson(settingsPath),
        gameDir,
        updateDir
      )
    );
    await writeJsonAtomic(statePath(portId), {
      ...state,
      gameDir,
      updateDir,
    } satisfies PcPortState);

    const objectId = pcPortObjectId(portId);
    const key = gameKey(portId);
    const existing = await gamesSublevel.get(key).catch(() => null);
    const [iconUrl, heroUrl] = await Promise.all([
      copyArtwork(port, gameDir, "icon"),
      copyArtwork(port, gameDir, "hero"),
    ]);

    await gamesShopAssetsSublevel.put(key, {
      updatedAt: Date.now(),
      objectId,
      shop: "custom",
      title: port.title,
      iconUrl,
      libraryHeroImageUrl: heroUrl ?? "",
      libraryImageUrl: iconUrl ?? "",
      logoImageUrl: "",
      logoPosition: null,
      coverImageUrl: iconUrl ?? "",
      downloadSources: [],
    });

    const game: Game = {
      ...(existing ?? {
        playTimeInMilliseconds: 0,
        lastTimePlayed: null,
        addedToLibraryAt: new Date(),
        favorite: false,
        automaticCloudSync: false,
        hasManuallyUpdatedPlaytime: false,
        remoteId: null,
      }),
      title: port.title,
      iconUrl,
      logoImageUrl: null,
      libraryHeroImageUrl: heroUrl,
      objectId,
      shop: "custom",
      platform: PC_PORT_PLATFORM,
      isDeleted: false,
      executablePath: state.binaryPath,
      executablePathUpdatedAt: new Date(),
      launchOptions: buildPcPortLaunchOptions(port, portDataDir),
    };
    await gamesSublevel.put(key, game);

    const context = getCurrentCloudSaveCustomPathContext();
    const customPaths = await Promise.all(
      port.savePaths.map(async (savePath) => {
        const absolute = path.join(portDataDir, ...savePath.split("/"));
        await fs.mkdir(absolute, { recursive: true });
        return {
          ...encodeCloudSaveCustomPath(absolute, context),
          kind: "dir" as const,
        };
      })
    );
    // Pending until the first upload confirms them on the remote snapshot.
    await registerCloudSaveCustomPaths("custom", objectId, customPaths, {
      context,
      syncState: "pending",
    });

    WindowManager.sendToAppWindows("on-library-batch-complete");
    return game;
  }
}
