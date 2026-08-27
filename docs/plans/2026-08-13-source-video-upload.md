# Source Video Upload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 支持空项目、分集批量上传和整剧单文件上传，并让项目、进度、素材数和任务统计来自真实数据库。

**Architecture:** 浏览器先向 Next.js 请求 TOS 预签名 PUT 地址，再将大文件直传 TOS，成功后调用素材完成 API 写入 Prisma。项目中心和工作台通过项目 API 读取真实 Project、Asset、Job、Output 聚合数据，不再依赖 demo-data。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Prisma/MySQL、Zod、TOS V4 预签名、Vitest/Testing Library。

---

### Task 1: 扩展数据契约

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/domain.ts`
- Test: `src/lib/domain.test.ts`

**Steps:**
1. 为项目允许 `episodeCount = 0`，为素材增加上传状态、上传模式、集数序号、文件大小和更新时间字段。
2. 增加源片登记与上传模式 Zod schema。
3. 添加验证测试，覆盖空项目、分集素材和整剧素材。
4. 运行 `npm test -- src/lib/domain.test.ts`，预期通过。
5. 执行 `npx prisma generate` 和 `npx prisma db push`。

### Task 2: 实现真实项目和素材 API

**Files:**
- Modify: `src/app/api/projects/route.ts`
- Create: `src/app/api/projects/[projectId]/route.ts`
- Create: `src/app/api/projects/[projectId]/assets/route.ts`
- Modify: `src/app/api/uploads/sign/route.ts`
- Modify: `src/lib/tos.ts`

**Steps:**
1. 将项目 GET/POST 切换到 Prisma，并为当前单用户环境 upsert 默认用户。
2. 从 Asset、Job、Output 聚合项目状态、进度、源片数和成片数。
3. 实现项目详情和素材列表接口。
4. 上传签名返回 `objectKey` 和稳定对象 URL；完成 API 校验后创建 Asset。
5. 对项目不存在、重复集数、非法文件类型和上传登记失败返回明确错误。

### Task 3: 实现双模式上传界面

**Files:**
- Create: `src/components/source-upload.tsx`
- Modify: `src/components/project-dashboard.tsx`
- Modify: `src/components/pipeline-workspace.tsx`
- Modify: `src/app/globals.css`

**Steps:**
1. 在创建项目弹窗允许集数为 0，并说明可以稍后上传。
2. 项目工作台的正片素材阶段增加“上传原始剧集”主入口。
3. 上传弹窗提供“分集批量上传”和“整剧单文件”两个模式。
4. 分集模式按文件名中的数字自动排序并允许修改集数；整剧模式只允许一个文件。
5. 每个文件依次执行签名、TOS PUT、素材登记，并显示单文件进度、成功和失败状态。
6. 上传完成后刷新项目详情和素材列表。

### Task 4: 移除误导性演示数据

**Files:**
- Modify: `src/components/project-dashboard.tsx`
- Modify: `src/components/pipeline-workspace.tsx`
- Modify: `src/components/video-preview.tsx`
- Modify: `src/components/sidebar.tsx`
- Delete or stop importing: `src/lib/demo-data.ts`

**Steps:**
1. 看板指标由真实项目聚合值生成，无数据时显示 0 和空状态。
2. 项目列表展示真实状态、源片数量、真实任务进度和输出数。
3. 工作台标题从项目详情读取，不再固定为“迟来的月光”。
4. 没有源片时显示上传引导；真实联调视频只保留为明确标识的演示产物。
5. 侧边栏不再固定链接到演示项目。

### Task 5: 自动化验证

**Files:**
- Modify: `src/components/interactions.test.tsx`
- Add API tests only where pure validation can be isolated.

**Steps:**
1. 添加空项目创建测试。
2. 添加双上传模式切换、分集自动排序和整剧单文件限制测试。
3. Mock 签名、PUT 和素材登记请求，验证上传完成状态。
4. 运行 `npm run typecheck`，预期无错误。
5. 运行 `npm test`，预期全部通过。
6. 运行 `npm run build`，预期生产构建成功。
7. 验证 `/`、真实项目页、项目 API 和素材 API 返回成功。
