// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  LibraryAssetDeleteButton,
  LibraryImagePreview,
} from "./library-asset-controls";
import { LibraryImageActions } from "./library-image-actions";
import { LibraryProjectSection } from "./library-project-section";

const refresh = vi.fn();
const enqueueSourceUploads = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/components/upload-manager", () => ({
  sourceVideoFiles: (files: File[]) =>
    files.filter((file) =>
      /\.(mp4|mov)$/i.test(file.name),
    ),
  useUploadManager: () => ({
    enqueueSourceUploads,
  }),
}));

describe("library asset controls", () => {
  beforeEach(() => {
    refresh.mockReset();
    enqueueSourceUploads.mockReset();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.stubGlobal(
      "alert",
      vi.fn(),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("confirms and deletes a project asset", async () => {
    const user = userEvent.setup();
    render(
      <LibraryAssetDeleteButton
        projectId="project-1"
        assetId="image-1"
        assetType="character_image"
        assetName="林夏基准图"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "删除 林夏基准图",
      }),
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/project-1/assets",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({
            assetId: "image-1",
            assetType: "character_image",
          }),
        }),
      );
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("opens an enlarged image preview", async () => {
    const user = userEvent.setup();
    render(
      <LibraryImagePreview
        sourceUrl="https://example.com/linxia.jpg"
        alt="林夏基准图"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "放大查看 林夏基准图",
      }),
    );

    expect(
      screen.getByRole("dialog", {
        name: "林夏基准图",
      }),
    ).toBeTruthy();
  });

  it("registers an image as a private avatar asset", async () => {
    const user = userEvent.setup();
    render(
      <LibraryImageActions
        projectId="project-1"
        assetId="image-1"
        assetName="林夏基准图"
        sourceUrl="https://example.com/linxia.jpg"
        characterName="林夏"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "将 林夏基准图 登记为虚拟人像",
      }),
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/project-1/assets/avatar",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "register",
            assetId: "image-1",
          }),
        }),
      );
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("shows the complete private avatar failure", () => {
    render(
      <LibraryImageActions
        projectId="project-1"
        assetId="image-1"
        assetName="林夏基准图"
        sourceUrl="https://example.com/linxia.jpg"
        characterName="林夏"
        avatarAssetId="avatar-1"
        avatarStatus="failed"
        avatarError="ContentRestricted：内容安全审核未通过，素材与自然人形象过于相似"
      />,
    );

    expect(
      screen.getByText(
        "ContentRestricted：内容安全审核未通过，素材与自然人形象过于相似",
      ),
    ).toBeTruthy();
  });

  it("warns that deleting an enrolled image also deletes its remote avatar", async () => {
    const user = userEvent.setup();
    render(
      <LibraryImageActions
        projectId="project-1"
        assetId="image-1"
        assetName="林夏基准图"
        sourceUrl="https://example.com/linxia.jpg"
        characterName="林夏"
        avatarAssetId="avatar-1"
        avatarStatus="active"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "删除 林夏基准图",
      }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining(
        "Seedance 自定义人像素材也会同步删除",
      ),
    );
  });

  it("folds and expands one project from its folder button", async () => {
    const user = userEvent.setup();
    render(
      <LibraryProjectSection
        projectId="project-1"
        projectName="轮椅留下的证言"
        summary="10 个源视频"
        defaultImageModel="seedream_5_0_pro"
        sources={[]}
        images={[]}
      >
        <div>剧集素材内容</div>
      </LibraryProjectSection>,
    );

    expect(
      screen.queryByText("剧集素材内容"),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: "展开 轮椅留下的证言",
      }),
    );
    expect(
      screen.getByText("剧集素材内容"),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "折叠 轮椅留下的证言",
      }),
    );
    expect(
      screen.queryByText("剧集素材内容"),
    ).toBeNull();
  });

  it("queues one or more episodes from the library project header", async () => {
    const user = userEvent.setup();
    render(
      <LibraryProjectSection
        projectId="project-1"
        projectName="轮椅留下的证言"
        summary="10 个源视频"
        defaultImageModel="seedream_5_0_pro"
        sources={[]}
        images={[]}
      >
        <div />
      </LibraryProjectSection>,
    );
    const files = [
      new File(["1"], "11.mp4", {
        type: "video/mp4",
      }),
      new File(["2"], "12.mov", {
        type: "video/quicktime",
      }),
    ];

    expect(
      screen.queryByRole("link", {
        name: "进入项目",
      }),
    ).toBeNull();
    await user.upload(
      screen.getByLabelText(
        "为轮椅留下的证言上传剧集",
      ),
      files,
    );

    expect(
      enqueueSourceUploads,
    ).toHaveBeenCalledWith({
      projectId: "project-1",
      projectName: "轮椅留下的证言",
      files,
    });
  });
});
