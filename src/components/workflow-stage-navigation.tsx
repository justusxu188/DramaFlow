import type { ProductionWorkspaceStage } from "@/lib/creative-work-types";

export type WorkflowStageView = {
  id: ProductionWorkspaceStage;
  label: string;
  state: "waiting" | "running" | "failed" | "completed" | "attention";
  statusLabel: string;
};

export function WorkflowStageNavigation({
  stages,
  activeStage,
  onSelect,
}: {
  stages: WorkflowStageView[];
  activeStage: ProductionWorkspaceStage;
  onSelect: (stage: ProductionWorkspaceStage) => void;
}) {
  return (
    <nav className="workflow-stage-navigation" aria-label="生产阶段">
      <div className="workflow-stage-list" role="tablist">
        {stages.map((stage, index) => (
          <button
            type="button"
            role="tab"
            aria-label={`${String(index + 1).padStart(2, "0")} · ${
              stage.statusLabel
            } ${stage.label}`}
            aria-selected={activeStage === stage.id}
            className={`${stage.state} ${
              activeStage === stage.id ? "active" : ""
            }`}
            key={stage.id}
            onClick={() => onSelect(stage.id)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{stage.label}</strong>
            <small title={stage.statusLabel}>
              {stage.statusLabel}
            </small>
          </button>
        ))}
      </div>
    </nav>
  );
}
