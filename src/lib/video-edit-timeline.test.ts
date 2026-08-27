import { describe, expect, it } from "vitest";
import {
  createMultiSourceTimeline,
  createTimeline,
  deleteTimelineSegment,
  splitTimelineAt,
  splitTimelineAtPosition,
  timelineDuration,
  timelineSegmentAt,
  timelineTrimRequests,
} from "./video-edit-timeline";

describe("video edit timeline", () => {
  it("supports multiple non-destructive split points", () => {
    const first = splitTimelineAt(
      createTimeline(30),
      8,
    );
    const second = splitTimelineAt(first, 21.5);

    expect(second.map(({ start, end }) => ({
      start,
      end,
    }))).toEqual([
      { start: 0, end: 8 },
      { start: 8, end: 21.5 },
      { start: 21.5, end: 30 },
    ]);
  });

  it("deletes selected sections and keeps ordered trim requests", () => {
    const split = splitTimelineAt(
      splitTimelineAt(createTimeline(30), 8),
      21.5,
    );
    const retained = deleteTimelineSegment(
      split,
      split[1].id,
    );

    expect(timelineDuration(retained)).toBe(16.5);
    expect(timelineTrimRequests(retained)).toEqual([
      {
        segmentId: split[0].id,
        startTime: 0,
        endTime: 8,
      },
      {
        segmentId: split[2].id,
        startTime: 21.5,
        endTime: 30,
      },
    ]);
  });

  it("never deletes the only remaining segment", () => {
    const timeline = createTimeline(12);
    expect(
      deleteTimelineSegment(
        timeline,
        timeline[0].id,
      ),
    ).toEqual(timeline);
  });

  it("splits and exports multiple source videos in track order", () => {
    const timeline = createMultiSourceTimeline([
      {
        id: "asset-1",
        name: "第一段",
        url: "https://example.com/1.mp4",
        duration: 30,
      },
      {
        id: "asset-2",
        name: "第二段",
        url: "https://example.com/2.mp4",
        duration: 20,
      },
    ]);
    const split = splitTimelineAtPosition(timeline, 35);

    expect(timelineSegmentAt(split, 35)).toMatchObject({
      segment: {
        sourceId: "asset-2",
        sourceName: "第二段",
      },
      sourceTime: 5,
    });
    expect(timelineTrimRequests(split)).toEqual([
      {
        segmentId: "segment-asset-1",
        startTime: 0,
        endTime: 30,
        sourceUrl: "https://example.com/1.mp4",
      },
      {
        segmentId: "segment-asset-2-a-5",
        startTime: 0,
        endTime: 5,
        sourceUrl: "https://example.com/2.mp4",
      },
      {
        segmentId: "segment-asset-2-b-5",
        startTime: 5,
        endTime: 20,
        sourceUrl: "https://example.com/2.mp4",
      },
    ]);
  });
});
