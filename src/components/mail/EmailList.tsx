"use client";

import { useEffect } from "react";
import { Inbox as InboxIcon, AlertTriangle } from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { EmailListItem } from "./EmailListItem";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar } from "./FilterBar";

export function EmailList() {
  const emails = useAppStore((s) => s.emails);
  const loading = useAppStore((s) => s.emailsLoading);
  const error = useAppStore((s) => s.emailsError);
  const openEmail = useAppStore((s) => s.openEmail);
  const currentFolder = useAppStore((s) => s.currentFolder);
  const openEmailById = useAppStore((s) => s.openEmailById);
  const refreshCurrentList = useAppStore((s) => s.refreshCurrentList);

  useEffect(() => {
    if (emails.length === 0 && !loading && !error) refreshCurrentList();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount; explicit refreshes go through the store
  }, []);

  return (
    <div className="flex h-full flex-col">
      <FilterBar />
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-5 w-5 text-muted" />
          </div>
        )}

        {!loading && error && (
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8" />}
            title="Couldn't load your emails"
            description={error}
            action={
              <button onClick={() => refreshCurrentList()} className="text-xs font-medium text-accent hover:underline">
                Try again
              </button>
            }
          />
        )}

        {!loading && !error && emails.length === 0 && (
          <EmptyState
            icon={<InboxIcon className="h-8 w-8" />}
            title={`No emails in ${currentFolder}`}
            description="Nothing matches the current filters, or this folder is empty."
          />
        )}

        {!loading &&
          !error &&
          emails.map((email) => (
            <EmailListItem key={email.id} email={email} active={openEmail?.id === email.id} onClick={() => openEmailById(email.id)} />
          ))}
      </div>
    </div>
  );
}
