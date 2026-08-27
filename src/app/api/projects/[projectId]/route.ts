import { NextResponse } from "next/server";
import { getProject } from "@/lib/project-store";
import { listPipelineRuns } from "@/lib/pipeline-store";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const data = await getProject(projectId);
  if (!data) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }
  const includeRuns =
    new URL(request.url).searchParams.get("includeRuns") === "1";
  return NextResponse.json({
    data: includeRuns
      ? {
          ...data,
          runs: await listPipelineRuns(projectId),
        }
      : data,
  });
}
