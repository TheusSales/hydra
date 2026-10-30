import type { GameShop } from "@types";
import { pcPortObjectId, isPcPortGame } from "./pc-ports.js";

/**
 * Native PC builds of console games: static recompilations ("recomp") and
 * source ports. A custom game is matched to an entry by its executable name
 * (or its folder name), or by its PC port catalog id, so the library can show
 * a "Recomp · N64" tag and the original game's artwork from LaunchBox.
 *
 * The list covers stable GitHub releases of recomps and ports with a playable
 * PC build. Hydra's LaunchBox catalogue has no Xbox, Xbox 360, Switch, Wii U
 * or PS4 games, so those use another release of the same game when there is
 * one, and no artwork otherwise.
 */
export type PcReleaseKind = "recomp" | "port";

export interface PcRelease {
  id: string;
  kind: PcReleaseKind;
  /** Title of the original game, as listed on LaunchBox. */
  title: string;
  /** Short label of the console the game was released on. */
  originalPlatform: string;
  /** LaunchBox object id of the original game, used for its artwork. */
  launchboxObjectId?: string;
  /** Matched against the executable's file name and its parent folder. */
  executablePattern: RegExp;
  /** Id in the PC port catalog, for ports installed from Settings. */
  portId?: string;
}

const recomp = (
  id: string,
  title: string,
  originalPlatform: string,
  launchboxObjectId: string | undefined,
  executablePattern: RegExp
): PcRelease => ({
  id,
  kind: "recomp",
  title,
  originalPlatform,
  launchboxObjectId,
  executablePattern,
});

const port = (
  id: string,
  title: string,
  originalPlatform: string,
  launchboxObjectId: string | undefined,
  executablePattern: RegExp,
  portId?: string
): PcRelease => ({
  id,
  kind: "port",
  title,
  originalPlatform,
  launchboxObjectId,
  executablePattern,
  portId,
});

export const PC_RELEASES: readonly PcRelease[] = [
  // Nintendo 64
  recomp(
    "zelda64recomp",
    "The Legend of Zelda: Majora's Mask",
    "N64",
    "167",
    /zelda64recomp/i
  ),
  recomp(
    "starfox64recomp",
    "Star Fox 64",
    "N64",
    "3",
    /starfox64recomp|sf64recomp/i
  ),
  recomp(
    "banjorecomp",
    "Banjo-Kazooie",
    "N64",
    "154",
    /banjo\w*recomp|bkrecomp/i
  ),
  recomp(
    "goemon64recomp",
    "Mystical Ninja Starring Goemon",
    "N64",
    "1120",
    /goemon64recomp/i
  ),
  recomp(
    "mariokart64recomp",
    "Mario Kart 64",
    "N64",
    "251",
    /mariokart64recomp|mk64recomp/i
  ),
  recomp(
    "goldeneyerecomp",
    "GoldenEye 007",
    "N64",
    "152",
    /goldeneye[-_ ]?recomp/i
  ),
  recomp(
    "dk64recomp",
    "Donkey Kong 64",
    "N64",
    "236",
    /dk64recomp|donkey[-_ ]?kong[-_ ]?64[-_ ]?recomp/i
  ),
  recomp(
    "conkerrecomp",
    "Conker's Bad Fur Day",
    "N64",
    "235",
    /conkerrecomp|cbfd[-_ ]?recomp|conkerbfdreloaded/i
  ),
  recomp("bm64recomp", "Bomberman 64", "N64", "1041", /bm64recomp/i),
  recomp("megaman64recomp", "Mega Man 64", "N64", "1106", /megaman64recomp/i),
  recomp(
    "harvestmoon64recomp",
    "Harvest Moon 64",
    "N64",
    "1082",
    /harvestmoon64recomp/i
  ),
  recomp(
    "dinosaurplanetrecomp",
    "Dinosaur Planet",
    "N64",
    undefined,
    /dinosaurplanetrecomp/i
  ),

  // Xbox 360
  // LaunchBox has no Xbox 360 entries; these use another release's artwork.
  recomp(
    "unleashedrecomp",
    "Sonic Unleashed",
    "X360",
    "899",
    /unleashedrecomp/i
  ),
  recomp(
    "marathonrecomp",
    "Sonic the Hedgehog (2006)",
    "X360",
    "31659",
    /marathonrecomp/i
  ),
  recomp("skate3recomp", "Skate 3", "X360", "13021", /skate3recomp/i),
  recomp(
    "dantesinferno",
    "Dante's Inferno",
    "X360",
    "12288",
    /dantesinferno|hells[-_ ]?gate/i
  ),
  recomp(
    "edgeoftimerecomp",
    "Spider-Man: Edge of Time",
    "X360",
    "7620",
    /edgeoftimerecomp/i
  ),
  recomp("restreet", "FIFA Street", "X360", "11342", /^restreet/i),
  recomp(
    "nocturnerecomp",
    "Castlevania: Symphony of the Night",
    "X360",
    "489",
    /nocturnerecomp/i
  ),
  recomp(
    "simpsonsgamerecomp",
    "The Simpsons Game",
    "X360",
    "10515",
    /thesimpsonsgame[-_ ]?recomp/i
  ),
  recomp(
    "condemned2recomp",
    "Condemned 2: Bloodshot",
    "X360",
    "6302",
    /condemned2recomp/i
  ),
  recomp(
    "xerenge",
    "Burnout: Revenge",
    "X360",
    "5098",
    /xerenge|burnout[-_ ]?revenge/i
  ),
  recomp(
    "kingkongrecomp",
    "Peter Jackson's King Kong",
    "X360",
    "22301",
    /^kingkong(?:[-_ ]?recomp|[-_. ]|$)/i
  ),
  recomp(
    "budokai3hd",
    "Dragon Ball Z: Budokai HD Collection",
    "X360",
    "11411",
    /budokai[-_ ]?3[-_ ]?hd/i
  ),
  recomp(
    "ttt2",
    "Tekken Tag Tournament 2",
    "X360",
    "11060",
    /^ttt2|tekken[-_ ]?tag[-_ ]?tournament[-_ ]?2/i
  ),
  recomp(
    "nfsmwrecomp",
    "Need for Speed: Most Wanted",
    "X360",
    "4563",
    /nfsmw[-_ ]?recomp/i
  ),
  recomp("dprecomp", "Deadly Premonition", "X360", "16335", /^dprecomp/i),
  recomp("eternalsonata", "Eternal Sonata", "X360", "6307", /eternalsonata/i),
  recomp("pinyonshift", "Forza Horizon", "X360", undefined, /pinyonshift/i),
  recomp(
    "fh1reimagined",
    "Forza Horizon",
    "X360",
    undefined,
    /forzahorizon1[-_ ]?reimagined/i
  ),
  recomp(
    "lostodysseyrecomp",
    "Lost Odyssey",
    "X360",
    undefined,
    /lostodyssey(?:recomp|hd)/i
  ),
  recomp(
    "fable2recomp",
    "Fable II",
    "X360",
    undefined,
    /fable[-_ ]?2[-_ ]?recomp/i
  ),
  recomp(
    "retip",
    "Viva Piñata: Trouble in Paradise",
    "X360",
    undefined,
    /^retip/i
  ),
  recomp("renut", "Banjo-Kazooie: Nuts & Bolts", "X360", undefined, /^renut/i),
  recomp(
    "narutoriserecomp",
    "Naruto: Rise of a Ninja",
    "X360",
    undefined,
    /naruto[-_ ]?rise/i
  ),

  // Xbox
  recomp(
    "doaxbv",
    "Dead or Alive Xtreme Beach Volleyball",
    "Xbox",
    undefined,
    /doaxbv/i
  ),
  recomp(
    "finesthour",
    "Call of Duty: Finest Hour",
    "Xbox",
    "4043",
    /finesthour/i
  ),

  // PlayStation
  recomp("medievilrecomp", "MediEvil", "PS1", "9638", /medievilrecomp/i),
  recomp(
    "driveclubrecomp",
    "Driveclub",
    "PS4",
    undefined,
    /driveclub[-_ ]?recomp/i
  ),

  // GameCube, Wii and Wii U
  recomp(
    "luigismansionrecomp",
    "Luigi's Mansion",
    "GC",
    "2126",
    /luigismansionrecomp/i
  ),
  recomp(
    "eternaldarknessrecomp",
    "Eternal Darkness: Sanity's Requiem",
    "GC",
    "6676",
    /eternaldarkness/i
  ),
  recomp(
    "skyrecomp",
    "The Legend of Zelda: Skyward Sword",
    "Wii",
    "405367",
    /^sky[-_. ]?recomp/i
  ),
  recomp(
    "brawlrecomp",
    "Super Smash Bros. Brawl",
    "Wii",
    "3349",
    /brawlrecomp/i
  ),
  recomp(
    "botwnative",
    "The Legend of Zelda: Breath of the Wild",
    "Wii U",
    undefined,
    /botw[-_ ]?native/i
  ),

  // Super Nintendo and Switch
  recomp("dkc1recomp", "Donkey Kong Country", "SNES", "127", /dkc1recomp/i),
  recomp("megamanxrecomp", "Mega Man X", "SNES", "138", /megamanxsnesrecomp/i),
  recomp(
    "totkrecomp",
    "The Legend of Zelda: Tears of the Kingdom",
    "Switch",
    undefined,
    /^totk(?:[-_ .]|$)|totk[-_ ]?pc/i
  ),
  recomp(
    "letsgorecomp",
    "Pokémon: Let's Go, Eevee!",
    "Switch",
    undefined,
    /letsgorecomp/i
  ),

  // Source ports
  // PS4 native ports built on bloodborne_pc. LaunchBox has no PS4 entries, so
  // Shadow of the Colossus uses the PS3 release's artwork.
  port(
    "sotcpc",
    "Shadow of the Colossus",
    "PS4",
    "15993",
    /^shadow of the colossus(?:\.exe)?$|^sotc(?:[-_ .]|$)/i
  ),
  port(
    "bloodbornepc",
    "Bloodborne",
    "PS4",
    undefined,
    /^bloodborne(?:[-_ .]|$)/i
  ),
  port(
    "shipofharkinian",
    "The Legend of Zelda: Ocarina of Time",
    "N64",
    "153",
    /^soh(?:[-_.]|$)|shipofharkinian/i
  ),
  port(
    "2ship2harkinian",
    "The Legend of Zelda: Majora's Mask",
    "N64",
    "167",
    /^2ship/i
  ),
  port(
    "sm64",
    "Super Mario 64",
    "N64",
    "204",
    /^sm64(?:ex|coop\w*|[-_.]|$)|render96/i
  ),
  port(
    "spartanport",
    "God of War III Remastered",
    "PS3",
    "819",
    /spartanport|^gow3[-_.]|^god of war iii/i,
    "spartanport"
  ),
];

/**
 * GitHub repository of each project, linked from the catalog. Super Mario 64
 * has many competing ports, so it links to none.
 */
export const PC_RELEASE_REPOSITORIES: Readonly<Record<string, string>> = {
  zelda64recomp: "Zelda64Recomp/Zelda64Recomp",
  starfox64recomp: "sonicdcer/Starfox64Recomp",
  banjorecomp: "BanjoRecomp/BanjoRecomp",
  goemon64recomp: "klorfmorf/Goemon64Recomp",
  mariokart64recomp: "sonicdcer/MarioKart64Recomp",
  goldeneyerecomp: "SunJaycy/GoldenEye-Recomp",
  dk64recomp: "Rainchus/Donkey-Kong-64-Recompiled",
  conkerrecomp: "sciaschi/CBFD-Recompiled",
  bm64recomp: "RevoSucks/BM64Recomp",
  megaman64recomp: "MegaMan64Recomp/MegaMan64Recompiled",
  harvestmoon64recomp: "HarvestMoon64Recomp/HarvestMoon64Recomp",
  dinosaurplanetrecomp: "DinosaurPlanetRecomp/dino-recomp",
  unleashedrecomp: "hedge-dev/UnleashedRecomp",
  marathonrecomp: "sonicnext-dev/MarathonRecomp",
  skate3recomp: "mchughalex/skate3recomp",
  dantesinferno: "florinp93/hells-gate-recomp",
  edgeoftimerecomp: "goliathret/EdgeOfTimeRecomp",
  restreet: "samuelit0davila/fifa-street-pc-port",
  nocturnerecomp: "birabittoh/NocturneRecomp",
  simpsonsgamerecomp: "YesterMester/TheSimpsonsGameRecomp",
  condemned2recomp: "psxrestore/Condemned2Recomp",
  xerenge: "shipa-2/Xerenge",
  kingkongrecomp: "TekRantGaming/king-kong-recompiled",
  budokai3hd: "novapowers0/DBZ-Budokai-3-HD-Collection",
  ttt2: "shihabal3amri/tekken-tag-tournament-2-pc",
  nfsmwrecomp: "madelrandel-blip/NFSMW-Recompiled",
  dprecomp: "LittleBitUA/DPRecomp",
  eternalsonata: "birabittoh/EternalSonataReprise",
  pinyonshift: "arcanite24/pinyon-shift",
  fh1reimagined: "FH1-ReImagined/ForzaHorizon1-ReImagined",
  lostodysseyrecomp: "freefrank/LostOdysseyRecomp",
  fable2recomp: "himdo/Fable-2-Recomp",
  retip: "SolarCookies/TiP-Recomp",
  renut: "masterspike52/reNut",
  narutoriserecomp: "jorjbarbosa/naruto-rise-recomp",
  doaxbv: "NoRain211/doaxvb-re",
  finesthour: "crazyriddler/FinestHourRemastered",
  medievilrecomp: "BlackLabelHQ/MediEvilRecomp",
  driveclubrecomp: "OverkillLabs3/driveclub-recomp",
  luigismansionrecomp: "rob646464/luigis-mansion-recompiled",
  eternaldarknessrecomp: "griches/EternalDarknessRecomp",
  skyrecomp: "Apolinario-coder/SkyRecomp",
  brawlrecomp: "josiahg2502-glitch/BrawlRecompiled",
  botwnative: "ryderclanky/BotW-Native",
  dkc1recomp: "elliotttate/DKC1Recomp",
  megamanxrecomp: "mstan/MegaManXSNESRecomp",
  totkrecomp: "valentderah/totk-pc-recomp",
  letsgorecomp: "raulzrrs/letsgo-recomp",
  sotcpc: "AjncSystem/ShadowOfTheColossus-PC",
  bloodbornepc: "Supermedo/bloodborne_pc",
  shipofharkinian: "HarbourMasters/Shipwright",
  "2ship2harkinian": "HarbourMasters/2ship2harkinian",
  spartanport: "FelipePrado0/SpartanPort",
};

const pathSegments = (executablePath: string) =>
  executablePath.split(/[\\/]+/).filter(Boolean);

export const findPcReleaseByExecutable = (
  executablePath: string | null | undefined
): PcRelease | null => {
  if (!executablePath) return null;

  const segments = pathSegments(executablePath);
  const fileName = segments.at(-1);
  const folderName = segments.at(-2);

  // The file name wins over the folder, so a port inside a folder named
  // after another release is still recognized.
  for (const name of [fileName, folderName]) {
    if (!name) continue;
    const release = PC_RELEASES.find((entry) =>
      entry.executablePattern.test(name)
    );
    if (release) return release;
  }

  return null;
};

export interface PcReleaseGame {
  shop: GameShop;
  objectId: string;
  platform?: string | null;
  executablePath?: string | null;
}

export const resolvePcRelease = (game: PcReleaseGame): PcRelease | null => {
  if (game.shop !== "custom") return null;

  if (isPcPortGame(game.shop, game.platform)) {
    const port = PC_RELEASES.find(
      (entry) => entry.portId && pcPortObjectId(entry.portId) === game.objectId
    );
    if (port) return port;
  }

  return findPcReleaseByExecutable(game.executablePath);
};

const KIND_LABELS: Record<PcReleaseKind, string> = {
  recomp: "Recomp",
  port: "Port",
};

export const pcReleaseTagLabel = (release: PcRelease) =>
  `${KIND_LABELS[release.kind]} · ${release.originalPlatform}`;
