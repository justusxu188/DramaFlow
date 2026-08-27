import { notFound, redirect } from "next/navigation";
import {
  creativeWorkTypeIds,
} from "@/lib/creative-work-types";
import { listProjects } from "@/lib/project-store";

export const dynamic = "force-dynamic";

export default async function CreativeTypePage({
  params,
}: {
  params: Promise<{ workType: string }>;
}) {
  const { workType: workTypeId } = await params;
  if (
    !creativeWorkTypeIds.includes(
      workTypeId as (typeof creativeWorkTypeIds)[number],
    )
  ) {
    notFound();
  }
  const projects = await listProjects();
  if (!projects.length) redirect("/");
  redirect(
    `/projects/${projects[0].id}?workType=${workTypeId}`,
  );
}
