import type { GameShop } from "@types";

/**
 * Library games installed from the PC port catalog are custom games tagged with
 * this platform. Their object id is stable (`port-<portId>`) so every machine
 * syncs saves to the same Cloud Save snapshot.
 */
export const PC_PORT_PLATFORM = "PC Port";

const PC_PORT_OBJECT_ID_PREFIX = "port-";

export const pcPortObjectId = (portId: string) =>
  `${PC_PORT_OBJECT_ID_PREFIX}${portId}`;

export const isPcPortGame = (shop: GameShop, platform?: string | null) =>
  shop === "custom" && platform === PC_PORT_PLATFORM;
