"use client";

import type { PipelineScript } from "@/components/pipeline-workspace-types";
import { prerollLabels } from "@/lib/domain";

export function PipelineScriptDetails({
  script,
}: {
  script: PipelineScript;
}) {
  return (
    <div
      className="script-version-details"
      id={`script-details-${script.id}`}
    >
      <div className="script-version-content">
        <span>AI 前贴类型</span>
        <small>{script.hookParadigm ?? "未记录"}</small>
        <span>前贴与正片关系</span>
        <small>
          {script.prepatchType ??
            (script.prerollType
              ? prerollLabels[script.prerollType]
              : "未记录")}
        </small>
        {script.audienceGenre && (
          <>
            <span>受众题材</span>
            <small>{script.audienceGenre}</small>
          </>
        )}
        <span>旁白文案</span>
        <p>{script.voiceover}</p>
        {script.coreHook && (
          <>
            <span>核心钩子</span>
            <small>{script.coreHook}</small>
          </>
        )}
        <span>衔接方式</span>
        <small>{script.transition}</small>
      </div>
    </div>
  );
}
