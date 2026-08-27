"use client";

import Link from "next/link";
import {
  usePathname,
  useSearchParams,
} from "next/navigation";
import {
  Blocks,
  ChevronDown,
  Clapperboard,
  Film,
  FolderKanban,
  Gauge,
  Settings,
} from "lucide-react";
import { creativeWorkTypes } from "@/lib/creative-work-types";

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeProjectWorkType =
    pathname.startsWith("/projects/")
      ? searchParams.get("workType")
      : null;
  const currentProjectId =
    pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const projectItem = {
    href: "/",
    label: "项目中心",
    icon: FolderKanban,
  };
  const ProjectIcon = projectItem.icon;
  const items = [
    { href: "/library", label: "素材库", icon: Film },
    { href: "/tasks", label: "任务中心", icon: Gauge },
  ];
  const productionActive =
    pathname.startsWith("/production") ||
    Boolean(activeProjectWorkType);

  return (
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="FrameFlow 首页">
        <span className="brand-mark">
          <Blocks size={20} strokeWidth={2.4} />
        </span>
        <span>
          <strong>FrameFlow</strong>
          <small>SHORT DRAMA STUDIO</small>
        </span>
      </Link>

      <nav className="sidebar-nav" aria-label="主导航">
        <p className="nav-caption">工作台</p>
        <Link
          href={projectItem.href}
          className={`nav-item ${
            pathname === "/" ||
              (
                pathname.startsWith("/projects/") &&
                !activeProjectWorkType
              )
              ? "active"
              : ""
          }`}
        >
          <ProjectIcon size={18} />
          <span>{projectItem.label}</span>
        </Link>
        <details
          className="sidebar-nav-group"
          open={productionActive}
        >
          <summary
            className={`nav-item ${
              productionActive ? "active" : ""
            }`}
          >
            <Clapperboard size={18} />
            <span>创作工作台</span>
            <ChevronDown
              className="nav-group-chevron"
              size={15}
            />
          </summary>
          <div className="sidebar-subnav">
            <Link
              href="/production"
              className={
                pathname === "/production" ? "active" : ""
              }
            >
              创作总览
            </Link>
            {creativeWorkTypes.map((workType) => {
              const href = currentProjectId
                ? `/projects/${currentProjectId}?workType=${workType.id}`
                : `/production/${workType.id}`;

              return (
                <Link
                  key={workType.id}
                  href={href}
                  onClick={(event) => {
                    if (
                      !currentProjectId ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    ) {
                      return;
                    }
                    event.preventDefault();
                    window.history.pushState(
                      null,
                      "",
                      href,
                    );
                  }}
                  className={
                    pathname ===
                      `/production/${workType.id}` ||
                    activeProjectWorkType ===
                      workType.id
                      ? "active"
                      : ""
                  }
                >
                  {workType.label}
                </Link>
              );
            })}
          </div>
        </details>
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`nav-item ${active ? "active" : ""}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <Link href="/settings" className={`nav-item ${pathname === "/settings" ? "active" : ""}`}>
          <Settings size={18} />
          <span>系统设置</span>
        </Link>
      </div>
    </aside>
  );
}
