"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import type { DateRangePreset } from "@/lib/types/mail";

const DATE_RANGE_OPTIONS: { value: DateRangePreset | ""; label: string }[] = [
  { value: "", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_10_days", label: "Last 10 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
];

/**
 * Normal UI controls for the same filter state the assistant's FILTER_EMAILS
 * action mutates (see applyEmailFilters in the app-store). There is no
 * separate filtering code path for the UI vs the AI.
 */
export function FilterBar() {
  const filters = useAppStore((s) => s.filters);
  const applyEmailFilters = useAppStore((s) => s.applyEmailFilters);
  const [senderInput, setSenderInput] = useState(filters.sender ?? "");

  const hasActiveFilters = filters.unreadOnly || filters.dateRange || filters.sender || filters.keyword;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
      <button
        onClick={() => applyEmailFilters({ unreadOnly: !filters.unreadOnly })}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          filters.unreadOnly ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground"
        }`}
      >
        Unread only
      </button>

      <select
        value={filters.dateRange ?? ""}
        onChange={(e) => applyEmailFilters({ dateRange: (e.target.value || undefined) as DateRangePreset | undefined })}
        className="rounded-full border border-border bg-transparent px-3 py-1 text-xs font-medium text-foreground focus:outline-none"
      >
        {DATE_RANGE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyEmailFilters({ sender: senderInput.trim() || undefined });
        }}
        className="flex items-center gap-1"
      >
        <input
          value={senderInput}
          onChange={(e) => setSenderInput(e.target.value)}
          placeholder="From..."
          className="w-28 rounded-full border border-border bg-transparent px-3 py-1 text-xs text-foreground placeholder:text-muted focus:outline-none"
        />
      </form>

      {hasActiveFilters && (
        <button
          onClick={() => {
            setSenderInput("");
            applyEmailFilters({ unreadOnly: undefined, dateRange: undefined, sender: undefined, keyword: undefined });
          }}
          className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <X className="h-3 w-3" /> Clear filters
        </button>
      )}
    </div>
  );
}
