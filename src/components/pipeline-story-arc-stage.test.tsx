// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PipelineStoryArcStage } from "./pipeline-story-arc-stage";

afterEach(cleanup);

describe("PipelineStoryArcStage", () => {
  it("keeps a retry action visible for every failed story arc task", async () => {
    const user = userEvent.setup();
    const onRetryFailed = vi.fn();

    render(
      <PipelineStoryArcStage
        arcs={[]}
        failedCount={2}
        onRetryFailed={onRetryFailed}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "重试失败任务（2）",
      }),
    );

    expect(onRetryFailed).toHaveBeenCalledOnce();
    expect(
      screen.getByText("爽点故事线生成失败，请重试失败任务。"),
    ).toBeTruthy();
  });
});
