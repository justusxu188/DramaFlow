import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { hasUsers } from "@/lib/user-store";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await hasUsers())) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  return <AuthForm mode="login" />;
}
