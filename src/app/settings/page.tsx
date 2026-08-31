import { Check, Database, HardDrive, ServerCog, ShieldCheck, UserRoundCheck } from "lucide-react";
import { env, hasArkAssetsConfig } from "@/lib/env";
import { getCreativeSettings } from "@/lib/creative-settings-store";
import { CreativeSettingsForm } from "@/components/creative-settings-form";
import { UserManagement } from "@/components/user-management";
import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/user-store";

export const dynamic = "force-dynamic";

const providers = [
  {
    name: "Ark / Seedance",
    description: "剧情理解、脚本、图片与前贴视频生成",
    ready: Boolean(env.ARK_API_KEY && env.ARK_VIDEO_MODEL),
    icon: ServerCog,
  },
  {
    name: "AI MediaKit",
    description: "场景切分、高光拼接与最终成片合成",
    ready: Boolean(env.MEDIAKIT_API_KEY),
    icon: ShieldCheck,
  },
  {
    name: "私域虚拟人像",
    description: "自定义虚拟人像入库与 Seedance 可信引用",
    ready: hasArkAssetsConfig(),
    icon: UserRoundCheck,
  },
  {
    name: "TOS 对象存储",
    description: "源片上传与长期产物存储",
    ready: Boolean(env.TOS_ENDPOINT && env.TOS_BUCKET),
    icon: HardDrive,
  },
  {
    name: "MySQL",
    description: "项目、任务、版本和产物记录",
    ready: Boolean(env.DATABASE_URL),
    icon: Database,
  },
];

export default async function SettingsPage() {
  const user = await requireAdmin();
  const [creativeSettings, users] = await Promise.all([
    getCreativeSettings(),
    listUsers(),
  ]);
  return (
    <div className="page settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">SYSTEM CONFIGURATION</p>
          <h1>系统设置</h1>
          <p className="page-subtitle">检查服务连接状态。密钥仅从服务端环境变量读取。</p>
        </div>
        <span className="status-pill status-已完成">
          {env.PROVIDER_MODE === "real" ? "真实模式" : "模拟模式"}
        </span>
      </header>
      <section className="settings-grid">
        {providers.map((provider) => {
          const Icon = provider.icon;
          return (
            <article key={provider.name} className="settings-card">
              <span className="metric-icon"><Icon size={18} /></span>
              <div>
                <h2>{provider.name}</h2>
                <p>{provider.description}</p>
              </div>
              <span className={`connection-state ${provider.ready ? "ready" : ""}`}>
                {provider.ready && <Check size={13} />}
                {provider.ready ? "已配置" : "待配置"}
              </span>
            </article>
          );
        })}
      </section>
      <CreativeSettingsForm
        initialSettings={creativeSettings}
      />
      <UserManagement
        initialUsers={users}
        currentUserId={user.id}
      />
    </div>
  );
}
