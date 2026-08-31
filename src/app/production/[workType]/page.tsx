import { notFound, redirect } from "next/navigation";
import {
  creativeWorkTypeIds,
} from "@/lib/creative-work-types";
import { listProjects } from "@/lib/project-store";
import { requireUser } from "@/lib/auth";
import { accessForUser } from "@/lib/authorization";

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
  const user = await requireUser();
  const projects = await listProjects(accessForUser(user));
  if (!projects.length) redirect("/");
  redirect(
    `/projects/${projects[0].id}?workType=${workTypeId}`,
  );
}
