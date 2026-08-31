import { NextResponse } from "next/server";
import { projectInputSchema } from "@/lib/domain";
import { createProject, listProjects } from "@/lib/project-store";
import {
  accessForUser,
  authenticatedApiUser,
} from "@/lib/authorization";

export async function GET() {
  const auth = await authenticatedApiUser();
  if (!auth.user || auth.response) return auth.response;
  return NextResponse.json({
    data: await listProjects(accessForUser(auth.user)),
  });
}

export async function POST(request: Request) {
  const auth = await authenticatedApiUser();
  if (!auth.user || auth.response) return auth.response;
  const requestId = crypto.randomUUID();
  try {
    const input = projectInputSchema.parse(await request.json());
    const data = await createProject(input, auth.user.id);
    return NextResponse.json({ data, requestId }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "项目参数不完整或格式错误", requestId },
      { status: 400 },
    );
  }
}
