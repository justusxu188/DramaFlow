import { Sparkles } from "lucide-react";

import type { PipelineArc } from "@/components/pipeline-workspace-types";

export function PipelineStoryArcStage({ arcs }: { arcs: PipelineArc[] }) {
  if (!arcs.length) {
    return null;
  }

  return (
    <div className="pipeline-section">
      <div className="pipeline-section-title">
        <Sparkles size={16} />
        <strong>爽点故事线</strong>
        <span>{arcs.length} 条</span>
      </div>
      <div className="variant-grid">
        {arcs.map((arc) => (
          <article key={arc.id}>
            <div>
              <span>{arc.payoffType}</span>
              <b>相关度 {arc.scores.relevance}</b>
            </div>
            <h3>{arc.title}</h3>
            <p>{arc.pitch}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
