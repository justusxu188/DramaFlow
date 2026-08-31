import { NextResponse } from "next/server";
import { getCreativeProvider } from "@/lib/providers";
import {
  authenticatedApiUser,
  authorizedProject,
} from "@/lib/authorization";
import { listPipelineJobs } from "@/lib/pipeline-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const auth = await authenticatedApiUser();
  if (!auth.user || auth.response) return auth.response;
  const requestId = crypto.randomUUID();
  try {
    const { jobId } = await context.params;
    const job = (await listPipelineJobs()).find(
      (item) => item.id === jobId || item.upstreamId === jobId,
    );
    if (
      !job ||
      !(await authorizedProject(job.projectId, auth.user))
    ) {
      return NextResponse.json(
        { error: "任务不存在", requestId },
        { status: 404 },
      );
    }
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
