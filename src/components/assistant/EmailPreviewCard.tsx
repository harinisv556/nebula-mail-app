import type { EmailPreview } from "@/lib/store/app-store";
import { useAppStore } from "@/lib/store/app-store";

/** Rich preview of real search/filter results inside the assistant panel (bonus: rich UI rendering, not just text). */
export function EmailPreviewList({ previews }: { previews: EmailPreview[] }) {
  const openEmailById = useAppStore((s) => s.openEmailById);

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-1.5">
      {previews.map((p) => (
        <button
          key={p.id}
          onClick={() => openEmailById(p.id)}
          className="flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-foreground">{p.from}</span>
            <span className="shrink-0 text-[10px] text-muted">{new Date(p.date).toLocaleDateString()}</span>
          </div>
          <span className="truncate text-xs text-foreground/80">{p.subject}</span>
          <span className="truncate text-[11px] text-muted">{p.preview}</span>
        </button>
      ))}
    </div>
  );
}
