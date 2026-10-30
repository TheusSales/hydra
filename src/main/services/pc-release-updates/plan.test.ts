import assert from "node:assert/strict";
import { it } from "node:test";

import {
  PC_RELEASES,
  PC_RELEASE_REPOSITORIES,
} from "../../../shared/pc-releases.js";
import {
  PC_RELEASE_UPDATE_SOURCES,
  displayVersion,
  findPackageExecutable,
  isSameVersion,
  packageFilesUnder,
  parseAssetDigest,
  selectUpdateAsset,
  updatePackageKind,
  type GithubRelease,
} from "./plan.js";

const release = (names: string[]): GithubRelease => ({
  tag_name: "v1.2.2",
  html_url: "https://github.com/owner/repo/releases/tag/v1.2.2",
  assets: names.map((name) => ({
    name,
    browser_download_url: `https://example.invalid/${name}`,
    size: 1,
    digest: `sha256:${"a".repeat(64)}`,
  })),
});

it("only lists update sources for releases in the catalog", () => {
  const ids = new Set(PC_RELEASES.map((entry) => entry.id));
  for (const id of Object.keys(PC_RELEASE_UPDATE_SOURCES)) {
    assert.ok(ids.has(id), `${id} is not in the PC release catalog`);
  }
});

it("picks each project's Windows and Linux package from its real assets", () => {
  const zelda = release([
    "Zelda64Recompiled-v1.2.2-Linux-ARM64.zip",
    "Zelda64Recompiled-v1.2.2-Linux-Flatpak-X64.zip",
    "Zelda64Recompiled-v1.2.2-Linux-X64.zip",
    "Zelda64Recompiled-v1.2.2-macOS.zip",
    "Zelda64Recompiled-v1.2.2-Windows.zip",
  ]);
  const source = PC_RELEASE_UPDATE_SOURCES.zelda64recomp;
  assert.equal(
    selectUpdateAsset(source, "win32", zelda)?.name,
    "Zelda64Recompiled-v1.2.2-Windows.zip"
  );
  assert.equal(
    selectUpdateAsset(source, "linux", zelda)?.name,
    "Zelda64Recompiled-v1.2.2-Linux-X64.zip"
  );

  const nocturne = release([
    "nocturnerecomp-tu-v1.4.5-windows-x64.zip",
    "nocturnerecomp-v1.4.5-windows-x64.zip",
  ]);
  assert.equal(
    selectUpdateAsset(
      PC_RELEASE_UPDATE_SOURCES.nocturnerecomp,
      "win32",
      nocturne
    )?.name,
    "nocturnerecomp-v1.4.5-windows-x64.zip"
  );

  const banjo = release(["BanjoRecompiled-v1.0.2-Linux-X64.tar.gz"]);
  assert.equal(
    selectUpdateAsset(PC_RELEASE_UPDATE_SOURCES.banjorecomp, "linux", banjo),
    null
  );
});

it("reads GitHub's sha256 digests and rejects anything else", () => {
  const hex = "B".repeat(64);
  assert.equal(parseAssetDigest(`sha256:${hex}`), hex.toLowerCase());
  assert.equal(parseAssetDigest("sha1:abc"), null);
  assert.equal(parseAssetDigest(null), null);
  assert.equal(parseAssetDigest("sha256:short"), null);
});

it("installs archives and single AppImages but not installers", () => {
  assert.equal(updatePackageKind("Skate3Recomp-Windows.zip"), "archive");
  assert.equal(updatePackageKind("GoldenEye-Recomp-Win.rar"), "archive");
  assert.equal(updatePackageKind("Game-x86_64.AppImage"), "file");
  assert.equal(updatePackageKind("Setup-1.0.exe"), null);
  assert.equal(updatePackageKind("game.tar.gz"), null);
});

it("compares and shows versions the way projects tag them", () => {
  assert.ok(isSameVersion("v1.2.2", "1.2.2"));
  assert.ok(isSameVersion("windows-v1.9.6", "windows-v1.9.6"));
  assert.ok(!isSameVersion("v1.0.2", "v1.0.3"));
  assert.equal(displayVersion("1.0.3"), "v1.0.3");
  assert.equal(displayVersion("v1.2.2"), "v1.2.2");
  assert.equal(displayVersion("Goldeneye1.2.4"), "Goldeneye1.2.4");
});

it("finds the executable inside a wrapping folder", () => {
  const files = [
    "Zelda64Recompiled/Zelda64Recompiled.exe",
    "Zelda64Recompiled/assets/font.ttf",
    "Zelda64Recompiled/SDL2.dll",
    "README.txt",
  ];
  const executable = findPackageExecutable(
    files,
    "zelda64recompiled.exe",
    /zelda64recomp/i,
    "win32"
  );
  assert.equal(executable, "Zelda64Recompiled/Zelda64Recompiled.exe");
  assert.deepEqual(packageFilesUnder(files, executable!), [
    "Zelda64Recompiled.exe",
    "assets/font.ttf",
    "SDL2.dll",
  ]);
});

it("follows an executable renamed per version, but only when unambiguous", () => {
  assert.equal(
    findPackageExecutable(
      ["DK64Recompiled-1-0-4.exe", "data.bin"],
      "DK64Recompiled-1-0-3.exe",
      /dk64recomp/i,
      "win32"
    ),
    "DK64Recompiled-1-0-4.exe"
  );
  assert.equal(
    findPackageExecutable(
      ["a/Game.exe", "b/Game.exe"],
      "Game.exe",
      /game/i,
      "win32"
    ),
    null
  );
  assert.equal(
    findPackageExecutable(
      ["Other.exe"],
      "Zelda64Recompiled.exe",
      /zelda64recomp/i,
      "win32"
    ),
    null
  );
});

it("updates each project from the repository the catalog links to", () => {
  for (const [id, source] of Object.entries(PC_RELEASE_UPDATE_SOURCES)) {
    assert.equal(source.repository, PC_RELEASE_REPOSITORIES[id], id);
  }
  const ids = new Set(PC_RELEASES.map((entry) => entry.id));
  for (const id of Object.keys(PC_RELEASE_REPOSITORIES)) {
    assert.ok(ids.has(id), `${id} has a repository but no catalog entry`);
  }
});
