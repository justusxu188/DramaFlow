import {
  createHash,
  createHmac,
} from "node:crypto";
import { env, hasVodWatermarkConfig } from "@/lib/env";

type WatermarkMode = "image" | "text";

type VodResponse = {
  ResponseMetadata?: {
    Error?: {
      Code?: string;
      Message?: string;
    };
  };
  Result?: Record<string, unknown>;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(
  key: string | Buffer,
  value: string,
) {
  return createHmac("sha256", key).update(value).digest();
}

function encodeQuery(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

export function createVodSignedRequest(input: {
  action: string;
  version: string;
  body: Record<string, unknown>;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  now?: Date;
}) {
  const host = "vod.volcengineapi.com";
  const service = "vod";
  const now = input.now ?? new Date();
  const xDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");
  const shortDate = xDate.slice(0, 8);
  const body = JSON.stringify(input.body);
  const payloadHash = sha256(body);
  const query = [
    ["Action", input.action],
    ["Version", input.version],
  ]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${encodeQuery(key)}=${encodeQuery(value)}`,
    )
    .join("&");
  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${xDate}\n`;
  const signedHeaders =
    "content-type;host;x-content-sha256;x-date";
  const canonicalRequest = [
    "POST",
    "/",
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope =
    `${shortDate}/${input.region}/${service}/request`;
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(input.secretAccessKey, shortDate);
  const regionKey = hmac(dateKey, input.region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, "request");
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  return {
    url: `https://${host}/?${query}`,
    body,
    headers: {
      "Content-Type": "application/json",
      Host: host,
      "X-Content-Sha256": payloadHash,
      "X-Date": xDate,
      Authorization:
        `HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function configuredTemplate(mode: WatermarkMode) {
  return mode === "image"
    ? env.VOD_IMAGE_WATERMARK_TEMPLATE_ID ??
        env.VOD_WATERMARK_TEMPLATE_ID
    : env.VOD_TEXT_WATERMARK_TEMPLATE_ID;
}

function outputUrl(storeUri: string) {
  const base = env.VOD_PLAY_DOMAIN?.startsWith("http")
    ? env.VOD_PLAY_DOMAIN
    : `https://${env.VOD_PLAY_DOMAIN}`;
  return new URL(
    storeUri.replace(/^\/+/, ""),
    `${base.replace(/\/+$/, "")}/`,
  ).toString();
}

export class VodWatermarkProvider {
  private async request(
    action: string,
    version: string,
    body: Record<string, unknown>,
  ) {
    if (!hasVodWatermarkConfig()) {
      throw new Error(
        "VOD 水印未配置，请补充访问凭证、空间、存储桶、播放域名和工作流模板",
      );
    }
    const signed = createVodSignedRequest({
      action,
      version,
      body,
      accessKeyId: env.VOLCENGINE_VOD_ACCESS_KEY_ID!,
      secretAccessKey:
        env.VOLCENGINE_VOD_SECRET_ACCESS_KEY!,
      region: env.VOD_REGION,
    });
    const response = await fetch(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });
    const payload = (await response.json()) as VodResponse;
    const providerError =
      payload.ResponseMetadata?.Error;
    if (!response.ok || providerError) {
      throw new Error(
        providerError?.Message ??
          providerError?.Code ??
          "VOD 水印请求失败",
      );
    }
    return payload.Result ?? {};
  }

  async start(input: {
    objectKey: string;
    mode: WatermarkMode;
    text?: string;
    clientToken: string;
  }) {
    const templateId = configuredTemplate(input.mode);
    if (!templateId) {
      throw new Error(
        input.mode === "image"
          ? "未配置图片水印模板"
          : "未配置文字水印模板",
      );
    }
    if (
      input.mode === "text" &&
      (!input.text?.trim() ||
        !env.VOD_TEXT_WATERMARK_VARIABLE_KEY)
    ) {
      throw new Error(
        "文字水印需要内容和动态变量 Key",
      );
    }
    const logo = {
      TemplateId: templateId,
      ...(input.mode === "text"
        ? {
            Vars: {
              [env.VOD_TEXT_WATERMARK_VARIABLE_KEY!]:
                input.text!.trim(),
            },
          }
        : {}),
    };
    const result = await this.request(
      "StartWorkflow",
      "2020-08-01",
      {
        DirectUrl: JSON.stringify({
          FileName: input.objectKey,
          SpaceName: env.VOD_SPACE_NAME,
          BucketName: env.VOD_BUCKET_NAME,
        }),
        TemplateId: env.VOD_WATERMARK_WORKFLOW_ID,
        Input: JSON.stringify({
          OverrideParams: {
            Logo: [logo],
          },
        }),
        ClientToken: input.clientToken,
      },
    );
    const runId = String(result.RunId ?? "");
    if (!runId) {
      throw new Error("VOD 水印任务未返回 RunId");
    }
    return {
      id: runId,
      status: "queued" as const,
      progress: 3,
    };
  }

  async getTask(runId: string) {
    const result = await this.request(
      "GetWorkflowExecutionResult",
      "2022-12-01",
      { RunId: runId },
    );
    const status = String(result.Status ?? "");
    if (status === "PendingStart" || status === "Running") {
      return {
        id: runId,
        status:
          status === "Running"
            ? "running" as const
            : "queued" as const,
        progress: status === "Running" ? 62 : 8,
      };
    }
    if (status !== "0") {
      return {
        id: runId,
        status: "failed" as const,
        progress: 100,
        error: `VOD 水印任务失败：${status || "未知状态"}`,
      };
    }
    const transcodes = Array.isArray(result.TranscodeInfos)
      ? result.TranscodeInfos
      : [];
    const storeUri = String(
      (transcodes[0] as Record<string, unknown> | undefined)
        ?.StoreUri ?? "",
    );
    if (!storeUri) {
      throw new Error("VOD 水印任务未返回输出地址");
    }
    return {
      id: runId,
      status: "completed" as const,
      progress: 100,
      videoUrl: outputUrl(storeUri),
    };
  }
}
