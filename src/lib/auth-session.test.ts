import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  createSessionToken,
  sessionMaxAgeSeconds,
  verifySessionToken,
} from "@/lib/auth-session";

describe("signed session", () => {
  beforeEach(() => {
    process.env.FRAMEFLOW_AUTH_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.FRAMEFLOW_AUTH_SECRET;
  });

  it("verifies a valid token", () => {
    const token = createSessionToken("user-1", 1_000);
    expect(verifySessionToken(token, 2_000)).toMatchObject({
      userId: "user-1",
    });
  });

  it("rejects tampered and expired tokens", () => {
    const token = createSessionToken("user-1", 1_000);
    const tampered = `${token.slice(0, -1)}x`;
    expect(verifySessionToken(tampered, 2_000)).toBeNull();
    expect(
      verifySessionToken(
        token,
        1_000 + sessionMaxAgeSeconds * 1000 + 1,
      ),
    ).toBeNull();
  });
});
