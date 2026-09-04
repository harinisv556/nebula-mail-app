import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { buildGmailQuery, resolveDateRange } from "@/lib/mail/query-builder";

// Fixed reference date so date-range math is deterministic: Thursday 2026-09-10, noon local time
// (noon avoids any DST/midnight edge cases across timezones the test runs in).
const NOW = new Date(2026, 8, 10, 12, 0, 0);
const ymd = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : undefined);

describe("resolveDateRange", () => {
  it("resolves last_7_days relative to now", () => {
    const { from, to } = resolveDateRange("last_7_days", NOW);
    expect(ymd(from)).toBe("2026-09-03");
    expect(ymd(to)).toBe("2026-09-10");
  });

  it("resolves last_10_days relative to now", () => {
    const { from } = resolveDateRange("last_10_days", NOW);
    expect(ymd(from)).toBe("2026-08-31");
  });

  it("this_week starts on Monday", () => {
    const { from } = resolveDateRange("this_week", NOW);
    expect(from?.getDay()).toBe(1); // Monday
  });

  it("all_time has no bounds", () => {
    expect(resolveDateRange("all_time", NOW)).toEqual({});
  });
});

describe("buildGmailQuery", () => {
  it("defaults to the inbox folder", () => {
    expect(buildGmailQuery({ folder: "inbox" }, NOW)).toBe("in:inbox");
  });

  it("maps sent folder", () => {
    expect(buildGmailQuery({ folder: "sent" }, NOW)).toBe("in:sent");
  });

  it("combines unread + sender + keyword", () => {
    const q = buildGmailQuery(
      { folder: "inbox", unreadOnly: true, sender: "sarah@example.com", keyword: "project update" },
      NOW,
    );
    expect(q).toBe('in:inbox is:unread from:sarah@example.com "project update"');
  });

  it("applies a date range preset as after/before", () => {
    const q = buildGmailQuery({ folder: "inbox", dateRange: "last_10_days" }, NOW);
    expect(q).toBe("in:inbox after:2026/08/31 before:2026/09/10");
  });

  it("explicit dateFrom/dateTo override the preset", () => {
    const q = buildGmailQuery(
      { folder: "inbox", dateRange: "last_10_days", dateFrom: "2026-01-01", dateTo: "2026-01-31" },
      NOW,
    );
    expect(q).toBe("in:inbox after:2026/01/01 before:2026/01/31");
  });
});
