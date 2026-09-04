import type { AppAction } from "@/lib/types/actions";
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

    case "FILTER_EMAILS":
      await store.applyEmailFilters({
        folder: action.payload.folder,
        unreadOnly: action.payload.unread,
        dateRange: action.payload.dateRange,
        sender: action.payload.sender,
        keyword: action.payload.keyword,
      });
      return;

    case "PREPARE_REPLY":
      await store.prepareReply(action.payload.emailId, action.payload.draftBody);
      return;

    case "PREPARE_FORWARD":
      await store.prepareForward(action.payload.emailId, action.payload.to, action.payload.draftBody);
      return;

    case "REQUEST_SEND_CONFIRMATION":
      store.requestSendConfirmation({ to: action.payload.to, cc: action.payload.cc, subject: action.payload.subject, body: action.payload.body });
      return;

    case "SEND_EMAIL":
      await store.sendEmail({ to: action.payload.to, cc: action.payload.cc, subject: action.payload.subject, body: action.payload.body });
      return;
  }
}

export async function dispatchActions(actions: AppAction[]): Promise<void> {
  // Sequential on purpose — actions must apply in order (e.g. FILL_COMPOSE before a later SEND_EMAIL).
  for (const action of actions) {
    await dispatchAction(action);
  }
}
