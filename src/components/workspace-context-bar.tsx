import { Boxes, Clapperboard, Film, Layers3, Workflow } from "lucide-react";

type ContextItem = {
  label: string;
  value: string;
  icon: typeof Boxes;
  title?: string;
};

function shortRunId(runId?: string) {
  if (!runId) return "尚未创建批次";
  return runId.startsWith("run-")
    ? runId.slice(4, 12)
    : runId.slice(0, 8);
}

export function WorkspaceContextBar({
  projectName,
  workflowLabel,
  runId,
  stageLabel,
  artifactLabel,
  inputLabel,
}: {
  projectName: string;
  workflowLabel: string;
  runId?: string;
  stageLabel: string;
  artifactLabel: string;
  inputLabel: string;
}) {
  const items: ContextItem[] = [
    {
      label: "项目",
      value: projectName,
      icon: Boxes,
    },
    {
      label: "工作流",
      value: workflowLabel,
      icon: Workflow,
    },
    {
      label: "当前批次",
      value: shortRunId(runId),
      title: runId,
      icon: Layers3,
    },
    {
      label: "当前阶段",
      value: stageLabel,
      icon: Clapperboard,
    },
    {
      label: "当前对象",
      value: artifactLabel,
      icon: Film,
    },
  ];

  return (
    <section
      className="workspace-context-bar"
      aria-label="当前生产上下文"
    >
      <div className="workspace-context-items">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              className="workspace-context-item"
              key={item.label}
              title={item.title}
            >
              <Icon size={14} />
              <span>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </span>
            </div>
          );
        })}
      </div>
      <div className="workspace-input-scope">
        <span>本批次输入</span>
        <strong>{inputLabel}</strong>
      </div>
    </section>
  );
}
