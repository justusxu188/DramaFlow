import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export const sessionCookieName = "frameflow_session";
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  expiresAt: number;
};

function sessionSecret() {
  const configured = process.env.FRAMEFLOW_AUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置 FRAMEFLOW_AUTH_SECRET");
  }
  return "frameflow-local-development-secret";
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(payload: string) {
  return createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
}

export function createSessionToken(
  userId: string,
  now = Date.now(),
) {
  const payload = encode(JSON.stringify({
    userId,
    expiresAt: now + sessionMaxAgeSeconds * 1000,
  } satisfies SessionPayload));
  return `${payload}.${signature(payload)}`;
}

export function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
): SessionPayload | null {
  if (!token) return null;
  const [payload, receivedSignature, extra] = token.split(".");
  if (!payload || !receivedSignature || extra) return null;
  const expectedSignature = signature(payload);
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(receivedSignature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }
  try {
    const value = JSON.parse(decode(payload)) as Partial<SessionPayload>;
    if (
      typeof value.userId !== "string" ||
      !value.userId ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= now
    ) {
      return null;
    }
    return {
      userId: value.userId,
      expiresAt: value.expiresAt,
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: sessionMaxAgeSeconds,
};
