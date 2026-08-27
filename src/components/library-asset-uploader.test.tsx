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
import { LibraryAssetUploader } from "./library-asset-uploader";
import { LibraryImageActions } from "./library-image-actions";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("library asset uploader", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async (
          input: string | URL | Request,
          init?: RequestInit,
        ) => {
          const url = String(input);
          if (url === "/api/uploads/sign") {
            return {
              ok: true,
              json: async () => ({
                data: {
                  uploadUrl:
                    "https://tos.test/upload",
                  sourceUrl:
                    "https://tos.test/linwan.jpg",
                  objectKey:
                    "project/图像资产/linwan.jpg",
                },
              }),
            } as Response;
          }
          if (
            url ===
              "https://tos.test/upload" &&
            init?.method === "PUT"
          ) {
            return {
              ok: true,
              status: 200,
            } as Response;
          }
          return {
            ok: true,
            json: async () => ({
              data: { id: "image-1" },
            }),
          } as Response;
        },
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uploads and registers a named character look", async () => {
    const user = userEvent.setup();
    render(
      <LibraryAssetUploader
        projectId="project-1"
        sources={[]}
        images={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "上传角色图片",
      }),
    );
    await user.type(
      screen.getByLabelText("角色名称"),
      "林晚",
    );
    const lookName = screen.getByLabelText(
      "妆造名称",
    );
    await user.clear(lookName);
    await user.type(lookName, "医院造型");
    await user.upload(
      screen.getByLabelText(
        /选择一张或多张角色图片/,
      ),
      new File(["image"], "linwan.jpg", {
        type: "image/jpeg",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "上传并保存",
      }),
    );

    await waitFor(() =>
      expect(refresh).toHaveBeenCalled(),
    );
    const assetRequest = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input) ===
            "/api/projects/project-1/assets" &&
          init?.method === "POST",
      );
    expect(
      JSON.parse(
        String(assetRequest?.[1]?.body),
      ),
    ).toMatchObject({
      assetType: "character_image",
      name: "linwan-上传图片",
      characterName: "林晚",
      lookName: "医院造型",
      viewType: "front",
      isBaseline: true,
    });
  });

  it("uses original names and registers multiple highlight videos", async () => {
    const user = userEvent.setup();
    render(
      <LibraryAssetUploader
        projectId="project-1"
        sources={[]}
        images={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "上传高光剪辑",
      }),
    );
    const fileInput = screen.getByLabelText(
      /选择一个或多个高光视频/,
    );
    await user.upload(fileInput, [
      new File(["video-a"], "大盘1.mp4", {
        type: "video/mp4",
      }),
      new File(["video-b"], "大盘2.mov", {
        type: "video/quicktime",
      }),
    ]);

    const nameInput = screen.getByLabelText(
      "高光名称",
    ) as HTMLInputElement;
    expect(nameInput.disabled).toBe(true);
    expect(nameInput.placeholder).toBe(
      "多文件上传时分别使用原文件名",
    );
    const folderInput = screen.getByLabelText(
      "选择文件夹",
    );
    expect(
      folderInput.hasAttribute("webkitdirectory"),
    ).toBe(true);

    await user.click(
      screen.getByRole("button", {
        name: "上传并保存",
      }),
    );

    await waitFor(() =>
      expect(refresh).toHaveBeenCalled(),
    );
    const assetBodies = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input) ===
            "/api/projects/project-1/assets" &&
          init?.method === "POST",
      )
      .map(([, init]) =>
        JSON.parse(String(init?.body)),
      );
    expect(assetBodies).toHaveLength(2);
    expect(assetBodies.map((body) => body.name)).toEqual([
      "大盘1.mp4",
      "大盘2.mov",
    ]);
  });

  it("fills the original file name for a single highlight", async () => {
    const user = userEvent.setup();
    render(
      <LibraryAssetUploader
        projectId="project-1"
        sources={[]}
        images={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "上传高光剪辑",
      }),
    );
    await user.upload(
      screen.getByLabelText(
        /选择一个或多个高光视频/,
      ),
      new File(["video"], "大盘2.mp4", {
        type: "video/mp4",
      }),
    );

    expect(
      (
        screen.getByLabelText(
          "高光名称",
        ) as HTMLInputElement
      ).value,
    ).toBe("大盘2.mp4");
  });

  it("allows text-to-image generation and shows model-specific dimensions", async () => {
    const user = userEvent.setup();
    render(
      <LibraryAssetUploader
        projectId="project-1"
        sources={[]}
        images={[
          {
            id: "image-1",
            name: "林夏基准图",
            sourceUrl:
              "https://example.com/linxia.jpg",
            characterName: "林夏",
            lookName: "基准造型",
          },
        ]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: /生成角色图片/,
      }),
    );

    const baselineSelect = screen.getByRole(
      "combobox",
      { name: "基准图" },
    );
    expect(
      (baselineSelect as HTMLSelectElement).value,
    ).toBe("");
    const placeholder =
      baselineSelect.querySelector(
        'option[value=""]',
      );
    expect(placeholder?.textContent).toBe(
      "无（直接文生图）",
    );
    expect(
      placeholder?.hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen.getByText("输入生成图片提示词"),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("角色名称") as HTMLInputElement)
        .value,
    ).toBe("");
    await user.type(
      screen.getByLabelText("角色名称"),
      "新角色",
    );
    expect(
      (
        screen.getByLabelText(
          "输入生成图片提示词",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe(
      "参考人物的脸型、发型不变，生成人物的全身、从头到脚、正面形象，背景为纯白色",
    );
    expect(
      screen.getByRole("combobox", {
        name: /^画面宽高比/,
      }) as HTMLSelectElement,
    ).toHaveProperty("value", "9:16");
    expect(screen.getByText("1152 × 2048")).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "生成并保存",
      }),
    );
    await waitFor(() =>
      expect(refresh).toHaveBeenCalled(),
    );
    expect(
      screen.getByRole("dialog", {
        name: "生成角色图片",
      }),
    ).toBeTruthy();
    expect(screen.getByText("已保存")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "生成并保存",
      }),
    ).toBeTruthy();
  });

  it("keeps the capture dialog open while multiple frames finish", async () => {
    const user = userEvent.setup();
    let taskIndex = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async (_input: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as {
            action: "start" | "complete";
          };
          if (body.action === "start") {
            taskIndex += 1;
            return {
              ok: true,
              status: 202,
              json: async () => ({
                data: { id: `capture-${taskIndex}` },
              }),
            } as Response;
          }
          return {
            ok: true,
            status: 201,
            json: async () => ({
              data: { id: `image-${taskIndex}` },
            }),
          } as Response;
        },
      ),
    );
    render(
      <LibraryAssetUploader
        projectId="project-1"
        sources={[
          {
            id: "source-1",
            name: "第一集.mp4",
            sourceUrl: "https://example.com/1.mp4",
            durationMs: 120000,
          },
        ]}
        images={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "生成角色图片" }),
    );
    await user.click(
      screen.getByRole("tab", { name: "视频截图" }),
    );
    await user.type(screen.getByLabelText("角色名称"), "林夏");
    await user.click(
      screen.getByRole("button", { name: "截图并生成" }),
    );
    await waitFor(() =>
      expect(screen.getByText("已保存")).toBeTruthy(),
    );
    const generatedRequest = vi.mocked(fetch).mock.calls.find(
      ([input]) =>
        String(input).endsWith("/assets/generate-image"),
    );
    expect(
      JSON.parse(String(generatedRequest?.[1]?.body)),
    ).toMatchObject({
      baselineAssetId: "image-1",
      generationMode: "capture_to_image",
      characterName: "林夏",
      lookName: "基准造型",
    });

    expect(
      screen.getByRole("dialog", {
        name: "生成角色图片",
      }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "截图并生成",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);

    await user.click(
      screen.getByRole("button", { name: "截图并生成" }),
    );
    await waitFor(() =>
      expect(screen.getAllByText("已保存")).toHaveLength(2),
    );
  });

  it("opens generation with the selected image from its edit action", async () => {
    const user = userEvent.setup();
    render(
      <>
        <LibraryAssetUploader
          projectId="project-1"
          sources={[]}
          images={[
            {
              id: "image-1",
              name: "林夏基准图",
              sourceUrl: "https://example.com/linxia.jpg",
              characterName: "林夏",
              lookName: "基准造型",
            },
          ]}
        />
        <LibraryImageActions
          projectId="project-1"
          assetId="image-1"
          assetName="林夏基准图"
          sourceUrl="https://example.com/linxia.jpg"
          characterName="林夏"
          lookName="基准造型"
        />
      </>,
    );

    await user.click(
      screen.getByRole("button", { name: "编辑 林夏基准图" }),
    );

    expect(
      (screen.getByLabelText("角色名称") as HTMLInputElement).value,
    ).toBe("重绘-林夏");
    expect(
      (screen.getByLabelText("妆造名称") as HTMLInputElement).value,
    ).toBe("基准造型");
    expect(
      (
        screen.getByRole("combobox", {
          name: "基准图",
        }) as HTMLSelectElement
      ).value,
    ).toBe("image-1");
    expect(
      (
        screen.getByLabelText(
          "输入生成图片提示词",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe(
      "参考人物的脸型、发型不变，生成人物的全身、从头到脚、正面形象，背景为纯白色",
    );
    expect(
      screen
        .getByRole("link", { name: "下载 林夏基准图" })
        .getAttribute("download"),
    ).toBe("林夏基准图");
  });

  it("renames an image without changing its identity", async () => {
    const user = userEvent.setup();
    render(
      <LibraryImageActions
        projectId="project-1"
        assetId="image-1"
        assetName="林夏基准图"
        sourceUrl="https://example.com/linxia.jpg"
        characterName="林夏"
        lookName="基准造型"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "重命名 林夏基准图",
      }),
    );
    const input = screen.getByLabelText("图片名称");
    await user.clear(input);
    await user.type(input, "林夏正面全身照");
    await user.click(
      screen.getByRole("button", {
        name: "保存名称",
      }),
    );

    await waitFor(() =>
      expect(refresh).toHaveBeenCalled(),
    );
    const request = vi.mocked(fetch).mock.calls.find(
      ([input, init]) =>
        String(input) ===
          "/api/projects/project-1/assets" &&
        init?.method === "PATCH",
    );
    expect(
      JSON.parse(String(request?.[1]?.body)),
    ).toEqual({
      action: "rename_image",
      assetId: "image-1",
      name: "林夏正面全身照",
    });
  });
});
