import { NextRequest, NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api-error";
import { filtersFromSearchParams } from "@/lib/mail/schemas";
import { withMailService } from "@/lib/mail/with-mail-service";

export async function GET(request: NextRequest) {
  try {
    const filters = filtersFromSearchParams(request.nextUrl.searchParams);
    const pageSizeParam = request.nextUrl.searchParams.get("pageSize");
    const pageSize = pageSizeParam ? Math.min(Math.max(Number(pageSizeParam), 1), 100) : 25;

    const emails = await withMailService((service) => service.listEmails(filters, pageSize));
    return NextResponse.json({ emails, filters });
  } catch (err) {
    return toErrorResponse(err);
  }
}
