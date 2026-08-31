import { ProjectDashboard } from "@/components/project-dashboard";
import { requireUser } from "@/lib/auth";

export default async function HomePage() {
  await requireUser();
  return <ProjectDashboard />;
}
