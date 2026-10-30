import type { GameShop } from "./game.types";

export type PcPortKind = "native-port" | "recomp" | "decomp";

/** What the renderer sees for each catalog entry. */
export interface PcPortSummary {
  id: string;
  title: string;
  portName: string;
  kind: PcPortKind;
  homepage: string;
  license: string;
  gameDataHint: string;
  supportsUpdateFolder: boolean;
  /** False when the port has no build for this operating system. */
  isAvailable: boolean;
  installedVersion: string | null;
  gameDir: string | null;
  updateDir: string | null;
  /** The library game exists and is ready to play. */
  isInLibrary: boolean;
}

export interface PcPortInstallProgress {
  portId: string;
  receivedBytes: number;
  totalBytes: number | null;
}

export type PcPortGameDataError =
  | "pc_port_game_dir_missing_files"
  | "pc_port_game_dir_unsupported_title"
  | "pc_port_update_dir_same_as_game"
  | "pc_port_update_dir_missing_files"
  | "pc_port_update_dir_title_mismatch";

/** Update state of a recomp or port added to the library (custom game). */
export interface PcReleaseUpdateStatus {
  releaseId: string;
  repository: string;
  /** Null until Hydra installs a release, since manual installs are unknown. */
  installedVersion: string | null;
  latestVersion: string | null;
  releaseUrl: string | null;
  updateAvailable: boolean;
  /** Whether this OS has a release package with a GitHub checksum. */
  canUpdate: boolean;
  hasBackup: boolean;
}

export interface PcReleaseUpdateProgress {
  shop: GameShop;
  objectId: string;
  phase: "downloading" | "verifying" | "extracting" | "installing";
  receivedBytes: number;
  totalBytes: number | null;
}

/** A recomp or port from the catalog, as the catalog screen lists it. */
export interface PcReleaseCatalogEntry {
  id: string;
  kind: "recomp" | "port";
  title: string;
  originalPlatform: string;
  tag: string;
  repositoryUrl: string | null;
  coverUrl: string | null;
  /** Hydra can update it from its GitHub releases. */
  autoUpdate: boolean;
  /** The matching game in the library, when there is one. */
  libraryGame: { shop: GameShop; objectId: string } | null;
}
