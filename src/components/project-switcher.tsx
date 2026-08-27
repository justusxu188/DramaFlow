"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  FileVideo2,
} from "lucide-react";
import type { ProjectSummary } from "@/lib/project-store";
import type { CreativeWorkType } from "@/lib/creative-work-types";

export function ProjectSwitcher({
  projectId,
  projectName,
  projectMeta,
  workType,
}: {
  projectId: string;
  projectName: string;
  projectMeta?: string;
  workType: CreativeWorkType;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/projects");
      const payload = await response.json() as {
        data?: ProjectSummary[];
      };
      if (response.ok) {
        setProjects(payload.data ?? []);
      }
    })();
  }, []);

  return (
    <div className="project-switcher">
      <button
        type="button"
        className="project-switcher-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="project-mini-poster">
          <FileVideo2 size={18} />
        </span>
        <span>
          <strong>{projectName}</strong>
          <small>
            {projectMeta || "选择项目"}
          </small>
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div
          className="project-switcher-menu"
          role="listbox"
          aria-label="选择项目"
        >
          <header>
            <strong>选择项目</strong>
            <small>{projects.length} 个项目</small>
          </header>
          <div>
            {projects.map((project) => (
              <button
                type="button"
                role="option"
                aria-selected={project.id === projectId}
                className={
                  project.id === projectId
                    ? "active"
                    : ""
                }
                key={project.id}
                onClick={() => {
                  setOpen(false);
                  router.push(
                    `/projects/${project.id}?workType=${workType.id}`,
                  );
                }}
              >
                <span>
                  <strong>{project.name}</strong>
                  <small>
                    {project.genre} · {project.sourceCount} 个源视频
                  </small>
                </span>
                {project.id === projectId && (
                  <Check size={14} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
