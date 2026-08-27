import { createHmac, createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { env } from "@/lib/env";

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

export type TosStorageStage =
  | "sources"
  | "character_images"
  | "analysis"
  | "strategies"
  | "highlights"
  | "scripts"
  | "prerolls"
  | "compositions"
  | "postproduction";

function safePathSegment(value: string, fallback: string) {
  const safe = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return safe || fallback;
}

export function projectStoragePrefix(projectId: string, projectName?: string) {
  const id = safePathSegment(projectId, "project");
  const name = safePathSegment(projectName ?? "", "project");
  return `AIGCAdv/projects/${name}-${id}`;
}

export function createTosUploadUrl(input: {
  projectId: string;
  projectName?: string;
  fileName: string;
  runId?: string;
  stage?: TosStorageStage;
  expiresIn?: number;
}) {
  const {
    TOS_ENDPOINT: endpoint,
    TOS_REGION: region,
    TOS_BUCKET: bucket,
    TOS_ACCESS_KEY_ID: accessKey,
    TOS_SECRET_ACCESS_KEY: secretKey,
  } = env;
  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new Error("TOS 上传配置未完成");
  }

  const now = new Date();
  const dateTime = toAmzDate(now);
  const date = dateTime.slice(0, 8);
  const service = "tos";
  const scope = `${date}/${region}/${service}/request`;
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const projectPrefix = projectStoragePrefix(
    input.projectId,
    input.projectName,
  );
  const stage = input.stage ?? "sources";
  const storagePrefix =
    stage === "character_images"
      ? `${projectPrefix}/图像资产`
      : stage === "sources"
        ? `${projectPrefix}/sources`
      : stage === "highlights" && !input.runId
        ? `${projectPrefix}/高光剪辑`
      : stage === "prerolls" && !input.runId
        ? `${projectPrefix}/AI前贴视频`
      : stage === "compositions" && !input.runId
        ? `${projectPrefix}/成片视频`
      : input.runId
        ? `${projectPrefix}/runs/${safePathSegment(input.runId, "run")}/${stage}`
        : `${projectPrefix}/sources`;
  const objectKey = `${storagePrefix}/${randomUUID()}-${safeName}`;
  const host = `${bucket}.${endpoint.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  const path = `/${objectKey.split("/").map(encode).join("/")}`;
  const expires = Math.min(input.expiresIn ?? 900, 3600);

  const query = new URLSearchParams({
    "X-Tos-Algorithm": "TOS4-HMAC-SHA256",
    "X-Tos-Credential": `${accessKey}/${scope}`,
    "X-Tos-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Tos-Date": dateTime,
    "X-Tos-Expires": String(expires),
    "X-Tos-SignedHeaders": "host",
  });
  query.sort();

  const canonicalRequest = [
    "PUT",
    path,
    query.toString(),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "TOS4-HMAC-SHA256",
    dateTime,
    scope,
    sha256(canonicalRequest),
  ].join("\n");

  const dateKey = hmac(secretKey, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, "request");
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  return {
    uploadUrl: `https://${host}${path}?${query.toString()}&X-Tos-Signature=${signature}`,
    sourceUrl: `https://${host}${path}`,
    objectKey,
    expiresAt: new Date(now.getTime() + expires * 1000).toISOString(),
  };
}

export function tosObjectUrl(objectKey: string) {
  const { TOS_ENDPOINT: endpoint, TOS_BUCKET: bucket } = env;
  if (!endpoint || !bucket) throw new Error("TOS 上传配置未完成");
  const host = `${bucket}.${endpoint.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  const objectPath = objectKey.split("/").map(encode).join("/");
  return `https://${host}/${objectPath}`;
}

export async function transferRemoteFileToTos(input: {
  remoteUrl: string;
  projectId: string;
  projectName?: string;
  runId?: string;
  stage: TosStorageStage;
  fileName: string;
}) {
  if (input.remoteUrl.startsWith("tos://")) {
    const [, resource = ""] = input.remoteUrl.split("tos://");
    const slash = resource.indexOf("/");
    const objectKey = slash >= 0 ? resource.slice(slash + 1) : "";
    if (!objectKey) throw new Error("MediaKit 返回的 TOS 地址无对象路径");
    return { objectKey, sourceUrl: tosObjectUrl(objectKey) };
  }

  const source = await fetch(input.remoteUrl, { cache: "no-store" });
  if (!source.ok) {
    throw new Error(`下载供应商产物失败 (${source.status})`);
  }
  const body = await source.arrayBuffer();
  const signed = createTosUploadUrl({
    projectId: input.projectId,
    projectName: input.projectName,
    runId: input.runId,
    stage: input.stage,
    fileName: input.fileName,
    expiresIn: 1800,
  });
  const upload = await fetch(signed.uploadUrl, {
    method: "PUT",
    body,
    headers: {
      "Content-Type": input.fileName.toLowerCase().endsWith(".jpg") ||
        input.fileName.toLowerCase().endsWith(".jpeg")
        ? "image/jpeg"
        : input.fileName.toLowerCase().endsWith(".png")
          ? "image/png"
          : input.fileName.toLowerCase().endsWith(".mov")
            ? "video/quicktime"
            : "video/mp4",
    },
  });
  if (!upload.ok) {
    throw new Error(`转存供应商产物到 TOS 失败 (${upload.status})`);
  }
  return {
    objectKey: signed.objectKey,
    sourceUrl: signed.sourceUrl,
    sizeBytes: body.byteLength,
  };
}

export async function uploadLocalFileToTos(input: {
  localPath: string;
  projectId: string;
  projectName?: string;
  runId?: string;
  stage: TosStorageStage;
  fileName: string;
  contentType?: string;
}) {
  const file = await stat(input.localPath);
  const signed = createTosUploadUrl({
    projectId: input.projectId,
    projectName: input.projectName,
    runId: input.runId,
    stage: input.stage,
    fileName: input.fileName,
    expiresIn: 1800,
  });
  const upload = await fetch(signed.uploadUrl, {
    method: "PUT",
    body: createReadStream(input.localPath) as unknown as BodyInit,
    headers: {
      "Content-Type": input.contentType ?? "video/mp4",
      "Content-Length": String(file.size),
    },
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  if (!upload.ok) {
    throw new Error(`上传本地处理产物到 TOS 失败 (${upload.status})`);
  }
  return {
    objectKey: signed.objectKey,
    sourceUrl: signed.sourceUrl,
    sizeBytes: file.size,
  };
}
