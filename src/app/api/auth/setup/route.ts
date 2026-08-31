import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  sessionCookieName,
  sessionCookieOptionsFor,
} from "@/lib/auth-session";
import { assignUnownedProjects } from "@/lib/project-store";
import { createFirstAdmin } from "@/lib/user-store";

const inputSchema = z.object({
  username: z.string(),
  name: z.string(),
  password: z.string(),
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const user = await createFirstAdmin(input);
    await assignUnownedProjects(user.id);
    const cookieStore = await cookies();
    cookieStore.set(
      sessionCookieName,
      createSessionToken(user.id),
      sessionCookieOptionsFor(request),
    );
    return NextResponse.json({ data: { user } }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "系统初始化失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
