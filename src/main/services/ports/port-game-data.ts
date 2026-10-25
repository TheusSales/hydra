import fs from "node:fs/promises";
import path from "node:path";

import type { PcPortGameDataError } from "@types";

import { parseParamSfo } from "../emulators/param-sfo.js";
import type { PcPortDefinition } from "./catalog.js";

export class PcPortGameDataInvalidError extends Error {
  constructor(
    readonly code: PcPortGameDataError,
    readonly detail?: string
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "PcPortGameDataInvalidError";
  }
}

const missingFiles = async (directory: string, files: string[]) => {
  const results = await Promise.all(
    files.map(async (file) => {
      const stat = await fs.stat(path.join(directory, file)).catch(() => null);
      return stat?.isFile() ? null : file;
    })
  );
  return results.filter((file): file is string => file !== null);
};

const readTitleId = async (directory: string, paramSfo: string) => {
  const data = await fs
    .readFile(path.join(directory, paramSfo))
    .catch(() => null);
  return data ? parseParamSfo(data) : null;
};

/**
 * Checks that the user's own game files match what the port needs. Returns the
 * title id read from the dump, when the port declares one.
 */
export const validatePcPortGameData = async (
  port: PcPortDefinition,
  gameDir: string,
  updateDir?: string | null
) => {
  const { gameData } = port;

  const missing = await missingFiles(gameDir, gameData.requiredFiles);
  if (missing.length > 0) {
    throw new PcPortGameDataInvalidError(
      "pc_port_game_dir_missing_files",
      missing.join(", ")
    );
  }

  const titleId = gameData.paramSfo
    ? await readTitleId(gameDir, gameData.paramSfo)
    : null;
  if (gameData.titleIds && (!titleId || !gameData.titleIds.includes(titleId))) {
    throw new PcPortGameDataInvalidError(
      "pc_port_game_dir_unsupported_title",
      titleId ?? "unknown"
    );
  }

  if (
    updateDir &&
    (await fs.realpath(updateDir).catch(() => path.resolve(updateDir))) ===
      (await fs.realpath(gameDir).catch(() => path.resolve(gameDir)))
  ) {
    throw new PcPortGameDataInvalidError("pc_port_update_dir_same_as_game");
  }

  if (updateDir && gameData.update) {
    const updateMissing = await missingFiles(
      updateDir,
      gameData.update.requiredFiles
    );
    if (updateMissing.length > 0) {
      throw new PcPortGameDataInvalidError(
        "pc_port_update_dir_missing_files",
        updateMissing.join(", ")
      );
    }
    if (gameData.paramSfo) {
      const updateTitleId = await readTitleId(updateDir, gameData.paramSfo);
      if (updateTitleId !== titleId) {
        throw new PcPortGameDataInvalidError(
          "pc_port_update_dir_title_mismatch",
          updateTitleId ?? "unknown"
        );
      }
    }
  }

  return { titleId };
};
