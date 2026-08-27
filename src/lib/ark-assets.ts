import {
  createHash,
  createHmac,
} from "node:crypto";
import {
  env,
  hasArkAssetsConfig,
} from "@/lib/env";

type FetchLike = typeof fetch;

type ArkAssetsClientOptions = {
  accessKeyId: string;
  secretAccessKey: string;
  projectName?: string;
  baseUrl?: string;
  fetcher?: FetchLike;
  now?: () => Date;
};

type ArkResponse<T> = {
  ResponseMetadata?: {
    RequestId?: string;
    Error?: {
      Code?: string;
      Message?: string;
    };
  };
  Result?: T;
};

export type PrivateAvatarAssetStatus =
  | "processing"
  | "active"
  | "failed";

export type PrivateAvatarAsset = {
  id: string;
  groupId: string;
  status: PrivateAvatarAssetStatus;
  assetType: "Image";
  projectName: string;
  name?: string;
  updatedAt?: string;
  error?: string;
};

function sha256(value: string) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function hmac(
  key: string | Buffer,
  value: string,
) {
  return createHmac("sha256", key)
    .update(value)
    .digest();
}

function formatDate(date: Date) {
  return date
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");
}

export function signArkAssetsRequest(input: {
  accessKeyId: string;
  secretAccessKey: string;
  action: string;
  body: string;
  host: string;
  now: Date;
}) {
  const xDate = formatDate(input.now);
  const shortDate = xDate.slice(0, 8);
  const payloadHash = sha256(input.body);
  const query = new URLSearchParams({
    Action: input.action,
    Version: "2024-01-01",
  });
  query.sort();
  const canonicalHeaders =
    "content-type:application/json\n" +
    `host:${input.host}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${xDate}\n`;
  const signedHeaders =
    "content-type;host;x-content-sha256;x-date";
  const canonicalRequest = [
    "POST",
    "/",
    query.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope =
    `${shortDate}/cn-beijing/ark/request`;
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(
    input.secretAccessKey,
    shortDate,
  );
  const regionKey = hmac(dateKey, "cn-beijing");
  const serviceKey = hmac(regionKey, "ark");
  const signingKey = hmac(serviceKey, "request");
  const signature = createHmac(
    "sha256",
    signingKey,
  )
    .update(stringToSign)
    .digest("hex");
  return {
    query: query.toString(),
    headers: {
      "Content-Type": "application/json",
      Host: input.host,
      "X-Content-Sha256": payloadHash,
      "X-Date": xDate,
      Authorization:
        "HMAC-SHA256 " +
        `Credential=${input.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, ` +
        `Signature=${signature}`,
    },
  };
}

function normalizeStatus(status?: string) {
  if (status === "Active") return "active" as const;
  if (status === "Failed") return "failed" as const;
  return "processing" as const;
}

export class ArkAssetsClient {
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly projectName: string;
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly now: () => Date;

  constructor(options: ArkAssetsClientOptions) {
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey =
      options.secretAccessKey;
    this.projectName =
      options.projectName ?? "default";
    this.baseUrl =
      options.baseUrl ??
      "https://ark.cn-beijing.volcengineapi.com";
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  getProjectName() {
    return this.projectName;
  }

  async createGroup(input: {
    name: string;
    description?: string;
  }) {
    const result = await this.request<{ Id: string }>(
      "CreateAssetGroup",
      {
        Name: input.name.slice(0, 64),
        Description: input.description?.slice(0, 300),
        GroupType: "AIGC",
        ProjectName: this.projectName,
      },
    );
    return result.Id;
  }

  async createImageAsset(input: {
    groupId: string;
    name: string;
    url: string;
  }) {
    const result = await this.request<{ Id: string }>(
      "CreateAsset",
      {
        GroupId: input.groupId,
        Name: input.name.slice(0, 64),
        AssetType: "Image",
        URL: input.url,
        ProjectName: this.projectName,
      },
    );
    return {
      id: result.Id,
      groupId: input.groupId,
      status: "processing" as const,
      assetType: "Image" as const,
      projectName: this.projectName,
      name: input.name,
    };
  }

  async getAsset(
    id: string,
  ): Promise<PrivateAvatarAsset> {
    const result = await this.request<{
      Id: string;
      GroupId: string;
      Status: string;
      AssetType: "Image";
      ProjectName: string;
      Name?: string;
      UpdateTime?: string;
      Error?: {
        Code?: string;
        Message?: string;
      };
    }>("GetAsset", {
      Id: id,
      ProjectName: this.projectName,
    });
    const error = [
      result.Error?.Code,
      result.Error?.Message,
    ]
      .filter(Boolean)
      .join("：");
    return {
      id: result.Id,
      groupId: result.GroupId,
      status: normalizeStatus(result.Status),
      assetType: result.AssetType,
      projectName: result.ProjectName,
      name: result.Name,
      updatedAt: result.UpdateTime,
      ...(error ? { error } : {}),
    };
  }

  async deleteAsset(id: string) {
    await this.request<Record<string, never>>(
      "DeleteAsset",
      {
        Id: id,
        ProjectName: this.projectName,
      },
    );
  }

  async deleteGroup(id: string) {
    await this.request<Record<string, never>>(
      "DeleteAssetGroup",
      {
        Id: id,
        ProjectName: this.projectName,
      },
    );
  }

  private async request<T>(
    action: string,
    payload: Record<string, unknown>,
  ) {
    const body = JSON.stringify(payload);
    const url = new URL(this.baseUrl);
    const signed = signArkAssetsRequest({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      action,
      body,
      host: url.host,
      now: this.now(),
    });
    url.search = signed.query;
    const response = await this.fetcher(url, {
      method: "POST",
      headers: signed.headers,
      body,
    });
    const data =
      (await response.json()) as ArkResponse<T>;
    const providerError =
      data.ResponseMetadata?.Error;
    if (!response.ok || providerError || !data.Result) {
      throw new Error(
        [
          providerError?.Code,
          providerError?.Message,
        ]
          .filter(Boolean)
          .join("：") ||
          `私域虚拟人像接口调用失败（${response.status}）`,
      );
    }
    return data.Result;
  }
}

export function getArkAssetsClient() {
  if (!hasArkAssetsConfig()) {
    throw new Error(
      "私域虚拟人像未配置，请设置 ARK_ASSETS_ACCESS_KEY_ID 和 ARK_ASSETS_SECRET_ACCESS_KEY",
    );
  }
  return new ArkAssetsClient({
    accessKeyId: env.ARK_ASSETS_ACCESS_KEY_ID!,
    secretAccessKey:
      env.ARK_ASSETS_SECRET_ACCESS_KEY!,
    projectName: env.ARK_ASSETS_PROJECT_NAME,
    baseUrl: env.ARK_ASSETS_BASE_URL,
  });
}
