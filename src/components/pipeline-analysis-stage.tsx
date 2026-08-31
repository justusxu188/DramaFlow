import { Film, RefreshCw } from "lucide-react";

import type { PipelineAnalysis } from "@/components/pipeline-workspace-types";

type PipelineAnalysisStageProps = {
  analysis: PipelineAnalysis;
  sourceUnitLabel: string;
  reanalyzeDisabled: boolean;
  onReanalyze: () => void | Promise<void>;
};

export function PipelineAnalysisStage({
  analysis,
  sourceUnitLabel,
  reanalyzeDisabled,
  onReanalyze,
}: PipelineAnalysisStageProps) {
  return (
    <div className="pipeline-section">
      <div className="pipeline-section-title">
        <Film size={16} />
        <strong>剧情理解</strong>
        <span>
          {analysis.sourceVideoInfo.length}
          {sourceUnitLabel} · {analysis.clips.length} 个片段 ·{" "}
          {analysis.highlights.length} 条高光候选 ·{" "}
          {Math.round(analysis.duration)} 秒
        </span>
        <button
          className="button ghost"
          type="button"
          disabled={reanalyzeDisabled}
          onClick={() => void onReanalyze()}
        >
          <RefreshCw size={14} />
          重新理解
        </button>
      </div>

      <div className="storyline-analysis">
        {analysis.sourceVideoInfo
          .slice()
          .sort((left, right) => left.index - right.index)
          .map((source) => {
            const sourceLabel = sourceUnitLabel.includes("高光")
              ? `高光 ${source.index + 1}`
              : `第 ${source.index + 1} 集`;
            const clips = analysis.clips
              .filter((clip) => clip.sourceVideoIndex === source.index)
              .sort((left, right) => left.start - right.start);
            return (
              <section className="storyline-episode" key={source.index}>
                <header>
                  <span>{sourceLabel}</span>
                  <h3>{source.title}</h3>
                  <small>{clips.length} 个剧情片段</small>
                </header>
                <p className="storyline-summary">{source.summary}</p>
                <div className="storyline-tags">
                  {source.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="storyline-clips">
                  {clips.map((clip) => {
                    const sourceVideo =
                      analysis.sourceVideoInfo.find(
                        (item) => item.index === clip.sourceVideoIndex,
                      )?.url;
                    return (
                      <article key={clip.index}>
                        {(clip.snapshotUrl || sourceVideo) && (
                          <span className="storyline-clip-preview">
                            {sourceVideo && (
                              <video
                                muted
                                playsInline
                                preload="metadata"
                                src={`${sourceVideo}#t=${Math.max(
                                  0,
                                  clip.start + 0.1,
                                )}`}
                                aria-label={`${sourceLabel}片段 ${
                                  clip.index + 1
                                } 视频帧`}
                              />
                            )}
                            {clip.snapshotUrl && (
                              <img
                                src={clip.snapshotUrl}
                                alt={`${sourceLabel}片段 ${
                                  clip.index + 1
                                } 关键帧`}
                                onError={(event) => {
                                  event.currentTarget.hidden = true;
                                }}
                              />
                            )}
                          </span>
                        )}
                        <div>
                          <header>
                            <span>
                              {Math.round(clip.start)}s–
                              {Math.round(clip.end)}s
                            </span>
                            <b>评分 {clip.score.toFixed(1)}</b>
                          </header>
                          <h4>{clip.title}</h4>
                          <p>{clip.summary}</p>
                          {clip.dialogue && (
                            <blockquote>
                              <strong>对白</strong>
                              <span>{clip.dialogue}</span>
                            </blockquote>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        <section className="storyline-provider-highlights">
          <header>
            <h3>MediaKit 高光候选</h3>
            <span>{analysis.highlights.length} 条</span>
          </header>
          {analysis.highlights.map((highlight) => (
            <article key={highlight.index}>
              <div>
                <b>候选 {highlight.index + 1}</b>
                <span>
                  引用片段{" "}
                  {highlight.clipIndexes
                    .map((index) => `#${index + 1}`)
                    .join("、")}
                </span>
              </div>
              <h4>{highlight.title}</h4>
              <p>{highlight.summary}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
