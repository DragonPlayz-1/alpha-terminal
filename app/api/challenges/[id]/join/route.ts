import { apiError, apiException, apiSuccess, getErrorMessage } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { joinChallenge } from "@/server/competition/service";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) { try { const user = await requireApiUser(); if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED"); const { id } = await context.params; return apiSuccess({ participant: await joinChallenge(user.id, id) }, 201); } catch (error) { const message = getErrorMessage(error); if (message.startsWith("Unable to complete")) return apiException(error, "Challenge service unavailable.", 503, "CHALLENGE_JOIN_UNAVAILABLE"); return apiError(message, 409, "CHALLENGE_JOIN_REJECTED"); } }
