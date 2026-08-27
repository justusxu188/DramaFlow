"use client";

import { useState } from "react";
import {
  LoaderCircle,
  Save,
  X,
} from "lucide-react";
import type { PipelineScript } from "@/components/pipeline-workspace-types";

function fitTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "0";
  element.style.height = `${element.scrollHeight + 2}px`;
}

function scriptDurationFromShots(
  shots: PipelineScript["shots"],
) {
  const duration = shots.reduce((total, shot) => {
    const values = shot.time.match(/\d+(?:\.\d+)?/g);
    if (!values?.length) return total;
    if (values.length === 1) {
      return total + Number(values[0]);
    }
    const start = Number(values[0]);
    const end = Number(values[1]);
    return total + Math.max(0, end - start);
  }, 0);
  return Math.round(duration * 100) / 100;
}

function timeRange(time: string) {
  const values = time.match(/\d+(?:\.\d+)?/g);
  if (!values?.length) return null;
  const start = Number(values[0]);
  const end =
    values.length > 1
      ? Number(values[1])
      : start + 1;
  return {
    start,
    end,
    duration: Math.max(1, Math.round(end - start)),
  };
}

function framingFields(framing: string) {
  const value = framing.trim();
  const match = value.match(
    /^(大特写|特写|近景|中近景|中景|全景|远景|微距)(?:[，,\s]+)?/,
  );
  if (!match) {
    return {
      framing,
      shotSize: undefined,
      cameraMove: undefined,
    };
  }
  return {
    framing,
    shotSize: match[1],
    cameraMove:
      value.slice(match[0].length).trim() || undefined,
  };
}

function updateVisual(
  shot: PipelineScript["shots"][number],
  visual: string,
) {
  return {
    ...shot,
    visual,
    dynamicChange: undefined,
    visualContrast: undefined,
    characterAction: undefined,
    startState: undefined,
    endState: undefined,
    cutToNext: undefined,
    characters: undefined,
    scene: undefined,
    keyProps: undefined,
  };
}

function normalizeShotTimeline(
  shots: PipelineScript["shots"],
) {
  let cursor = 0;
  return shots.map((shot) => {
    const duration = timeRange(shot.time)?.duration ?? 1;
    const next = {
      ...shot,
      time: `${cursor}-${cursor + duration}秒`,
    };
    cursor += duration;
    return next;
  });
}

function updateShotTimeline(
  shots: PipelineScript["shots"],
  changedIndex: number,
) {
  const current = timeRange(shots[changedIndex]?.time ?? "");
  if (!current) return normalizeShotTimeline(shots);
  const previousEnd =
    changedIndex > 0
      ? timeRange(shots[changedIndex - 1].time)?.end ?? 0
      : 0;
  let cursor = Math.round(previousEnd);
  return shots.map((shot, index) => {
    if (index < changedIndex) return shot;
    const duration =
      index === changedIndex
        ? current.duration
        : timeRange(shot.time)?.duration ?? 1;
    const next = {
      ...shot,
      time: `${cursor}-${cursor + duration}秒`,
    };
    cursor += duration;
    return next;
  });
}

function dialogueText(
  shot: PipelineScript["shots"][number],
) {
  const dialogue = shot.dialogue?.trim();
  const speaker = shot.dialogueSpeaker?.trim();
  if (
    !dialogue ||
    ["无", "无台词", "无对白"].includes(dialogue)
  ) {
    return "";
  }
  if (
    !speaker ||
    ["无", "无台词", "无对白"].includes(speaker)
  ) {
    return dialogue;
  }
  return `${speaker}说：${dialogue}`;
}

function parseDialogueText(value: string) {
  const matched = value.match(/^(.+?)说[：:]\s*(.*)$/s);
  return matched
    ? {
        dialogueSpeaker: matched[1].trim(),
        dialogue: matched[2],
      }
    : {
        dialogueSpeaker: "",
        dialogue: value,
      };
}

function prepareScript(script: PipelineScript) {
  return {
    ...script,
    shots: normalizeShotTimeline(
      (script.shots ?? []).map((shot) => ({
        ...shot,
        voiceover:
          shot.voiceover ??
          shot.subtitle ??
          "",
      })),
    ),
    videoPrompt: script.videoPrompt ?? "",
  };
}

export function PipelineScriptEditorModal({
  script,
  saving,
  onClose,
  onSave,
}: {
  script: PipelineScript;
  saving: boolean;
  onClose: () => void;
  onSave: (script: PipelineScript) => void;
}) {
  const [draft, setDraft] = useState(() =>
    prepareScript(script),
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal script-review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="script-review-title"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">SCRIPT REVIEW</p>
            <h2 id="script-review-title">
              编辑 AI 前贴脚本
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="script-edit-scroll">
          <section className="script-meta-editor">
            <strong>脚本信息</strong>
            <div className="script-meta-fields">
              <label>
                标题
                <input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      title: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                总时长（秒）
                <input
                  readOnly
                  value={scriptDurationFromShots(
                    draft.shots,
                  )}
                />
              </label>
              <label>
                首帧花字
                <textarea
                  ref={fitTextarea}
                  value={draft.hookTitleCard ?? ""}
                  onInput={(event) =>
                    fitTextarea(event.currentTarget)
                  }
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      hookTitleCard: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                正片衔接
                <textarea
                  ref={fitTextarea}
                  value={draft.transition}
                  onInput={(event) =>
                    fitTextarea(event.currentTarget)
                  }
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      transition: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          </section>
          <section className="script-shot-editor">
            <strong>前贴脚本内容</strong>
            {draft.shots.map((shot, index) => (
              <article
                className="script-shot-fields"
                key={shot.beatId ?? index}
              >
                <header>
                  <span>
                    第{index + 1}段
                    {shot.beatRole
                      ? ` · ${shot.beatRole}`
                      : ""}
                  </span>
                  {shot.segmentType ===
                    "original_footage" && <b>原片</b>}
                </header>
                <div className="script-shot-row">
                  <label>
                    时间
                    <input
                      value={shot.time}
                      aria-label={`镜头 ${index + 1} 时间`}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          shots: draft.shots.map(
                            (item, shotIndex) =>
                              shotIndex === index
                                ? {
                                    ...item,
                                    time: event.target.value,
                                  }
                                : item,
                          ),
                        })
                      }
                      onBlur={() =>
                        setDraft({
                          ...draft,
                          shots: updateShotTimeline(
                            draft.shots,
                            index,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    景别与运镜
                    <textarea
                      ref={fitTextarea}
                      value={shot.framing}
                      aria-label={`镜头 ${index + 1} 景别`}
                      onInput={(event) =>
                        fitTextarea(event.currentTarget)
                      }
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          shots: draft.shots.map(
                            (item, shotIndex) =>
                              shotIndex === index
                                ? {
                                    ...item,
                                    ...framingFields(
                                      event.target.value,
                                    ),
                                  }
                                : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    画面
                    <textarea
                      ref={fitTextarea}
                      value={shot.visual}
                      aria-label={`镜头 ${index + 1} 画面`}
                      onInput={(event) =>
                        fitTextarea(event.currentTarget)
                      }
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          shots: draft.shots.map(
                            (item, shotIndex) =>
                              shotIndex === index
                                ? updateVisual(
                                    item,
                                    event.target.value,
                                  )
                                : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    旁白（画外音）
                    <textarea
                      ref={fitTextarea}
                      value={shot.voiceover ?? ""}
                      aria-label={`第 ${index + 1} 段旁白`}
                      onInput={(event) =>
                        fitTextarea(event.currentTarget)
                      }
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          shots: draft.shots.map(
                            (item, shotIndex) =>
                              shotIndex === index
                                ? {
                                    ...item,
                                    voiceover:
                                      event.target.value,
                                  }
                                : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    角色台词
                    <textarea
                      ref={fitTextarea}
                      value={dialogueText(shot)}
                      aria-label={`第 ${index + 1} 段角色台词`}
                      onInput={(event) =>
                        fitTextarea(event.currentTarget)
                      }
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          shots: draft.shots.map(
                            (item, shotIndex) =>
                              shotIndex === index
                                ? {
                                    ...item,
                                    ...parseDialogueText(
                                      event.target.value,
                                    ),
                                  }
                                : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    字幕
                    <textarea
                      ref={fitTextarea}
                      value={shot.subtitle ?? ""}
                      aria-label={`第 ${index + 1} 段字幕`}
                      onInput={(event) =>
                        fitTextarea(event.currentTarget)
                      }
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          shots: draft.shots.map(
                            (item, shotIndex) =>
                              shotIndex === index
                                ? {
                                    ...item,
                                    subtitle:
                                      event.target.value,
                                  }
                                : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    场景/时间文字
                    <textarea
                      ref={fitTextarea}
                      value={shot.sceneCaption ?? ""}
                      aria-label={`第 ${index + 1} 段场景或时间文字`}
                      onInput={(event) =>
                        fitTextarea(event.currentTarget)
                      }
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          shots: draft.shots.map(
                            (item, shotIndex) =>
                              shotIndex === index
                                ? {
                                    ...item,
                                    sceneCaption:
                                      event.target.value,
                                  }
                                : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    声音
                    <textarea
                      ref={fitTextarea}
                      value={shot.sound ?? ""}
                      aria-label={`镜头 ${index + 1} 声音`}
                      onInput={(event) =>
                        fitTextarea(event.currentTarget)
                      }
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          shots: draft.shots.map(
                            (item, shotIndex) =>
                              shotIndex === index
                                ? {
                                    ...item,
                                    sound: event.target.value,
                                  }
                                : item,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              </article>
            ))}
          </section>
        </div>
        <div className="modal-actions">
          <button
            className="button ghost"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="button primary"
            disabled={saving}
            onClick={() => onSave(draft)}
          >
            {saving ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Save size={15} />
            )}
            保存脚本
          </button>
        </div>
      </div>
    </div>
  );
}
