import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/auth-session";
import { assignUnownedProjects } from "@/lib/project-store";
import {
  authenticateUser,
  hasUsers,
} from "@/lib/user-store";

const inputSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  if (!(await hasUsers())) {
    return NextResponse.json(
      { error: "系统尚未初始化", setupRequired: true },
      { status: 409 },
    );
  }
  try {
    const input = inputSchema.parse(await request.json());
    const user = await authenticateUser(
      input.username,
      input.password,
    );
    if (!user) {
      return NextResponse.json(
        { error: "用户名或密码错误" },
        { status: 401 },
      );
    }
    if (user.role === "admin") {
      await assignUnownedProjects(user.id);
    }
    const cookieStore = await cookies();
    cookieStore.set(
      sessionCookieName,
      createSessionToken(user.id),
      sessionCookieOptions,
    );
    return NextResponse.json({ data: { user } });
  } catch {
    return NextResponse.json(
      { error: "用户名或密码错误" },
      { status: 401 },
    );
  }
}
