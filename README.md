# FrameFlow 短剧投流素材工作台

面向短剧投流团队的 AI 素材生产系统，覆盖剧情理解、前贴脚本与分镜、Seedance 前贴生成、MediaKit 高光剪辑、时间线审片和批量成片。

## 本地运行

需要 Node.js 20+ 和 MySQL 8。

```bash
npm install
cp .env.example .env.local
npx prisma generate
npx prisma db push
npm run dev
```

默认 `PROVIDER_MODE=mock`，无需外部 API 或数据库即可浏览界面和调用示例任务。访问 `http://localhost:3000`。

`npm run dev` 会同时启动 Next.js 和 Pipeline Worker，异步任务会由 Worker 持续领取并轮询上游状态。生产环境使用 `npm start` 时也会同时启动两者。

如部署平台需要拆分 Web 与 Worker 进程，可分别运行：

```bash
npm run dev:web
npm run worker
```

Worker 默认连接 `http://127.0.0.1:3000`；可通过 `APP_BASE_URL` 和 `WORKER_INTERVAL_MS` 覆盖服务地址与轮询间隔。

## 真实供应商模式

在 `.env.local` 中设置：

```bash
PROVIDER_MODE=real
ARK_API_KEY=
ARK_TEXT_MODEL_SEED_2_1_PRO=
ARK_TEXT_MODEL_SEED_2_0_LITE=
ARK_IMAGE_MODEL=
ARK_VIDEO_MODEL=
ARK_ASSETS_ACCESS_KEY_ID=
ARK_ASSETS_SECRET_ACCESS_KEY=
ARK_ASSETS_PROJECT_NAME=default
MEDIAKIT_API_KEY=
TOS_ENDPOINT=
TOS_REGION=cn-beijing
TOS_BUCKET=
TOS_ACCESS_KEY_ID=
TOS_SECRET_ACCESS_KEY=
DATABASE_URL=
```

服务端已封装以下接口：

- Ark Chat Completions：剧情理解与前贴脚本。
- Seedream Images Generations：角色参考图与场景图。
- Seedance Contents Generations Tasks：前贴视频创建与状态查询。
- MediaKit Segment Scenes：正片场景切分。
- MediaKit Concat Video：前贴、高光与结尾拼接。
- TOS V4 Presigned PUT：正片直传对象存储。

所有 Key 只允许配置在服务端环境变量中。不要使用飞书需求文档里已经暴露的密码和 Key；上线前必须全部轮换。

## 验证

```bash
npm test
npm run typecheck
npm run build
```

健康检查：`GET /api/health`

## 真实端到端测试

配置 `.env.local` 后运行：

```bash
npm run test:real
```

脚本会实际调用 Seedance 生成一条 15 秒短剧源片和一条 10 秒前贴，再调用 MediaKit 完成场景切分、高光片段拼接以及“前贴 + 高光”最终合成。真实产物保存在 `public/real-demo/`，项目工作台会自动读取 `result.json` 并播放最终 MP4。

真实调用会产生模型与媒体处理费用。脚本只输出任务 ID、状态和产物大小，不输出任何凭证。

## 关键目录

- `src/app`：页面和服务端 API。
- `src/components`：项目中心、流水线、预览和时间线。
- `src/lib/providers`：Ark、Seedream、Seedance、MediaKit 适配器。
- `src/lib/tos.ts`：TOS 预签名上传。
- `prisma/schema.prisma`：项目、素材、任务和成片数据模型。
- `docs/plans`：产品设计与实施计划。
