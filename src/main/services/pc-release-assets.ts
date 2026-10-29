import { gamesShopAssetsSublevel, gamesSublevel } from "@main/level";
import { resolvePcRelease, type PcRelease } from "@shared";
import type { ShopAssets } from "@types";
import { HydraApi } from "./hydra-api";
import { logger } from "./logger";
import { WindowManager } from "./window-manager";

export interface PcReleaseArtwork {
  iconUrl: string | null;
  coverImageUrl: string | null;
  libraryHeroImageUrl: string | null;
  logoImageUrl: string | null;
}

/**
 * Artwork of the original game from the LaunchBox catalogue. It does not need
 * a Hydra account; when the request fails the game is added without it.
 */
export const fetchPcReleaseArtwork = async (
  release: PcRelease
): Promise<PcReleaseArtwork | null> => {
  if (!release.launchboxObjectId) return null;

  try {
    const assets = await HydraApi.get<ShopAssets | null>(
      `/games/launchbox/${release.launchboxObjectId}/assets`,
      null,
      { needsAuth: false }
    );
    if (!assets) return null;

    return {
      iconUrl: assets.iconUrl || null,
      coverImageUrl: assets.libraryImageUrl || assets.coverImageUrl || null,
      libraryHeroImageUrl: assets.libraryHeroImageUrl || null,
      logoImageUrl: assets.logoImageUrl || null,
    };
  } catch (error) {
    logger.error("Failed to fetch PC release artwork", {
      release: release.id,
      error,
    });
    return null;
  }
};

/**
 * Gives recomps and ports added before their catalog entry existed (or while
 * the artwork request failed) the original game's artwork. Only empty fields
 * are filled, so images the player picked are kept.
 */
export const backfillPcReleaseArtwork = async () => {
  let updated = 0;

  for await (const [key, game] of gamesSublevel.iterator()) {
    if (game.isDeleted) continue;

    const release = resolvePcRelease(game);
    if (!release?.launchboxObjectId) continue;

    const assets = await gamesShopAssetsSublevel.get(key).catch(() => null);
    const hasCover = Boolean(
      game.customCoverImageUrl ||
        assets?.coverImageUrl ||
        assets?.libraryImageUrl
    );
    if (hasCover && game.iconUrl && game.logoImageUrl) continue;

    const artwork = await fetchPcReleaseArtwork(release);
    if (!artwork) continue;

    const coverUrl =
      assets?.coverImageUrl || assets?.libraryImageUrl || artwork.coverImageUrl;
    const iconUrl = game.iconUrl || artwork.iconUrl;
    const heroUrl = game.libraryHeroImageUrl || artwork.libraryHeroImageUrl;
    const logoUrl = game.logoImageUrl || artwork.logoImageUrl;

    await gamesShopAssetsSublevel.put(key, {
      updatedAt: Date.now(),
      objectId: game.objectId,
      shop: game.shop,
      title: game.title,
      logoPosition: null,
      downloadSources: [],
      ...assets,
      iconUrl,
      coverImageUrl: coverUrl ?? "",
      libraryImageUrl: coverUrl ?? "",
      libraryHeroImageUrl: heroUrl ?? "",
      logoImageUrl: logoUrl ?? "",
    });
    await gamesSublevel.put(key, {
      ...game,
      iconUrl,
      libraryHeroImageUrl: heroUrl,
      logoImageUrl: logoUrl,
    });
    updated += 1;
  }

  if (updated > 0) {
    logger.info(`Filled in artwork for ${updated} PC recomps and ports`);
    WindowManager.sendToAppWindows("on-library-batch-complete");
  }
};
