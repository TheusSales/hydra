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
  return { asset, checksum, type: spec.type };
};

/** Reads `sha256sum`-style sidecars: `<hash>  <file name>` or a bare hash. */
export const parseSha256Sidecar = (text: string) => {
  const match = /^\s*([a-fA-F0-9]{64})\b/.exec(text);
  return match ? match[1].toLowerCase() : null;
};
