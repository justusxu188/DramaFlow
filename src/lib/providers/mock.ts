import type { ProductionConfig } from "@/lib/production-config";
import type { CreativeProvider, ScriptDraft, StoryAnalysis } from "./types";

const analysis: StoryAnalysis = {
  synopsis:
    "被逐出家门的药师林晚意外继承古方，在身份暴露前救下敌对家族继承人。",
  characters: [
    { name: "林晚", role: "女主", desire: "证明自己并守住古方" },
    { name: "顾沉", role: "男主", desire: "查清家族中毒真相" },
    { name: "林雪", role: "反派", desire: "夺取古方与继承权" },
  ],
  conflict: "林晚必须在救人和隐藏身份之间做出选择。",
  emotionCurve: [
    { at: 0, level: 30, label: "受辱" },
    { at: 18, level: 72, label: "反击" },
    { at: 41, level: 96, label: "身份揭晓" },
    { at: 58, level: 82, label: "危机升级" },
  ],
  highlights: [
    { title: "银针救人", start: 32.4, end: 44.8, score: 96 },
    { title: "身份反转", start: 91.1, end: 108.3, score: 93 },
    { title: "当众退婚", start: 143.2, end: 157.6, score: 89 },
  ],
};

function script(index: number): ScriptDraft {
  return {
    id: `script-v${index}`,
    title: index === 1 ? "被赶出家门后，她救了最不该救的人" : "所有人都说她不会医术",
    hookType: index === 1 ? "identity_gap" : "abnormal_line",
    prerollType: "story_linked",
    duration: index === 1 ? 18 : 15,
    voiceover:
      index === 1
        ? "她被家族当众除名，却在下一秒，用一根银针救活了顾家继承人。"
        : "全城名医都判他活不过今晚，只有这个被逐出家门的女人说：三分钟，我能救。",
    transition: "镜头推近银针落下，白闪衔接正片救治现场。",
    shots: [
      {
        time: "0-3s",
        framing: "中近景 / 快推",
        visual: "族谱被撕碎，纸片掠过林晚脸侧。",
        dialogue: "从今天起，你不再是林家人。",
      },
      {
        time: "3-8s",
        framing: "特写 / 快切",
        visual: "担架冲入大厅，监护仪骤然拉平。",
        dialogue: "谁能救他，顾家给谁一半产业。",
      },
      {
        time: "8-14s",
        framing: "中景 / 环绕",
        visual: "林晚逆着人群走向担架，银针在指间展开。",
        dialogue: "不用一半。把门关上。",
      },
      {
        time: "14-18s",
        framing: "极近特写",
        visual: "银针落穴，画面白闪进入正片。",
        dialogue: "十分钟后，所有人都后悔了。",
      },
    ],
  };
}

export class MockCreativeProvider implements CreativeProvider {
  async analyzeStoryline(_input: {
    videoUrls: string[];
    clientToken: string;
    enableSnapshot?: boolean;
  }) {
    return {
      id: "amk-tool-analyze-video-storyline-mock",
      status: "queued" as const,
      progress: 2,
    };
  }

  async restoreDramaScript(_input: {
    videoUrls: string[];
    clientToken: string;
  }) {
    return {
      id: "amk-tool-drama-script-mock",
      status: "queued" as const,
      progress: 2,
    };
  }

  async analyzeStory(_input: { videoUrl: string }) {
    return analysis;
  }

  async generateScripts(input: {
    analysis: StoryAnalysis;
    hookType: ScriptDraft["hookType"];
    prerollType: ScriptDraft["prerollType"];
    count: number;
  }) {
    return Array.from({ length: input.count }, (_, index) => script(index + 1));
  }

  async generateImage(input: {
    prompt: string;
    size: string;
    referenceUrls?: string[];
    model?: "seedream_5_0_lite" | "seedream_5_0_pro";
  }) {
    return {
      urls: [
        "https://example.invalid/mock-character-reference.jpg",
      ],
      size: input.size,
    };
  }

  async extractFrames(input: {
    videoUrl: string;
    timestamps: number[];
    clientToken: string;
  }) {
    return {
      id: `mock-extract-frames-${input.timestamps[0] ?? 0}`,
      status: "queued" as const,
      progress: 5,
    };
  }

  async createPreroll(_input: {
    prompt: string;
    duration: number;
    ratio: string;
    referenceUrls?: string[];
    model: ProductionConfig["videoModel"];
    resolution: ProductionConfig["videoResolution"];
  }) {
    return { id: "mock-seedance-001", status: "queued" as const, progress: 8 };
  }

  async getPrerollTask(id: string) {
    return {
      id,
      status: "completed" as const,
      progress: 100,
      videoUrl: "/demo/preroll.mp4",
    };
  }

  async segmentScenes(_input: { videoUrl: string }) {
    return { id: "mock-segment-001", status: "running" as const, progress: 64 };
  }

  async createHighlight(_input: {
    videoUrls: string[];
    mode: Parameters<CreativeProvider["createHighlight"]>[0]["mode"];
  }) {
    return { id: "mock-highlight-001", status: "queued" as const, progress: 12 };
  }

  async getMediaTask(id: string) {
    if (id.startsWith("mock-extract-frames-")) {
      return {
        id,
        status: "completed" as const,
        progress: 100,
        result: {
          snapshots: [{
            image_url:
              "https://example.invalid/mock-character-reference.jpg",
          }],
          snapshot_count: 1,
        },
      };
    }
    return {
      id,
      status: "completed" as const,
      progress: 100,
      videoUrl: "/demo/highlight.mp4",
    };
  }

  async trimVideo(_input: {
    videoUrl: string;
    startTime: number;
    endTime: number;
  }) {
    return {
      id: "mock-transition-trim-001",
      status: "queued" as const,
      progress: 8,
    };
  }

  async concatVideos(_input: {
    videoUrls: string[];
    transitions?: string[];
    clientToken: string;
  }) {
    return {
      id: "mock-compose-001",
      status: "completed" as const,
      progress: 100,
      videoUrl: "/demo/final.mp4",
    };
  }
}
