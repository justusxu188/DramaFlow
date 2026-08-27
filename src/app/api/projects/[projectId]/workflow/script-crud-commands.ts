import { NextResponse } from "next/server";

import type { WorkflowAction } from "./schema";
import {
  activatePipelineRun,
  deleteScript,
  deleteScripts,
  getPipelineJob,
  markScriptPrerollOpened,
  requeuePipelineJob,
  updateScript,
} from "@/lib/pipeline-store";

export type ScriptCrudAction = Extract<
  WorkflowAction,
  {
    action:
      | "retry"
      | "open_preroll_script"
      | "update_script"
      | "delete_script"
      | "delete_scripts";
  }
>;

export async function handleScriptCrudCommand(
  input: ScriptCrudAction,
  projectId: string,
  requestId: string,
) {
  if (input.action === "retry") {
    const job = await getPipelineJob(input.jobId);
    const data = await requeuePipelineJob(input.jobId, {
      attempts: 0,
      upstreamId:
        job?.kind === "post_production"
          ? job.upstreamId
          : undefined,
    });
    return NextResponse.json({ data, requestId }, { status: 202 });
  }

  await activatePipelineRun(projectId, input.workflowEntry);
  if (input.action === "open_preroll_script") {
    const data = await markScriptPrerollOpened(
      projectId,
      input.scriptId,
    );
    return NextResponse.json({ data, requestId });
  }
  if (input.action === "update_script") {
    const data = await updateScript(projectId, input.scriptId, input.script);
    return NextResponse.json({ data, requestId });
  }
  if (input.action === "delete_script") {
    const data = await deleteScript(projectId, input.scriptId);
    return NextResponse.json({ data, requestId });
  }
  const data = await deleteScripts(projectId, input.scriptIds);
  return NextResponse.json({ data, requestId });
}
