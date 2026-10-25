import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { parseLaunchOptions } from "../../events/helpers/parse-launch-options.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import { findPcPort } from "./catalog.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import {
  PcPortGameDataInvalidError,
  validatePcPortGameData,
} from "./port-game-data.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import {
  buildPcPortLaunchOptions,
  findPcPortExecutable,
  findRemotePcPortSavePath,
  mergePcPortSettings,
  parseSha256Sidecar,
  pcPortVersionFromTag,
  selectPcPortReleaseAsset,
} from "./port-runtime.ts";

const port = findPcPort("spartanport");

/** Minimal PS4 param.sfo holding a single TITLE_ID entry. */
const paramSfo = (titleId: string) => {
  const key = Buffer.from("TITLE_ID\0");
  const value = Buffer.alloc(16);
  value.write(titleId, "ascii");
  const header = Buffer.alloc(20 + 16);
  header.writeUInt32LE(0x46535000, 0);
  header.writeUInt32LE(0x101, 4);
  header.writeUInt32LE(36, 8); // key table
  header.writeUInt32LE(36 + key.length, 12); // data table
  header.writeUInt32LE(1, 16);
  header.writeUInt16LE(0, 20); // key offset
  header.writeUInt16LE(0x0204, 22); // utf8 string
  header.writeUInt32LE(titleId.length + 1, 24);
  header.writeUInt32LE(16, 28);
  header.writeUInt32LE(0, 32); // data offset
  return Buffer.concat([header, key, value]);
};

const roots: string[] = [];
const makeDump = async (titleId: string, files = ["eboot.bin"]) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hydra-port-"));
  roots.push(root);
  await fs.mkdir(path.join(root, "sce_sys"));
  await fs.writeFile(
    path.join(root, "sce_sys", "param.sfo"),
    paramSfo(titleId)
  );
  for (const file of files) await fs.writeFile(path.join(root, file), "");
  return root;
};

after(async () => {
  await Promise.all(
    roots.map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

const rejectsWith = (promise: Promise<unknown>, code: string) =>
  assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof PcPortGameDataInvalidError && error.code === code
  );

describe("PC port game data validation", () => {
  it("accepts supported dumps and reports the title id", async () => {
    const gameDir = await makeDump("CUSA01715");
    assert.deepEqual(await validatePcPortGameData(port, gameDir), {
      titleId: "CUSA-01715",
    });
  });

  it("names the files missing from the game folder", async () => {
    const gameDir = await makeDump("CUSA01715", []);
    await rejectsWith(
      validatePcPortGameData(port, gameDir),
      "pc_port_game_dir_missing_files"
    );
  });

  it("rejects titles the port does not support", async () => {
    const gameDir = await makeDump("CUSA00001");
    await rejectsWith(
      validatePcPortGameData(port, gameDir),
      "pc_port_game_dir_unsupported_title"
    );
  });

  it("requires the update folder to belong to the same title", async () => {
    const gameDir = await makeDump("CUSA01715");
    const sameTitle = await makeDump("CUSA01715");
    const otherTitle = await makeDump("CUSA01623");

    await validatePcPortGameData(port, gameDir, sameTitle);
    await rejectsWith(
      validatePcPortGameData(port, gameDir, gameDir),
      "pc_port_update_dir_same_as_game"
    );
    await rejectsWith(
      validatePcPortGameData(port, gameDir, otherTitle),
      "pc_port_update_dir_title_mismatch"
    );
  });
});

describe("PC port runtime helpers", () => {
  it("builds launch options the library launcher parses back", () => {
    const options = buildPcPortLaunchOptions(port, "/home/me/My Data");
    assert.deepEqual(parseLaunchOptions(options), [
      "SPARTAN_DATA_DIR=/home/me/My Data",
      "%command%",
      "--play",
    ]);
  });

  it("only overrides the game folders in the port's own settings", () => {
    assert.deepEqual(
      mergePcPortSettings(
        port,
        { game_dir: "/old", ui_language: "pt", update_dir: "/old-update" },
        "/new",
        null
      ),
      { game_dir: "/new", ui_language: "pt", update_dir: "" }
    );
    assert.deepEqual(mergePcPortSettings(port, "corrupt", "/new", "/up"), {
      game_dir: "/new",
      update_dir: "/up",
    });
  });

  it("picks this platform's build and its checksum, old names included", () => {
    const asset = (name: string) => ({
      name,
      browser_download_url: `https://example.com/${name}`,
      size: 1,
    });
    const assets = [
      asset("spartanport-windows.zip"),
      asset("spartanport-x86_64.AppImage"),
      asset("spartanport-x86_64.AppImage.sha256"),
    ];

    const linux = selectPcPortReleaseAsset(port, "linux", assets);
    assert.equal(linux?.asset.name, "spartanport-x86_64.AppImage");
    assert.equal(linux?.checksum?.name, "spartanport-x86_64.AppImage.sha256");
    assert.equal(selectPcPortReleaseAsset(port, "darwin", assets), null);
    assert.equal(
      selectPcPortReleaseAsset(port, "linux", [asset("gow3-x86_64.AppImage")])
        ?.checksum,
      null
    );
  });

  it("reads sha256sum sidecars", () => {
    const hash = "A".repeat(64);
    assert.equal(
      parseSha256Sidecar(`${hash}  spartanport-x86_64.AppImage\n`),
      hash.toLowerCase()
    );
    assert.equal(parseSha256Sidecar("not a hash"), null);
  });

  it("picks the Windows zip and its checksum", () => {
    const asset = (name: string) => ({
      name,
      browser_download_url: `https://example.com/${name}`,
      size: 1,
    });
    const selected = selectPcPortReleaseAsset(port, "win32", [
      asset("spartanport-x86_64.AppImage"),
      asset("spartanport-windows.zip"),
      asset("spartanport-windows.zip.sha256"),
    ]);
    assert.equal(selected?.asset.name, "spartanport-windows.zip");
    assert.equal(selected?.spec.type, "zip");
    assert.equal(selected?.checksum?.name, "spartanport-windows.zip.sha256");
  });

  it("reads sidecars written in binary mode", () => {
    const hash = "b".repeat(64);
    assert.equal(parseSha256Sidecar(`${hash} *spartanport-windows.zip`), hash);
  });

  it("shows the version without the release tag's platform prefix", () => {
    assert.equal(pcPortVersionFromTag("windows-v2.7.0"), "v2.7.0");
    assert.equal(pcPortVersionFromTag("v1.4.0"), "v1.4.0");
    assert.equal(pcPortVersionFromTag("2.0.1"), "2.0.1");
  });

  it("finds the launcher inside the zip's top-level folder, preferred name first", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hydra-port-zip-"));
    roots.push(root);
    const folder = path.join(root, "spartanport-windows");
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, "God of War III.exe"), "");
    await fs.writeFile(path.join(folder, "SpartanPort.exe"), "");

    assert.equal(
      await findPcPortExecutable(root, [
        "SpartanPort.exe",
        "God of War III.exe",
      ]),
      path.join(folder, "SpartanPort.exe")
    );
    assert.equal(await findPcPortExecutable(root, ["Missing.exe"]), null);
  });

  it("adopts a save folder uploaded from another operating system", () => {
    const windows =
      "<custom><windows><winAppData>/hydralauncher/ports/spartanport/data/user/savedata";
    assert.equal(
      findRemotePcPortSavePath(port, "user/savedata", [
        "<custom><linux><home>/other/save",
        windows,
      ]),
      windows
    );
    assert.equal(
      findRemotePcPortSavePath(port, "user/savedata", [
        "<custom><linux><home>/ports/another/data/user/savedata",
      ]),
      null
    );
  });
});
