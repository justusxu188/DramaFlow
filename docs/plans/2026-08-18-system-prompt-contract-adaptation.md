# Three-Stage System Prompt Contract Adaptation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让用户手动更新后的三阶段 System Prompt 与数据解析、脚本编辑、提示词持久化、Seedance 提交和 UI 状态保持一致。

**Architecture:** 以当前已保存的三份 System Prompt 为唯一协议来源，补齐代码中的字段映射和结果校验。脚本编辑仍保留紧凑的自然语言界面，用户修改可见内容后清理会冲突的旧结构信息，由第三阶段根据最终可见脚本重新建立生成约束。

**Tech Stack:** Next.js 16、React 19、TypeScript、Zod、Vitest、React Testing Library、JSON/MySQL 持久化。

---

## 执行边界

- Tasks 1-5 不修改 `data/creative-settings.json` 和 `src/lib/preroll-prompts.ts`。
- 不改变用户当前保存的三份 System Prompt。
- 不在提示词结果 UI 中增加全局技术参数面板，仍只展示实际提交给 Seedance 的逐段提示词。
- Task 6 涉及 System Prompt，只有用户单独确认后才执行。
- 当前目录不是 Git 仓库，因此不安排 commit。

### Task 1: 补齐第三阶段输出协议

**Files:**
- Modify: `src/lib/pipeline-store.ts:113-137`
- Modify: `src/lib/providers/ark.ts:148-339`
- Modify: `src/components/batch-pipeline-panel.tsx:131-152`
- Test: `src/lib/providers/providers.test.ts`

**Step 1: 写失败测试**

使用当前第三阶段 Prompt 的完整输出结构构造 `video_prompt_plan`，断言：

```ts
expect(normalizeVideoPromptPlan({
  video_prompt_plan: {
    global_visual_style: "写实短剧",
    character_constraints: "角色外观统一",
    scene_prop_constraints: "场景和道具统一",
    voice_cards: "旁白与角色音色卡",
    music_line: "（紧张电子乐）",
    sound_principle: "音效与动作同步",
    persistent_text: "【剧名】左上角常驻",
    subtitle_style: "底部白字黑边",
    clips: [{
      clip_id: "VP1",
      source_beats: ["S1", "S2"],
      duration_sec: 5,
      reference_assets: [],
      video_prompt:
        "【画面描述】首尾画面\n【全局限制(Negative)】生成缺陷类：无变形；内容合规类：无血腥",
    }],
  },
})).toMatchObject({
  success: true,
  data: {
    voiceCards: "旁白与角色音色卡",
    musicLine: "（紧张电子乐）",
    persistentText: "【剧名】左上角常驻",
    subtitleStyle: "底部白字黑边",
  },
});
```

**Step 2: 运行失败测试**

Run:

```bash
PATH="/opt/homebrew/bin:$PATH" node_modules/.bin/vitest run src/lib/providers/providers.test.ts
```

Expected: FAIL，新增字段为 `undefined`。

**Step 3: 扩展持久化类型**

在 `VideoPromptPlan` 与前端 DTO 中增加：

```ts
voiceCards?: string;
musicLine?: string;
persistentText?: string;
subtitleStyle?: string;
```

保留现有 `soundPrinciple`，不再用一个字段承载全部声音约束。

**Step 4: 扩展解析映射**

在 `normalizeVideoPromptPlan()` 中映射：

```ts
voiceCards: firstText(source, ["voiceCards", "voice_cards"]),
musicLine: firstText(source, ["musicLine", "music_line"]),
persistentText: firstText(source, [
  "persistentText",
  "persistent_text",
]),
subtitleStyle: firstText(source, [
  "subtitleStyle",
  "subtitle_style",
]),
```

旧字段 `text_overlay_principle` 继续兼容读取，但不要求新 Prompt 输出。

**Step 5: 运行测试**

Expected: 新旧两种 VideoPromptPlan 格式均通过。

### Task 2: 保证全局声音和文字约束进入实际提交内容

**Files:**
- Modify: `src/lib/seedance-prompt.ts`
- Modify: `src/lib/pipeline-runner.ts:802-836`
- Modify: `src/components/batch-pipeline-panel.tsx:2286-2336`
- Test: `src/lib/pipeline-runner.test.ts`
- Test: `src/components/interactions.test.tsx`

**Step 1: 写失败测试**

覆盖多片段场景，断言最终提交文本包含：

```text
【声音】固定音色卡、全局音乐、声音同步原则
【画面文字】全程常驻文字
```

并断言 UI 展示文本与提交给 Seedance 的文本完全相同。

**Step 2: 增加统一编译入口**

将 `buildSeedanceSegmentPrompt()` 参数扩展为：

```ts
{
  globalVisualStyle: string;
  characterLock: string;
  sceneLock: string;
  voiceCards?: string;
  musicLine?: string;
  soundPrinciple?: string;
  persistentText?: string;
  subtitleStyle?: string;
  negativePrompt: string;
  segment: VideoPromptSegment;
}
```

**Step 3: 合并规则**

- `segment.prompt` 已包含完整 `【声音】`时，不重复追加相同内容。
- 缺少 `【声音】`时，使用 `voiceCards + musicLine + soundPrinciple`生成该段。
- `persistentText`不是“无”且当前段缺少 `【画面文字】`时补入。
- `subtitleStyle`只作为字幕样式约束，不生成额外字幕内容。
- 不在 UI 外新增“高级信息”区域。
- UI 与 Seedance 请求都调用同一个编译函数，避免展示与提交不一致。

**Step 4: 运行测试**

Expected: 单片段、多片段、无音乐、无常驻文字四类用例通过。

### Task 3: 让脚本编辑后的可见内容成为唯一可信版本

**Files:**
- Modify: `src/components/batch-pipeline-panel.tsx:968-1004`
- Modify: `src/components/batch-pipeline-panel.tsx:2609-2744`
- Modify: `src/app/api/projects/[projectId]/workflow/route.ts:56-112`
- Modify: `src/lib/pipeline-store.ts:990-1031`
- Test: `src/components/interactions.test.tsx`
- Test: `src/app/api/projects/[projectId]/workflow/route.test.ts`

**Step 1: 写失败测试**

模拟用户修改“画面”和“景别与运镜”后保存，断言：

- 新画面和新景别正常保存。
- 与旧画面绑定的 `startState/endState/dynamicChange/characterAction`不再原样残留。
- `sceneCaption`可以直接查看和编辑。
- 保存后旧视频提示词仍被标记过期。

**Step 2: UI 增加一个自然语言字段**

在现有“字幕”列中采用上下排列，不增加新的技术面板：

```text
字幕
场景/时间文字
```

分别对应 `subtitle`和 `sceneCaption`。不显示 `scene_caption`等工程字段名。

**Step 3: 同步景别字段**

用户修改“景别与运镜”时，同时更新：

```ts
framing
shotSize
cameraMove
```

解析失败时只保留 `framing`，将旧的 `shotSize/cameraMove`清空，禁止旧值继续覆盖新内容。

**Step 4: 清理冲突的旧结构**

当用户修改某段的 `visual`时，仅针对该段清空：

```ts
startState
endState
dynamicChange
visualContrast
characterAction
characters
scene
keyProps
```

第三阶段根据最终画面重新补全。未修改的分段保留原结构，不做全脚本破坏性清理。

**Step 5: 保留自然语言编辑体验**

- 不新增“高级信息”折叠区。
- 不重新显示“剪辑节奏”“镜头作用”。
- 不显示口播字数校验字段。
- 所有内容仍可直接阅读，不使用字段内部滚动条。

### Task 4: 接入第二阶段硬指标校验

**Files:**
- Modify: `src/lib/providers/ark.ts:914-955`
- Modify: `src/lib/providers/ark.ts:1247-1300`
- Modify: `src/lib/pipeline-runner.ts:510-574`
- Test: `src/lib/providers/providers.test.ts`
- Test: `src/lib/pipeline-runner.test.ts`

**Step 1: 写规则测试**

分别构造以下失败脚本：

- 时间轴有重叠或空缺。
- 总时长与末段结束时间不一致。
- 节拍少于 5 或多于 12。
- 前 3-5 秒少于 2 个 `hook_ref`。
- AI 节拍缺少 `dynamic_change`。
- 猎奇模式没有或有多个“桥接回正片”节拍。
- 15 秒 spoken text 少于 60 字或超过 105 字。

**Step 2: 实现纯函数校验**

新增：

```ts
validateV2ScriptDraft(script, concept): string[]
```

spoken text 按所有 `voiceover + dialogue`去空白后的实际字符数计算，不信任模型返回的 `vo_wordcount`。

**Step 3: 生成链路接入**

每条脚本规范化后立即校验：

```ts
const issues = validateV2ScriptDraft(script, concept);
if (issues.length) {
  throw new Error(
    `第 ${index + 1} 条脚本未通过检查：${issues.join("；")}`,
  );
}
```

先使用现有任务重试机制，不新增额外模型请求，避免生成时间进一步增加。

**Step 4: 用户反馈**

失败原因沿现有任务错误区域展示自然语言，例如：

```text
第 2 条脚本未通过检查：15 秒口播共 118 字，应为 60-105 字
```

不新增永久显示的“口播字数校验”字段。

### Task 5: 清理废弃的合规角标协议

**Files:**
- Modify: `src/lib/providers/ark.ts:110-143`
- Modify: `src/lib/providers/ark.ts:750-824`
- Modify: `src/lib/providers/types.ts:25-50`
- Modify: `src/components/batch-pipeline-panel.tsx:99-152`
- Test: `src/lib/providers/providers.test.ts`

**Step 1: 写契约测试**

断言第一、二、三阶段请求和持久化脚本均不包含：

```text
compliance_badge
complianceBadge
合规角标
```

**Step 2: 删除新数据链路残留**

- 从 `v2ConceptSchema`删除 `compliance_badge`。
- 从 `normalizeV2ScriptDraft()`删除 `complianceBadge`。
- 从 `ScriptDraft`和前端 DTO 删除该字段。

**Step 3: 保留历史清理**

保留读取历史视频提示词时对 `【合规角标】`段落的移除逻辑，避免旧数据重新提交给 Seedance。

### Task 6: 可选修正第二阶段 System Prompt 示例

**Files:**
- Modify only after explicit approval: `data/creative-settings.json`
- Modify only after explicit approval: `src/lib/preroll-prompts.ts`

**Current conflict:**

```json
"total_duration_sec": 15,
"vo_wordcount": 118
```

同一 Prompt 规定 15 秒口播范围为：

```text
15 × 4 = 60 字
15 × 7 = 105 字
```

**Recommended change:**

```json
"vo_wordcount": 75
```

75 字对应约 5 字/秒，位于推荐区间中部。只修改示例数字，不修改生成方法、字段结构或其他规则。

## 最终验证

依次执行：

```bash
PATH="/opt/homebrew/bin:$PATH" node_modules/.bin/vitest run src/lib/providers/providers.test.ts
PATH="/opt/homebrew/bin:$PATH" node_modules/.bin/vitest run src/lib/pipeline-runner.test.ts
PATH="/opt/homebrew/bin:$PATH" node_modules/.bin/vitest run src/components/interactions.test.tsx
PATH="/opt/homebrew/bin:$PATH" node_modules/.bin/vitest run
PATH="/opt/homebrew/bin:$PATH" node_modules/.bin/tsc --noEmit
PATH="/opt/homebrew/bin:$PATH" node_modules/.bin/next build
```

验收标准：

1. 当前三份 System Prompt 内容在 Tasks 1-5 前后哈希完全一致。
2. 新第三阶段字段完整保存，不因解析丢失。
3. UI 展示文本与 Seedance 实际提交文本一致。
4. 编辑画面后不会继续提交旧的起止状态、角色、场景和道具约束。
5. 不合格脚本不会进入第三阶段，并显示具体自然语言原因。
6. 新生成数据不再包含合规角标。
7. 现有全部测试、TypeScript 检查和生产构建通过。
