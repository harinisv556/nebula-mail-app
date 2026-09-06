import type { AppAction } from "@/lib/types/actions";
import type { EmailFilters } from "@/lib/types/mail";
import { useAppStore } from "@/lib/store/app-store";

/**
 * Executes a validated AppAction against the SAME store functions the UI
 * uses. This is the client-side half of "AI COMMAND -> APPLICATION ACTION":
 * by the time an action reaches here it has already been through
 * validateAction() on the server, so this function trusts it completely and
 * just calls the ordinary store API — exactly what an onClick handler does.
 */
export async function dispatchAction(action: AppAction): Promise<void> {
  const store = useAppStore.getState();

  switch (action.type) {
    case "NAVIGATE":
      if (action.payload.view === "inbox") await store.navigateToInbox();
      else if (action.payload.view === "sent") await store.navigateToSent();
      else store.openCompose();
      return;

    case "OPEN_EMAIL":
      await store.openEmailById(action.payload.emailId);
      return;

    case "OPEN_COMPOSE":
      store.openCompose();
      return;

    case "FILL_COMPOSE":
      store.fillCompose({ to: action.payload.to, cc: action.payload.cc, subject: action.payload.subject, body: action.payload.body });
      return;

    case "SEARCH_EMAILS":
      await store.searchEmails(action.payload);
      return;

    case "FILTER_EMAILS": {
      // Only pass through fields the model actually specified. FILTER_EMAILS's
      // payload fields are all optional — if we always included every key
      // (even as `undefined`), applyEmailFilters' object-spread merge would
      // treat "key present with value undefined" as "clear this field",
      // wiping out e.g. the current folder just because the model didn't
      // mention it. Omitting unspecified keys entirely lets the store's
      // merge fall through to the existing value instead. See __tests__/dispatch-actions.test.ts.
      const patch: Partial<EmailFilters> = {};
      if (action.payload.folder !== undefined) patch.folder = action.payload.folder;
      if (action.payload.unread !== undefined) patch.unreadOnly = action.payload.unread;
      if (action.payload.dateRange !== undefined) patch.dateRange = action.payload.dateRange;
      if (action.payload.sender !== undefined) patch.sender = action.payload.sender;
      if (action.payload.keyword !== undefined) patch.keyword = action.payload.keyword;
      await store.applyEmailFilters(patch);
      return;
    }

    case "PREPARE_REPLY":
      await store.prepareReply(action.payload.emailId, action.payload.draftBody);
      return;

    case "PREPARE_FORWARD":
      await store.prepareForward(action.payload.emailId, action.payload.to, action.payload.draftBody);
      return;

    case "REQUEST_SEND_CONFIRMATION":
      await store.requestSendConfirmation({
        to: action.payload.to,
        cc: action.payload.cc,
        bcc: action.payload.bcc,
        subject: action.payload.subject,
        body: action.payload.body,
        threadId: action.payload.threadId,
        inReplyTo: action.payload.inReplyTo,
      });
      return;

    case "SEND_EMAIL":
      await store.sendEmail({
        to: action.payload.to,
        cc: action.payload.cc,
        bcc: action.payload.bcc,
        subject: action.payload.subject,
        body: action.payload.body,
        threadId: action.payload.threadId,
        inReplyTo: action.payload.inReplyTo,
      });
      return;
  }
}

export async function dispatchActions(actions: AppAction[]): Promise<void> {
  // Sequential on purpose — actions must apply in order (e.g. FILL_COMPOSE before a later SEND_EMAIL).
  for (const action of actions) {
    await dispatchAction(action);
  }
}
