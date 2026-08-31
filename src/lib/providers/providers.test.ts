import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ArkCreativeProvider,
  buildFallbackVideoPromptPlan,
  buildPrerollChatMessages,
  findPrerollScriptIssues,
  normalizeCreativeProposal,
  normalizePrerollScriptDraft,
  normalizeVideoPromptPlan,
  scriptSimilarity,
  validateVideoPromptPlanRules,
  validateVideoPromptTargetSegments,
  validateV2ScriptDraft,
} from "./ark";
import { MockCreativeProvider } from "./mock";
import { MediaKitProvider } from "./mediakit";
import type { ScriptDraft } from "./types";
import {
  defaultPrerollCreativeSystemPrompt,
  defaultPrerollScriptSystemPrompt,
  defaultVideoPromptSystemPrompt,
} from "@/lib/preroll-prompts";

vi.mock("@/lib/env", () => ({
  env: {
    ARK_API_KEY: "test-key",
    ARK_BASE_URL: "https://ark.test",
    ARK_TEXT_MODEL_SEED_2_1_PRO: "seed-2-1-pro",
    ARK_TEXT_MODEL_SEED_2_0_LITE: "seed-2-0-lite",
    ARK_VIDEO_MODEL: "endpoint-default",
    ARK_VIDEO_MODEL_SEEDANCE_2_5:
      "endpoint-seedance-2-5",
    ARK_VIDEO_MODEL_SEEDANCE_2_0: "endpoint-seedance-2-0",
    ARK_VIDEO_MODEL_SEEDANCE_2_0_MINI: "endpoint-mini",
    ARK_VIDEO_MODEL_SEEDANCE_2_0_FAST: "endpoint-fast",
    ARK_IMAGE_MODEL: "seedream-default",
    ARK_IMAGE_MODEL_SEEDREAM_5_0_LITE:
      "seedream-lite",
    ARK_IMAGE_MODEL_SEEDREAM_5_0_PRO:
      "seedream-pro",
    MEDIAKIT_API_KEY: "mediakit-key",
    MEDIAKIT_BASE_URL: "https://mediakit.test",
  },
}));

describe("creative provider contract", () => {
  const provider = new MockCreativeProvider();
  const script = (
    overrides: Partial<ScriptDraft> = {},
  ): ScriptDraft => ({
    id: "script-1",
    title: "轮椅开始倒计时",
    hookType: "identity_gap",
    prerollType: "story_extended",
    duration: 15,
    voiceover: "这把轮椅，正在倒数她被全网审判的时间。",
    transition: "倒计时归零后切入高光首帧。",
    shots: [
      {
        time: "0-3s",
        framing: "特写",
        visual: "轮椅扶手投射出红色倒计时。",
        voiceover: "这把轮椅正在倒数。",
        dialogueSpeaker: "女孩",
        dialogue: "只剩十秒。",
      },
    ],
    ...overrides,
  });
  const prerollInput = (
    scriptSystemPrompt: string,
  ) => ({
    arc: {
      id: "arc-1",
      title: "轮椅证言",
      pitch: "被误解的女孩等待真相反转",
      audience: "general" as const,
      payoffType: "truth_reveal",
      conflict: "舆论误判与事故真相",
      hookType: "identity_gap",
      prerollType: "story_extended",
      evidenceClipIndexes: [1],
      highlightPrompt: "真相揭晓",
      scores: {
        relevance: 90,
        visuality: 88,
        novelty: 80,
        risk: 10,
      },
    },
    relatedArcs: [{
      id: "arc-2",
      title: "身份公开",
      pitch: "女孩公开真实身份完成反击",
      audience: "general" as const,
      payoffType: "identity_reveal",
      conflict: "身份被持续质疑",
      hookType: "identity_gap",
      prerollType: "story_linked",
      evidenceClipIndexes: [1],
      highlightPrompt: "身份公开",
      scores: {
        relevance: 92,
        visuality: 86,
        novelty: 82,
        risk: 8,
      },
    }],
    anchor: {
      openingSummary: "女孩坐在轮椅上面对质疑",
      firstAction: "女孩抬头",
      firstDialogue: "你们都错了",
      characters: ["女孩"],
      emotion: "压抑",
      continuityRequirements: ["轮椅位置连续"],
      recommendedTransition: "倒计时归零切入女孩抬头",
      forbiddenConflicts: ["女孩不能站立"],
    },
    analysis: {
      duration: 120,
      sourceVideoInfo: [{
        index: 0,
        url: "https://example.test/episode.mp4",
        title: "第一集",
        summary: "女孩因事故被全网误解",
        tags: ["误解"],
      }],
      clips: [{
        index: 1,
        sourceVideoIndex: 0,
        title: "监控损坏",
        summary: "三个监控同时损坏",
        dialogue: "监控怎么都坏了",
        score: 90,
        start: 10,
        end: 20,
      }],
      highlights: [],
    },
    count: 1,
    durationMin: 10,
    durationMax: 20,
    creativeSystemPrompt: "固定的创意提案 System Prompt",
    scriptSystemPrompt,
    expressionType: "uncanny_spectacle" as const,
    previousScripts: [],
  });
  const proposal = () => ({
    id: "proposal-1",
    creativeTheme: "轮椅审判倒计时",
    narrativePerspective: "轮椅系统第一视角",
    openingVisual: "扶手投射红色十秒倒计时",
    conflictMechanism: "每次说谎都会扣除倒计时",
    escalation: "现场所有屏幕同步播放事故证据",
    suspenseBreak: "倒计时归零前停住",
    transitionStrategy: "归零闪白切入女孩抬头",
  });
  const v2Concept = () => ({
    concept_id: "C1",
    mode: "剧情锚定模式",
    prepatch_type: "剧情延展",
    hook_paradigm: "违和奇观",
    audience_genre: "女频｜奇幻逆袭",
    creative_theme: "轮椅审判倒计时",
    one_line_hook: "轮椅开始倒数谎言。",
    hook_stack: [
      { sec: "0-1s", hook: "红色倒计时亮起", type: "画面钩子" },
      { sec: "1-3s", hook: "只剩十秒", type: "台词钩子" },
    ],
    spectacle_core: "轮椅扶手投射红色倒计时",
    opening_3s_visual: "女孩身前亮起红色数字",
    narrative_pov: "贴身跟随",
    conflict_or_stake: "谎言将触发证据公开",
    escalation: "现场屏幕同步亮起",
    emotion_curve: "违和→震撼→期待反击",
    meme_adaptation: "无",
    suspense_cutoff: "归零前停住",
    bridge_type: "无需桥接",
    mainfilm_handoff: "闪白切入女孩抬头",
    suggested_duration: "15秒",
    ai_segment_sec: "15秒",
    original_footage_sec: "0秒",
    suggested_beat_count: "8",
    suggested_vo_tone: "2倍速",
    hook_title_card: "谎言只剩十秒",
    why_it_works: "连续倒计时强化悬念",
  });
  const v2Script = () => ({
    script: {
      script_version: "V1",
      concept_id: "C1",
      mode: "剧情锚定模式",
      prepatch_type: "剧情延展",
      audience_genre: "女频｜奇幻逆袭",
      title: "轮椅开始倒计时",
      total_duration_sec: 15,
      ai_segment_sec: 15,
      original_footage_sec: 0,
      creative_theme: "轮椅审判倒计时",
      watch_motivation: "等待证据公开",
      vo_tone: "低声线快节奏",
      vo_speed: "1.2倍速，约5字每秒",
      vo_wordcount: 75,
      hook_title_card: "谎言只剩十秒",
      beats: Array.from({ length: 5 }, (_, beatIndex) => ({
        beat_id: `S${beatIndex + 1}`,
        time_range: `${beatIndex * 3}.0-${(beatIndex + 1) * 3}.0`,
        segment_type: "ai_generated",
        beat_role:
          beatIndex < 2 ? "钩子截停" : "冲突升级",
        hook_ref:
          beatIndex < 2 ? `第${beatIndex + 1}个钩子` : "无",
        visual: `轮椅扶手第${beatIndex + 1}次亮起倒计时`,
        dynamic_change: `数字从${10 - beatIndex}跳到${9 - beatIndex}`,
        visual_contrast: "红光与冷色环境",
        character_action: "女孩低头看向扶手",
        shot_size: "特写",
        camera_move: "缓慢推进",
        voiceover: "这把轮椅正在倒数真相。",
        dialogue_speaker: "女孩",
        dialogue: "只剩十秒。",
        subtitle: "只剩十秒",
        scene_caption: "无",
        sound: "低频心跳",
        start_state: "女孩低头",
        end_state: "女孩抬眼",
        cut_to_next: "动作切",
        characters: ["女孩"],
        scene: "医院门口",
        key_props: ["轮椅"],
      })),
      bridge_beat_id: "无",
      bridge_type: "无需桥接",
      ending_cutoff: "结尾停留在「归零前」，给用户「真相公开」的强烈期待",
      mainfilm_entry: "闪白切入女孩抬头",
      self_check: ["前3秒落满钩子"],
    },
    creative_assumptions: [],
  });
  const validV2Draft = (): ScriptDraft => ({
    ...script(),
    mode: "剧情锚定模式",
    duration: 15,
    voWordcount: 75,
    shots: Array.from({ length: 5 }, (_, index) => ({
      beatId: `S${index + 1}`,
      time: `${index * 3}-${(index + 1) * 3}秒`,
      segmentType: "ai_generated" as const,
      beatRole: index < 2 ? "钩子截停" : "冲突升级",
      hookRef: index < 2 ? `第${index + 1}个钩子` : "无",
      framing: "特写，缓慢推进",
      visual: `倒计时跳到${9 - index}`,
      dynamicChange: `数字从${10 - index}变为${9 - index}`,
      voiceover: "这把轮椅正在倒数真相",
      dialogue: "只剩十秒",
    })),
  });

  it("uses the exact V2 handoff fields across all prompts", () => {
    expect(defaultPrerollCreativeSystemPrompt).toEqual(
      expect.stringContaining('"concept_id": "C1"'),
    );
    expect(defaultPrerollCreativeSystemPrompt).toEqual(
      expect.stringContaining('"hook_stack"'),
    );
    expect(defaultPrerollCreativeSystemPrompt).toEqual(
      expect.stringContaining('"bridge_type"'),
    );
    expect(defaultPrerollScriptSystemPrompt).toEqual(
      expect.stringContaining('"beats"'),
    );
    expect(defaultPrerollScriptSystemPrompt).toEqual(
      expect.stringContaining('"dynamic_change"'),
    );
    expect(defaultPrerollScriptSystemPrompt).toEqual(
      expect.stringContaining('"segment_type"'),
    );
    expect(defaultPrerollScriptSystemPrompt).toEqual(
      expect.stringContaining('"dialogue_speaker"'),
    );
    expect(defaultPrerollCreativeSystemPrompt).toContain(
      "1-1.8 倍速",
    );
    expect(defaultPrerollScriptSystemPrompt).toContain(
      "时长×4 到 时长×9",
    );
    expect(defaultVideoPromptSystemPrompt).toContain(
      "1-1.8 倍速、约 4-9 字/秒",
    );
    expect(
      [
        defaultPrerollCreativeSystemPrompt,
        defaultPrerollScriptSystemPrompt,
        defaultVideoPromptSystemPrompt,
      ].join("\n"),
    ).not.toContain("4-8 字/秒");
    expect(defaultVideoPromptSystemPrompt).toContain(
      "不单列首帧或尾帧锚点字段",
    );
    expect(defaultVideoPromptSystemPrompt).toEqual(
      expect.stringContaining('"source_beats"'),
    );
    expect(defaultVideoPromptSystemPrompt).toEqual(
      expect.stringContaining('"original_footage_note"'),
    );
    expect(defaultVideoPromptSystemPrompt).toContain(
      "音乐使用圆括号 ()",
    );
    expect(defaultVideoPromptSystemPrompt).toContain(
      "音效使用尖括号 <>",
    );
    expect(defaultVideoPromptSystemPrompt).toContain(
      "台词使用花括号 {}",
    );
    expect(defaultVideoPromptSystemPrompt).toContain(
      "字幕使用中文方头括号 【】",
    );
    expect(defaultVideoPromptSystemPrompt).toContain(
      "不得把旁白或对白字幕集中写进【画面文字】",
    );
    expect(defaultVideoPromptSystemPrompt).toContain(
      "1-1.8 倍速、约 4-9 字/秒",
    );
    expect(defaultVideoPromptSystemPrompt).not.toContain(
      "【合规角标】",
    );
  });

  it("passes selected video model and resolution to Ark", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "task-1",
        status: "queued",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new ArkCreativeProvider().createPreroll({
      prompt: "竖屏短剧",
      duration: 10,
      ratio: "9:16",
      model: "seedance_2_0_fast",
      resolution: "1080p",
    });

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(body).toMatchObject({
      model: "endpoint-fast",
      resolution: "1080p",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses medium reasoning for both story arc requests", async () => {
    const arc = prerollInput("固定 System Prompt").arc;
    const response = () =>
      new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({ arcs: [arc] }),
            },
          }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetchMock);

    await new ArkCreativeProvider().mineStoryArcs({
      analysis: {
        duration: 10,
        sourceVideoInfo: [],
        clips: [{
          index: 1,
          sourceVideoIndex: 0,
          title: "英语启蒙方法",
          summary: "讲解英语启蒙的正确方法。",
          dialogue: "先听说，再认字。",
          score: 4,
          start: 0,
          end: 10,
        }],
        highlights: [],
      },
      genre: "教育广告",
      count: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = fetchMock.mock.calls.map((call) =>
      JSON.parse(String(call[1]?.body)),
    );
    expect(
      requests.map((request) => request.reasoning_effort),
    ).toEqual(["medium", "medium"]);
  });

  it("keeps the configured prompt as the only system message", () => {
    const systemPrompt = "截图中保存的完整 System Prompt";
    const payload = {
      task: "generate_preroll_scripts",
      constraints: {
        expressionType: "uncanny_spectacle",
        durationRange: { min: 15, max: 30 },
      },
    };

    const messages = buildPrerollChatMessages(systemPrompt, payload);

    expect(messages[0]).toEqual({
      role: "system",
      content: systemPrompt,
    });
    expect(JSON.parse(messages[1].content)).toEqual(payload);
    expect(messages[0].content).not.toContain("spectacle");
  });

  it("accepts complete and sufficiently novel scripts without retry", () => {
    expect(
      findPrerollScriptIssues({
        scripts: [script()],
        expectedCount: 1,
        durationMin: 10,
        durationMax: 20,
        comparisonTexts: [
          "三个监控同时损坏，摩托男剪视频制造碰瓷谣言",
        ],
      }),
    ).toEqual([]);
  });

  it("accepts model drafts without system-owned identity fields", () => {
    const {
      id: _id,
      hookType: _hookType,
      prerollType: _prerollType,
      ...modelDraft
    } = script();

    expect(
      findPrerollScriptIssues({
        scripts: [{
          ...modelDraft,
          hookType: "猎奇奇观",
        }],
        expectedCount: 1,
        durationMin: 10,
        durationMax: 20,
        comparisonTexts: [],
      }),
    ).toEqual([]);
  });

  it("normalizes the configured Chinese System Prompt output format", () => {
    expect(
      normalizePrerollScriptDraft(
        {
          前贴标题: "轮椅开始倒计时",
          建议时长: "15秒",
          视频脚本: [{
            时间段: "0-3秒",
            "画面/镜头": "轮椅扶手投射红色倒计时",
            口播: "只剩十秒",
            字幕: "真相即将归零",
          }],
          结尾卡点: "倒计时归零切入女孩抬头",
        },
        {
          index: 0,
          durationMax: 20,
          fallbackTransition: "闪白切入高光",
        },
      ),
    ).toMatchObject({
      title: "轮椅开始倒计时",
      duration: 15,
      voiceover: "只剩十秒",
      transition: "倒计时归零切入女孩抬头",
      shots: [{
        time: "0-3秒",
        visual: "轮椅扶手投射红色倒计时",
        dialogue: "只剩十秒",
      }],
    });
  });

  it("normalizes Chinese creative proposal fields", () => {
    expect(normalizeCreativeProposal({
      创意母题: "轮椅审判倒计时",
      叙事视角: "轮椅系统第一视角",
      首帧画面: "扶手投射红色倒计时",
      冲突机制: "每次说谎都会扣除时间",
      冲突升级: "现场屏幕同步证据",
      悬念断点: "归零前一秒停住",
      衔接方式: "闪白切入女孩抬头",
    }, 0)).toMatchObject({
      success: true,
      data: {
        creativeTheme: "轮椅审判倒计时",
        narrativePerspective: "轮椅系统第一视角",
        openingVisual: "扶手投射红色倒计时",
      },
    });
  });

  it("normalizes structured Chinese Seedance prompt plans", () => {
    expect(normalizeVideoPromptPlan({
      video_prompt_plan: {
        global_visual_style: "竖屏写实短剧",
        character_constraints: "林夏保持短发和浅色外套",
        scene_prop_constraints: "医院门口阴天自然光",
        voice_cards: "林夏使用清晰冷静的青年女声",
        music_line: "（紧张电子乐）",
        sound_principle: "音效与动作同步",
        persistent_text: "左上角常驻【短剧名称】",
        subtitle_style: "底部白字黑边字幕",
        clips: [{
          clip_id: "VP1",
          source_beats: ["S1", "S2"],
          duration_sec: 8,
          reference_assets: [
            "https://example.test/role.jpg",
          ],
          video_prompt:
            "【画面描述】近景稳定推进，林夏从低头到抬头。" +
            "【全局限制(Negative)】禁止五官漂移和肢体畸形",
        }],
        original_footage_note: "无",
        mainfilm_handoff_prompt: "闪白切入正片",
      },
    })).toMatchObject({
      success: true,
      data: {
        globalVisualStyle: "竖屏写实短剧",
        voiceCards: "林夏使用清晰冷静的青年女声",
        musicLine: "（紧张电子乐）",
        persistentText: "左上角常驻【短剧名称】",
        subtitleStyle: "底部白字黑边字幕",
        segments: [{
          duration: 8,
          prompt:
            "【画面描述】近景稳定推进，林夏从低头到抬头。" +
            "【全局限制(Negative)】禁止五官漂移和肢体畸形",
        }],
      },
    });
  });

  it("fills noncritical video prompt fields from the script context", () => {
    const result = normalizeVideoPromptPlan({
      video_prompt_plan: {
        clips: [{
          clip_id: "VP1",
          source_beats: ["S1"],
          duration_sec: 6,
          video_prompt:
            "【画面描述】人物抬头。" +
            "【全局限制(Negative)】禁止人物变形",
        }],
      },
    }, {
      scriptId: "script-1",
      revision: "revision-1",
      globalVisualStyle: "竖屏写实短剧",
      characterLock: "女主外观和服装保持一致",
      sceneLock: "医院门口空间保持一致",
    });
    expect(result).toMatchObject({
      success: true,
      data: {
        globalVisualStyle: "竖屏写实短剧",
        characterLock: "女主外观和服装保持一致",
        sceneLock: "医院门口空间保持一致",
        negativePrompt: "禁止人物变形",
        segments: [{ duration: 6 }],
      },
    });
  });

  it("rejects prompt bodies that violate the configured format", () => {
    const plan = buildFallbackVideoPromptPlan({
      script: {
        ...script(),
        projectId: "project-1",
        arcId: "arc-1",
        highlightId: "highlight-1",
        reviewStatus: "confirmed",
        videoPrompt: "",
        createdAt: "",
        updatedAt: "",
      },
      sourceRevision: "revision-1",
      characterMode: "text_to_video",
      videoModel: "seedance_2_5",
      resolution: "480p",
      ratio: "16:9",
      referenceUrls: [],
      maxClipDurationSec: 30,
      generateSubtitles: false,
    });
    expect(validateVideoPromptPlanRules(plan)).toEqual([]);
    expect(plan.globalVisualStyle).not.toMatch(
      /16\s*[:：]\s*9|横屏|画幅/,
    );
    expect(plan.segments[0].prompt).not.toMatch(
      /16\s*[:：]\s*9|横屏|画幅/,
    );
    expect(plan.segments[0].prompt).toContain(
      "【镜头1】（0-",
    );
    expect(plan.segments[0].prompt).toContain("35mm");

    expect(validateVideoPromptPlanRules({
      ...plan,
      segments: [{
        ...plan.segments[0],
        prompt:
          "写实短剧，16:9画幅，480p分辨率，使用1.2倍速旁白。" +
          "人物连续完成所有动作。",
      }],
    })).toEqual(expect.arrayContaining([
      "第 1 个片段缺少【画面描述】",
      "第 1 个片段缺少【镜头1】",
      "第 1 个片段缺少【全局限制(Negative)】",
      "第 1 个片段正文包含生成平台参数",
      "第 1 个片段正文包含语速数值",
    ]));

    expect(validateVideoPromptPlanRules({
      ...plan,
      cameraPrinciple: "全局统一使用50mm定焦镜头",
      segments: [{
        ...plan.segments[0],
        prompt: plan.segments[0].prompt.replace(
          "【摄影机参数】稳定器拍摄",
          "【摄影机参数】85mm镜头，稳定器拍摄",
        ).replace(
          "【类型与风格】",
          "【类型与风格】1080P，适配短视频平台观看比例，",
        ),
      }],
    })).toEqual(expect.arrayContaining([
      "camera_principle 包含只能写在具体镜头内的焦段参数",
      "第 1 个片段正文包含生成平台参数",
      "第 1 个片段的焦段参数只能写在具体【镜头N】内",
    ]));
  });

  it("builds distinct fallback prompts for each required segment", () => {
    const splitScript = {
      ...script({
        duration: 16,
        aiSegmentSec: 16,
        shots: [
          {
            beatId: "S1",
            time: "0-4秒",
            framing: "近景",
            visual: "第一段镜头一：女孩抬头",
            voiceover: "第一句",
            dialogue: "",
          },
          {
            beatId: "S2",
            time: "4-8秒",
            framing: "中景",
            visual: "第一段镜头二：女孩推门",
            voiceover: "第二句",
            dialogue: "",
          },
          {
            beatId: "S3",
            time: "8-12秒",
            framing: "特写",
            visual: "第二段镜头一：合同落桌",
            voiceover: "第三句",
            dialogue: "",
          },
          {
            beatId: "S4",
            time: "12-16秒",
            framing: "全景",
            visual: "第二段镜头二：众人回头",
            voiceover: "第四句",
            dialogue: "",
          },
        ],
      }),
      projectId: "project-1",
      arcId: "arc-1",
      highlightId: "highlight-1",
      reviewStatus: "confirmed" as const,
      videoPrompt: "",
      createdAt: "",
      updatedAt: "",
    };
    const plan = buildFallbackVideoPromptPlan({
      script: splitScript,
      sourceRevision: "revision-1",
      characterMode: "text_to_video",
      videoModel: "seedance_2_0",
      resolution: "720p",
      ratio: "9:16",
      referenceUrls: [],
      maxClipDurationSec: 10,
      generateSubtitles: false,
    });

    expect(plan.segments.map((segment) => segment.duration))
      .toEqual([8, 8]);
    expect(plan.segments.map((segment) => segment.sourceBeats))
      .toEqual([["S1", "S2"], ["S3", "S4"]]);
    expect(plan.segments[0].prompt).toContain("第一段镜头一");
    expect(plan.segments[0].prompt).not.toContain("第二段镜头一");
    expect(plan.segments[1].prompt).toContain("第二段镜头一");
    expect(plan.segments[1].prompt).not.toContain("第一段镜头一");
    expect(plan.segments[1].prompt).toContain(
      "【镜头1】（0-4秒",
    );

    const duplicatedPlan = {
      ...plan,
      segments: plan.segments.map((segment) => ({
        ...segment,
        prompt: plan.segments[0].prompt,
      })),
    };
    expect(
      validateVideoPromptTargetSegments(
        duplicatedPlan,
        [8, 8],
        [["S1", "S2"], ["S3", "S4"]],
      ),
    ).toContain("不同片段不得返回完全相同的提示词正文");

    expect(
      validateVideoPromptTargetSegments(
        {
          ...plan,
          segments: [{
            ...plan.segments[0],
            duration: 16,
            sourceBeats: ["S1", "S2", "S3", "S4"],
          }],
        },
        [8, 8],
        [["S1", "S2"], ["S3", "S4"]],
      ),
    ).toEqual(expect.arrayContaining([
      "片段数量应为 2，实际为 1",
      "第 1 个片段时长应为 8 秒，实际为 16 秒",
      "第 1 个片段必须且只能包含镜头 S1、S2",
    ]));
  });

  it("validates V2 timing, hooks, dynamics and spoken length", () => {
    expect(validateV2ScriptDraft(validV2Draft())).toEqual([]);

    const invalid = validV2Draft();
    invalid.shots = invalid.shots.slice(0, 4).map(
      (shot, index) => ({
        ...shot,
        time:
          index === 1
            ? "4-7秒"
            : shot.time,
        hookRef: "无",
        dynamicChange: "",
        voiceover: "短句",
        dialogue: "",
      }),
    );
    expect(validateV2ScriptDraft(invalid)).toEqual(
      expect.arrayContaining([
        "节拍数量应为 5-12 个，实际为 4 个",
        "第 2 个节拍应从 3 秒开始，实际为 4 秒",
        "前 5 秒至少需要 2 个有效钩子，实际为 0 个",
        "第 1 个 AI 节拍缺少动态变化",
        "15 秒口播共 8 字，应为 60-135 字",
      ]),
    );

    const maximumRate = validV2Draft();
    maximumRate.shots = maximumRate.shots.map((shot) => ({
      ...shot,
      voiceover: "字".repeat(27),
      dialogue: "",
    }));
    expect(validateV2ScriptDraft(maximumRate)).toEqual([]);
  });

  it("requires exactly one bridge beat in bizarre-acquisition mode", () => {
    const invalid = {
      ...validV2Draft(),
      mode: "猎奇吸睛模式",
      bridgeBeatId: "S4",
      shots: validV2Draft().shots.map((shot) => ({
        ...shot,
        beatRole: "冲突升级",
      })),
    };
    expect(validateV2ScriptDraft(invalid)).toContain(
      "猎奇吸睛模式必须且只能有 1 个桥接回正片节拍，实际为 0 个",
    );
  });

  it("analyzes a highlight into prompt-ready visual style fields", async () => {
    const visualStyle = {
      visualMedium: "真人写实短剧",
      characterStyle: "年轻男性，利落短发，面部硬朗",
      wardrobeStyle: "深色防水夹克",
      propStyle: "金属罗盘与旧渔船设备",
      sceneStyle: "阴天深海渔船甲板",
      lightingStyle: "冷色散射光与侧逆光",
      colorStyle: "低饱和蓝灰色",
      cameraStyle: "中近景手持跟拍",
      textureStyle: "潮湿粗粝的海雾质感",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              openingSummary: "男子在渔船甲板握住罗盘",
              firstAction: "男子抬起罗盘",
              firstDialogue: "",
              characters: ["年轻男子"],
              emotion: "紧张",
              continuityRequirements: ["保持罗盘位置一致"],
              recommendedTransition: "动作匹配切入",
              forbiddenConflicts: ["服装颜色变化"],
              visualStyle,
            }),
          },
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new ArkCreativeProvider()
      .analyzeTransition({
        videoUrl: "https://example.com/highlight.mp4",
        seconds: 10,
        storylineContext: "深海危机",
      });

    expect(result.visualStyle).toEqual(visualStyle);
    const request = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    );
    expect(request.messages[0].content).toContain(
      "characterStyle",
    );
    expect(request.messages[0].content).toContain(
      "人物、道具和场景与高光视频属于同一视觉世界",
    );
  });

  it("uses the dedicated System Prompt to compile Seedance segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              全局视觉风格: "写实短剧",
              主体锁定: "角色外观与服装保持一致",
              场景锁定: "医院门口空间与光线保持一致",
              "全局限制(Negative)": "禁止人物变形和背景闪变",
              分镜视频提示词列表: [
                {
                  镜头号: 0,
                  source_beats: ["S1"],
                  时长秒数: 15,
                  参考素材: [],
                  生视频提示词:
                    "【画面描述】首帧人物低头，末帧人物抬头。" +
                    "【镜头1】（0-15秒，近景，50mm，缓慢推进）人物从低头到抬头。" +
                    "【画面文字】无。" +
                    "【全局限制(Negative)】1.生成缺陷类：人物变形和背景闪变。" +
                    "2.内容合规类：血腥画面、字幕、花字、标题、角标、Logo、水印、UI、任何可见文字。",
                  声音: "低频心跳",
                },
              ],
              缺失信息: [],
            }),
          },
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new ArkCreativeProvider()
      .compileVideoPrompt({
        script: {
          ...script(),
          projectId: "project-1",
          arcId: "arc-1",
          highlightId: "highlight-1",
          reviewStatus: "confirmed",
          videoPrompt: "",
          createdAt: "",
          updatedAt: "",
        },
        sourceRevision: "sha256:test-revision",
        systemPrompt: "独立的生视频提示词 System Prompt",
        characterMode: "text_to_video",
        videoModel: "default",
        resolution: "720p",
        ratio: "9:16",
        referenceUrls: [],
        maxClipDurationSec: 15,
        generateSubtitles: false,
        highlightStyle: {
          visualMedium: "真人写实短剧",
          characterStyle: "年轻男性，利落短发，面部硬朗",
          wardrobeStyle: "深色防水夹克，现代海上作业服装",
          propStyle: "金属罗盘与旧渔船设备",
          sceneStyle: "阴天深海渔船甲板",
          lightingStyle: "阴天冷色散射光，人物侧逆光",
          colorStyle: "低饱和蓝灰色，金色罗盘作为局部强调",
          cameraStyle: "中近景手持跟拍，轻微晃动",
          textureStyle: "潮湿、粗粝、真实海雾质感",
        },
      });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].duration).toBe(15);
    expect(result.maxClipDurationSec).toBe(15);
    expect(result.generateSubtitles).toBe(false);
    expect(result.systemPromptHash).toMatch(/^[a-f0-9]{64}$/);
    const request = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    );
    expect(request.model).toBe("seed-2-1-pro");
    expect(request.messages[0].role).toBe("system");
    expect(request.messages[0].content).toContain(
      "独立的生视频提示词 System Prompt",
    );
    expect(request.messages[0].content).toContain(
      "平台结构化输出契约",
    );
    expect(request.messages[0].content).toContain(
      "生成参数隔离",
    );
    expect(request.messages[0].content).toContain(
      "不得在 global_visual_style、camera_principle、video_prompt",
    );
    expect(request.messages[0].content).toContain(
      "短视频平台比例",
    );
    expect(request.messages[0].content).toContain(
      "焦段参数只能写在对应的【镜头N】内部",
    );
    expect(request.messages[0].content).toContain(
      "高光视频视觉风格强约束",
    );
    expect(request.messages[0].content).toContain(
      "本次为无字幕模式",
    );
    expect(
      JSON.parse(request.messages[1].content),
    ).toMatchObject({
      最终确认版脚本: {
        script_version: "V1",
        beats: [
          expect.objectContaining({
            beat_id: "S1",
            segment_type: "ai_generated",
            voiceover: "这把轮椅正在倒数。",
            dialogue_speaker: "女孩",
          }),
        ],
        vo_speed: "1-1.8倍速，约4-9字每秒",
      },
      参考素材与生成参数: {
        分辨率: "720p",
        画幅: "9:16",
        生成字幕: false,
        高光视频视觉风格: expect.objectContaining({
          characterStyle: "年轻男性，利落短发，面部硬朗",
          sceneStyle: "阴天深海渔船甲板",
        }),
      },
    });
  });

  it("repairs only the incomplete video prompt response", async () => {
    const response = (content: unknown) =>
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify(content),
          },
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        video_prompt_plan: {
          clips: [{
            clip_id: "VP1",
            duration_sec: 6,
          }],
        },
      }))
      .mockResolvedValueOnce(response({
        video_prompt_plan: {
          clips: [{
            clip_id: "VP1",
            duration_sec: 6,
            video_prompt:
              "【画面描述】人物抬头。" +
              "【全局限制(Negative)】禁止人物变形",
          }],
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new ArkCreativeProvider()
      .compileVideoPrompt({
        script: {
          ...script(),
          projectId: "project-1",
          arcId: "arc-1",
          highlightId: "highlight-1",
          reviewStatus: "confirmed",
          videoPrompt: "",
          createdAt: "",
          updatedAt: "",
        },
        sourceRevision: "sha256:test-revision",
        systemPrompt: "独立的生视频提示词 System Prompt",
        characterMode: "text_to_video",
        videoModel: "default",
        resolution: "720p",
        ratio: "9:16",
        referenceUrls: [],
        maxClipDurationSec: 15,
        generateSubtitles: false,
      });

    expect(result.segments).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repairRequest = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    );
    expect(repairRequest.messages.at(-1).content).toContain(
      "segments.0.prompt",
    );
    expect(repairRequest.messages.at(-1).content).toContain(
      "只修正当前 JSON",
    );
  });

  it("builds a no-subtitle fallback when prompt compilation returns no segments", async () => {
    const response = new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            video_prompt_plan: {
              clips: [],
            },
          }),
        },
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(response.clone());
    vi.stubGlobal("fetch", fetchMock);

    const result = await new ArkCreativeProvider()
      .compileVideoPrompt({
        script: {
          ...script(),
          projectId: "project-1",
          arcId: "arc-1",
          highlightId: "highlight-1",
          reviewStatus: "confirmed",
          videoPrompt: "",
          createdAt: "",
          updatedAt: "",
        },
        sourceRevision: "sha256:test-revision",
        characterMode: "drama_character",
        videoModel: "seedance_2_5",
        resolution: "720p",
        ratio: "9:16",
        referenceUrls: ["asset://avatar-1"],
        maxClipDurationSec: 30,
        generateSubtitles: false,
      });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].referenceAssets).toEqual([
      "asset://avatar-1",
    ]);
    expect(result.segments[0].prompt).toContain(
      "无字幕、无花字",
    );
    expect(result.segments[0].prompt).not.toContain(
      "字幕【",
    );
    const request = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    );
    expect(request.reasoning_effort).toBe("medium");
    expect(request.messages[0].content).toContain(
      "无字幕模式（优先级最高）",
    );
    expect(result.generateSubtitles).toBe(false);
    expect(result.systemPromptHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects invalid V2 scripts before compiling video prompts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const invalidScript = validV2Draft();
    invalidScript.shots = invalidScript.shots.slice(0, 2);

    await expect(
      new ArkCreativeProvider().compileVideoPrompt({
        script: {
          ...invalidScript,
          scriptVersion: "V1",
          conceptId: "C1",
          projectId: "project-1",
          arcId: "arc-1",
          highlightId: "highlight-1",
          reviewStatus: "confirmed",
          videoPrompt: "",
          createdAt: "",
          updatedAt: "",
        },
        sourceRevision: "sha256:test-revision",
        characterMode: "text_to_video",
        videoModel: "default",
        resolution: "720p",
        ratio: "9:16",
        referenceUrls: [],
        maxClipDurationSec: 15,
        generateSubtitles: false,
      }),
    ).rejects.toThrow("脚本未通过生视频检查");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests correction only for structural or similarity failures", () => {
    const issues = findPrerollScriptIssues({
      scripts: [
        script({
          title: "",
          voiceover: "三个监控同时损坏，摩托男剪视频制造碰瓷谣言",
          shots: [],
        }),
      ],
      expectedCount: 2,
      durationMin: 10,
      durationMax: 20,
      comparisonTexts: [
        "三个监控全坏，摩托男剪视频制造碰瓷谣言",
      ],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("脚本数量"),
        expect.stringContaining("字段不完整"),
        expect.stringContaining("相似度过高"),
      ]),
    );
  });

  it("combines configured proposal and script prompts in one request", async () => {
    const systemPrompt = "固定的用户 System Prompt";
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              concept: v2Concept(),
              ...v2Script(),
            }),
          },
        }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await new ArkCreativeProvider().generatePrerollScripts(
      prerollInput(systemPrompt),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    );
    expect(request.messages[0].role).toBe("system");
    expect(request.messages[0].content).toContain(
      "固定的创意提案 System Prompt",
    );
    expect(request.messages[0].content).toContain(systemPrompt);
    expect(request.messages[0].content).toContain(
      "一次请求内先完成创意策划",
    );
    expect(request).toMatchObject({
      response_format: { type: "json_object" },
      stream: false,
      max_tokens: 12000,
      reasoning_effort: "medium",
    });
    expect(
      JSON.parse(request.messages[1].content),
    ).toMatchObject({
      本条指定表达类型: "违和奇观",
      本条指定前贴类型: "剧情延展",
      项目爽点故事线: expect.arrayContaining([
        expect.objectContaining({
          title: "身份公开",
        }),
      ]),
      口播字数硬性要求: expect.stringContaining(
        "15秒：60-135字",
      ),
    });
    const scriptPayload = JSON.parse(request.messages[1].content);
    expect(scriptPayload.口播字数硬性要求).toContain(
      "12秒：48-108字",
    );
    expect(scriptPayload.口播字数硬性要求).toContain(
      "18秒：72-162字",
    );
  });

  it("rewrites a script outside the configured duration range", async () => {
    const response = (duration: number) => {
      const payload = v2Script();
      payload.script.total_duration_sec = duration;
      payload.script.ai_segment_sec = duration;
      payload.script.beats = payload.script.beats.map(
        (beat, index) => ({
          ...beat,
          time_range:
            index < 4
              ? `${index * 3}.0-${(index + 1) * 3}.0`
              : `12.0-${duration}.0`,
        }),
      );
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              concept: v2Concept(),
              ...payload,
            }),
          },
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(14))
      .mockResolvedValueOnce(response(16));
    vi.stubGlobal("fetch", fetchMock);

    const scripts =
      await new ArkCreativeProvider().generatePrerollScripts({
        ...prerollInput("固定的用户 System Prompt"),
        durationMin: 16,
        durationMax: 20,
      });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(scripts[0].duration).toBe(16);
    const initialRequest = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    );
    expect(initialRequest.messages[0].content).toContain(
      "total_duration_sec 必须在 16-20 秒内",
    );
    const repairRequest = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    );
    expect(repairRequest.messages.at(-1).content).toContain(
      "脚本总时长 14 秒不在要求的 16-20 秒范围内",
    );
  });

  it("generates one combined V2 result for each requested variant", async () => {
    const systemPrompt = "固定的用户 System Prompt";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: JSON.stringify({
                  concept: v2Concept(),
                  ...v2Script(),
                }),
              },
            }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await new ArkCreativeProvider().generatePrerollScripts(
      prerollInput(systemPrompt),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requests = fetchMock.mock.calls.map((call) =>
      JSON.parse(String(call[1]?.body))
    );
    expect(requests[0].messages[0].content).toContain(
      "固定的创意提案 System Prompt",
    );
    expect(requests[0].messages[0].content).toContain(systemPrompt);
  });

  it("repairs malformed JSON without restarting the whole script job", async () => {
    const response = (content: string) =>
      new Response(JSON.stringify({
        choices: [{ message: { content } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const progress = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          '{"concept":{"creative_theme": 作恶摩托男想剪断证据},"script":{}}',
        ),
      )
      .mockResolvedValueOnce(
        response(JSON.stringify({
          concept: v2Concept(),
          ...v2Script(),
        })),
      );
    vi.stubGlobal("fetch", fetchMock);

    const scripts =
      await new ArkCreativeProvider().generatePrerollScripts({
        ...prerollInput("固定的用户 System Prompt"),
        onProgress: progress,
      });

    expect(scripts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repairRequest = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    );
    expect(
      repairRequest.messages.at(-1).content,
    ).toContain("修正后的合法 JSON");
    expect(progress.mock.calls).toEqual([
      [90, "已完成 1/1 条脚本"],
    ]);
  });

  it("rewrites only the invalid script before task-level retry", async () => {
    const response = (content: unknown) =>
      new Response(JSON.stringify({
        choices: [{
          message: {
            content:
              typeof content === "string"
                ? content
                : JSON.stringify(content),
          },
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const invalidScript = v2Script();
    invalidScript.script.beats =
      invalidScript.script.beats.slice(0, 2);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          concept: v2Concept(),
          ...invalidScript,
        }),
      )
      .mockResolvedValueOnce(response({
        concept: v2Concept(),
        ...v2Script(),
      }));
    vi.stubGlobal("fetch", fetchMock);

    const scripts =
      await new ArkCreativeProvider().generatePrerollScripts(
        prerollInput("固定的用户 System Prompt"),
      );

    expect(scripts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const correctionRequest = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    );
    expect(
      correctionRequest.messages.at(-1).content,
    ).toContain("节拍数量应为 5-12 个");
  });

  it("distributes selected expression and preroll types across variants", async () => {
    const combinedResponse = () =>
      new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                concept: v2Concept(),
                ...v2Script(),
              }),
            },
          }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(combinedResponse())
      .mockResolvedValueOnce(combinedResponse())
      .mockResolvedValueOnce(combinedResponse());
    vi.stubGlobal("fetch", fetchMock);

    const scripts =
      await new ArkCreativeProvider().generatePrerollScripts({
        ...prerollInput("固定的用户 System Prompt"),
        count: 3,
        expressionTypes: [
          "identity_contrast",
          "uncanny_spectacle",
          "evidence_reveal",
        ],
        prerollTypes: [
          "story_extended",
          "strong_acquisition",
        ],
      });

    const conceptPayloads = fetchMock.mock.calls
      .slice(0, 3)
      .map((call) =>
        JSON.parse(
          JSON.parse(String(call[1]?.body)).messages[1].content,
        ));
    expect(conceptPayloads[0]).toMatchObject({
      本条指定表达类型: "极致身份反差",
      本条指定前贴类型: "剧情延展",
    });
    expect(conceptPayloads[1]).toMatchObject({
      本条指定表达类型: "违和奇观",
      本条指定前贴类型: "强引流性质",
    });
    expect(conceptPayloads[2]).toMatchObject({
      本条指定表达类型: "证据实锤前置",
      本条指定前贴类型: "剧情延展",
    });
    expect(
      new Set(
        conceptPayloads.map((payload) =>
          `${payload.本条指定表达类型}:${payload.本条指定前贴类型}`),
      ).size,
    ).toBe(3);
    expect(
      conceptPayloads.every(
        (payload) =>
          typeof payload.本条指定表达类型 === "string" &&
          typeof payload.本条指定前贴类型 === "string",
      ),
    ).toBe(true);
    expect(scripts.map((script) => script.prerollType)).toEqual([
      "story_extended",
      "strong_acquisition",
      "story_extended",
    ]);
    expect(scripts.map((script) => script.hookParadigm)).toEqual([
      "极致身份反差",
      "违和奇观",
      "证据实锤前置",
    ]);
  });

  it("submits all requested script variants concurrently", async () => {
    const pendingResponses: Array<
      (response: Response) => void
    > = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          pendingResponses.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const generation =
      new ArkCreativeProvider().generatePrerollScripts({
        ...prerollInput("固定的用户 System Prompt"),
        count: 4,
      });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
    pendingResponses.forEach((resolve) =>
      resolve(new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                concept: v2Concept(),
                ...v2Script(),
              }),
            },
          }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      )),
    );

    await expect(generation).resolves.toHaveLength(4);
  });

  it("returns each completed script before the whole batch finishes", async () => {
    const pendingResponses: Array<
      (response: Response) => void
    > = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          pendingResponses.push(resolve);
        }),
    );
    const onScriptComplete = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    let batchFinished = false;
    const generation =
      new ArkCreativeProvider().generatePrerollScripts({
        ...prerollInput("固定的用户 System Prompt"),
        count: 3,
        onScriptComplete,
      }).finally(() => {
        batchFinished = true;
      });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    pendingResponses[1](new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              concept: v2Concept(),
              ...v2Script(),
            }),
          },
        }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ));

    await vi.waitFor(() => {
      expect(onScriptComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: "C2",
        }),
        1,
      );
    });
    expect(batchFinished).toBe(false);

    for (const index of [0, 2]) {
      pendingResponses[index](new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                concept: v2Concept(),
                ...v2Script(),
              }),
            },
          }],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ));
    }

    await expect(generation).resolves.toHaveLength(3);
  });

  it("keeps completed script callbacks when another variant fails", async () => {
    const valid = new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              concept: v2Concept(),
              ...v2Script(),
            }),
          },
        }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
    const malformed = () => new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: "{\"concept\":",
          },
        }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(valid)
      .mockResolvedValueOnce(malformed())
      .mockResolvedValueOnce(malformed());
    const onScriptComplete = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new ArkCreativeProvider().generatePrerollScripts({
        ...prerollInput("固定的用户 System Prompt"),
        count: 2,
        onScriptComplete,
      }),
    ).rejects.toThrow("成功 1/2");
    expect(onScriptComplete).toHaveBeenCalledTimes(1);
  });

  it("selects one stable type and relation for a single script", async () => {
    const response = (content: unknown) =>
      new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify(content),
            },
          }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        concept: v2Concept(),
        ...v2Script(),
      }));
    vi.stubGlobal("fetch", fetchMock);

    const scripts =
      await new ArkCreativeProvider().generatePrerollScripts({
        ...prerollInput("固定的用户 System Prompt"),
        count: 1,
        selectionSeed: "single-script-choice",
        expressionTypes: [
          "identity_contrast",
          "uncanny_spectacle",
          "evidence_reveal",
        ],
        prerollTypes: [
          "story_extended",
          "strong_acquisition",
        ],
      });

    const conceptPayload = JSON.parse(
      JSON.parse(
        String(fetchMock.mock.calls[0][1]?.body),
      ).messages[1].content,
    );
    expect(conceptPayload).toMatchObject({
      本条指定表达类型: "极致身份反差",
      本条指定前贴类型: "强引流性质",
    });
    expect(scripts[0]).toMatchObject({
      hookParadigm: "极致身份反差",
      prepatchType: "强引流性质",
      prerollType: "strong_acquisition",
    });
  });

  it("detects scripts that only rephrase the same narrative", () => {
    expect(
      scriptSimilarity(
        "三个监控全坏，摩托男剪视频制造碰瓷谣言",
        "三个监控同时损坏，摩托男剪视频造碰瓷谣言",
      ),
    ).toBeGreaterThan(0.4);
    expect(
      scriptSimilarity(
        "三个监控全坏，摩托男剪视频制造碰瓷谣言",
        "轮椅忽然投射出事故发生前的全息倒计时",
      ),
    ).toBeLessThan(0.2);
  });

  it("returns structured story analysis", async () => {
    const result = await provider.analyzeStory({ videoUrl: "https://example.test/a.mp4" });
    expect(result.characters.length).toBeGreaterThan(1);
    expect(result.highlights[0].score).toBeGreaterThan(80);
  });

  it("generates multiple script variants", async () => {
    const analysis = await provider.analyzeStory({ videoUrl: "https://example.test/a.mp4" });
    const scripts = await provider.generateScripts({
      analysis,
      hookType: "identity_gap",
      prerollType: "story_linked",
      count: 2,
    });
    expect(scripts).toHaveLength(2);
    expect(scripts[0].shots.length).toBeGreaterThan(2);
  });

  it("generates reference images with requested dimensions", async () => {
    const result = await provider.generateImage({
      prompt: "古风药师角色定妆照",
      size: "1600x2848",
    });
    expect(result.size).toBe("1600x2848");
    expect(result.urls).toHaveLength(1);
  });

  it("routes image generation to the selected Seedream model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{
            url: "https://example.com/look.jpg",
            size: "1600x2848",
          }],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new ArkCreativeProvider().generateImage({
      prompt: "保持角色一致，生成正面妆照",
      size: "1600x2848",
      referenceUrls: [
        "https://example.com/baseline.jpg",
      ],
      model: "seedream_5_0_pro",
    });

    expect(
      JSON.parse(
        String(fetchMock.mock.calls[0][1]?.body),
      ),
    ).toMatchObject({
      model: "seedream-pro",
      image: [
        "https://example.com/baseline.jpg",
      ],
    });
    expect(
      JSON.parse(
        String(fetchMock.mock.calls[0][1]?.body),
      ),
    ).not.toHaveProperty(
      "sequential_image_generation",
    );
  });

  it("routes video generation to Seedance 2.5", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "video-task-1",
          status: "queued",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new ArkCreativeProvider().createPreroll({
      prompt: "竖屏短剧前贴",
      duration: 10,
      ratio: "9:16",
      model: "seedance_2_5",
      resolution: "720p",
    });

    expect(
      JSON.parse(
        String(fetchMock.mock.calls[0][1]?.body),
      ),
    ).toMatchObject({
      model: "endpoint-seedance-2-5",
      duration: 10,
      ratio: "9:16",
    });
  });

  it("requests MediaKit frames at the selected timestamps", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          task_id: "frame-task-1",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const task =
      await new MediaKitProvider().extractFrames({
        videoUrl:
          "https://example.com/episode.mp4",
        timestamps: [12.48],
        clientToken: "capture-token",
      });

    expect(task.id).toBe("frame-task-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mediakit.test/tools/extract-frames",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(
        String(fetchMock.mock.calls[0][1]?.body),
      ),
    ).toMatchObject({
      video_url:
        "https://example.com/episode.mp4",
      snapshot_type: "SpecifiedTime",
      specified_time: [12.48],
      enable_sprite: false,
    });
  });

  it("omits visual packaging and mixed prompts for sequential highlights", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          task_id: "highlight-task-1",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new MediaKitProvider().createHighlight({
      videoUrls: [
        "https://example.com/episode.mp4",
      ],
      mode: "montage",
      settings: {
        minDuration: 180,
        maxDuration: 300,
        maxNumber: 2,
        cutMode: "Sequential",
        segmentPrompt: "高光筛选",
        startPrompt: "高能开头",
        endingPrompt: "悬念结尾",
        enableOpeningHook: true,
        openingHookMinDuration: 5,
        openingHookMaxDuration: 10,
        openingHookMinScore: 3.5,
        openingHookPrompt: "强冲突",
        template: "none",
        hint: "点击下方看完整版",
      },
    });

    const body = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    );
    expect(body.edit_param).toBeUndefined();
    expect(body.highlight_cuts_param).toEqual({
      enable_storyboard: true,
      min_duration: 180,
      max_duration: 300,
      max_number: 2,
      cut_mode: "Sequential",
    });
    expect(body.opening_hook_param).toEqual({
      enable_opening_hook: false,
    });
  });

  it.each(["无", ""])(
    "omits a visual hint whose value is %j",
    async (hint) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          task_id: "highlight-task-1",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new MediaKitProvider().createHighlight({
      videoUrls: [
        "https://example.com/episode.mp4",
      ],
      mode: "montage",
      title: "测试短剧",
      settings: {
        minDuration: 60,
        maxDuration: 90,
        maxNumber: 1,
        cutMode: "Mixed",
        segmentPrompt: "高光筛选",
        startPrompt: "高能开头",
        endingPrompt: "悬念结尾",
        enableOpeningHook: false,
        openingHookMinDuration: 5,
        openingHookMaxDuration: 10,
        openingHookMinScore: 3.5,
        openingHookPrompt: "强冲突",
        template: "热门短剧1",
        hint,
      },
    });

    const body = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    );
    expect(body.edit_param.template_edit).toEqual({
      template: "热门短剧1",
      title: "测试短剧",
    });
    },
  );

  it("maps post-production tools to MediaKit requests", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () => new Response(
        JSON.stringify({
          success: true,
          task_id: "post-task-1",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const mediaKit = new MediaKitProvider();
    const videoUrl =
      "https://example.com/episode.mp4";

    await mediaKit.enhanceVideo({
      videoUrl,
      resolution: "1080p",
      fps: 30,
    });
    await mediaKit.eraseVideoSubtitles({
      videoUrl,
    });
    await mediaKit.trimVideo({
      videoUrl,
      startTime: 3.5,
      endTime: 18,
    });
    await mediaKit.adjustVideoSpeed({
      videoUrl,
      speed: 1.25,
    });
    await mediaKit.createAsrSubtitles({
      videoUrl,
      language: "cmn-Hans-CN",
      enableSpeakerInfo: true,
    });
    await mediaKit.addSubtitlesToVideo({
      videoUrl,
      subtitles: [{
        subtitleText: "真相终于揭晓",
        startTime: 1.234,
        endTime: 3.876,
      }],
      clientToken: "pipeline-job-subtitle-1",
    });

    expect(
      fetchMock.mock.calls.map((call) => call[0]),
    ).toEqual([
      "https://mediakit.test/tools/enhance-video-generative",
      "https://mediakit.test/tools/erase-video-subtitle-pro",
      "https://mediakit.test/tools/trim-video",
      "https://mediakit.test/tools/adjust-video-speed",
      "https://mediakit.test/tools/asr-subtitles",
      "https://mediakit.test/tools/add-subtitle-to-video",
    ]);
    expect(
      fetchMock.mock.calls.map((call) =>
        JSON.parse(String(call[1]?.body)),
      ),
    ).toEqual([
      {
        video_url: videoUrl,
        resolution: "1080p",
        fps: 30,
      },
      {
        video_url: videoUrl,
        mode: "Subtitle",
        model_version: "v5",
      },
      {
        video_url: videoUrl,
        start_time: 3.5,
        end_time: 18,
      },
      {
        video_url: videoUrl,
        speed: 1.25,
      },
      {
        video_url: videoUrl,
        language: "cmn-Hans-CN",
        enable_speaker_info: true,
      },
      {
        video_url: videoUrl,
        subtitles: [{
          subtitle_text: "真相终于揭晓",
          start_time: 1.234,
          end_time: 3.876,
        }],
        subtitle_font_type: "sy_black",
        subtitle_font_size: 50,
        subtitle_font_color: "#FFFFFFFF",
        subtitle_pos_preset: "bottom_center",
        client_token: "pipeline-job-subtitle-1",
      },
    ]);
  });

  it("keeps MediaKit completion evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            task_id: "amk-tool-add-subtitle-to-video-1",
            request_id: "request-1",
            status: "completed",
            result: {
              video_url: "https://example.com/subtitled.mp4",
              resolution: "720p",
              duration: 14.066667,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      new MediaKitProvider().getMediaTask(
        "amk-tool-add-subtitle-to-video-1",
      ),
    ).resolves.toMatchObject({
      status: "completed",
      videoUrl: "https://example.com/subtitled.mp4",
      requestId: "request-1",
      resolution: "720p",
      duration: 14.066667,
    });
  });

  it("supports asynchronous video tasks", async () => {
    const created = await provider.createPreroll({
      prompt: "test",
      duration: 15,
      ratio: "9:16",
      model: "default",
      resolution: "720p",
    });
    const completed = await provider.getPrerollTask(created.id);
    expect(created.status).toBe("queued");
    expect(completed.status).toBe("completed");
  });
});
