import { ProjectWorkspaceRoute } from "@/components/pipeline-workspace";
import { requireUser } from "@/lib/auth";
import { accessForUser } from "@/lib/authorization";
import { getProject } from "@/lib/project-store";
import { notFound } from "next/navigation";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await getProject(projectId, accessForUser(user)))) {
    notFound();
  }
  return <ProjectWorkspaceRoute projectId={projectId} />;
}
