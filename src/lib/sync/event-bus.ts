import { EventEmitter } from "events";

/**
 * In-process signal bus bridging the Gmail Pub/Sub webhook to open SSE
 * connections. This only works within a single Node.js process — fine for
 * local dev and a single-instance deployment (the demo target here), but a
 * multi-instance production deployment would need a shared pub/sub (Redis,
 * etc.) instead. Documented as a known trade-off in the README.
 *
 * Stashed on `globalThis` so Next.js's dev-mode module reloading doesn't
 * spawn a second emitter that nothing is listening on.
 */
declare global {
  var __mailSyncBus: EventEmitter | undefined;
}

export const mailSyncBus: EventEmitter = globalThis.__mailSyncBus ?? new EventEmitter();
mailSyncBus.setMaxListeners(0);
globalThis.__mailSyncBus = mailSyncBus;

/** Called by the Pub/Sub webhook to wake up a user's SSE stream immediately instead of waiting for its next poll tick. */
export function notifyPossibleNewMail(userEmail: string): void {
  mailSyncBus.emit(`wake:${userEmail}`, {});
}

export function onWake(userEmail: string, callback: () => void): () => void {
  const event = `wake:${userEmail}`;
  mailSyncBus.on(event, callback);
  return () => mailSyncBus.off(event, callback);
}
