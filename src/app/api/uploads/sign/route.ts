import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject } from "@/lib/project-store";
import { createTosUploadUrl } from "@/lib/tos";

const uploadSchema = z.object({
  projectId: z.string().min(3).max(100),
  fileName: z.string().min(1).max(180),
  mimeType: z.enum([
    "video/mp4",
    "video/quicktime",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]),
  size: z.number().int().positive().max(10 * 1024 * 1024 * 1024),
  assetType: z.enum(["source", "character_image", "highlight"]).default(
    "source",
  ),
});

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = uploadSchema.parse(await request.json());
    const project = await getProject(input.projectId);
    if (!project) {
      return NextResponse.json(
        { error: "项目不存在", requestId },
        { status: 404 },
      );
    }
    const data = createTosUploadUrl({
      projectId: input.projectId,
      projectName: project.name,
      fileName: input.fileName,
      stage:
        input.assetType === "character_image"
          ? "character_images"
          : input.assetType === "highlight"
            ? "highlights"
            : "sources",
    });
    return NextResponse.json({
      data: { ...data, method: "PUT", headers: {} },
      requestId,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("未完成")
        ? error.message
        : "上传签名创建失败";
    return NextResponse.json({ error: message, requestId }, { status: 400 });
  }
}
