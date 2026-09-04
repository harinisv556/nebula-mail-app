"use client";

import { AuthGate } from "@/components/AuthGate";
import { ThemeSync } from "@/components/ui/ThemeSync";
import { Header } from "@/components/mail/Header";
import { Sidebar } from "@/components/mail/Sidebar";
import { MailMain } from "@/components/mail/MailMain";
import { ComposeModal } from "@/components/mail/ComposeModal";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { useRealtimeSync } from "@/lib/sync/use-realtime-sync";

function MailApp() {
  useRealtimeSync();
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <MailMain />
        <AssistantPanel />
      </div>
      <ComposeModal />
    </div>
  );
}

export default function Home() {
  return (
    <>
      <ThemeSync />
      <AuthGate>
        <MailApp />
      </AuthGate>
    </>
  );
}
