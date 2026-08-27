import { NextResponse } from "next/server";

import type { WorkflowAction } from "./schema";
import { runPipelineJobNow } from "@/lib/pipeline-runner";
import {
  enqueuePipelineJob,
  getPipelineProject,
  listPipelineJobs,
} from "@/lib/pipeline-store";

export type ComposePrerollAction = Extract<
  WorkflowAction,
  { action: "compose_preroll" }
>;

export async function handleComposePreroll(
  input: ComposePrerollAction,
  projectId: string,
  requestId: string,
) {
  const pipeline = await getPipelineProject(projectId);
  const render = pipeline?.renders.find(
    (item) =>
      item.id === input.renderId &&
      item.status === "completed" &&
      Boolean(item.videoUrl),
  );
  const highlight = pipeline?.highlights.find(
    (item) =>
      item.id === input.highlightId && Boolean(item.result?.videoUrls[0]),
  );
  const renderVideoUrl = render?.videoUrl;
  if (!render || !renderVideoUrl || !highlight) {
    return NextResponse.json(
      { error: "拼接缺少可用的 AI 前贴视频或高光视频", requestId },
      { status: 409 },
    );
  }
  if (renderVideoUrl !== input.renderVideoUrl) {
    return NextResponse.json(
      {
        error: "播放器中的 AI 前贴版本已过期，请刷新后重新拼接",
        requestId,
      },
      { status: 409 },
    );
  }
  if (
    render.subtitleVerificationStatus === "failed" ||
    (
      render.processedOperation === "add_subtitles" &&
      render.subtitleVerificationStatus !== "verified"
    )
  ) {
    return NextResponse.json(
      { error: "当前 AI 前贴字幕未通过画面验收，禁止拼接", requestId },
      { status: 409 },
    );
  }
  const activeCompose = (await listPipelineJobs(projectId)).find(
    (job) =>
      job.kind === "compose" &&
      ["queued", "running"].includes(job.status) &&
      job.input.renderId === render.id &&
      job.input.highlightId === highlight.id &&
      job.input.renderVideoUrl === renderVideoUrl,
  );
  if (activeCompose) {
    return NextResponse.json(
      { data: activeCompose, requestId },
      { status: 202 },
    );
  }
  const data = await enqueuePipelineJob({
    projectId,
    kind: "compose",
    input: {
      runId: pipeline?.currentRunId,
      renderId: render.id,
      highlightId: highlight.id,
      renderVideoUrl,
      sourceRenderSubtitleVerified:
        render.subtitleVerificationStatus === "verified",
      compositionId: `composition-${render.id}-${crypto.randomUUID()}`,
    },
  });
  void runPipelineJobNow(data.id);
  return NextResponse.json({ data, requestId }, { status: 202 });
}
