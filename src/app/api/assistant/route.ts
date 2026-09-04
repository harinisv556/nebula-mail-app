import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-error";
import { runAssistant } from "@/lib/ai/assistant";
import { AssistantRequestSchema } from "@/lib/ai/schemas";
import { withMailService } from "@/lib/mail/with-mail-service";

export async function POST(request: NextRequest) {
  try {
    const body = AssistantRequestSchema.parse(await request.json());
    const result = await withMailService((service) => runAssistant(body.message, body.context, body.history, service));
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
