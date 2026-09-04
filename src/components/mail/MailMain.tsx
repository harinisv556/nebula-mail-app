"use client";

import { useAppStore } from "@/lib/store/app-store";
import { EmailList } from "./EmailList";
import { EmailDetail } from "./EmailDetail";

export function MailMain() {
  const currentView = useAppStore((s) => s.currentView);
  const showDetail = currentView === "email_detail";

  return (
    <main className="flex min-w-0 flex-1 overflow-hidden bg-background">
      <div className={`h-full w-full max-w-md shrink-0 border-r border-border md:block ${showDetail ? "hidden" : "block"}`}>
        <EmailList />
      </div>
      <div className={`h-full min-w-0 flex-1 md:block ${showDetail ? "block" : "hidden"}`}>
        <EmailDetail />
      </div>
    </main>
  );
}
