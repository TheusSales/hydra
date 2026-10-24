import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import type { PrepareSnapshotRequest } from "@types";

// @ts-ignore The Node ESM test runner requires the source extension.
import { RcloneWebdavServer } from "./rclone-webdav-server.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import {
  blobPath,
  SelfHostedSnapshotStore,
} from "./self-hosted-snapshot-store.ts";

const hasRclone = spawnSync("rclone", ["version"]).status === 0;

const variantId = "a".repeat(64);
const content = Buffer.from("god of war iii slot 1");
const hash = createHash("sha256").update(content).digest("hex");

const request = (baseVersion: number): PrepareSnapshotRequest => ({
  shop: "launchbox",
  objectId: "gow3",
  platform: "linux",
  snapshotHash: "d".repeat(64),
  baseVersion,
  customPathRawPaths: [],
  variants: [{ variantId, kind: "default" }],
  files: [
    {
      variantId,
      rawPath: "<home>/savedata",
      relativePath: "SAVEDATA00/data.bin",
      hash,
      sizeBytes: content.length,
      lastModifiedAt: "2026-10-23T00:00:00.000Z",
    },
  ],
});

describe("rclone webdav self-hosted store", { skip: !hasRclone }, () => {
  let root: string;
  let server: RcloneWebdavServer;

  before(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "hydra-rclone-"));
    server = new RcloneWebdavServer({ remote: root });
    await server.ensureStarted();
  });

  after(async () => {
    server.stop();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("listens on loopback only, behind a random URL prefix", async () => {
    const url = new URL(server.blobUrl(blobPath(hash)));
    assert.equal(url.hostname, "127.0.0.1");
    assert.match(url.pathname, /^\/[a-f0-9]{48}\/blobs\//);

    const withoutToken = await fetch(`${url.origin}/blobs/${hash}`, {
      method: "PUT",
      body: "x",
    });
    assert.ok(!withoutToken.ok);
  });

  it("runs prepare, upload, commit and restore against a real remote", async () => {
    const store = new SelfHostedSnapshotStore(server);

    const prepared = await store.prepareSnapshot(request(0));
    const [file] = prepared.files;
    assert.ok(file.status === "upload");

    // Same request shape as the native addon's upload_local_save_blob.
    const upload = await fetch(file.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": file.requiredHeaders["Content-Length"],
        "x-amz-checksum-sha256": file.requiredHeaders["x-amz-checksum-sha256"],
      },
      body: content,
    });
    assert.ok(upload.ok, `upload failed: ${upload.status}`);

    const committed = await store.commitSnapshot({
      pendingSnapshotId: prepared.pendingSnapshotId,
    });
    assert.equal(committed.version, 1);

    assert.deepEqual(
      await fs.readFile(path.join(root, "blobs", hash)),
      content
    );
    const documents = await fs.readdir(path.join(root, "games", "launchbox"));
    assert.equal(documents.length, 1);

    const [download] = await store.getSnapshotDownloadUrls(
      committed.snapshotId
    );
    const restored = Buffer.from(
      await (await fetch(download.downloadUrl)).arrayBuffer()
    );
    assert.deepEqual(restored, content);

    const second = await store.prepareSnapshot(request(1));
    assert.equal(second.files[0].status, "skip");
  });

  it("reads snapshot documents rewritten behind its back", async () => {
    const store = new SelfHostedSnapshotStore(server);
    const [before] = await store.listSnapshots("gow3", "launchbox");

    const [document] = await fs.readdir(path.join(root, "games", "launchbox"));
    const documentPath = path.join(root, "games", "launchbox", document);
    const stored = JSON.parse(await fs.readFile(documentPath, "utf8"));
    await fs.writeFile(
      documentPath,
      JSON.stringify({ ...stored, version: before.version + 1 })
    );

    const [after] = await store.listSnapshots("gow3", "launchbox");
    assert.equal(after.version, before.version + 1);
  });
});
