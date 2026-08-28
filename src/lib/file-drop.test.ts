// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { filesFromDataTransfer } from "./file-drop";

type TestEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file?: (
    success: (file: File) => void,
    failure?: (error: DOMException) => void,
  ) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: TestEntry[]) => void,
      failure?: (error: DOMException) => void,
    ) => void;
  };
};

function fileEntry(file: File): TestEntry {
  return {
    isFile: true,
    isDirectory: false,
    file: (success) => success(file),
  };
}

function directoryEntry(
  batches: TestEntry[][],
): TestEntry {
  return {
    isFile: false,
    isDirectory: true,
    createReader: () => ({
      readEntries: (success) =>
        success(batches.shift() ?? []),
    }),
  };
}

describe("folder drag and drop", () => {
  it("recursively collects files from dropped folders", async () => {
    const first = new File(["a"], "01.mp4", {
      type: "video/mp4",
    });
    const second = new File(["b"], "02.mp4", {
      type: "video/mp4",
    });
    const nested = directoryEntry([
      [fileEntry(second)],
      [],
    ]);
    const root = directoryEntry([
      [fileEntry(first), nested],
      [],
    ]);

    const files = await filesFromDataTransfer({
      items: [
        {
          webkitGetAsEntry: () => root,
        },
      ],
      files: [],
    });

    expect(files.map((file) => file.name)).toEqual([
      "01.mp4",
      "02.mp4",
    ]);
  });

  it("falls back to the dropped file list", async () => {
    const image = new File(["image"], "角色.png", {
      type: "image/png",
    });

    await expect(
      filesFromDataTransfer({
        items: [],
        files: [image],
      }),
    ).resolves.toEqual([image]);
  });
});
