import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { UploadManagerProvider } from "@/components/upload-manager";

export const metadata: Metadata = {
  title: "FrameFlow | 短剧投流素材工作台",
  description: "前贴钩子、高光智剪与批量成片的一体化创作工作台",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <UploadManagerProvider>
          <div className="app-shell">
            <Suspense
              fallback={
                <aside
                  className="sidebar"
                  aria-hidden="true"
                />
              }
            >
              <Sidebar />
            </Suspense>
            <main className="app-main">
              {children}
            </main>
          </div>
        </UploadManagerProvider>
      </body>
    </html>
  );
}
