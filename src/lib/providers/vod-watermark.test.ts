import { describe, expect, it } from "vitest";
import { createVodSignedRequest } from "@/lib/providers/vod-watermark";

describe("VOD request signing", () => {
  it("creates a deterministic signed StartWorkflow request", () => {
    const request = createVodSignedRequest({
      action: "StartWorkflow",
      version: "2020-08-01",
      body: {
        DirectUrl: "{\"FileName\":\"video.mp4\"}",
        TemplateId: "workflow-1",
      },
      accessKeyId: "test-ak",
      secretAccessKey: "test-sk",
      region: "cn-north-1",
      now: new Date("2026-08-23T12:00:00.000Z"),
    });

    expect(request.url).toBe(
      "https://vod.volcengineapi.com/?Action=StartWorkflow&Version=2020-08-01",
    );
    expect(request.headers["X-Date"]).toBe(
      "20260823T120000Z",
    );
    expect(request.headers.Authorization).toContain(
      "Credential=test-ak/20260823/cn-north-1/vod/request",
    );
    expect(request.headers.Authorization).toContain(
      "SignedHeaders=content-type;host;x-content-sha256;x-date",
    );
    expect(request.headers.Authorization).not.toContain(
      "test-sk",
    );
  });
});
