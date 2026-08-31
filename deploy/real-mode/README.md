# DramaFlow · Real-Mode Deployment Guide（仅 Real 模式）

> 适用于：拿到 GitHub 上 DramaFlow 源代码后，在一台\*\*全新的 Linux ECS（CentOS Stream 9 / RHEL 9 / Ubuntu 22.04 / Debian 12，x86\_64）\*\*上部署为生产可运行的 real 模式，接入火山引擎方舟（ARK）/ Seedream / Seedance / MediaKit / TOS / VOD 全链路。
>
> 本目录产物：
>
> | 文件                             | 作用                                    |
> | ------------------------------ | ------------------------------------- |
> | `deploy-real-mode.sh`          | **主入口：一键部署脚本**，root 用户执行即可            |
> | `frameflow.env.template`       | `/etc/frameflow.env` 的凭据模板，含每键说明+取值位置 |
> | `frameflow.service.example`    | systemd 单元模板（Web+Worker 单服务）          |
> | `nginx-frameflow.conf.example` | Nginx vhost 模板（默认服务、2G 上传体、WS 升级头）    |
> | `check-real-config.mjs`        | 凭据/Endpoints 自检脚本（0 外部依赖，部署脚本自动调用）    |

***

## 0. 前置条件（部署之前请准备好）

| #   | 项                                                                                                                                       | 示例                                              | 备注                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| 0.1 | **一台 ECS**，root 或 sudo 权限，公网 IP 可达，**80 端口已放行**（安全组/NACL）                                                                               | `1.2.3.4`                                       | CPU ≥ 2 核，内存 ≥ 4 GB，系统盘 ≥ 40 GB             |
| 0.2 | **GitHub 仓库**可访问：公开仓库直接用 `https://github.com/<you>/DramaFlow.git`；**私有仓库**请在 GitHub 生成一个「细粒度 Personal Access Token（Contents 只读）」并嵌入 URL | `https://ghp_xxx@github.com/acme/DramaFlow.git` | PAT 不要写进任何文档，只在部署命令中使用一次；用完建议在 GitHub 吊销或轮换 |
| 0.3 | **火山引擎主账号**，已开通以下产品（共 6 个），并新建一个 **IAM 子账号** + 其下的 **AK/SK 对**：ARK、MediaKit、TOS、VOD、Seedream、Seedance                                   | —                                               | 见下一节「1. 火山控制台最小 IAM 权限指引」                   |
| 0.4 | 本地或跳板机能 ssh 到目标 ECS                                                                                                                     | —                                               | 本文档所有命令都在 ECS 上执行                           |

***

## 1. 火山控制台最小 IAM 权限指引（强烈推荐，拒绝 `AdministratorAccess` 通配）

在 [火山引擎 IAM 控制台](https://console.volcengine.com/iam/) 里：

1. **新建子账号** `dramaflow-prod-svc`（仅编程访问，不登录控制台）。
2. 新建自定义策略 `DramaFlowRealModeMinimal`，声明以下权限（示例）：

   * `ark:*`（或最小化：`ark:ChatCompletions`、`ark:ImagesGenerations`、`ark:VideosGenerations`、`ark:GetObject`、`ark:PutObject`）

   * `vod:*`（或最小化：`vod:UploadMedia`、`vod:GetMediaInfo`、`vod:StartWorkflow`、`vod:RetrieveTranscodeResult`）

   * `tos:*`（或最小化：`tos:GetObject`、`tos:PutObject`、`tos:ListBucket` 仅限你的 dramaflow bucket）

   * `mediakit:*`（或最小化：`mediakit:Describe*` + 各任务 `Submit*Job`）
3. 为子账号生成一对 **AccessKeyId / SecretAccessKey**，妥善保存，后面会填到 env 文件里。
4. 在各个产品控制台（下一节）中用**主账号**先开通产品、创建资源（接入点、桶、VOD 空间），再将子账号 AK/SK 用于 DramaFlow 服务端调用即可。

***

## 2. 收集火山控制台凭据清单（部署时一次收集完）

按顺序把下面每一项**复制粘贴**到本地的一个草稿（例如 `credentials-draft.txt`）里，稍后会一次性写入 ECS 的 `/etc/frameflow.env`。**每个 URL 对应取值位置**：

| 编号         | 要收集的键                                                                                                                                                           | 长度/格式                                                                                                                                                                                                                                                 | 火山控制台路径（精确到页面）                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ①          | `PROVIDER_MODE`                                                                                                                                                 | 固定字符串 `real`                                                                                                                                                                                                                                          | 手动填写，不需要控制台                                                                                                                 |
| ②          | `FRAMEFLOW_AUTH_SECRET`                                                                                                                                         | 至少 32 字符；推荐执行 `openssl rand -hex 32`                                                                                                                                                                                                                  | 在 ECS 本机生成，不要提交到 Git；修改该值会让现有登录会话全部失效                                                                                          |
| ③          | `ARK_API_KEY`                                                                                                                                                   | 36 字符                                                                                                                                                                                                                                                 | [ARK → 应用接入 → API Key 管理 → 新建 API Key](https://console.volcengine.com/ark/)                                                 |
| ④          | `ARK_TEXT_MODEL_SEED_2_1_PRO`                                                                                                                                   | `ep-` 开头，23 字符                                                                                                                                                                                                                                        | 同上：**ARK → 模型推理 → 接入点 → 新建接入点**，模型选 `doubao-seed-2.1-pro` → 复制「接入点 ID」                                                      |
| ⑤          | `ARK_TEXT_MODEL_SEED_2_0_LITE`（降级选填）                                                                                                                            | `ep-` 开头 23 字符                                                                                                                                                                                                                                        | 同上，模型选 `doubao-seed-2.0-lite`                                                                                               |
| ⑥          | `ARK_IMAGE_MODEL_SEEDREAM_5_0_PRO` 与/或 `_LITE`（**至少一个**）                                                                                                        | `ep-` 开头 23 字符                                                                                                                                                                                                                                        | 同上，模型选 `seedream-5.0-pro` / `seedream-5.0-lite` → 新建接入点 → 复制接入点 ID                                                          |
| ⑦          | `ARK_VIDEO_MODEL_SEEDANCE_2_5` / `2_0` / `2_0_FAST` / `2_0_MINI`（**至少一个**）                                                                                      | `ep-` 开头 23 字符                                                                                                                                                                                                                                        | 同上，模型选对应 Seedance 规格 → 新建接入点 → 复制接入点 ID                                                                                     |
| ⑧          | `ARK_ASSETS_ACCESS_KEY_ID` + `ARK_ASSETS_SECRET_ACCESS_KEY`                                                                                                     | AK(47) / SK(60)                                                                                                                                                                                                                                       | IAM 子账号的 AK/SK（上面第 1 节生成的那对），可与 TOS/VOD 共用                                                                                  |
| ⑨          | `TOS_BUCKET` / `TOS_ENDPOINT` / `TOS_REGION` / `TOS_ACCESS_KEY_ID` / `TOS_SECRET_ACCESS_KEY`                                                                    | 桶名 + `tos-cn-xxx.volces.com`                                                                                                                                                                                                                          | [TOS 控制台 → 桶列表 → 创建桶](https://console.volcengine.com/tos/)，建议 cn-beijing；桶「概览」页能看到 Endpoint / Region / 桶名                   |
| ⑩          | `MEDIAKIT_API_KEY`                                                                                                                                              | 47 字符                                                                                                                                                                                                                                                 | [媒体处理 MediaKit → API Key 管理 → 新建](https://console.volcengine.com/mediakit/)                                                 |
| ⑪（可选但建议）   | `VOLCENGINE_VOD_ACCESS_KEY_ID` + SK + `VOD_SPACE_NAME` + `VOD_BUCKET_NAME` + `VOD_PLAY_DOMAIN` + `VOD_WATERMARK_WORKFLOW_ID` + `VOD_*_TEMPLATE_ID`（图片/文字/全局三选一） | —                                                                                                                                                                                                                                                     | [视频点播 VOD](https://console.volcengine.com/vod/)：空间概览取 Space/Bucket/Domain；模板管理新建水印模板复制模板 ID；工作流管理新建「水印+转码」工作流复制 Workflow ID |
| ⑫ Base URL | 域名                                                                                                                                                              | 模板里已经写好了以下默认值，一般不用改：`ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3ARK_ASSETS_BASE_URL=https://ark.cn-beijing.volcengineapi.comMEDIAKIT_BASE_URL=https://mediakit.cn-beijing.volces.com/api/v1TOS_REGION=cn-beijing` / `VOD_REGION=cn-north-1` | <br />                                                                                                                      |

***

## 3. 快速开始（在新 ECS 上复制粘贴即可）

**下面所有命令在目标 ECS 上以** **`root`** **执行**（如果是 sudo 用户，每条前加 `sudo -i` 进入 root shell 再执行）。

### 3.1 进入 root 并拉取部署脚本（两种方式任选）

```bash
# 方式 A：若已在本机 git clone 过 DramaFlow 仓库：
cd /opt
GITHUB_PAT=ghp_xxxxx_你的_GitHub_PAT
git clone --depth 1 https://${GITHUB_PAT}@github.com/<你的用户名>/DramaFlow.git frameflow-src 2>/dev/null || true
cd /opt/frameflow-src/deploy/real-mode && chmod +x deploy-real-mode.sh

# 方式 B：还没 clone，只想先拿脚本：
# （公开仓库可直接 curl 原始文件；私有仓库请用方式 A）
```

### 3.2 跑部署脚本（核心：一条命令）

> 脚本会自动：安装 Node 22 / git / nginx → 新建运行用户 `frameflow` → 备份任何已存在的旧部署 → 从 GitHub clone DramaFlow → `npm ci` + Prisma generate + `tsc` + `next build` → 生成/安装凭据模板、systemd 单元、Nginx vhost → 凭据自检 → 重启服务 → `/api/health` 验收。不会覆盖任何已存在的 `/etc/frameflow.env`。

```bash
PUBLIC_IP="<你的ECS公网IP，例如 1.2.3.4>"
GITHUB_URL="https://<你的PAT>@github.com/<你的用户名>/DramaFlow.git"

cd /opt/frameflow-src/deploy/real-mode   # 或脚本所在目录
bash deploy-real-mode.sh \
  --github-url "$GITHUB_URL" \
  --public-ip  "$PUBLIC_IP" \
  --revision   main
```

### 3.3 填凭据（如果是第一次部署）

脚本首次运行时会把 `frameflow.env.template` 复制到 `/etc/frameflow.env`，**但所有凭据值仍是占位空值**。你需要用 `vi` 或 `nano` 按上面「第 2 节」的草稿**逐行粘贴真实值**：

```bash
chmod 0640 /etc/frameflow.env         # 防止其他 OS 用户可读
vi /etc/frameflow.env                 # 粘贴 ①~⑪，保存退出
```

### 3.4 填完凭据：一键自检 + 重启服务

```bash
# 先跑凭据自检：硬要求全 SET 才会 exit 0
cd /opt/frameflow
sudo -u frameflow bash -lc 'set -a; . /etc/frameflow.env; set +a; node /opt/frameflow/deploy/real-mode/check-real-config.mjs'
# 期望最后一行：[SELF_CHECK] PASS — 所有 real-mode 硬要求 + 资源型 AK/SK 均已 SET。

# 一切 OK：重启服务 + 看应用日志滚动 + 健康检查
systemctl restart frameflow.service
sleep 3
journalctl -u frameflow.service -n 50 --no-pager
curl -sS http://127.0.0.1:3000/api/health
# 期望：{"status":"ok","providerMode":"real",...}
```

### 3.5 公网验收

在本机浏览器访问：

```
http://<你的ECS公网IP>/
```

* 能看到 DramaFlow Web 工作台，说明 Nginx → Next.js 链路通；

* 进入「设置」页，点一次上传图片/视频且能生成任务，说明 TOS/ARK/MediaKit 真链路通。

***

## 4. 关键文件位置与说明（运维排查）

| 位置                                                   | 作用                                                                                                                 | 权限建议                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `/etc/frameflow.env`                                 | **唯一真源的凭据文件**，systemd 注入 `process.env`                                                                             | `root:frameflow 0640`，严禁 commit 到 Git，严禁把文件下载到本地保存（服务器端只保留一份，配合定期备份）            |
| `/opt/frameflow/`                                    | DramaFlow 应用根目录（Next.js 代码 + data/ + node\_modules/ + .next/）                                                      | 代码由 `root:root` 拥有；`data/` 与 `.next/` 由 `frameflow:frameflow` 拥有                |
| `/opt/frameflow/data/`                               | 本地 JSON 持久化存储（pipeline/store、创意设置等），**不进入 Git**，服务器独立维护                                                            | `frameflow:frameflow 0755`                                                      |
| `/opt/.frameflow-backups/frameflow-YYYYMMDD-HHMMSS/` | 每次运行 `deploy-real-mode.sh` 前自动备份的「env + systemd unit + nginx conf + full code + data」                              | `root:root`，建议定期清理 30 天前的备份                                                     |
| `/etc/systemd/system/frameflow.service`              | systemd 单元（Web + Worker 二合一，`npm start` 走 `scripts/run-with-worker.mjs`）                                           | `root:root 0644`，修改后必须 `systemctl daemon-reload && systemctl restart frameflow` |
| `/etc/nginx/conf.d/frameflow.conf`                   | Nginx 反代 127.0.0.1:3000，default\_server、client\_max\_body\_size=2G、WebSocket headers                               | `root:root 0644`，修改后必须 `nginx -t && systemctl restart nginx`                    |
| 日志                                                   | 应用/Worker：`journalctl -u frameflow.service -n 200 -f`；Nginx：`/var/log/nginx/access.log`、`/var/log/nginx/error.log` | —                                                                               |

***

## 5. 常见运维操作手册

### 5.1 更新代码（从 GitHub 新 commit 热更部署）

直接重跑部署脚本即可，**不会覆盖已填写的** **`/etc/frameflow.env`，不会删** **`data/`** **与** **`node_modules/`**：

```bash
PUBLIC_IP="1.2.3.4"
GITHUB_URL="https://<PAT>@github.com/<你的用户名>/DramaFlow.git"
bash /opt/frameflow/deploy/real-mode/deploy-real-mode.sh \
  --github-url "$GITHUB_URL" \
  --public-ip  "$PUBLIC_IP" \
  --revision   main
# 如果凭据没改，SELF_CHECK 和 HEALTH 应该仍然 PASS / OK
```

### 5.2 单独重启服务（改了 env 或 systemd 配置）

```bash
# 改了 env
systemctl restart frameflow.service
# 改了 systemd unit 文件
systemctl daemon-reload && systemctl restart frameflow.service
# 改了 nginx
nginx -t && systemctl restart nginx
```

### 5.3 查看某个任务/模型调用失败的根因

```bash
# 1. 最近 200 行应用日志（含 worker 每个 pipeline task 开始/结束/失败的 trace）
journalctl -u frameflow.service -n 200 --no-pager --since "1 hour ago"
# 2. 只看 worker 段：
journalctl -u frameflow.service --since "1 hour ago" | grep -E "\[worker\]|Error|FAIL|Unauthorized|InvalidAuthentication"
# 3. 如果失败在 401/403：重新跑一次 check-real-config.mjs 确认 AK/SK/EndpointId 没被意外清空
sudo -u frameflow bash -lc 'set -a; . /etc/frameflow.env; set +a; node /opt/frameflow/deploy/real-mode/check-real-config.mjs'
```

### 5.4 回滚到上一版代码（出错后紧急恢复）

部署脚本每次会生成 `/opt/.frameflow-backups/frameflow-YYYYMMDD-HHMMSS/full.tgz`。回滚到指定时间点：

```bash
ROLLBACK="/opt/.frameflow-backups/frameflow-20260831-105544"
systemctl stop frameflow.service
# 备份当前现场再动手（避免回滚不对比不出差异）
bash /opt/frameflow/deploy/real-mode/deploy-real-mode.sh \
  --skip-build --skip-nginx --skip-self-check \
  --github-url "file:///dev/null" --public-ip "127.0.0.1" 2>/dev/null || true
# 恢复代码 + data
rm -rf /opt/frameflow/* /opt/frameflow/.next
mkdir -p /opt/frameflow
tar -xzf "$ROLLBACK/full.tgz" -C /opt/frameflow
# 恢复 env/nginx/systemd（谨慎，只在需要时替换）
# cp -a "$ROLLBACK/frameflow.env" /etc/frameflow.env     # 通常 env 不要跟着回滚（新代码兼容老 env）
# cp -a "$ROLLBACK/frameflow.service" /etc/systemd/system/frameflow.service
# cp -a "$ROLLBACK/frameflow.conf" /etc/nginx/conf.d/frameflow.conf
systemctl daemon-reload
systemctl restart frameflow.service
sleep 3 && curl -sS http://127.0.0.1:3000/api/health
```

***

## 6. 安全加固清单（生产必做）

| #   | 动作                               | 为什么要做                 | 怎么做                                                                                                                                        |
| --- | -------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 6.1 | `/etc/frameflow.env` 收紧权限        | 防止同一台 ECS 上其他低权限用户读凭据 | `chown root:root /etc/frameflow.env && chmod 0600 /etc/frameflow.env`，并改用 systemd `LoadCredential=frameflow.env:/etc/frameflow.env` 注入（进阶） |
| 6.2 | AK/SK 定期轮换                       | 避免静态 AK/SK 泄漏后无限期有效   | IAM 控制台每月/每季度为 `dramaflow-prod-svc` 子账号生成新 AK/SK → 改 `/etc/frameflow.env` → `systemctl restart frameflow` → 跑自检                            |
| 6.3 | 使用 VPC 内 Endpoint + 内网访问 TOS/ARK | 公网出口不暴露对象存储与大模型流量     | 在 ECS 与 TOS 之间开通 TOS 内网 Endpoint（`tos-cn-beijing.ivolces.com`），将 env 中的 `TOS_ENDPOINT` 改为内网域名                                              |
| 6.4 | GitHub PAT 一次性使用                 | 防止 PAT 泄漏后被他人克隆私有仓库   | 部署完立刻到 GitHub → Settings → Tokens → 吊销刚才的 PAT；下次部署再生成一个新的                                                                                  |
| 6.5 | Nginx 前面切 HTTPS + CDN（可选）        | 避免 HTTP 明文传输用户上传的素材   | 使用阿里云 CDN / Cloudflare 等，回源到 ECS 80；或用 certbot 给 Nginx 加 Let's Encrypt 证书                                                                  |

***

## 7. 故障速查表（Troubleshooting）

| 现象                                           | 最可能根因                                                                                                                          | 验证 / 修复                                                                                                                      | <br />                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| `缺少真实供应商配置：...` 启动失败                         | `/etc/frameflow.env` 中必填项仍为空                                                                                                   | 跑 `check-real-config.mjs` 看缺哪几个 → 填 → restart                                                                                | <br />                                                                                                                  |
| 401 `InvalidAuthentication` / 403            | AK/SK 错了、Endpoint ID 填了不存在的模型、子账号没绑定对应产品策略                                                                                     | ① 跑自检看各键长度对不对；② 用火山官方 Postman Collection 用同样的 AK/SK 调一次 `/v3/chat/completions` 看 200；③ 重新在控制台复制 Endpoint ID（确保是接入点，不是模型名）    | <br />                                                                                                                  |
| 上传大视频立即 413                                  | Nginx `client_max_body_size` 没生效或默认 server block 拦截                                                                            | 确认 `/etc/nginx/conf.d/frameflow.conf` 是 `listen 80 default_server`；`nginx -s reload`；注释 nginx.conf 中自带的 `server_name _` 80 段 | <br />                                                                                                                  |
| 健康检查 `/api/health` 返回 `providerMode: "mock"` | ① systemd 没读到 env（没配置 EnvironmentFile 或路径写错）；② `/etc/frameflow.env` 没写 PROVIDER\_MODE=real；③ 部署用户改了 service 文件但没 daemon-reload | \`systemctl cat frameflow\.service                                                                                           | grep EnvironmentFile`；`systemctl show frameflow\.service -p Environment,EnvironmentFile`；再 ` daemon-reload && restart\` |
| `npm ci` 或 `next build` 时内存 OOM              | ECS 只有 1\~2 GB 内存（Next 构建需要 2GB+）                                                                                              | 升级到至少 4GB，或给系统挂 4GB swap 再跑构建                                                                                                | <br />                                                                                                                  |
| SELinux 报 AVC 拒绝写入 `/opt/frameflow/data`     | `ProtectSystem=strict` 下不在 ReadWritePaths 白名单里或 selinux context 错                                                              | `semanage fcontext -a -t bin_t '/opt/frameflow/data(/.*)?' && restorecon -R /opt/frameflow/data`；或临时 `setenforce 0` 验证       | <br />                                                                                                                  |

***

**一句话总结给你的用户：** 跑通 real 模式 = 用 deploy 目录里这份 `deploy-real-mode.sh` 做服务器初始化 + 把第 2 节的应用安全项与火山控制台凭据/Endpoints 完整填到 `/etc/frameflow.env`，然后 `systemctl restart frameflow.service`。脚本和 README 会兜底做备份、自检和健康检查。
