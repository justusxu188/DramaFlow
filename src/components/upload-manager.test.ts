// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  episodeNumberFromFileName,
  sourceVideoFiles,
  uploadAssetName,
  uploadFilesForTarget,
  uploadMimeType,
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

  it("filters files according to the selected asset folder", () => {
    const video = new File(["video"], "高光.mp4", {
      type: "video/mp4",
    });
    const image = new File(["image"], "林晚.png", {
      type: "image/png",
    });
    const text = new File(["text"], "说明.txt", {
      type: "text/plain",
    });

    expect(
      uploadFilesForTarget(
        [video, image, text],
        "source",
      ).map((file) => file.name),
    ).toEqual(["高光.mp4"]);
    expect(
      uploadFilesForTarget(
        [video, image, text],
        "highlight",
      ).map((file) => file.name),
    ).toEqual(["高光.mp4"]);
    expect(
      uploadFilesForTarget(
        [video, image, text],
        "character_image",
      ).map((file) => file.name),
    ).toEqual(["林晚.png"]);
  });

  it("uses the established upload naming for each asset folder", () => {
    const video = new File(["video"], "高光片段.mp4", {
      type: "video/mp4",
    });
    const image = new File(["image"], "林晚.png", {
      type: "image/png",
    });

    expect(uploadAssetName(video, "source")).toBe(
      "高光片段.mp4",
    );
    expect(uploadAssetName(video, "highlight")).toBe(
      "高光片段.mp4",
    );
    expect(
      uploadAssetName(image, "character_image"),
    ).toBe("林晚-上传图片");
  });

  it("infers MIME types when dropped files omit them", () => {
    expect(
      uploadMimeType(new File(["image"], "角色.PNG")),
    ).toBe("image/png");
    expect(
      uploadMimeType(new File(["video"], "片段.mov")),
    ).toBe("video/quicktime");
  });
});
