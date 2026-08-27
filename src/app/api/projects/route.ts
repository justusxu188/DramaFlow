import { NextResponse } from "next/server";
import { projectInputSchema } from "@/lib/domain";
import { createProject, listProjects } from "@/lib/project-store";

export async function GET() {
  return NextResponse.json({ data: await listProjects() });
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = projectInputSchema.parse(await request.json());
    const data = await createProject(input);
    return NextResponse.json({ data, requestId }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "项目参数不完整或格式错误", requestId },
      { status: 400 },
    );
  }
}
