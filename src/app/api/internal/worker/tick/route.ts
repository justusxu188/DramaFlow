import { NextResponse } from "next/server";
import { runPipelineTick } from "@/lib/pipeline-runner";

export const maxDuration = 300;

export async function POST() {
  const data = await runPipelineTick();
  return NextResponse.json({ data });
}
