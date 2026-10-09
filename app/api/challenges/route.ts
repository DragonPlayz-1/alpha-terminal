import { apiSuccess } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { challenges } from "@/server/competition/service";
export async function GET() { const user = await requireApiUser(); return apiSuccess({ challenges: await challenges(user?.id) }); }
