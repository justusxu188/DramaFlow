// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  episodeNumberFromFileName,
  sourceVideoFiles,
} from "./upload-manager";

describe("background source uploads", () => {
  it("infers episode numbers from file names", () => {
    expect(
      episodeNumberFromFileName(
        "短剧_第023集.mp4",
        1,
      ),
    ).toBe(23);
    expect(
      episodeNumberFromFileName(
        "无编号片段.mov",
        7,
      ),
    ).toBe(7);
  });

  it("keeps unique MP4 and MOV files only", () => {
    const first = new File(["a"], "01.mp4", {
      type: "video/mp4",
      lastModified: 1,
    });
    const duplicate = new File(["a"], "01.mp4", {
      type: "video/mp4",
      lastModified: 1,
    });
    const mov = new File(["b"], "02.mov", {
      type: "",
      lastModified: 2,
    });
    const text = new File(["c"], "readme.txt", {
      type: "text/plain",
    });

    expect(
      sourceVideoFiles([
        first,
        duplicate,
        mov,
        text,
      ]).map((file) => file.name),
    ).toEqual(["01.mp4", "02.mov"]);
  });
});
