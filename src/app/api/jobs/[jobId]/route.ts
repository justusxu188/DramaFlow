import { NextResponse } from "next/server";
import { getCreativeProvider } from "@/lib/providers";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { jobId } = await context.params;
    const provider = getCreativeProvider();
    const data = jobId.startsWith("amk-")
      ? await provider.getMediaTask(jobId)
      : await provider.getPrerollTask(jobId);
    return NextResponse.json({ data, requestId });
  } catch {
    return NextResponse.json(
      { error: "任务状态查询失败", requestId },
      { status: 502 },
    );
  }
}
