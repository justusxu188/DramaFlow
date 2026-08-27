import { describe, expect, it } from "vitest";
import {
  insertCharacterAssetMentions,
  resolveCharacterAssetMentionsForSubmission,
  stripVideoRatioInstructions,
  withSubmittedSeedancePrompts,
} from "@/lib/seedance-prompt";

describe("withSubmittedSeedancePrompts", () => {
  it("persists the complete prompt used for Seedance submission", () => {
    const plan = withSubmittedSeedancePrompts({
      sourceScriptId: "script-1",
      sourceRevision: "revision-1",
      globalVisualStyle: "写实电影感",
      characterLock: "女主黑色长发与红色外套保持一致",
      sceneLock: "雨夜街道保持一致",
      voiceCards: "女主使用冷静青年女声",
      musicLine: "低频悬疑音乐",
      soundPrinciple: "对白清晰",
      persistentText: "右下角展示剧名",
      subtitleStyle: "白字黑边",
      negativePrompt: "禁止角色变脸",
      missingInformation: [],
      segments: [{
        index: 0,
        duration: 5,
        referenceAssets: [],
        prompt: "女主在雨中回头",
        sound: "雨声",
      }],
    });

    const submitted = plan.segments[0].submittedPrompt ?? "";
    expect(submitted).toContain("写实电影感");
    expect(submitted).toContain("女主黑色长发与红色外套保持一致");
    expect(submitted).toContain("雨夜街道保持一致");
    expect(submitted).toContain("女主在雨中回头");
    expect(submitted).toContain("冷静青年女声");
    expect(submitted).toContain("低频悬疑音乐");
    expect(submitted).toContain("右下角展示剧名");
    expect(submitted).toContain("白字黑边");
    expect(submitted).toContain("禁止角色变脸");
  });

  it("adds image asset mentions beside referenced characters", () => {
    expect(
      insertCharacterAssetMentions(
        "林夏推开门，顾川回头。",
        ["林夏", "顾川"],
      ),
    ).toBe("@林夏推开门，@顾川回头。");
    expect(
      insertCharacterAssetMentions(
        "空镜展示医院走廊。",
        ["林夏"],
      ),
    ).toBe("@林夏 空镜展示医院走廊。");
    expect(
      insertCharacterAssetMentions(
        "镜头1：林夏推门。镜头2：林夏回头。",
        ["林夏"],
      ),
    ).toBe("镜头1：@林夏推门。镜头2：@林夏回头。");
  });

  it("converts character mentions to ordered image references for Ark", () => {
    expect(
      resolveCharacterAssetMentionsForSubmission(
        "@林夏推开门，@顾川回头，@林夏走近镜头。",
        [{
          characterName: "林夏",
          assetIds: ["image-1"],
        }, {
          characterName: "路人",
          assetIds: [],
          useTextToVideo: true,
        }, {
          characterName: "顾川",
          assetIds: ["image-2"],
        }],
      ),
    ).toBe("图片1推开门，图片2回头，图片1走近镜头。");
  });

  it("reuses the same image number when characters share one asset", () => {
    expect(
      resolveCharacterAssetMentionsForSubmission(
        "@林夏和@顾川并肩站立。",
        [{
          characterName: "林夏",
          assetIds: ["shared-image"],
        }, {
          characterName: "顾川",
          assetIds: ["shared-image"],
        }],
      ),
    ).toBe("图片1和图片1并肩站立。");
  });

  it("removes platform parameters and only keeps lens values in shots", () => {
    const sanitized = stripVideoRatioInstructions(
      "【类型与风格】1080P，适配短视频平台观看比例。" +
        "【摄影机参数】全局使用50mm镜头，稳定器拍摄。" +
        "【镜头参数】35mm定焦镜头，浅景深。" +
        "【镜头1】（0-3秒，中景，50mm，缓慢推进）人物抬头。" +
        "【镜头2】（3-5秒，特写，85毫米）人物回望。",
    );

    expect(sanitized).not.toMatch(
      /1080\s*[pP]|短视频平台|【摄影机参数】[^【]*50\s*mm|【镜头参数】[^【]*35\s*mm/i,
    );
    expect(sanitized).toContain(
      "【镜头1】（0-3秒，中景，50mm，缓慢推进）",
    );
    expect(sanitized).toContain(
      "【镜头2】（3-5秒，特写，85毫米）",
    );
  });
});
