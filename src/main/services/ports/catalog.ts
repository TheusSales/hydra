import type { PcPortKind } from "@types";

export type PcPortAsset = {
  /** Matched against the asset names of the latest GitHub release. */
  pattern: RegExp;
} & (
  | { type: "appimage" }
  | {
      type: "zip";
      /** Executable names to look for in the extracted archive, preferred first. */
      executables: string[];
    }
);

export interface PcPortDefinition {
  id: string;
  /** The game the port runs. */
  title: string;
  portName: string;
  kind: PcPortKind;
  githubRepo: string;
  homepage: string;
  license: string;
  assets: Partial<Record<NodeJS.Platform, PcPortAsset>>;
  gameData: {
    /** Shown next to the folder picker. */
    hint: string;
    requiredFiles: string[];
    /** `param.sfo` relative to the game folder, read to check the title. */
    paramSfo?: string;
    /** Normalized (`CUSA-01623`) title ids the port supports. */
    titleIds?: string[];
    update?: { requiredFiles: string[] };
    /** Files inside the game folder used as library artwork. */
    artwork?: { icon?: string; hero?: string };
  };
  /** How the port is told where its data and the game live. */
  runtime: {
    dataDirEnv: string;
    args: string[];
    /** JSON settings file inside the data folder, merged before launch. */
    settingsFile: string;
    gameDirKey: string;
    updateDirKey?: string;
  };
  /** Save folders relative to the port's data folder, synced by Cloud Save. */
  savePaths: string[];
}

export const pcPortCatalog: PcPortDefinition[] = [
  {
    id: "spartanport",
    title: "God of War III Remastered",
    portName: "SpartanPort",
    kind: "native-port",
    githubRepo: "FelipePrado0/SpartanPort",
    homepage: "https://github.com/FelipePrado0/SpartanPort",
    license: "GPL-2.0-or-later",
    assets: {
      // Renamed from gow3-x86_64.AppImage in 2.x; accept both.
      linux: {
        pattern: /^(?:spartanport|gow3)-x86_64\.AppImage$/,
        type: "appimage",
      },
      // The zip holds spartanport-windows/ with the launcher, which takes --play
      // and SPARTAN_DATA_DIR like the AppImage.
      win32: {
        pattern: /^(?:spartanport|gow3)-windows\.zip$/,
        type: "zip",
        executables: ["SpartanPort.exe", "God of War III.exe"],
      },
    },
    gameData: {
      hint: "PS4 dump: the folder with eboot.bin, sce_module and sce_sys (CUSA01623 or CUSA01715).",
      requiredFiles: ["eboot.bin", "sce_sys/param.sfo"],
      paramSfo: "sce_sys/param.sfo",
      titleIds: ["CUSA-01623", "CUSA-01715"],
      update: { requiredFiles: ["eboot.bin", "sce_sys/param.sfo"] },
      artwork: { icon: "sce_sys/icon0.png", hero: "sce_sys/pic1.png" },
    },
    runtime: {
      dataDirEnv: "SPARTAN_DATA_DIR",
      args: ["--play"],
      settingsFile: "settings.json",
      gameDirKey: "game_dir",
      updateDirKey: "update_dir",
    },
    savePaths: ["user/savedata"],
  },
];

export const findPcPort = (portId: string) => {
  const port = pcPortCatalog.find((entry) => entry.id === portId);
  if (!port) throw new Error(`Unknown PC port: ${portId}`);
  return port;
};
