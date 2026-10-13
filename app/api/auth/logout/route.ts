import { apiException, apiSuccess } from "@/lib/http";
import { destroySession } from "@/server/auth/session";

export async function POST() {
  try {
    await destroySession();
    return apiSuccess({ loggedOut: true });
  } catch (error) {
    return apiException(error, "Unable to sign out. Please try again.", 503, "LOGOUT_UNAVAILABLE");
  }
}
