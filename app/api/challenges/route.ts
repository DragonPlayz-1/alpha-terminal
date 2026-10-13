import { apiException, apiSuccess } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { challenges } from "@/server/competition/service";
export async function GET() { try { const user = await requireApiUser(); return apiSuccess({ challenges: await challenges(user?.id) }); } catch (error) { return apiException(error, "Unable to load challenges.", 503, "CHALLENGES_UNAVAILABLE"); } }
