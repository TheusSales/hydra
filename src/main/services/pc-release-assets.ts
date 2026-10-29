import type { PcRelease } from "@shared";
import type { ShopAssets } from "@types";
import { HydraApi } from "./hydra-api";
import { logger } from "./logger";

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
