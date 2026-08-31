import type { Metadata } from "next";
import "./globals.css";
import { ApplicationFrame } from "@/components/application-frame";
import { UploadManagerProvider } from "@/components/upload-manager";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "FrameFlow | 短剧投流素材工作台",
  description: "前贴钩子、高光智剪与批量成片的一体化创作工作台",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return (
    <html lang="zh-CN">
      <body>
        <UploadManagerProvider>
          <ApplicationFrame user={user}>
            {children}
          </ApplicationFrame>
        </UploadManagerProvider>
      </body>
    </html>
  );
}
