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

const push = vi.fn();
const enqueueAssetUploads = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/upload-manager", () => ({
  uploadFilesForTarget: (
    files: File[],
    target: string,
  ) =>
    files.filter((file) =>
      target === "character_image"
        ? /\.(jpg|jpeg|png|webp)$/i.test(file.name)
        : /\.(mp4|mov)$/i.test(file.name),
    ),
  useUploadManager: () => ({
    enqueueAssetUploads,
  }),
}));

import { ProjectDashboard } from "./project-dashboard";

describe("project creation source uploads", () => {
  beforeEach(() => {
    push.mockReset();
    enqueueAssetUploads.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async (
          input: string | URL | Request,
          init?: RequestInit,
        ) => {
          if (
            String(input) === "/api/projects" &&
            init?.method === "POST"
          ) {
            return {
              ok: true,
              json: async () => ({
                data: {
                  id: "project-new",
                  name: "新短剧",
                  genre: "都市",
                  episodeCount: 0,
                  progress: 0,
                  status: "awaiting_upload",
                  outputs: 0,
                  sourceCount: 0,
                  runningJobs: 0,
                  updatedAt:
                    "2026-08-20T00:00:00.000Z",
                },
              }),
            };
          }
          return {
            ok: true,
            json: async () => ({ data: [] }),
          };
        },
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses one picker for single or multiple source videos", async () => {
    const user = userEvent.setup();
    render(<ProjectDashboard />);

    await user.click(
      screen.getByRole("button", {
        name: "新建短剧项目",
      }),
    );
    await user.type(
      screen.getByLabelText("剧目名称"),
      "新短剧",
    );
    await user.type(
      screen.getByLabelText("题材类型"),
      "都市",
    );
    const files = [
      new File(["1"], "01.mp4", {
        type: "video/mp4",
      }),
      new File(["2"], "02.mp4", {
        type: "video/mp4",
      }),
    ];
    await user.upload(
      screen.getByLabelText("选择上传文件"),
      files,
    );
    expect(
      screen.queryByText("单个文件"),
    ).toBeNull();
    expect(
      screen.queryByText("多个文件"),
    ).toBeNull();
    expect(
      screen.queryByText("选择文件夹"),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "创建并后台上传",
      }),
    );

    await waitFor(() => {
      expect(
        enqueueAssetUploads,
      ).toHaveBeenCalledWith({
        projectId: "project-new",
        projectName: "新短剧",
        files,
        assetType: "source",
      });
      expect(push).toHaveBeenCalledWith(
        "/projects/project-new",
      );
    });
  });

  it("queues images and highlights into the selected asset folder", async () => {
    const user = userEvent.setup();
    render(<ProjectDashboard />);

    await user.click(
      screen.getByRole("button", {
        name: "新建短剧项目",
      }),
    );
    await user.type(
      screen.getByLabelText("剧目名称"),
      "新短剧",
    );
    await user.type(
      screen.getByLabelText("题材类型"),
      "都市",
    );
    await user.click(
      screen.getByRole("button", {
        name: "图像资产",
      }),
    );
    const image = new File(["image"], "林晚.png", {
      type: "image/png",
    });
    await user.upload(
      screen.getByLabelText("选择上传文件"),
      image,
    );
    await user.click(
      screen.getByRole("button", {
        name: "创建并后台上传",
      }),
    );

    await waitFor(() => {
      expect(
        enqueueAssetUploads,
      ).toHaveBeenCalledWith({
        projectId: "project-new",
        projectName: "新短剧",
        files: [image],
        assetType: "character_image",
      });
    });
  });
});
