import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { authorizedClient, exchangeCodeForTokens } from "@/lib/auth/google";
import { getSession } from "@/lib/auth/session";
import { logError } from "@/lib/log-safe";

function redirectWithError(request: NextRequest, message: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("auth_error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return redirectWithError(request, `Google sign-in was cancelled or denied (${oauthError}).`);
  }
  if (!code || !state) {
    return redirectWithError(request, "Malformed OAuth callback — missing code or state.");
  }

  const session = await getSession();
  if (!session.oauthState || session.oauthState !== state) {
    return redirectWithError(request, "OAuth state mismatch — please try signing in again.");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const auth = authorizedClient(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth });
    const userinfo = await oauth2.userinfo.get();

    session.tokens = tokens;
    session.userEmail = userinfo.data.email ?? undefined;
    session.oauthState = undefined;
    await session.save();

    return NextResponse.redirect(new URL("/", request.url));
  } catch (err) {
    logError("[auth/callback] token exchange failed:", err);
    return redirectWithError(request, "Failed to complete Google sign-in. Please try again.");
  }
}
