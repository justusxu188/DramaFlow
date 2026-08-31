import { NextResponse } from "next/server";
import { pipelineInputSchema } from "@/lib/domain";
import { getCreativeProvider } from "@/lib/providers";
import {
  authenticatedApiUser,
  authorizedProject,
} from "@/lib/authorization";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { projectId } = await context.params;
    const auth = await authenticatedApiUser();
    if (!auth.user || auth.response) return auth.response;
    if (!(await authorizedProject(projectId, auth.user))) {
      return NextResponse.json(
        { error: "项目不存在", requestId },
        { status: 404 },
      );
    }
    const input = pipelineInputSchema.parse(await request.json());
    const provider = getCreativeProvider();

    if (input.stage === "analysis") {
      const result = await provider.analyzeStory({
        videoUrl:
          input.prompt || "https://example.invalid/source-episode.mp4",
      });
      return NextResponse.json({ data: result, requestId });
    }

    if (input.stage === "script") {
      const analysis = {
        synopsis: "被逐出家门的药师林晚，在豪门宴会上救下顾家继承人。",
        characters: [
          { name: "林晚", role: "女主", desire: "证明医术并守住古方" },
          { name: "顾沉", role: "男主", desire: "查清中毒真相" },
        ],
        conflict: "林晚必须在救人和隐藏身份之间做出选择。",
        emotionCurve: [
          { at: 0, level: 32, label: "受辱" },
          { at: 8, level: 85, label: "危机" },
          { at: 16, level: 96, label: "反转" },
        ],
        highlights: [
          { title: "银针救人", start: 0, end: 15, score: 96 },
        ],
      };
      const result = await provider.generateScripts({
        analysis,
        hookType: input.hookType ?? "identity_gap",
        prerollType: input.prerollType ?? "story_linked",
        count: 2,
      });
      return NextResponse.json({ data: result, requestId });
    }

    if (input.stage === "preroll") {
      const result = await provider.createPreroll({
        prompt: input.prompt || "身份反差短剧前贴，前三秒冲突爆发",
        duration: Math.min(input.duration ?? 15, 15),
        ratio: "9:16",
        model: "default",
        resolution: "720p",
      });
      return NextResponse.json({ data: result, requestId }, { status: 202 });
    }

    if (input.stage === "highlight" && input.videoUrls?.[0]) {
      const result = await provider.segmentScenes({
        videoUrl: input.videoUrls[0],
      });
      return NextResponse.json({ data: result, requestId }, { status: 202 });
    }

    if (input.stage === "compose" && input.videoUrls) {
      const result = await provider.concatVideos({
        videoUrls: input.videoUrls,
        transitions: input.transitions,
        clientToken: `${projectId}-${crypto.randomUUID()}`,
      });
      return NextResponse.json({ data: result, requestId }, { status: 202 });
    }

    const job = {
      id: `job-${crypto.randomUUID()}`,
      projectId,
      stage: input.stage,
      status: "queued",
      progress: 3,
      createdAt: new Date().toISOString(),
    };
    return NextResponse.json({ data: job, requestId }, { status: 202 });
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("未配置")
        ? error.message
        : "任务创建失败，请检查输入或稍后重试";
    return NextResponse.json({ error: message, requestId }, { status: 400 });
  }
}
