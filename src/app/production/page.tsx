import Link from "next/link";
import {
  ArrowRight,
  Clapperboard,
  Film,
  Scissors,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { creativeWorkTypes } from "@/lib/creative-work-types";
import { listProjects } from "@/lib/project-store";

export const dynamic = "force-dynamic";

const workIcons = {
  "full-chain": Sparkles,
  "highlight-preroll": WandSparkles,
  "batch-highlights": Clapperboard,
  "post-production": Scissors,
};

export default async function ProductionPage() {
  const projects = await listProjects();
  return (
    <div className="page creative-workbench-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">CREATIVE WORKBENCH</p>
          <h1>创作工作台</h1>
          <p className="page-subtitle">
            先选择本次要完成的创作任务，系统只展示相关素材、设置和步骤。
          </p>
        </div>
      </header>

      <section className="creative-type-list">
        {creativeWorkTypes.map((workType) => {
          const Icon = workIcons[workType.id];
          return (
            <Link
              href={`/production/${workType.id}`}
              className="creative-type-row"
              key={workType.id}
            >
              <span className="creative-type-icon">
                <Icon size={21} />
              </span>
              <div>
                <strong>{workType.label}</strong>
                <small>{workType.description}</small>
              </div>
              <span className="creative-type-meta">
                {workType.stages.length
                  ? `${workType.stages.length} 个步骤`
                  : "独立工作台"}
              </span>
              <ArrowRight size={17} />
            </Link>
          );
        })}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RECENT PROJECTS</p>
            <h2>最近项目</h2>
          </div>
          <span className="work-count">
            {projects.length} 个项目
          </span>
        </div>
        <div className="work-list compact">
          {!projects.length && (
            <div className="empty-state">
              <Film size={24} />
              <strong>暂无创作项目</strong>
              <Link className="button primary" href="/">
                前往项目中心
              </Link>
            </div>
          )}
          {projects.slice(0, 5).map((project) => (
            <Link
              href={`/projects/${project.id}?workType=full-chain`}
              className="work-row"
              key={project.id}
            >
              <span className="project-poster">
                <Film size={22} />
              </span>
              <div>
                <strong>{project.name}</strong>
                <small>
                  {project.genre} · {project.sourceCount} 个源视频
                </small>
              </div>
              <span>
                <b>{project.progress}%</b>
                <small>生产进度</small>
              </span>
              <ArrowRight size={17} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
