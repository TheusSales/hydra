/**
 * Where each recomp or port publishes its builds, and the pure decisions the
 * updater makes about a GitHub release. Only established projects are listed
 * (300+ stars, 3+ months old, a checksum on every asset), because updating
 * downloads and replaces the game's executable.
 */
export type UpdatePlatform = "win32" | "linux";

export interface PcReleaseUpdateSource {
  repository: string;
  /** Release asset for each OS; an OS without one cannot update. */
  assets: Partial<Record<UpdatePlatform, RegExp>>;
}

export const PC_RELEASE_UPDATE_SOURCES: Readonly<
  Record<string, PcReleaseUpdateSource>
> = {
  zelda64recomp: {
    repository: "Zelda64Recomp/Zelda64Recomp",
    assets: { win32: /-Windows\.zip$/i, linux: /-Linux-X64\.zip$/i },
  },
  banjorecomp: {
    repository: "BanjoRecomp/BanjoRecomp",
    assets: { win32: /-Windows\.zip$/i },
  },
  mariokart64recomp: {
    repository: "sonicdcer/MarioKart64Recomp",
    assets: {
      win32: /-Windows-\w+\.zip$/i,
      linux: /-Linux-X64-Release\.zip$/i,
    },
  },
  starfox64recomp: {
    repository: "sonicdcer/Starfox64Recomp",
    assets: {
      win32: /-Windows-\w+\.zip$/i,
      linux: /-Linux-X64-Release\.zip$/i,
    },
  },
  goemon64recomp: {
    repository: "klorfmorf/Goemon64Recomp",
    assets: {
      win32: /-Windows-\w+\.zip$/i,
      linux: /-Linux-X64-Release\.zip$/i,
    },
  },
  dk64recomp: {
    repository: "Rainchus/Donkey-Kong-64-Recompiled",
    assets: {
      win32: /-Windows-Release[-\d]*\.zip$/i,
      linux: /-Linux-X64-Release[-\d]*\.zip$/i,
    },
  },
  bm64recomp: {
    repository: "RevoSucks/BM64Recomp",
    assets: {
      win32: /-Windows-\w+\.zip$/i,
      linux: /-Linux-X64-Release\.zip$/i,
    },
  },
  goldeneyerecomp: {
    repository: "SunJaycy/GoldenEye-Recomp",
    assets: { win32: /-Win\.rar$/i },
  },
  // Skate 3 (mchughalex/skate3recomp) is left out: Windows Defender flags the
  // v2.0.2 Windows package as Trojan:Win32/Suschil!rfn (issues #160, #178, #188).
  edgeoftimerecomp: {
    repository: "goliathret/EdgeOfTimeRecomp",
    assets: { win32: /-win-amd64\.zip$/i, linux: /-x86_64\.AppImage$/i },
  },
  nocturnerecomp: {
    repository: "birabittoh/NocturneRecomp",
    assets: { win32: /^nocturnerecomp-v[\d.]+-windows-x64\.zip$/i },
  },
  dinosaurplanetrecomp: {
    repository: "DinosaurPlanetRecomp/dino-recomp",
    assets: { win32: /-Windows-x64\.zip$/i, linux: /-Linux-x64\.AppImage$/i },
  },
  shipofharkinian: {
    repository: "HarbourMasters/Shipwright",
    assets: { win32: /-Win64\.zip$/i },
  },
  "2ship2harkinian": {
    repository: "HarbourMasters/2ship2harkinian",
    assets: { win32: /-Win64\.zip$/i, linux: /-Linux\.zip$/i },
  },
};

export interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  digest?: string | null;
}

export interface GithubRelease {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: GithubReleaseAsset[];
}

export const toUpdatePlatform = (platform: string): UpdatePlatform | null =>
  platform === "win32" || platform === "linux" ? platform : null;

export const selectUpdateAsset = (
  source: PcReleaseUpdateSource,
  platform: UpdatePlatform,
  release: GithubRelease
): GithubReleaseAsset | null => {
  const pattern = source.assets[platform];
  if (!pattern) return null;
  return release.assets.find((asset) => pattern.test(asset.name)) ?? null;
};

/** GitHub publishes asset digests as `sha256:<hex>`. */
export const parseAssetDigest = (digest: string | null | undefined) => {
  const match = /^sha256:([a-f0-9]{64})$/i.exec(digest?.trim() ?? "");
  return match ? match[1].toLowerCase() : null;
};

export type UpdatePackageKind = "archive" | "file";

export const updatePackageKind = (
  assetName: string
): UpdatePackageKind | null => {
  if (/\.(zip|7z|rar)$/i.test(assetName)) return "archive";
  if (/\.AppImage$/i.test(assetName)) return "file";
  return null;
};

const normalizeVersion = (tag: string) =>
  tag
    .trim()
    .replace(/^[a-z]+(?=\d)/i, "")
    .replace(/^v/i, "")
    .toLowerCase();

export const isSameVersion = (installed: string, latest: string) =>
  normalizeVersion(installed) === normalizeVersion(latest);

/** Shown to the player: `v1.2.2`, `1.0.3` and `Goldeneye1.2.4` as written. */
export const displayVersion = (tag: string) =>
  /^\d/.test(tag) ? `v${tag}` : tag;

const baseName = (file: string) => file.split(/[\\/]/).at(-1) ?? file;

const isExecutableName = (name: string, platform: UpdatePlatform) =>
  platform === "win32"
    ? /\.exe$/i.test(name)
    : /\.AppImage$/i.test(name) || !/\.[a-z0-9]{1,5}$/i.test(name);

/**
 * Finds the game's executable among the extracted files (paths relative to
 * the extraction folder, `/`-separated). Releases often wrap everything in a
 * top folder, and a few rename the executable per version, so it matches the
 * current file name first and then the release's executable pattern.
 */
export const findPackageExecutable = (
  files: readonly string[],
  currentExecutableName: string,
  executablePattern: RegExp,
  platform: UpdatePlatform
): string | null => {
  const sameName = files.filter(
    (file) =>
      baseName(file).toLowerCase() === currentExecutableName.toLowerCase()
  );
  if (sameName.length === 1) return sameName[0];
  if (sameName.length > 1) return null;

  const byPattern = files.filter((file) => {
    const name = baseName(file);
    return isExecutableName(name, platform) && executablePattern.test(name);
  });
  return byPattern.length === 1 ? byPattern[0] : null;
};

/** The files to copy over the game folder, relative to the package root. */
export const packageFilesUnder = (
  files: readonly string[],
  executable: string
) => {
  const slash = executable.lastIndexOf("/");
  const root = slash === -1 ? "" : executable.slice(0, slash + 1);
  return files
    .filter((file) => file.startsWith(root))
    .map((file) => file.slice(root.length));
};
