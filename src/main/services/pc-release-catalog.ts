import { gamesSublevel } from "@main/level";
import {
  PC_RELEASES,
  PC_RELEASE_REPOSITORIES,
  pcReleaseTagLabel,
  resolvePcRelease,
  type PcRelease,
} from "@shared";
import type { GameShop, PcReleaseCatalogEntry } from "@types";

import { fetchPcReleaseArtwork } from "./pc-release-assets";
import { PC_RELEASE_UPDATE_SOURCES } from "./pc-release-updates/plan";

const COVER_REQUESTS_AT_ONCE = 6;

// Covers come from LaunchBox and don't change, so they're kept for the session.
const coverByLaunchboxId = new Map<string, string | null>();

const loadCovers = async (releases: readonly PcRelease[]) => {
  const pending = [
    ...new Set(
      releases
        .map((release) => release.launchboxObjectId)
        .filter(
          (id): id is string => Boolean(id) && !coverByLaunchboxId.has(id!)
        )
    ),
  ];

  const worker = async () => {
    for (let id = pending.shift(); id; id = pending.shift()) {
      const release = releases.find((entry) => entry.launchboxObjectId === id)!;
      const artwork = await fetchPcReleaseArtwork(release);
      // A failed request is retried the next time the catalog opens.
      if (artwork) coverByLaunchboxId.set(id, artwork.coverImageUrl);
    }
  };

  await Promise.all(
    Array.from({ length: COVER_REQUESTS_AT_ONCE }, () => worker())
  );
};

export const listPcReleaseCatalog = async (): Promise<
  PcReleaseCatalogEntry[]
> => {
  const libraryGames = new Map<string, { shop: GameShop; objectId: string }>();
  for await (const [, game] of gamesSublevel.iterator()) {
    if (game.isDeleted) continue;
    const release = resolvePcRelease(game);
    if (release && !libraryGames.has(release.id)) {
      libraryGames.set(release.id, {
        shop: game.shop,
        objectId: game.objectId,
      });
    }
  }

  await loadCovers(PC_RELEASES);

  return PC_RELEASES.map((release) => {
    const repository = PC_RELEASE_REPOSITORIES[release.id];
    return {
      id: release.id,
      kind: release.kind,
      title: release.title,
      originalPlatform: release.originalPlatform,
      tag: pcReleaseTagLabel(release),
      repositoryUrl: repository ? `https://github.com/${repository}` : null,
      coverUrl: release.launchboxObjectId
        ? (coverByLaunchboxId.get(release.launchboxObjectId) ?? null)
        : null,
      autoUpdate: release.id in PC_RELEASE_UPDATE_SOURCES,
      libraryGame: libraryGames.get(release.id) ?? null,
    };
  });
};
