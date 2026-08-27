import { NextResponse } from "next/server";

import {
  prepareContinueProduction,
  type ContinueProductionAction,
} from "./continue-production-preflight";
import { runPipelineJobNow } from "@/lib/pipeline-runner";
import { allocateHighlightOutputs } from "@/lib/production-config";
import {
  enqueuePipelineJob,
  upsertHighlight,
} from "@/lib/pipeline-store";

export type { ContinueProductionAction } from "./continue-production-preflight";

export async function handleContinueProduction(
  input: ContinueProductionAction,
  projectId: string,
  requestId: string,
) {
  const prepared = await prepareContinueProduction(
    input,
    projectId,
    requestId,
  );
  if (!prepared.ok) {
    return prepared.response;
  }
  const { pipeline, productionConfig, sharedInput } = prepared;
  const sharedArcs = pipeline.arcs ?? [];

  if (sharedArcs.length > 0) {
    const allocations = allocateHighlightOutputs(
      productionConfig.highlightTargetCount,
      sharedArcs.length,
    );
    const jobs = [];
    for (const [index, arc] of sharedArcs
      .slice(0, allocations.length)
      .entries()) {
      const highlightId = `highlight-${crypto.randomUUID()}`;
      await upsertHighlight(projectId, {
        id: highlightId,
        arcId: arc.id,
        mode: "montage",
        status: "queued",
      });
      const job = await enqueuePipelineJob({
        projectId,
        kind: "highlight",
        input: {
          ...sharedInput,
          arcId: arc.id,
          highlightId,
          highlightOutputCount: allocations[index],
        },
      });
      jobs.push(job);
      void runPipelineJobNow(job.id);
    }
    return NextResponse.json(
      { data: jobs, reused: ["analysis", "arcs"], requestId },
      { status: 202 },
    );
  }

  const data = await enqueuePipelineJob({
    projectId,
    kind: "mine_arcs",
    input: sharedInput,
  });
  void runPipelineJobNow(data.id);
  return NextResponse.json(
    { data, reused: ["analysis"], requestId },
    { status: 202 },
  );
}
