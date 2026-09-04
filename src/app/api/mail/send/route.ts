import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-error";
import { ComposeDraftSchema } from "@/lib/mail/schemas";
import { withMailService } from "@/lib/mail/with-mail-service";

export async function POST(request: NextRequest) {
  try {
    const draft = ComposeDraftSchema.parse(await request.json());
    const result = await withMailService((service) => service.sendEmail(draft));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
