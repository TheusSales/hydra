import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";

import type { RemoteObjectStore } from "./self-hosted-snapshot-store";

export interface RcloneRemoteConfig {
  /** rclone remote and optional root, e.g. `vps:hydra-saves`. */
  remote: string;
  /** rclone binary; defaults to `rclone` on PATH. */
  binaryPath?: string | null;
}

const STARTUP_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 60_000;

const findFreePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not allocate a local port"));
      });
    });
  });

const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

/**
 * Serves the configured rclone remote over WebDAV on 127.0.0.1 so the native
 * addon can stream save blobs with plain HTTP PUT/GET. A random URL prefix acts
 * as the capability token; the server never listens on other interfaces.
 */
export class RcloneWebdavServer implements RemoteObjectStore {
  private process: ChildProcess | null = null;
  private baseUrl: string | null = null;
  private starting: Promise<void> | null = null;

  constructor(
    readonly config: RcloneRemoteConfig,
    private readonly log: (message: string) => void = () => {}
  ) {}

  private get binary() {
    return this.config.binaryPath?.trim() || "rclone";
  }

  async ensureStarted() {
    if (this.baseUrl && this.process && this.process.exitCode === null) return;
    this.starting ??= this.start().finally(() => {
      this.starting = null;
    });
    await this.starting;
  }

  private async start() {
    const port = await findFreePort();
    const token = randomBytes(24).toString("hex");
    const args = [
      "serve",
      "webdav",
      this.config.remote,
      "--addr",
      `127.0.0.1:${port}`,
      "--baseurl",
      `/${token}`,
      // Snapshot documents are rewritten by other machines; never trust a
      // cached size or listing when reading them back.
      "--dir-cache-time",
      "0s",
      "--poll-interval",
      "0",
    ];

    const child = spawn(this.binary, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    this.process = child;

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("exit", (code, signal) => {
      if (this.process === child) {
        this.process = null;
        this.baseUrl = null;
      }
      // rclone echoes the served URL; keep the capability token out of logs.
      this.log(
        `rclone webdav exited (code=${code}, signal=${signal}) ${stderr
          .replaceAll(token, "<token>")
          .trim()}`
      );
    });

    const spawnError = new Promise<never>((_, reject) => {
      child.once("error", (error: NodeJS.ErrnoException) => {
        reject(
          new Error(
            error.code === "ENOENT"
              ? "cloud_save_rclone_not_found"
              : `Failed to start rclone: ${error.message}`
          )
        );
      });
      child.once("exit", () =>
        reject(
          new Error(
            `rclone exited during startup: ${stderr.replaceAll(token, "<token>").trim()}`
          )
        )
      );
    });

    const baseUrl = `http://127.0.0.1:${port}/${token}/`;
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    const waitUntilReady = async () => {
      while (Date.now() < deadline) {
        try {
          const response = await fetch(baseUrl, {
            method: "PROPFIND",
            headers: { Depth: "0" },
          });
          if (response.status < 500) return;
        } catch {
          // not listening yet
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw new Error(
        `rclone webdav did not start: ${stderr.replaceAll(token, "<token>").trim()}`
      );
    };

    try {
      await Promise.race([waitUntilReady(), spawnError]);
    } catch (error) {
      child.kill();
      throw error;
    }
    spawnError.catch(() => {});
    this.baseUrl = baseUrl;

    for (const directory of ["blobs", "games"]) {
      await this.mkcol(directory);
    }
  }

  stop() {
    this.process?.kill();
    this.process = null;
    this.baseUrl = null;
  }

  private url(path: string) {
    if (!this.baseUrl) throw new Error("rclone webdav server is not running");
    return this.baseUrl + encodePath(path);
  }

  private async request(path: string, init: RequestInit) {
    await this.ensureStarted();
    return fetch(this.url(path), {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  private async mkcol(path: string) {
    const segments = path.split("/");
    for (let index = 1; index <= segments.length; index += 1) {
      const response = await fetch(
        this.url(segments.slice(0, index).join("/")),
        { method: "MKCOL" }
      );
      // 405: already exists
      if (!response.ok && response.status !== 405) {
        throw new Error(
          `rclone webdav MKCOL ${path} failed: ${response.status}`
        );
      }
    }
  }

  blobUrl(path: string) {
    return this.url(path);
  }

  async readJson(path: string) {
    const response = await this.request(path, { method: "GET" });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`rclone webdav GET ${path} failed: ${response.status}`);
    }
    return (await response.json()) as unknown;
  }

  async writeJson(path: string, value: unknown) {
    const directory = path.split("/").slice(0, -1).join("/");
    await this.ensureStarted();
    if (directory) await this.mkcol(directory);
    const response = await this.request(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    if (!response.ok) {
      throw new Error(`rclone webdav PUT ${path} failed: ${response.status}`);
    }
  }

  async exists(path: string) {
    const response = await this.request(path, { method: "HEAD" });
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new Error(`rclone webdav HEAD ${path} failed: ${response.status}`);
    }
    return true;
  }

  async delete(path: string) {
    const response = await this.request(path, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      throw new Error(
        `rclone webdav DELETE ${path} failed: ${response.status}`
      );
    }
  }
}
