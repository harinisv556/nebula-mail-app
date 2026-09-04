"use client";

import { Inbox, PenSquare, Send } from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { Button } from "@/components/ui/Button";

export function Sidebar() {
  const currentFolder = useAppStore((s) => s.currentFolder);
  const navigateToInbox = useAppStore((s) => s.navigateToInbox);
  const navigateToSent = useAppStore((s) => s.navigateToSent);
  const openCompose = useAppStore((s) => s.openCompose);

  const items = [
    { key: "inbox" as const, label: "Inbox", icon: Inbox, onClick: navigateToInbox },
    { key: "sent" as const, label: "Sent", icon: Send, onClick: navigateToSent },
  ];

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-border bg-surface p-3">
      <Button variant="primary" className="mb-3 w-full justify-start" onClick={openCompose}>
        <PenSquare className="h-4 w-4" />
        Compose
      </Button>

      {items.map(({ key, label, icon: Icon, onClick }) => {
        const active = currentFolder === key;
        return (
          <button
            key={key}
            onClick={() => onClick()}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-accent-soft text-accent" : "text-foreground hover:bg-surface-2"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
