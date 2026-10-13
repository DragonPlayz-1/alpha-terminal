import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiError, apiException, apiSuccess, getErrorMessage } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { journalAccount as accountFor, journalContentSchema } from "@/server/journal";

const schema = journalContentSchema.partial();

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid journal entry.", 400, "INVALID_JOURNAL_ENTRY");
  const scope = request.nextUrl.searchParams.get("scope") ?? "main";
  if (!scope || scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
    const account = await accountFor(user.id, scope);
    const { id } = await context.params;
    const entry = await db.tradeJournalEntry.updateMany({ where: { id, userId: user.id, accountId: account.id }, data: parsed.data });
    if (!entry.count) return apiError("Journal entry not found.", 404, "JOURNAL_NOT_FOUND");
    return apiSuccess({ saved: true });
  } catch (error) {
    if (getErrorMessage(error) === "Trading account unavailable.") return apiError("Trading account unavailable.", 404, "ACCOUNT_NOT_FOUND");
    return apiException(error, "Unable to update the journal entry.", 503, "JOURNAL_UPDATE_UNAVAILABLE");
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const scope = request.nextUrl.searchParams.get("scope") ?? "main";
  if (!scope || scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
    const account = await accountFor(user.id, scope);
    const { id } = await context.params;
    const deleted = await db.tradeJournalEntry.deleteMany({ where: { id, userId: user.id, accountId: account.id } });
    if (!deleted.count) return apiError("Journal entry not found.", 404, "JOURNAL_NOT_FOUND");
    return apiSuccess({ deleted: true });
  } catch (error) {
    if (getErrorMessage(error) === "Trading account unavailable.") return apiError("Trading account unavailable.", 404, "ACCOUNT_NOT_FOUND");
    return apiException(error, "Unable to delete the journal entry.", 503, "JOURNAL_DELETE_UNAVAILABLE");
  }
}
