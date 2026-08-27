import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ArkAssetsClient,
  signArkAssetsRequest,
} from "./ark-assets";

describe("Ark private avatar assets", () => {
  it("signs Ark control-plane requests with fixed credentials", () => {
    const signed = signArkAssetsRequest({
      accessKeyId: "AKLT-test",
      secretAccessKey: "secret",
      action: "CreateAsset",
      body: "{}",
      host: "ark.cn-beijing.volcengineapi.com",
      now: new Date("2026-08-20T10:00:00.000Z"),
    });

    expect(signed.query).toBe(
      "Action=CreateAsset&Version=2024-01-01",
    );
    expect(signed.headers["X-Date"]).toBe(
      "20260820T100000Z",
    );
    expect(signed.headers.Authorization).toMatch(
      /^HMAC-SHA256 Credential=AKLT-test\/20260820\/cn-beijing\/ark\/request, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=[a-f0-9]{64}$/,
    );
  });

  it("creates an image asset in the selected avatar group", async () => {
    const fetcher = vi.fn(
      async (
        _input: RequestInfo | URL,
        _init?: RequestInit,
      ) =>
        new Response(
          JSON.stringify({
            Result: { Id: "asset-1" },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    );
    const client = new ArkAssetsClient({
      accessKeyId: "AKLT-test",
      secretAccessKey: "secret",
      fetcher,
      now: () =>
        new Date("2026-08-20T10:00:00.000Z"),
    });

    const result = await client.createImageAsset({
      groupId: "group-1",
      name: "林夏全身图",
      url: "https://tos.test/linxia.jpg",
    });

    expect(result).toEqual({
      id: "asset-1",
      groupId: "group-1",
      status: "processing",
      assetType: "Image",
      projectName: "default",
      name: "林夏全身图",
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain(
      "Action=CreateAsset",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      GroupId: "group-1",
      Name: "林夏全身图",
      AssetType: "Image",
      URL: "https://tos.test/linxia.jpg",
      ProjectName: "default",
    });
  });

  it("returns complete preprocessing failures", async () => {
    const client = new ArkAssetsClient({
      accessKeyId: "AKLT-test",
      secretAccessKey: "secret",
      fetcher: vi.fn(async () =>
        new Response(
          JSON.stringify({
            Result: {
              Id: "asset-1",
              GroupId: "group-1",
              Status: "Failed",
              AssetType: "Image",
              ProjectName: "default",
              Name: "林夏全身图",
              UpdateTime: "2026-08-20T12:44:38Z",
              Error: {
                Code: "ContentRestricted",
                Message: "内容安全审核未通过",
              },
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      ),
    });

    await expect(
      client.getAsset("asset-1"),
    ).resolves.toEqual({
      id: "asset-1",
      groupId: "group-1",
      status: "failed",
      assetType: "Image",
      projectName: "default",
      name: "林夏全身图",
      updatedAt: "2026-08-20T12:44:38Z",
      error:
        "ContentRestricted：内容安全审核未通过",
    });
  });
});
