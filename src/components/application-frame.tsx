"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import type { AppUser } from "@/lib/user-store";

export function ApplicationFrame({
  user,
  children,
}: {
  user: AppUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/setup") {
    return children;
  }
  return (
    <div className="app-shell">
      <Suspense
        fallback={
          <aside className="sidebar" aria-hidden="true" />
        }
      >
        {user && <Sidebar user={user} />}
      </Suspense>
      <main className="app-main">{children}</main>
    </div>
  );
}
