import { CheckCircle2, AlertCircle } from "lucide-react";
import type { AssistantMessage } from "@/lib/store/app-store";
import { EmailPreviewList } from "./EmailPreviewCard";

export function MessageBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}>
      <div className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm ${isUser ? "bg-accent text-accent-foreground" : "bg-surface-2 text-foreground"}`}>
        <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>

        {message.actions && message.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.actions.map((a, i) => (
              <span key={i} className="flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                <CheckCircle2 className="h-3 w-3" /> {a.summary}
              </span>
            ))}
          </div>
        )}

        {message.isError && (
          <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-danger">
            <AlertCircle className="h-3 w-3" /> Error
          </span>
        )}

        {message.previews && message.previews.length > 0 && <EmailPreviewList previews={message.previews} />}
      </div>
    </div>
  );
}
