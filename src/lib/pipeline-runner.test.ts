import { describe, expect, it } from "vitest";
import {
  buildBatchHighlightAssetInput,
  planVideoSegments,
  resolveAgentScriptReferences,
  resolveProductionConfig,
  shouldContinueAfterHighlight,
  splitVideoDuration,
  uploadedHighlightSnapshot,
} from "./pipeline-runner";
import {
  defaultProductionConfig,
  videoGenerationSegmentDurations,
  videoGenerationSegmentLimit,
} from "./production-config";
import {
  buildSeedanceSegmentPrompt,
  resolveSubmittedSeedancePrompt,
  splitSeedancePromptForDisplay,
  stripVideoRatioInstructions,
} from "./seedance-prompt";

describe("long preroll segmentation", () => {
  it("keeps the immutable uploaded-highlight run snapshot", () => {
    expect(uploadedHighlightSnapshot({
      uploadedHighlights: [{
        assetId: "asset-1",
        highlightId: "highlight-upload-asset-1",
        name: "高光一",
        videoUrl: "https://example.com/highlight.mp4",
        duration: 90,
      }, {
        assetId: "invalid",
      }],
    })).toEqual([{
      assetId: "asset-1",
      highlightId: "highlight-upload-asset-1",
      name: "高光一",
      videoUrl: "https://example.com/highlight.mp4",
      duration: 90,
    }]);
  });

  it("keeps short videos in one generation", () => {
    expect(splitVideoDuration(15, 15)).toEqual([15]);
  });

  it("balances long videos across model-safe segments", () => {
    expect(splitVideoDuration(16, 15)).toEqual([8, 8]);
    expect(splitVideoDuration(31, 15)).toEqual([11, 10, 10]);
    expect(splitVideoDuration(60, 30)).toEqual([30, 30]);
  });

  it("uses the selected Seedance model limit", () => {
    expect(videoGenerationSegmentLimit("seedance_2_5")).toBe(30);
    expect(videoGenerationSegmentDurations(30, "seedance_2_5"))
      .toEqual([30]);
    expect(videoGenerationSegmentDurations(31, "seedance_2_5"))
      .toEqual([16, 15]);
    expect(videoGenerationSegmentLimit("seedance_2_0")).toBe(15);
    expect(videoGenerationSegmentLimit("seedance_2_0_mini")).toBe(15);
    expect(videoGenerationSegmentDurations(16, "seedance_2_0_mini"))
      .toEqual([8, 8]);
    expect(videoGenerationSegmentDurations(16, "seedance_2_0_fast"))
      .toEqual([8, 8]);
  });

  it("keeps a short multi-shot script in one model request", () => {
    expect(planVideoSegments([
      {
        time: "0-2秒",
        framing: "近景",
        visual: "操作员看向正常的大屏",
        dialogue: "",
        sound: "环境底噪",
      },
      {
        time: "2-4秒",
        framing: "特写",
        visual: "举报弹窗连续出现",
        dialogue: "",
        sound: "警报声",
      },
      {
        time: "4-8秒",
        framing: "中景",
        visual: "切到警车定位点同时亮起",
        dialogue: "",
        sound: "引擎启动声",
      },
      {
        time: "8-11秒",
        framing: "特写",
        visual: "红光落到轮椅标识并闪白转场",
        dialogue: "",
        sound: "低频冲击",
      },
    ], 11, 15)).toEqual([
      expect.objectContaining({
        duration: 11,
        shotIndexes: [0, 1, 2, 3],
      }),
    ]);
  });

  it("removes aspect-ratio instructions from video prompt text", () => {
    expect(
      stripVideoRatioInstructions(
        "【摄影机参数】9:16画幅，稳定器拍摄。" +
          "【类型与风格】竖屏写实短剧。",
      ),
    ).toBe(
      "【摄影机参数】稳定器拍摄。" +
        "【类型与风格】写实短剧。",
    );
  });

  it("never splits one shot across Seedance requests", () => {
    expect(() =>
      planVideoSegments([
        {
          time: "0-16秒",
          framing: "长镜头",
          visual: "人物从走廊进入大厅并完成连续对话",
          dialogue: "整段动作不可中断",
        },
      ], 16, 15),
    ).toThrow("单镜头");
  });

  it("keeps continuous shots in the fewest model-safe segments", () => {
    const shots = [0, 5, 10].map((start) => ({
      time: `${start}-${start + 5}秒`,
      framing: "中景",
      visual: "人物持续完成同一组动作",
      dialogue: "",
    }));
    expect(planVideoSegments(shots, 15, 15)).toEqual([
      expect.objectContaining({
        duration: 15,
        shotIndexes: [0, 1, 2],
      }),
    ]);
  });

  it("rejects a target duration that cannot preserve every shot", () => {
    const shots = Array.from({ length: 5 }, (_, index) => ({
      time: `${index}-${index + 1}秒`,
      framing: "特写",
      visual: `镜头 ${index + 1}`,
      dialogue: "",
    }));
    expect(() => planVideoSegments(shots, 4, 15)).toThrow(
      "不足以容纳",
    );
  });

  it("keeps every generated segment between four seconds and the model limit", () => {
    const segments = planVideoSegments([
      {
        time: "0-3秒",
        framing: "近景",
        visual: "人物抬头",
        dialogue: "",
      },
      {
        time: "3-7秒",
        framing: "中景",
        visual: "人物走向门口",
        dialogue: "",
      },
      {
        time: "7-11秒",
        framing: "特写",
        visual: "人物推门",
        dialogue: "",
      },
      {
        time: "11-16秒",
        framing: "全景",
        visual: "人物进入大厅",
        dialogue: "",
      },
    ], 16, 15);

    expect(segments.flatMap((segment) => segment.shotIndexes))
      .toEqual([0, 1, 2, 3]);
    expect(segments.every(
      (segment) => segment.duration >= 4 && segment.duration <= 15,
    )).toBe(true);
  });

  it("submits only global constraints and the current segment", () => {
    expect(buildSeedanceSegmentPrompt({
      globalVisualStyle: "9:16 写实短剧",
      characterLock: "操作员制服一致",
      sceneLock: "交通指挥中心",
      negativePrompt: "禁止人物和界面漂移",
      segment: {
        index: 1,
        duration: 6,
        referenceAssets: [],
        prompt: "中景跟拍，操作员转身按下警报按钮。",
        sound: "短促警报声",
      },
    })).toBe(
      "写实短剧。角色一致性：操作员制服一致。场景一致性：交通指挥中心。\n" +
      "当前片段：中景跟拍，操作员转身按下警报按钮。\n" +
      "声音：短促警报声。\n" +
      "稳定性限制：禁止人物和界面漂移。",
    );
  });

  it("rebuilds legacy submitted prompts without placeholder text", () => {
    const prompt =
      "【画面描述】人物抬头" +
      "【全局限制(Negative)】禁止人物变形";
    expect(resolveSubmittedSeedancePrompt({
      globalVisualStyle: "写实短剧",
      characterLock: "人物外观保持一致",
      sceneLock: "场景保持一致",
      negativePrompt: "禁止人物变形",
      segment: {
        index: 0,
        duration: 6,
        referenceAssets: [],
        prompt,
        sound: "",
        submittedPrompt:
          `${prompt}\n稳定性限制：按每个片段 ` +
          "video_prompt 内的【全局限制(Negative)】执行。",
      },
    })).toBe(prompt);
  });

  it("fills missing stage-three voice and text sections", () => {
    expect(buildSeedanceSegmentPrompt({
      globalVisualStyle: "写实短剧",
      characterLock: "女主外观保持一致",
      sceneLock: "医院门口空间保持一致",
      voiceCards: "旁白使用沉稳清晰的中年男声",
      musicLine: "（紧张电子乐）",
      soundPrinciple: "音效与动作同步",
      persistentText: "左上角全程常驻【短剧名称】",
      subtitleStyle: "底部白字黑边字幕",
      negativePrompt: "禁止人物变形",
      segment: {
        index: 0,
        duration: 6,
        referenceAssets: [],
        prompt:
          "【画面描述】女主抬头看向镜头" +
          "【镜头1】近景，旁白{真相来了}，字幕【真相来了】" +
          "【画面文字】无" +
          "【声音】" +
          "【全局限制(Negative)】禁止人物变形",
        sound: "",
      },
    })).toBe(
      "【画面描述】女主抬头看向镜头" +
      "【镜头1】近景，旁白{真相来了}，字幕【真相来了】" +
      "【画面文字】左上角全程常驻【短剧名称】" +
      "【字幕样式】底部白字黑边字幕" +
      "【声音】旁白使用沉稳清晰的中年男声；" +
      "（紧张电子乐）" +
      "【全局限制(Negative)】禁止人物变形",
    );
  });

  it("does not append semantically duplicate voice and subtitle sections", () => {
    const prompt =
      "【画面描述】女主抬头看向镜头" +
      "【镜头1】旁白{真相来了}，字幕【真相来了】" +
      "【字幕样式】白色粗体字幕，位于画面底部" +
      "【声音】旁白为沉稳中年男声；（紧张电子乐贯穿全片）" +
      "【全局限制(Negative)】禁止人物变形";
    expect(buildSeedanceSegmentPrompt({
      globalVisualStyle: "写实短剧",
      characterLock: "女主外观保持一致",
      sceneLock: "医院门口空间保持一致",
      voiceCards: "旁白：中年男性，沉稳清晰的音色",
      musicLine: "（全程贯穿紧张电子乐）",
      soundPrinciple: "音效与动作同步",
      persistentText: "",
      subtitleStyle: "底部白字黑边字幕",
      negativePrompt: "禁止人物变形",
      segment: {
        index: 0,
        duration: 6,
        referenceAssets: [],
        prompt,
        sound: "",
      },
    })).toBe(prompt);
  });

  it("preserves explicit no-audio and no-subtitle instructions", () => {
    const prompt =
      "【画面描述】纯画面蒙太奇" +
      "【字幕样式】无字幕" +
      "【声音】无配音、无BGM、无音效，保持静音" +
      "【全局限制(Negative)】禁止出现任何声音和字幕";
    expect(buildSeedanceSegmentPrompt({
      globalVisualStyle: "写实短剧",
      characterLock: "人物外观保持一致",
      sceneLock: "场景保持一致",
      voiceCards: "旁白：沉稳中年男声",
      musicLine: "（紧张电子乐）",
      soundPrinciple: "音效与动作同步",
      persistentText: "",
      subtitleStyle: "底部白字黑边字幕",
      negativePrompt: "禁止人物变形",
      segment: {
        index: 0,
        duration: 6,
        referenceAssets: [],
        prompt,
        sound: "",
      },
    })).toBe(prompt);
  });

  it("treats a plain no value as an explicit disabled section", () => {
    const prompt =
      "【画面描述】纯画面蒙太奇" +
      "【字幕样式】无" +
      "【声音】无" +
      "【全局限制(Negative)】禁止人物变形";
    expect(buildSeedanceSegmentPrompt({
      globalVisualStyle: "写实短剧",
      characterLock: "人物外观保持一致",
      sceneLock: "场景保持一致",
      voiceCards: "旁白：沉稳中年男声",
      musicLine: "（紧张电子乐）",
      soundPrinciple: "音效与动作同步",
      persistentText: "",
      subtitleStyle: "底部白字黑边字幕",
      negativePrompt: "禁止人物变形",
      segment: {
        index: 0,
        duration: 6,
        referenceAssets: [],
        prompt,
        sound: "",
      },
    })).toBe(prompt);
  });

  it("splits structured prompts into readable display sections", () => {
    expect(splitSeedancePromptForDisplay(
      "【主体锁定】女主和轮椅【场景设定】医院门口" +
      "【镜头1】近景推进，字幕【真相马上揭晓】" +
      "【字幕样式】底部白字黑边" +
      "【全局限制(Negative)】禁止变形",
    )).toEqual([
      { label: "主体锁定", content: "女主和轮椅" },
      { label: "场景设定", content: "医院门口" },
      {
        label: "镜头1",
        content: "近景推进，字幕【真相马上揭晓】",
      },
      {
        label: "字幕样式",
        content: "底部白字黑边",
      },
      {
        label: "全局限制(Negative)",
        content: "禁止变形",
      },
    ]);
  });

  it("removes compliance badges from submitted prompts", () => {
    expect(buildSeedanceSegmentPrompt({
      globalVisualStyle: "",
      characterLock: "",
      sceneLock: "",
      negativePrompt: "",
      segment: {
        index: 0,
        duration: 6,
        referenceAssets: [],
        prompt:
          "【画面描述】人物抬头【合规角标】影视效果 请勿模仿" +
          "【声音】旁白{真相来了}【全局限制(Negative)】禁止变形",
        sound: "",
      },
    })).toBe(
      "【画面描述】人物抬头【声音】旁白{真相来了}" +
      "【全局限制(Negative)】禁止变形",
    );
  });
});

describe("production plan execution", () => {
  it("stops batch highlight jobs before the preroll pipeline", () => {
    expect(
      shouldContinueAfterHighlight({
        ...defaultProductionConfig,
        productionEntry: "batch_highlights",
        autoRun: true,
      }),
    ).toBe(false);
    expect(
      shouldContinueAfterHighlight({
        ...defaultProductionConfig,
        productionEntry: "full_drama",
        autoRun: true,
      }),
    ).toBe(true);
  });

  it("builds a reusable library asset from each batch highlight output", () => {
    expect(
      buildBatchHighlightAssetInput({
        projectName: "真实短剧",
        runId: "run-1",
        sourceHighlightId:
          "highlight-1-variant-2",
        index: 1,
        objectKey:
          "projects/project-1/highlights/2.mp4",
        sourceUrl:
          "https://example.com/highlight-2.mp4",
        sizeBytes: 2048,
        durationSeconds: 18.25,
        summary: "身份揭露",
      }),
    ).toEqual({
      name: "真实短剧-高光-2",
      objectKey:
        "projects/project-1/highlights/2.mp4",
      sourceUrl:
        "https://example.com/highlight-2.mp4",
      mimeType: "video/mp4",
      sizeBytes: 2048,
      durationMs: 18250,
      metadata: {
        sourceType: "mediakit",
        sourceRunId: "run-1",
        sourceHighlightId:
          "highlight-1-variant-2",
        summary: "身份揭露",
      },
    });
  });

  it("pauses Agent character mode when a script role has no image asset", () => {
    const result = resolveAgentScriptReferences(
      {
        shots: [
          {
            time: "0-3秒",
            framing: "近景",
            visual: "林晚抬头",
            dialogue: "",
            characters: ["林晚", "顾沉"],
          },
        ],
      },
      [
        {
          id: "image-1",
          projectId: "project-1",
          kind: "character_image",
          folder: "图像资产",
          name: "林晚-正面",
          objectKey: "images/linwan.jpg",
          sourceUrl:
            "https://example.com/linwan.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 1024,
          uploadStatus: "completed",
          metadata: {
            characterName: "林晚",
            lookName: "日常装",
          },
          createdAt:
            "2026-08-19T00:00:00.000Z",
        },
      ],
    );

    expect(result).toEqual({
      characterNames: ["林晚", "顾沉"],
      missingCharacterNames: ["顾沉"],
      referenceUrls: [
        "https://example.com/linwan.jpg",
      ],
    });
  });

  it("keeps the production batch config frozen after submission", () => {
    expect(
      resolveProductionConfig(
        {
          ...defaultProductionConfig,
          scriptCount: 2,
          expressionType: "identity_contrast",
        },
        {
          ...defaultProductionConfig,
          scriptCount: 5,
          expressionType: "uncanny_spectacle",
        },
      ),
    ).toMatchObject({
      scriptCount: 2,
      expressionType: "identity_contrast",
    });
  });
});
