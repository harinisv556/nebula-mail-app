import type { AppAction } from "@/lib/types/actions";

/** Short human-readable label for an action, shown as a status chip in the assistant panel. */
export function summarizeAction(action: AppAction): string {
  switch (action.type) {
    case "NAVIGATE":
      return `Navigated to ${action.payload.view}`;
    case "SEARCH_EMAILS":
      return "Searched emails";
    case "FILTER_EMAILS":
      return "Filtered inbox";
    case "OPEN_EMAIL":
      return "Opened email";
    case "OPEN_COMPOSE":
      return "Opened compose";
    case "FILL_COMPOSE":
      return "Filled compose form";
    case "PREPARE_REPLY":
      return "Prepared reply";
    case "PREPARE_FORWARD":
      return "Prepared forward";
    case "REQUEST_SEND_CONFIRMATION":
      return "Waiting for send confirmation";
    case "SEND_EMAIL":
      return "Sent email";
  }
}
