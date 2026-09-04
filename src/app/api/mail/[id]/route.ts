import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { logError } from "@/lib/log-safe";
import { withMailService } from "@/lib/mail/with-mail-service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const email = await withMailService((service) => service.getEmail(id));
    // Reading an email marks it as read, mirroring standard mail-client behavior.
    if (!email.isRead) {
      await withMailService((service) => service.markRead(id, true)).catch((err) => {
        logError("[mail/:id] failed to mark email read (non-fatal):", err);
      });
      email.isRead = true;
    }
    return NextResponse.json({ email });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const PatchSchema = z.object({ isRead: z.boolean() });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await request.json());
    await withMailService((service) => service.markRead(id, body.isRead));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
