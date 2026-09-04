"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Mail } from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

export function AuthGate({ children }: { children: ReactNode }) {
  const authChecked = useAppStore((s) => s.authChecked);
  const authEmail = useAppStore((s) => s.authEmail);
  const setAuth = useAppStore((s) => s.setAuth);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [authErrorParam, setAuthErrorParam] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
      // Synchronizing from an external system (the URL) on mount — a
      // genuine one-time read, not state mirroring, so the
      // setState-in-effect lint heuristic doesn't apply cleanly here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthErrorParam(err);
      window.history.replaceState({}, "", window.location.pathname);
    }

    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setAuth(data.authenticated ? data.email : null))
      .catch(() => setCheckError("Could not reach the server to check sign-in status."));
  }, [setAuth]);

  if (!authChecked) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Spinner className="h-6 w-6 text-muted" />
      </div>
    );
  }

  if (!authEmail) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 text-center shadow-sm animate-fade-in">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Mail className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Nebula Mail</h1>
          <p className="mt-1 text-sm text-muted">An AI-powered mail client connected to your real Gmail account.</p>

          {(checkError || authErrorParam) && (
            <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{authErrorParam ?? checkError}</p>
          )}

          <Button
            variant="primary"
            className="mt-6 w-full"
            onClick={() => {
              // Full navigation is required: /api/auth/login is a server
              // route that 302s to Google's consent screen — not an
              // in-app page a client-side router could handle.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/api/auth/login";
            }}
          >
            Sign in with Google
          </Button>
          <p className="mt-3 text-[11px] text-muted">
            Requests read, send, and modify access to your Gmail so the app and assistant can work with real mail.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
