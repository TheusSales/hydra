import assert from "node:assert/strict";
import { it } from "node:test";

import { PC_PORT_PLATFORM, pcPortObjectId } from "./pc-ports.js";
import {
  PC_RELEASES,
  findPcReleaseByExecutable,
  pcReleaseTagLabel,
  resolvePcRelease,
} from "./pc-releases.js";

it("matches recomps by executable name on Windows and Linux", () => {
  assert.equal(
    findPcReleaseByExecutable("C:\\Games\\Zelda64Recomp\\Zelda64Recompiled.exe")
      ?.id,
    "zelda64recomp"
  );
  assert.equal(
    findPcReleaseByExecutable(
      "/home/user/Games/UnleashedRecomp-x86_64.AppImage"
    )?.id,
    "unleashedrecomp"
  );
});

it("matches source ports without catching unrelated executables", () => {
  assert.equal(
    findPcReleaseByExecutable("D:\\Ports\\SoH\\soh.exe")?.id,
    "shipofharkinian"
  );
  assert.equal(
    findPcReleaseByExecutable("D:\\Ports\\2Ship\\2ship.exe")?.id,
    "2ship2harkinian"
  );
  assert.equal(findPcReleaseByExecutable("D:\\Games\\Soho\\game.exe"), null);
  assert.equal(findPcReleaseByExecutable("D:\\Games\\shooter.exe"), null);
});

it("matches the PS4 native ports by their launcher or folder", () => {
  for (const executablePath of [
    "C:\\Users\\me\\Jogos\\SotC-PC\\Shadow of The Colossus.exe",
    "C:\\Users\\me\\Jogos\\SotC-PC\\SotC.exe",
    "C:\\Users\\me\\Jogos\\SotC-PC\\launcher.exe",
  ]) {
    assert.equal(findPcReleaseByExecutable(executablePath)?.id, "sotcpc");
  }
  assert.equal(
    findPcReleaseByExecutable("D:\\Ports\\Bloodborne-Windows\\Bloodborne.exe")
      ?.id,
    "bloodbornepc"
  );
  assert.equal(findPcReleaseByExecutable("D:\\Games\\Sotchi\\game.exe"), null);
});

it("falls back to the folder name when the executable is generic", () => {
  assert.equal(
    findPcReleaseByExecutable("C:\\Games\\Starfox64Recomp\\launcher.exe")?.id,
    "starfox64recomp"
  );
});

it("prefers the executable name over the folder name", () => {
  assert.equal(
    findPcReleaseByExecutable("C:\\Zelda64Recomp\\2ship.exe")?.id,
    "2ship2harkinian"
  );
});

it("resolves catalog ports by object id and ignores other shops", () => {
  assert.equal(
    resolvePcRelease({
      shop: "custom",
      objectId: pcPortObjectId("spartanport"),
      platform: PC_PORT_PLATFORM,
      executablePath: "/opt/ports/release-1/SpartanPort.AppImage",
    })?.id,
    "spartanport"
  );
  assert.equal(
    resolvePcRelease({
      shop: "steam",
      objectId: "1",
      executablePath: "C:\\Zelda64Recompiled.exe",
    }),
    null
  );
});

it("labels the tag with the kind and the original console", () => {
  const unleashed = PC_RELEASES.find(
    (release) => release.id === "unleashedrecomp"
  );
  const spartan = PC_RELEASES.find((release) => release.id === "spartanport");
  assert.ok(unleashed && spartan);
  assert.equal(pcReleaseTagLabel(unleashed), "Recomp · X360");
  assert.equal(pcReleaseTagLabel(spartan), "Port · PS3");
});

it("matches the names used by each project's GitHub release", () => {
  // Release asset names (without the archive extension) as published on
  // GitHub; the executable inside is named the same way.
  const releaseNames: Record<string, string> = {
    "Zelda64Recompiled-v1.2.2-Windows": "zelda64recomp",
    "UnleashedRecomp-Windows": "unleashedrecomp",
    "BanjoRecompiled-v1.0.2-Windows": "banjorecomp",
    "MarioKart64Recompiled-v0.9.2-Linux-X64-Release": "mariokart64recomp",
    "Starfox64Recompiled-v1.0.3-Linux-X64-Release": "starfox64recomp",
    "Goemon64Recompiled-AppImage-X64-Release": "goemon64recomp",
    "GoldenEye-Recomp-Win": "goldeneyerecomp",
    "DK64Recompiled-Linux-X64-Release-1-0-3": "dk64recomp",
    "ConkerRecompiled-V0.1.6-Windows": "conkerrecomp",
    "ConkerBFDReloaded-v1.4.7-Windows": "conkerrecomp",
    "BM64Recompiled-Linux-X64-Release": "bm64recomp",
    "MegaMan64Recompiled-v0.9.1-Linux-X64": "megaman64recomp",
    "HarvestMoon64Recompiled-v1.2.2-Linux-X64": "harvestmoon64recomp",
    "DinosaurPlanetRecompiled-v0.3.0-Windows-x64": "dinosaurplanetrecomp",
    "Skate3Recomp-Windows": "skate3recomp",
    "DantesInferno-0.8.4-beta-portable": "dantesinferno",
    "EdgeOfTimeRecomp-v1.0.0-20261004_2039-win-amd64": "edgeoftimerecomp",
    "ReStreet-2.1.3-Setup.exe": "restreet",
    "nocturnerecomp-v1.4.5-linux-x64": "nocturnerecomp",
    "TheSimpsonsGame-Recompiled-Windows-x64": "simpsonsgamerecomp",
    "condemned2recompV0.5.1_windows": "condemned2recomp",
    "Burnout_Revenge_Installer-win-amd64.exe": "xerenge",
    "KingKong-v1.9.13-windows-x64": "kingkongrecomp",
    "DBZ-Budokai-3-HD-Collection-v1.5.5.5": "budokai3hd",
    "ttt2_setup.exe": "ttt2",
    "NFSMW-Recomp-1.0.2-Windows-x64": "nfsmwrecomp",
    "DPRecomp-2.0.14-win64": "dprecomp",
    "eternalsonata-v1.3.7-linux-amd64": "eternalsonata",
    "PinyonShift-Launcher": "pinyonshift",
    "ForzaHorizon1-ReImagined-Setup-0.2.0.exe": "fh1reimagined",
    "LostOdysseyRecomp-windows-x64": "lostodysseyrecomp",
    "LostOdysseyHD-0.2.0-win64": "lostodysseyrecomp",
    "Fable_2_recomp_v1.5.0_windows": "fable2recomp",
    "retip_1.14.0_windows_amd64": "retip",
    "renut-x86_64.AppImage": "renut",
    "naruto-rise-recomp-win-amd64": "narutoriserecomp",
    "DOAXBV-0.6.0": "doaxbv",
    "FinestHourRemasteredUpdate.exe": "finesthour",
    "MediEvilRecomp-v0.2b-windows-x64": "medievilrecomp",
    "driveclub-recomp-0.3.2-win64": "driveclubrecomp",
    "LuigisMansionRecompiled-1.1.5-windows-x64": "luigismansionrecomp",
    "EternalDarkness-windows-x64-202610200024-1cb3fe6": "eternaldarknessrecomp",
    "SkyRecomp-v2.0.2-Windows": "skyrecomp",
    "Sky.Recomp-v2.0.2-linux-x86_64.AppImage": "skyrecomp",
    "BrawlRecompiled-v0.5.0-Windows": "brawlrecomp",
    "BotW-Native-v0.1.1-windows-x64": "botwnative",
    "DKC1Recomp-v0.0.17-Windows-x64": "dkc1recomp",
    "MegaManXSNESRecomp-windows-2.3.9": "megamanxrecomp",
    "TotK-Setup-0.1.1-windows": "totkrecomp",
    "LetsGoRecomp-0.7.5-windows": "letsgorecomp",
  };

  for (const [name, id] of Object.entries(releaseNames)) {
    assert.equal(
      findPcReleaseByExecutable(`C:\\Games\\${name}`)?.id,
      id,
      `${name} should match ${id}`
    );
  }
});

it("does not tag ordinary games whose names share a word", () => {
  for (const name of [
    "Skyrim.exe",
    "SkyrimSE.exe",
    "Fable Anniversary.exe",
    "Burnout Paradise.exe",
    "KingdomCome.exe",
    "Forza Horizon 5.exe",
    "TotalWar.exe",
    "Eternal.exe",
  ]) {
    assert.equal(
      findPcReleaseByExecutable(`C:\\Games\\${name}`),
      null,
      `${name} should not match`
    );
  }
});

it("only points to LaunchBox for releases it has artwork for", () => {
  for (const release of PC_RELEASES) {
    if (release.launchboxObjectId === undefined) continue;
    assert.match(release.launchboxObjectId, /^\d+$/, release.id);
  }
});

it("keeps release ids unique", () => {
  const ids = PC_RELEASES.map((release) => release.id);
  assert.equal(new Set(ids).size, ids.length);
});
