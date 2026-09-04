"use client";

import { useState } from "react";
import { Moon, Sun, LogOut, Mail, Search } from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { Button } from "@/components/ui/Button";

export function Header() {
  const authEmail = useAppStore((s) => s.authEmail);
  const darkMode = useAppStore((s) => s.darkMode);
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode);
  const searchEmails = useAppStore((s) => s.searchEmails);
  const currentFolder = useAppStore((s) => s.currentFolder);
  const setAuth = useAppStore((s) => s.setAuth);
  const [query, setQuery] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    await searchEmails({ keyword: query.trim() || undefined, folder: currentFolder });
  }

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Flipping authEmail to null is enough — AuthGate re-renders the sign-in
    // screen immediately; no full page navigation needed.
    setAuth(null);
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2 font-semibold text-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Mail className="h-4 w-4" />
        </span>
        <span className="hidden sm:inline">Nebula Mail</span>
      </div>

      <form onSubmit={handleSearch} className="mx-auto flex w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-1.5">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${currentFolder}...`}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
        />
      </form>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" aria-label="Toggle dark mode" onClick={toggleDarkMode}>
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        {authEmail && (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-xs text-muted">{authEmail}</span>
            <Button variant="ghost" size="sm" aria-label="Sign out" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
