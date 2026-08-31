import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  sessionCookieName,
  verifySessionToken,
} from "@/lib/auth-session";
import { getUserById, type AppUser } from "@/lib/user-store";

export type AuthenticatedUser = AppUser;

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = verifySessionToken(
    cookieStore.get(sessionCookieName)?.value,
  );
  if (!session) return null;
  const user = await getUserById(session.userId);
  return user?.active ? user : null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
