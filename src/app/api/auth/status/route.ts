import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasUsers } from "@/lib/user-store";

export async function GET() {
  const [initialized, user] = await Promise.all([
    hasUsers(),
    getCurrentUser(),
  ]);
  return NextResponse.json({
    data: { initialized, user },
  });
}
