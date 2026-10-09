import { apiError, apiSuccess, getErrorMessage } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { joinChallenge } from "@/server/competition/service";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) { const user = await requireApiUser(); if (!user) return apiError("Authentication required.", 401); try { const { id } = await context.params; return apiSuccess({ participant: await joinChallenge(user.id, id) }, 201); } catch (e) { const message = getErrorMessage(e); return apiError(message, message.startsWith("Unable to complete") ? 503 : 409); } }
