import { z } from "zod";

const serverEnvSchema = z.object({
  PROVIDER_MODE: z.enum(["mock", "real"]).default("mock"),
  PERSISTENCE_MODE: z.enum(["local", "mysql"]).default("local"),
  PIPELINE_JOB_STALE_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(3_600_000)
    .default(900_000),
  FRAMEFLOW_AUTH_SECRET: z
    .union([z.string().min(32), z.literal("")])
    .optional(),
  DATABASE_URL: z.string().optional(),
  ARK_API_KEY: z.string().optional(),
  ARK_BASE_URL: z
    .string()
    .url()
    .default("https://ark.cn-beijing.volces.com/api/v3"),
  ARK_TEXT_MODEL_SEED_2_1_PRO: z.string().optional(),
  ARK_TEXT_MODEL_SEED_2_0_LITE: z.string().optional(),
  ARK_IMAGE_MODEL: z.string().optional(),
  ARK_IMAGE_MODEL_SEEDREAM_5_0_LITE: z.string().optional(),
  ARK_IMAGE_MODEL_SEEDREAM_5_0_PRO: z.string().optional(),
  ARK_VIDEO_MODEL: z.string().optional(),
  ARK_VIDEO_MODEL_SEEDANCE_2_5: z.string().optional(),
  ARK_VIDEO_MODEL_SEEDANCE_2_0: z.string().optional(),
  ARK_TEXT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(30000)
    .max(600000)
    .default(300000),
  ARK_VIDEO_MODEL_SEEDANCE_2_0_MINI: z.string().optional(),
  ARK_VIDEO_MODEL_SEEDANCE_2_0_FAST: z.string().optional(),
  ARK_VIDEO_MAX_DURATION: z.coerce.number().int().min(2).default(15),
  ARK_ASSETS_ACCESS_KEY_ID: z.string().optional(),
  ARK_ASSETS_SECRET_ACCESS_KEY: z.string().optional(),
  ARK_ASSETS_PROJECT_NAME: z.string().default("default"),
  ARK_ASSETS_BASE_URL: z
    .string()
    .url()
    .default(
      "https://ark.cn-beijing.volcengineapi.com",
    ),
  MEDIAKIT_API_KEY: z.string().optional(),
  MEDIAKIT_BASE_URL: z
    .string()
    .url()
    .default("https://mediakit.cn-beijing.volces.com/api/v1"),
  MEDIAKIT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(10_000)
    .max(600_000)
    .default(120_000),
  TOS_ENDPOINT: z.string().optional(),
  TOS_REGION: z.string().default("cn-beijing"),
  TOS_BUCKET: z.string().optional(),
  TOS_ACCESS_KEY_ID: z.string().optional(),
  TOS_SECRET_ACCESS_KEY: z.string().optional(),
  VOLCENGINE_VOD_ACCESS_KEY_ID: z.string().optional(),
  VOLCENGINE_VOD_SECRET_ACCESS_KEY: z.string().optional(),
  VOD_REGION: z.string().default("cn-north-1"),
  VOD_SPACE_NAME: z.string().optional(),
  VOD_BUCKET_NAME: z.string().optional(),
  VOD_PLAY_DOMAIN: z.string().optional(),
  VOD_WATERMARK_TEMPLATE_ID: z.string().optional(),
  VOD_IMAGE_WATERMARK_TEMPLATE_ID: z.string().optional(),
  VOD_TEXT_WATERMARK_TEMPLATE_ID: z.string().optional(),
  VOD_TEXT_WATERMARK_VARIABLE_KEY: z.string().optional(),
  VOD_WATERMARK_WORKFLOW_ID: z.string().optional(),
});

export const env = serverEnvSchema.parse(process.env);

export function hasVodWatermarkConfig() {
  return Boolean(
    env.VOLCENGINE_VOD_ACCESS_KEY_ID &&
      env.VOLCENGINE_VOD_SECRET_ACCESS_KEY &&
      env.VOD_SPACE_NAME &&
      env.VOD_BUCKET_NAME &&
      env.VOD_PLAY_DOMAIN &&
      env.VOD_WATERMARK_WORKFLOW_ID &&
      (
        env.VOD_IMAGE_WATERMARK_TEMPLATE_ID ||
        env.VOD_WATERMARK_TEMPLATE_ID ||
        (
          env.VOD_TEXT_WATERMARK_TEMPLATE_ID &&
          env.VOD_TEXT_WATERMARK_VARIABLE_KEY
        )
      ),
  );
}

export function vodWatermarkCapabilities() {
  const common = Boolean(
    env.VOLCENGINE_VOD_ACCESS_KEY_ID &&
      env.VOLCENGINE_VOD_SECRET_ACCESS_KEY &&
      env.VOD_SPACE_NAME &&
      env.VOD_BUCKET_NAME &&
      env.VOD_PLAY_DOMAIN &&
      env.VOD_WATERMARK_WORKFLOW_ID,
  );
  return {
    image: common && Boolean(
      env.VOD_IMAGE_WATERMARK_TEMPLATE_ID ??
        env.VOD_WATERMARK_TEMPLATE_ID,
    ),
    text:
      common &&
      Boolean(
        env.VOD_TEXT_WATERMARK_TEMPLATE_ID &&
          env.VOD_TEXT_WATERMARK_VARIABLE_KEY,
      ),
  };
}

export function hasArkAssetsConfig() {
  return Boolean(
    env.ARK_ASSETS_ACCESS_KEY_ID &&
      env.ARK_ASSETS_SECRET_ACCESS_KEY,
  );
}

export function assertRealProviderConfig() {
  const required = [
    "ARK_API_KEY",
    "ARK_TEXT_MODEL_SEED_2_1_PRO",
    "MEDIAKIT_API_KEY",
  ] as const;
  const missing: string[] = required.filter((key) => !env[key]);
  if (
    !env.ARK_IMAGE_MODEL &&
    !env.ARK_IMAGE_MODEL_SEEDREAM_5_0_LITE &&
    !env.ARK_IMAGE_MODEL_SEEDREAM_5_0_PRO
  ) {
    missing.push("ARK_IMAGE_MODEL_SEEDREAM_5_0_LITE/PRO");
  }
  if (
    !env.ARK_VIDEO_MODEL &&
    !env.ARK_VIDEO_MODEL_SEEDANCE_2_5 &&
    !env.ARK_VIDEO_MODEL_SEEDANCE_2_0 &&
    !env.ARK_VIDEO_MODEL_SEEDANCE_2_0_MINI &&
    !env.ARK_VIDEO_MODEL_SEEDANCE_2_0_FAST
  ) {
    missing.push("ARK_VIDEO_MODEL_SEEDANCE_*");
  }
  if (missing.length > 0) {
    throw new Error(`缺少真实供应商配置：${missing.join(", ")}`);
  }
}
