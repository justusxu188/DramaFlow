import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/auth-session";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, "", {
    ...sessionCookieOptions,
    maxAge: 0,
  });
  return NextResponse.json({ data: { loggedOut: true } });
}
