import { ProjectWorkspaceRoute } from "@/components/pipeline-workspace";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectWorkspaceRoute projectId={projectId} />;
}
