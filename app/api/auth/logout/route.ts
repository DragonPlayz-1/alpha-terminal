import { apiSuccess } from "@/lib/http";
import { destroySession } from "@/server/auth/session";

export async function POST() {
  await destroySession();
  return apiSuccess({ loggedOut: true });
}
