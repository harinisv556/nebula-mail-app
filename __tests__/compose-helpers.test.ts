import { describe, expect, it } from "vitest";
import { buildForwardDraft, buildReplyDraft } from "@/lib/mail/compose-helpers";
import type { Email } from "@/lib/types/mail";

const sampleEmail: Email = {
  id: "e1",
  threadId: "t1",
  folder: "inbox",
  from: { name: "David Kim", email: "david@example.com" },
  to: [{ email: "me@example.com" }],
  subject: "Q3 numbers",
  preview: "Here are the numbers",
  bodyText: "Here are the numbers for Q3.",
  date: "2026-01-15T10:00:00.000Z",
  isRead: true,
  isStarred: false,
  attachments: [],
  labels: [],
  messageIdHeader: "<xyz@mail.gmail.com>",
};

describe("buildReplyDraft", () => {
  it("addresses the reply to the original sender and prefixes the subject with Re:", () => {
    const draft = buildReplyDraft(sampleEmail);
    expect(draft.to).toEqual(["david@example.com"]);
    expect(draft.subject).toBe("Re: Q3 numbers");
    expect(draft.threadId).toBe("t1");
    expect(draft.inReplyTo).toBe("<xyz@mail.gmail.com>");
    expect(draft.body).toContain("Here are the numbers for Q3.");
  });

  it("does not double-prefix a subject that's already a reply", () => {
    const draft = buildReplyDraft({ ...sampleEmail, subject: "Re: Q3 numbers" });
    expect(draft.subject).toBe("Re: Q3 numbers");
  });

  it("includes assistant-drafted reply text above the quoted original", () => {
    const draft = buildReplyDraft(sampleEmail, "Thanks, looks good!");
    expect(draft.body.startsWith("Thanks, looks good!")).toBe(true);
    expect(draft.body).toContain("Here are the numbers for Q3.");
  });
});

describe("buildForwardDraft", () => {
  it("prefixes the subject with Fwd: and includes the original headers", () => {
    const draft = buildForwardDraft(sampleEmail, ["someone@example.com"]);
    expect(draft.subject).toBe("Fwd: Q3 numbers");
    expect(draft.to).toEqual(["someone@example.com"]);
    expect(draft.body).toContain("Forwarded message");
    expect(draft.body).toContain("David Kim");
  });

  it("allows an empty recipient list when none was specified yet", () => {
    const draft = buildForwardDraft(sampleEmail);
    expect(draft.to).toEqual([]);
  });
});
