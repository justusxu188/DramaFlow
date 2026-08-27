import { describe, expect, it } from "vitest";
import {
  clipSubtitlesToRanges,
  complementTimeRanges,
  normalizeTimeRanges,
} from "@/lib/subtitle-post-production";

describe("subtitle time ranges", () => {
  it("normalizes, clamps, sorts and merges overlapping ranges", () => {
    expect(
      normalizeTimeRanges(
        [
          { startTime: 8, endTime: 15 },
          { startTime: -2, endTime: 3 },
          { startTime: 2.5, endTime: 6 },
          { startTime: 9, endTime: 9 },
        ],
        12,
      ),
    ).toEqual([
      { startTime: 0, endTime: 6 },
      { startTime: 8, endTime: 12 },
    ]);
  });

  it("calculates the effective range for exclusion mode", () => {
    expect(
      complementTimeRanges(
        [
          { startTime: 2, endTime: 4 },
          { startTime: 7, endTime: 8 },
        ],
        10,
      ),
    ).toEqual([
      { startTime: 0, endTime: 2 },
      { startTime: 4, endTime: 7 },
      { startTime: 8, endTime: 10 },
    ]);
  });

  it("clips recognized subtitles to partial erase ranges", () => {
    expect(
      clipSubtitlesToRanges(
        [
          {
            id: "subtitle-1",
            subtitleText: "跨越边界",
            startTime: 1,
            endTime: 4,
          },
          {
            id: "subtitle-2",
            subtitleText: "不在范围",
            startTime: 6,
            endTime: 7,
          },
        ],
        [{ startTime: 2, endTime: 3 }],
      ),
    ).toEqual([
      {
        id: "subtitle-1-range-1",
        subtitleText: "跨越边界",
        startTime: 2,
        endTime: 3,
      },
    ]);
  });
});
