import { NextRequest, NextResponse } from "next/server";

const sessionCookieName = "frameflow_session";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/login" || pathname === "/setup") {
    return NextResponse.next();
  }
  if (!request.cookies.has(sessionCookieName)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
