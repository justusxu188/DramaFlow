import { NextResponse } from "next/server";
import { listPipelineRuns } from "@/lib/pipeline-store";
import {
  authenticatedApiUser,
  authorizedProject,
} from "@/lib/authorization";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticatedApiUser();
  if (!auth.user || auth.response) return auth.response;
  const { projectId } = await context.params;
  const data = await authorizedProject(projectId, auth.user);
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
