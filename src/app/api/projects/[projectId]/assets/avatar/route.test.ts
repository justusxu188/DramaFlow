import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectName: vi.fn(),
  createGroup: vi.fn(),
  createImageAsset: vi.fn(),
  getAsset: vi.fn(),
  deleteAsset: vi.fn(),
  deleteGroup: vi.fn(),
  getImageAssetsByIds: vi.fn(),
  listImageAssets: vi.fn(),
  updateImageAssetMetadata: vi.fn(),
}));

vi.mock("@/lib/ark-assets", () => ({
  getArkAssetsClient: () => ({
    getProjectName: mocks.getProjectName,
    createGroup: mocks.createGroup,
    createImageAsset: mocks.createImageAsset,
    getAsset: mocks.getAsset,
    deleteAsset: mocks.deleteAsset,
    deleteGroup: mocks.deleteGroup,
  }),
}));

vi.mock("@/lib/project-store", () => ({
  getImageAssetsByIds: mocks.getImageAssetsByIds,
  listImageAssets: mocks.listImageAssets,
  updateImageAssetMetadata:
    mocks.updateImageAssetMetadata,
}));

vi.mock("@/lib/authorization", () => ({
  authenticatedApiUser: async () => ({
    user: { id: "user-1", role: "user" },
    response: null,
  }),
  authorizedProject: async () => ({ id: "project-1" }),
}));

import { POST } from "./route";

const context = {
  params: Promise.resolve({
    projectId: "project-1",
  }),
};

function image(
  metadata: Record<string, unknown> = {},
) {
  return {
    id: "image-1",
    projectId: "project-1",
    kind: "character_image",
    name: "林夏全身图",
    sourceUrl: "https://tos.test/linxia.jpg",
    metadata: {
      characterId: "character-1",
      characterName: "林夏",
      isBaseline: true,
      ...metadata,
    },
  };
}

describe("private avatar asset route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectName.mockReturnValue("default");
    mocks.getImageAssetsByIds.mockResolvedValue([
      image(),
    ]);
    mocks.listImageAssets.mockResolvedValue([
      image(),
    ]);
    mocks.createGroup.mockResolvedValue("group-1");
    mocks.createImageAsset.mockResolvedValue({
      id: "avatar-1",
      groupId: "group-1",
      status: "processing",
      assetType: "Image",
      projectName: "default",
      name: "林夏全身图",
    });
    mocks.updateImageAssetMetadata.mockResolvedValue(
      true,
    );
  });

  it("registers an image in a private avatar group", async () => {
    const response = await POST(
      new Request("http://localhost/avatar", {
        method: "POST",
        body: JSON.stringify({
          action: "register",
          assetId: "image-1",
        }),
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(mocks.createGroup).toHaveBeenCalledWith({
      name: "林夏",
      description:
        "FrameFlow 项目 project-1 的自定义虚拟人像",
    });
    expect(
      mocks.createImageAsset,
    ).toHaveBeenCalledWith({
      groupId: "group-1",
      name: "林夏全身图",
      url: "https://tos.test/linxia.jpg",
    });
    expect(
      mocks.updateImageAssetMetadata,
    ).toHaveBeenCalledWith(
      "project-1",
      "image-1",
      expect.objectContaining({
        avatarAssetId: "avatar-1",
        avatarStatus: "processing",
        avatarAssetType: "Image",
        avatarProjectName: "default",
        avatarRemoteName: "林夏全身图",
      }),
    );
  });

  it("reports the remote asset id when local persistence fails", async () => {
    mocks.updateImageAssetMetadata.mockResolvedValue(
      false,
    );

    const response = await POST(
      new Request("http://localhost/avatar", {
        method: "POST",
        body: JSON.stringify({
          action: "register",
          assetId: "image-1",
        }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.stringContaining("avatar-1"),
      }),
    );
  });

  it("reuses the character avatar group", async () => {
    mocks.listImageAssets.mockResolvedValue([
      image({
        avatarGroupId: "group-existing",
        avatarAssetId: "avatar-existing",
        avatarStatus: "active",
      }),
      {
        ...image(),
        id: "image-2",
        name: "林夏侧面图",
        metadata: {
          characterId: "character-1",
          characterName: "林夏",
        },
      },
    ]);
    mocks.getImageAssetsByIds.mockResolvedValue([
      {
        ...image(),
        id: "image-2",
        name: "林夏侧面图",
        metadata: {
          characterId: "character-1",
          characterName: "林夏",
        },
      },
    ]);

    const response = await POST(
      new Request("http://localhost/avatar", {
        method: "POST",
        body: JSON.stringify({
          action: "register",
          assetId: "image-2",
        }),
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(mocks.createGroup).not.toHaveBeenCalled();
    expect(
      mocks.createImageAsset,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group-existing",
      }),
    );
  });

  it("migrates an existing asset into the inference project", async () => {
    mocks.getProjectName.mockReturnValue("X-Project");
    mocks.getImageAssetsByIds.mockResolvedValue([
      image({
        avatarGroupId: "group-default",
        avatarAssetId: "avatar-default",
        avatarStatus: "active",
        avatarProjectName: "default",
      }),
    ]);
    mocks.listImageAssets.mockResolvedValue([
      image({
        avatarGroupId: "group-default",
        avatarAssetId: "avatar-default",
        avatarStatus: "active",
        avatarProjectName: "default",
      }),
    ]);
    mocks.createGroup.mockResolvedValue(
      "group-x-project",
    );
    mocks.createImageAsset.mockResolvedValue({
      id: "avatar-x-project",
      groupId: "group-x-project",
      status: "processing",
      assetType: "Image",
      projectName: "X-Project",
      name: "林夏全身图",
    });

    const response = await POST(
      new Request("http://localhost/avatar", {
        method: "POST",
        body: JSON.stringify({
          action: "refresh",
          assetId: "image-1",
        }),
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(mocks.createGroup).toHaveBeenCalled();
    expect(
      mocks.updateImageAssetMetadata,
    ).toHaveBeenCalledWith(
      "project-1",
      "image-1",
      expect.objectContaining({
        avatarAssetId: "avatar-x-project",
        avatarProjectName: "X-Project",
      }),
    );
  });

  it("repairs a historical asset into its character group", async () => {
    mocks.getImageAssetsByIds.mockResolvedValue([
      image({
        avatarGroupId: "group-duplicate",
        avatarAssetId: "avatar-duplicate",
        avatarStatus: "active",
      }),
    ]);
    mocks.listImageAssets.mockResolvedValue([
      image({
        avatarGroupId: "group-duplicate",
        avatarAssetId: "avatar-duplicate",
        avatarStatus: "active",
      }),
      {
        ...image(),
        id: "image-2",
        metadata: {
          characterId: "character-1",
          characterName: "林夏",
          avatarGroupId: "group-primary",
          avatarAssetId: "avatar-primary",
          avatarStatus: "active",
        },
      },
    ]);
    mocks.createImageAsset.mockResolvedValue({
      id: "avatar-repaired",
      groupId: "group-primary",
      status: "processing",
      assetType: "Image",
      projectName: "default",
      name: "林夏全身图",
    });

    const response = await POST(
      new Request("http://localhost/avatar", {
        method: "POST",
        body: JSON.stringify({
          action: "repair_group",
          assetId: "image-1",
        }),
      }),
      context,
    );

    expect(response.status).toBe(202);
    expect(mocks.deleteAsset).toHaveBeenCalledWith(
      "avatar-duplicate",
    );
    expect(mocks.deleteGroup).toHaveBeenCalledWith(
      "group-duplicate",
    );
    expect(
      mocks.createImageAsset,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group-primary",
      }),
    );
  });

  it("refreshes preprocessing failures with full errors", async () => {
    mocks.getImageAssetsByIds.mockResolvedValue([
      image({
        avatarGroupId: "group-1",
        avatarAssetId: "avatar-1",
        avatarStatus: "processing",
      }),
    ]);
    mocks.getAsset.mockResolvedValue({
      id: "avatar-1",
      groupId: "group-1",
      status: "failed",
      assetType: "Image",
      projectName: "default",
      name: "林夏全身图",
      error:
        "ContentRestricted：内容安全审核未通过",
    });

    const response = await POST(
      new Request("http://localhost/avatar", {
        method: "POST",
        body: JSON.stringify({
          action: "refresh",
          assetId: "image-1",
        }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(
      mocks.updateImageAssetMetadata,
    ).toHaveBeenCalledWith(
      "project-1",
      "image-1",
      expect.objectContaining({
        avatarStatus: "failed",
        avatarError:
          "ContentRestricted：内容安全审核未通过",
      }),
    );
  });
});
