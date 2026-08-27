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
const enqueueSourceUploads = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
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

import { ProjectDashboard } from "./project-dashboard";

describe("project creation source uploads", () => {
  beforeEach(() => {
    push.mockReset();
    enqueueSourceUploads.mockReset();
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

  it("queues selected files and navigates without waiting for upload", async () => {
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
      screen.getByLabelText(/多个文件/),
      files,
    );
    await user.click(
      screen.getByRole("button", {
        name: "创建并后台上传",
      }),
    );

    await waitFor(() => {
      expect(
        enqueueSourceUploads,
      ).toHaveBeenCalledWith({
        projectId: "project-new",
        projectName: "新短剧",
        files,
      });
      expect(push).toHaveBeenCalledWith(
        "/projects/project-new",
      );
    });
  });
});
