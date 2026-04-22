import { describe, expect, it } from "vitest";

import { composeAuthHeaders } from "../infrastructure/backoffice/authHeaders";

describe("composeAuthHeaders", () => {
  it("returns empty headers when no session context exists", () => {
    expect(composeAuthHeaders()).toEqual({});
  });

  it("includes bearer and firebase headers when an id token exists", () => {
    expect(composeAuthHeaders({ mode: "firebase", idToken: "token-1" })).toEqual({
      authorization: "Bearer token-1",
      "x-firebase-id-token": "token-1",
    });
  });

  it("includes the dev uid only for dev mode", () => {
    expect(composeAuthHeaders({ mode: "dev", devUid: "dev-123" })).toEqual({
      "x-dev-firebase-uid": "dev-123",
    });
    expect(composeAuthHeaders({ mode: "firebase", devUid: "dev-123" })).toEqual({});
  });
});