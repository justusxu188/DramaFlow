import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    TOS_ENDPOINT: "tos-cn-beijing.volces.com",
    TOS_REGION: "cn-beijing",
    TOS_BUCKET: "short-drama",
    TOS_ACCESS_KEY_ID: "test-access-key",
    TOS_SECRET_ACCESS_KEY: "test-secret-key",
  },
}));

import { createTosUploadUrl, projectStoragePrefix } from "@/lib/tos";

describe("TOS storage folders", () => {
  it("groups source videos under the project name", () => {
    const signed = createTosUploadUrl({
      projectId: "project-123",
      projectName: "迟来的月光",
      fileName: "episode-01.mp4",
    });

    expect(signed.objectKey).toMatch(
      /^AIGCAdv\/projects\/迟来的月光-project-123\/sources\/.+-episode-01\.mp4$/,
    );
  });

  it("groups generated media by immutable run and stage", () => {
    const signed = createTosUploadUrl({
      projectId: "project-123",
      projectName: "迟来的月光",
      runId: "run-456",
      stage: "highlights",
      fileName: "highlight-01.mp4",
    });

    expect(signed.objectKey).toContain(
      `${projectStoragePrefix("project-123", "迟来的月光")}/runs/run-456/highlights/`,
    );
  });

  it("stores confirmed character images in a reusable project folder", () => {
    const signed = createTosUploadUrl({
      projectId: "project-123",
      projectName: "迟来的月光",
      runId: "run-456",
      stage: "character_images",
      fileName: "heroine.jpg",
    });

    expect(signed.objectKey).toMatch(
      /^AIGCAdv\/projects\/迟来的月光-project-123\/图像资产\/.+-heroine\.jpg$/,
    );
    expect(signed.objectKey).not.toContain("/runs/");
  });
});
