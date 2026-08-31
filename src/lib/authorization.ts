import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProject } from "@/lib/project-store";
import type { AppUser } from "@/lib/user-store";

export type ProjectAccess = Pick<AppUser, "id" | "role">;

export function accessForUser(user: AppUser): ProjectAccess {
  return { id: user.id, role: user.role };
}

export async function authenticatedApiUser() {
  const user = await getCurrentUser();
  if (user) return { user, response: null };
  return {
    user: null,
    response: NextResponse.json(
      { error: "请先登录" },
      { status: 401 },
    ),
  };
}

export async function adminApiUser() {
  const auth = await authenticatedApiUser();
  if (!auth.user || auth.response) return auth;
  if (auth.user.role === "admin") return auth;
  return {
    user: null,
    response: NextResponse.json(
      { error: "仅管理员可执行此操作" },
      { status: 403 },
    ),
  };
}

export async function authorizedProject(
  projectId: string,
  user: AppUser,
) {
  return getProject(projectId, accessForUser(user));
}
