import { NextResponse } from "next/server";
import { z } from "zod";
import { imageSizes } from "@/lib/domain";
import { getCreativeProvider } from "@/lib/providers";
import { getCreativeSettings } from "@/lib/creative-settings-store";
import { authenticatedApiUser } from "@/lib/authorization";

const inputSchema = z.object({
  prompt: z.string().trim().min(4).max(1200),
  resolution: z.enum(["2K", "4K"]).default("2K"),
  ratio: z.enum(["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"]),
  referenceUrls: z.array(z.string().url()).max(14).optional(),
});

export async function POST(request: Request) {
  const auth = await authenticatedApiUser();
  if (auth.response) return auth.response;
  const requestId = crypto.randomUUID();
  try {
    const input = inputSchema.parse(await request.json());
    const settings = await getCreativeSettings();
    const result = await getCreativeProvider().generateImage({
      prompt: input.prompt,
      size: imageSizes[input.resolution][input.ratio],
      referenceUrls: input.referenceUrls,
      model: settings.imageModel,
    });
    return NextResponse.json({ data: result, requestId });
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("未配置")
        ? error.message
        : "图片生成失败，请检查参数后重试";
    return NextResponse.json({ error: message, requestId }, { status: 400 });
  }
}
