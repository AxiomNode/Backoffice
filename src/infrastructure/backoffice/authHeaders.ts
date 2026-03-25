import type { SessionContext } from "../../domain/types/backoffice";

export function composeAuthHeaders(context?: SessionContext): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!context) {
    return headers;
  }

  if (context.idToken) {
    headers.authorization = `Bearer ${context.idToken}`;
    headers["x-firebase-id-token"] = context.idToken;
  }
  if (context.mode === "dev" && context.devUid) {
    headers["x-dev-firebase-uid"] = context.devUid;
  }
  return headers;
}
