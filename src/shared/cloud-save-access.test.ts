import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getCloudSaveAccessAction,
  isSelfHostedCloudSaveConfigured,
} from "./cloud-save-access.js";

describe("cloud save access", () => {
  it("sends unauthenticated users to sign in", () => {
    assert.equal(getCloudSaveAccessAction(false, false), "sign-in");
  });

  it("sends authenticated users without a subscription to the paywall", () => {
    assert.equal(getCloudSaveAccessAction(true, false), "paywall");
  });

  it("opens cloud saves only for active subscribers", () => {
    assert.equal(getCloudSaveAccessAction(true, true), "open");
  });

  it("opens self-hosted cloud saves without a Hydra account", () => {
    assert.equal(getCloudSaveAccessAction(false, false, true), "open");
    assert.equal(getCloudSaveAccessAction(true, false, true), "open");
  });

  it("treats self-hosted saves as configured only with an rclone remote", () => {
    assert.equal(isSelfHostedCloudSaveConfigured(null), false);
    assert.equal(
      isSelfHostedCloudSaveConfigured({ cloudSaveBackend: "rclone" }),
      false
    );
    assert.equal(
      isSelfHostedCloudSaveConfigured({
        cloudSaveBackend: "rclone",
        rcloneCloudSaveRemote: "  ",
      }),
      false
    );
    assert.equal(
      isSelfHostedCloudSaveConfigured({
        cloudSaveBackend: "hydra",
        rcloneCloudSaveRemote: "vps:saves",
      }),
      false
    );
    assert.equal(
      isSelfHostedCloudSaveConfigured({
        cloudSaveBackend: "rclone",
        rcloneCloudSaveRemote: "vps:saves",
      }),
      true
    );
  });
});
