// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/library",
  workType: null as string | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => ({
    get: (key: string) =>
      key === "workType"
        ? navigation.workType
        : null,
  }),
}));

import { Sidebar } from "./sidebar";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigation.pathname = "/library";
  navigation.workType = null;
});

describe("sidebar navigation", () => {
  it("uses distinct routes for all four work areas", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "项目中心" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("创作工作台")).toBeTruthy();
    expect(
      screen
        .getByText("全链路素材创作")
        .closest("a")
        ?.getAttribute("href"),
    ).toBe("/production/full-chain");
    expect(
      screen
        .getByText("视频后期剪辑")
        .closest("a")
        ?.getAttribute("href"),
    ).toBe("/production/post-production");
    expect(screen.getByRole("link", { name: "素材库" }).getAttribute("href")).toBe("/library");
    expect(screen.getByRole("link", { name: "任务中心" }).getAttribute("href")).toBe("/tasks");
    expect(screen.getByRole("link", { name: "素材库" }).className).toContain("active");
    const navigationText = screen.getByRole("navigation").textContent ?? "";
    expect(navigationText.indexOf("项目中心")).toBeLessThan(
      navigationText.indexOf("创作工作台"),
    );
    expect(screen.queryByText("Jason Chen")).toBeNull();
    expect(screen.queryByText("创意制作团队")).toBeNull();
  });

  it("highlights the selected work type inside a project", () => {
    navigation.pathname = "/projects/project-1";
    navigation.workType = "batch-highlights";

    render(<Sidebar />);

    expect(
      screen
        .getByText("批量高光剪辑")
        .closest("a")
        ?.className,
    ).toContain("active");
    expect(
      screen
        .getByText("全链路素材创作")
        .closest("a")
        ?.className,
    ).not.toContain("active");
    expect(
      screen
        .getByText("全链路素材创作")
        .closest("a")
        ?.getAttribute("href"),
    ).toBe(
      "/projects/project-1?workType=full-chain",
    );
  });

  it("switches work type without reloading the project page", () => {
    navigation.pathname = "/projects/project-1";
    navigation.workType = "full-chain";
    const pushState = vi.spyOn(
      window.history,
      "pushState",
    );

    render(<Sidebar />);
    fireEvent.click(
      screen.getByText("批量高光剪辑"),
    );

    expect(pushState).toHaveBeenCalledWith(
      null,
      "",
      "/projects/project-1?workType=batch-highlights",
    );
  });
});
