import "server-only";
import { auth } from "@repo/auth/server";
import { Svix } from "svix";
import { keys } from "../keys";

const svixToken = keys().SVIX_TOKEN;

// Svix "application" is scoped to `orgId` in the eventual multi-tenant
// model (Phase 1) — until `organizations` exists, `userId` stands in as the
// tenant boundary for outgoing webhooks.
export const send = async (eventType: string, payload: object) => {
  if (!svixToken) {
    throw new Error("SVIX_TOKEN is not set");
  }

  const svix = new Svix(svixToken);
  const { userId } = await auth();

  if (!userId) {
    return;
  }

  return svix.message.create(userId, {
    eventType,
    payload: {
      eventType,
      ...payload,
    },
    application: {
      name: userId,
      uid: userId,
    },
  });
};

export const getAppPortal = async () => {
  if (!svixToken) {
    throw new Error("SVIX_TOKEN is not set");
  }

  const svix = new Svix(svixToken);
  const { userId } = await auth();

  if (!userId) {
    return;
  }

  return svix.authentication.appPortalAccess(userId, {
    application: {
      name: userId,
      uid: userId,
    },
  });
};
