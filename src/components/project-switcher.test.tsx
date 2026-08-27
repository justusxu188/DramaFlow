// @vitest-environment jsdom

import {
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { parseCreativeWorkType } from "@/lib/creative-work-types";
import { ProjectSwitcher } from "./project-switcher";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}));

describe("project switcher", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "project-1",
              name: "当前项目",
              genre: "都市",
              sourceCount: 10,
            },
            {
              id: "project-2",
              name: "新项目",
              genre: "悬疑",
              sourceCount: 8,
            },
          ],
        }),
      }),
    );
  });

  it("switches projects without changing the creative type", async () => {
    const user = userEvent.setup();
    render(
      <ProjectSwitcher
        projectId="project-1"
        projectName="当前项目"
        workType={parseCreativeWorkType(
          "highlight-preroll",
        )}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: /当前项目/,
      }),
    );
    await user.click(
      await screen.findByRole("option", {
        name: /新项目/,
      }),
    );

    expect(navigation.push).toHaveBeenCalledWith(
      "/projects/project-2?workType=highlight-preroll",
    );
  });
});
