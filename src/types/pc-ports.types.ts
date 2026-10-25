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
