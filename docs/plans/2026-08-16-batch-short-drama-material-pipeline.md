# Batch Short Drama Material Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前演示型七阶段工作台升级为基于真实剧情理解、可批量派生 AI 前贴与高光成片的持久化生产系统。

**Architecture:** Next.js 负责控制面 API 和工作台，独立 Worker 执行 MediaKit、Ark 和 Seedance 异步任务。MySQL 保存任务、标准化剧情知识和产物谱系，TOS 保存视频与原始分析文件；所有供应商响应先进入 adapter，再转换为内部领域模型。

**Tech Stack:** Next.js 16、React 19、TypeScript、Prisma/MySQL、TOS、AI MediaKit、Doubao Seed、Seedance、Vitest。

---

### Task 1: 固化领域契约和数据模型

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/domain.ts`
- Modify: `src/lib/providers/types.ts`
- Test: `src/lib/domain.test.ts`

**Steps:**
1. 先写失败测试，覆盖故事线、证据片段、过渡锚点、脚本和产物谱系校验。
2. 增加 `AnalysisRun`、`DramaKnowledge`、`StoryBeat`、`StoryArc`、`HighlightVariant`、`TransitionAnchor`、`RenderVariant`、`Composition`、`QualityEvaluation`。
3. 为所有异步实体增加状态、供应商任务 ID、幂等键、重试次数和错误字段。
4. 运行 `npm test -- src/lib/domain.test.ts`，预期通过。
5. 数据库网络恢复后执行 `npx prisma migrate dev --name batch_material_pipeline`，不要用生产数据库直接试验。

### Task 2: 重写 MediaKit Adapter

**Files:**
- Modify: `src/lib/providers/mediakit.ts`
- Modify: `src/lib/providers/types.ts`
- Modify: `src/lib/providers/providers.test.ts`
- Create: `src/lib/providers/fixtures/mediakit-storyline.json`
- Create: `src/lib/providers/fixtures/mediakit-highlights.json`

**Steps:**
1. 写失败测试，验证故事线、剧本还原、高光和任务结果映射。
2. 实现 `/tools/analyze-video-storyline`。
3. 实现 `/tools/drama-script`，支持 `return_pkg`。
4. 将 `createHighlight` 改为 `/tools/generate-highlights-microdrama`。
5. 解析 `video_urls`、`mixvideo_info`、`storyboard_info` 和短效时间。
6. 保留 `/tools/concat-video` 仅用于最终合成。
7. 运行 Provider 测试，预期所有 fixture 映射通过。

### Task 3: 实现剧情理解编排

**Files:**
- Create: `src/lib/pipeline/story-understanding.ts`
- Create: `src/lib/pipeline/normalize-drama-knowledge.ts`
- Create: `src/app/api/projects/[projectId]/analysis/route.ts`
- Modify: `src/app/api/jobs/[jobId]/route.ts`
- Test: `src/lib/pipeline/story-understanding.test.ts`

**Steps:**
1. 写失败测试，覆盖真人短剧双路分析、漫剧仅故事线分析和分批限制。
2. 从项目真实源片读取 URL，禁止客户端传任意分析 URL。
3. 按最多 30 个文件、累计 210 分钟对故事线任务分批。
4. 真人短剧并行创建剧本还原任务；动画跳过。
5. 合并供应商结果为 `DramaKnowledge`，保留所有证据时间码。
6. 保存原始 JSON 到 TOS，保存标准化索引到 MySQL。

### Task 4: 实现爽点故事线提炼

**Files:**
- Create: `src/lib/pipeline/story-arc-miner.ts`
- Modify: `src/lib/providers/ark.ts`
- Create: `src/app/api/projects/[projectId]/story-arcs/route.ts`
- Test: `src/lib/pipeline/story-arc-miner.test.ts`

**Steps:**
1. 写失败测试，要求每条故事线引用有效 `StoryBeat`。
2. 定义 Seed 2.1 Pro 的结构化 JSON Schema。
3. 生成 3-8 条故事线并计算剧情相关度、可视化程度、新颖度和风险。
4. 拒绝没有证据引用的事实型输出。
5. 提供人工选择、编辑和重新生成 API。

### Task 5: 实现多版本高光智剪

**Files:**
- Create: `src/lib/pipeline/highlight-generator.ts`
- Create: `src/app/api/projects/[projectId]/highlights/route.ts`
- Modify: `src/lib/providers/mediakit.ts`
- Test: `src/lib/pipeline/highlight-generator.test.ts`

**Steps:**
1. 写失败测试，验证每条 StoryArc 可创建 Sequential 和 Mixed 版本。
2. 从 StoryArc 自动生成 segment、start、ending 和 opening hook Prompt。
3. 开启 `enable_storyboard` 并保存来源时间码。
4. 任务完成后立即把 `video_urls` 转存 TOS。
5. 支持单版本重试，不重跑剧情理解。

### Task 6: 实现高光开头理解与过渡锚点

**Files:**
- Create: `src/lib/pipeline/transition-analyzer.ts`
- Modify: `src/lib/providers/ark.ts`
- Create: `src/app/api/highlights/[highlightId]/transition-anchor/route.ts`
- Test: `src/lib/pipeline/transition-analyzer.test.ts`

**Steps:**
1. 写失败测试，验证首帧、首句、动作、人物、情绪和禁止冲突字段。
2. 裁取高光前 3-8 秒或抽取关键帧。
3. 使用 Seed 2.0 Lite 生成 `TransitionAnchor`。
4. 校验人物和时间线必须能追溯到 `DramaKnowledge`。

### Task 7: 实现结构化前贴脚本矩阵

**Files:**
- Modify: `src/lib/domain.ts`
- Modify: `src/lib/providers/ark.ts`
- Create: `src/lib/pipeline/preroll-script-generator.ts`
- Create: `src/app/api/highlights/[highlightId]/scripts/route.ts`
- Test: `src/lib/pipeline/preroll-script-generator.test.ts`

**Steps:**
1. 写失败测试，覆盖预设下拉项、自定义要求和趋势灵感可选输入。
2. 输入 StoryArc、TransitionAnchor、证据片段和用户配置。
3. 默认生成 3 个结构化脚本。
4. 校验时长、字数、1-2 秒镜头节奏、前三秒钩子和最终过渡。
5. 标记剧情事实与创作延展，禁止混淆。

### Task 8: 实现 Seedance 预览与精制

**Files:**
- Modify: `src/lib/providers/ark.ts`
- Create: `src/lib/pipeline/preroll-renderer.ts`
- Create: `src/app/api/scripts/[scriptId]/renders/route.ts`
- Test: `src/lib/pipeline/preroll-renderer.test.ts`

**Steps:**
1. 写失败测试，验证 Fast 与 Mini 路由和预算限制。
2. Fast 用于全部候选预览，Mini 仅用于入选脚本。
3. 长前贴拆为镜头任务并维护角色参考和首尾帧。
4. 完成后转存 TOS，并保存模型、参数、成本和版本。

### Task 9: 实现合成、QC 和谱系

**Files:**
- Create: `src/lib/pipeline/composer.ts`
- Create: `src/lib/pipeline/quality-gate.ts`
- Create: `src/app/api/projects/[projectId]/compositions/route.ts`
- Modify: `src/lib/providers/mediakit.ts`
- Test: `src/lib/pipeline/composer.test.ts`

**Steps:**
1. 写失败测试，验证只有 QC 通过的组合可发布。
2. 使用 MediaKit 拼接前贴与高光。
3. 检查时长、编码、黑帧、静帧、音量、字幕遮挡和衔接一致性。
4. 保存完整谱系和自动评分。
5. 允许人工驳回后只重跑前贴或合成。

### Task 10: 增加独立 Worker

**Files:**
- Create: `worker/index.ts`
- Create: `worker/job-runner.ts`
- Create: `src/lib/jobs/repository.ts`
- Modify: `package.json`
- Test: `worker/job-runner.test.ts`

**Steps:**
1. 写失败测试，覆盖幂等、重试、超时、取消和回调重复。
2. Next.js API 只创建 Job，不执行长任务。
3. Worker 领取 Job，调用供应商并持久化状态。
4. 优先接事件回调，轮询作为兜底。
5. 增加 `worker:dev` 和 `worker:start` 脚本。

### Task 11: 重构工作台为分叉谱系

**Files:**
- Modify: `src/components/pipeline-workspace.tsx`
- Create: `src/components/story-arc-selector.tsx`
- Create: `src/components/highlight-variants.tsx`
- Create: `src/components/script-variants.tsx`
- Create: `src/components/render-matrix.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/interactions.test.tsx`

**Steps:**
1. 写交互测试，覆盖故事线选择、高光版本、脚本配置、批量生成和失败重试。
2. 将七阶段导航保留为阶段视图，但阶段内部展示版本树。
3. 每个产物显示来源、状态、成本和下游使用数量。
4. 禁止无边界“全选全部组合”，显示预计任务数与成本。

### Task 12: 趋势灵感子系统

**Files:**
- Create: `src/lib/inspiration/types.ts`
- Create: `src/lib/inspiration/ranker.ts`
- Create: `src/app/api/inspirations/route.ts`
- Create: `src/components/inspiration-picker.tsx`
- Test: `src/lib/inspiration/ranker.test.ts`

**Steps:**
1. 先接人工录入、飞书案例库或授权公开源，不直接抓受限平台页面。
2. 保存来源、时间、热度和过期时间。
3. 计算与当前题材、人物、冲突和受众的匹配度。
4. 只将用户选中或 Top N 灵感加入脚本 Prompt。

### Task 13: 全链路验证

**Files:**
- Create: `scripts/pipeline-smoke.mjs`
- Modify: `.env.example`
- Modify: `README.md`

**Steps:**
1. 用一部真实短剧跑通上传、理解、故事线、高光、脚本、Fast 前贴和合成。
2. 验证所有短效 URL 已转存 TOS。
3. 注入一次供应商失败，确认单阶段重试不重跑上游。
4. 运行 `npm run typecheck`、`npm test`、`npm run build`。
5. 记录首批候选耗时、任务数、成功率和单条成本。
