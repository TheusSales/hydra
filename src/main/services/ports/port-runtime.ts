import fs from "node:fs/promises";
import path from "node:path";

import type { PcPortDefinition } from "./catalog.js";

/**
 * string-argv keeps quotes that open mid-token (`VAR="a b"` stays literal), so
 * a token with spaces is quoted as a whole: `"VAR=a b"`.
 */
const launchToken = (value: string) => {
  if (value.includes('"')) {
    throw new Error("pc_port_data_dir_unsupported_characters");
  }
  return /\s/.test(value) ? `"${value}"` : value;
};

/**
 * Launch options in the `VAR=value %command% args` form the library launcher
 * already understands, so port games start through the regular play button.
 */
export const buildPcPortLaunchOptions = (
  port: PcPortDefinition,
  dataDir: string
) =>
  [
    launchToken(`${port.runtime.dataDirEnv}=${dataDir}`),
    "%command%",
    ...port.runtime.args,
  ].join(" ");

/**
 * Points the port's own settings at the game folders while keeping every other
 * setting the user changed in the port's launcher or in-game menu.
 */
export const mergePcPortSettings = (
  port: PcPortDefinition,
  current: unknown,
  gameDir: string,
  updateDir: string | null
) => {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  return {
    ...base,
    [port.runtime.gameDirKey]: gameDir,
    ...(port.runtime.updateDirKey
      ? { [port.runtime.updateDirKey]: updateDir ?? "" }
      : {}),
  };
};

export interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

/** Picks the build for this platform and its `.sha256` sidecar, if published. */
export const selectPcPortReleaseAsset = (
  port: PcPortDefinition,
  platform: NodeJS.Platform,
  assets: GithubReleaseAsset[]
) => {
  const spec = port.assets[platform];
  if (!spec) return null;
  const asset = assets.find(({ name }) => spec.pattern.test(name));
  if (!asset) return null;
  const checksum =
    assets.find(({ name }) => name === `${asset.name}.sha256`) ?? null;
  return { asset, checksum, spec };
};

/** Reads `sha256sum`-style sidecars: `<hash>  <file name>` or a bare hash. */
export const parseSha256Sidecar = (text: string) => {
  const match = /^\s*([a-fA-F0-9]{64})\b/.exec(text);
  return match ? match[1].toLowerCase() : null;
};

/** Release tags carry the build's platform (`windows-v2.7.0`); show the version. */
export const pcPortVersionFromTag = (tag: string) =>
  tag.replace(/^[a-z][a-z0-9]*-(?=v?\d)/i, "");

/**
 * Finds the port's executable in an extracted archive: at its root or in the
 * single top-level folder release zips usually wrap everything in.
 */
export const findPcPortExecutable = async (
  root: string,
  executables: string[]
) => {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const folders = [
    root,
    ...entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name)),
  ];
  for (const name of executables) {
    for (const folder of folders) {
      const candidate = path.join(folder, name);
      const stat = await fs.stat(candidate).catch(() => null);
      if (stat?.isFile()) return candidate;
    }
  }
  return null;
};

/**
 * Finds a save location another machine already uploaded for this port, so a
 * save made on Windows restores on Linux and vice versa: the custom path
 * encoding differs per platform, but the port's data layout does not.
 */
export const findRemotePcPortSavePath = (
  port: PcPortDefinition,
  savePath: string,
  remoteRawPaths: string[]
) => {
  const suffix = `/ports/${port.id}/data/${savePath}`;
  return remoteRawPaths.find((rawPath) => rawPath.endsWith(suffix)) ?? null;
};
