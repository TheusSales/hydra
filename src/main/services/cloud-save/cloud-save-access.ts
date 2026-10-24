import {
  getCloudSaveAccessAction,
  SubscriptionRequiredError,
  UserNotLoggedInError,
} from "@shared";

import { HydraApi } from "../hydra-api";
import { CloudSaveRemotes } from "./remote/cloud-save-remote";

export const canAccessCloudSaves = (
  isLoggedIn: boolean,
  hasActiveSubscription: boolean,
  isSelfHosted = CloudSaveRemotes.isSelfHosted()
) =>
  getCloudSaveAccessAction(isLoggedIn, hasActiveSubscription, isSelfHosted) ===
  "open";

export const assertCloudSaveSubscription = (
  isLoggedIn = HydraApi.isLoggedIn(),
  hasActiveSubscription = HydraApi.hasActiveSubscription()
) => {
  if (CloudSaveRemotes.isSelfHosted()) return;
  if (!isLoggedIn) {
    throw new UserNotLoggedInError();
  }
  if (!hasActiveSubscription) {
    throw new SubscriptionRequiredError();
  }
};
