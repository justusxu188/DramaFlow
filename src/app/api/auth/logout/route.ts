import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  sessionCookieName,
  sessionCookieOptionsFor,
} from "@/lib/auth-session";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, "", {
    ...sessionCookieOptionsFor(request),
    maxAge: 0,
  });
  return NextResponse.json({ data: { loggedOut: true } });
}
