import { registerEvent } from "../register-event";
import { gamesSublevel, gamesShopAssetsSublevel, levelKeys } from "@main/level";
import { randomUUID } from "node:crypto";
import type { GameShop } from "@types";
import { findPcReleaseByExecutable } from "@shared";
import { fetchPcReleaseArtwork } from "@main/services/pc-release-assets";

const addCustomGameToLibrary = async (
  _event: Electron.IpcMainInvokeEvent,
  title: string,
  executablePath: string,
  iconUrl?: string,
  logoImageUrl?: string,
  libraryHeroImageUrl?: string
) => {
  const objectId = randomUUID();
  const shop: GameShop = "custom";
  const gameKey = levelKeys.game(shop, objectId);

  const existingGames = await gamesSublevel.iterator().all();
  const existingGame = existingGames.find(
    ([_key, game]) => game.executablePath === executablePath && !game.isDeleted
  );

  if (existingGame) {
    throw new Error(
      "A game with this executable path already exists in your library"
    );
  }

  // Recomps and source ports get the original game's artwork from LaunchBox;
  // images passed by the caller still take precedence.
  const release = findPcReleaseByExecutable(executablePath);
  const releaseArtwork = release ? await fetchPcReleaseArtwork(release) : null;

  const resolvedIconUrl = iconUrl || releaseArtwork?.iconUrl || "";
  const resolvedCoverUrl = iconUrl || releaseArtwork?.coverImageUrl || "";
  const resolvedLogoUrl = logoImageUrl || releaseArtwork?.logoImageUrl || "";
  const resolvedHeroUrl =
    libraryHeroImageUrl || releaseArtwork?.libraryHeroImageUrl || "";

  const assets = {
    updatedAt: Date.now(),
    objectId,
    shop,
    title,
    iconUrl: resolvedIconUrl || null,
    libraryHeroImageUrl: resolvedHeroUrl,
    libraryImageUrl: resolvedCoverUrl,
    logoImageUrl: resolvedLogoUrl,
    logoPosition: null,
    coverImageUrl: resolvedCoverUrl,
    downloadSources: [],
  };
  await gamesShopAssetsSublevel.put(gameKey, assets);

  const game = {
    title,
    iconUrl: resolvedIconUrl || null,
    logoImageUrl: resolvedLogoUrl || null,
    libraryHeroImageUrl: resolvedHeroUrl || null,
    objectId,
    shop,
    remoteId: null,
    isDeleted: false,
    playTimeInMilliseconds: 0,
    lastTimePlayed: null,
    addedToLibraryAt: new Date(),
    executablePath,
    executablePathUpdatedAt: new Date(),
    launchOptions: null,
    favorite: false,
    automaticCloudSync: false,
    hasManuallyUpdatedPlaytime: false,
  };

  await gamesSublevel.put(gameKey, game);

  return game;
};

registerEvent("addCustomGameToLibrary", addCustomGameToLibrary);
