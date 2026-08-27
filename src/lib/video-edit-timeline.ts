export type VideoEditSegment = {
  id: string;
  start: number;
  end: number;
  sourceId?: string;
  sourceUrl?: string;
  sourceName?: string;
};

const precision = (value: number) =>
  Number(value.toFixed(3));

export function createTimeline(
  duration: number,
  source?: {
    id: string;
    url: string;
    name: string;
  },
): VideoEditSegment[] {
  const safeDuration = Math.max(0, precision(duration));
  return safeDuration
    ? [{
        id: source ? `segment-${source.id}` : "segment-1",
        start: 0,
        end: safeDuration,
        sourceId: source?.id,
        sourceUrl: source?.url,
        sourceName: source?.name,
      }]
    : [];
}

export function createMultiSourceTimeline(
  sources: Array<{
    id: string;
    url: string;
    name: string;
    duration: number;
  }>,
) {
  return sources.flatMap((source) =>
    createTimeline(source.duration, source),
  );
}

export function splitTimelineAt(
  segments: VideoEditSegment[],
  time: number,
) {
  const point = precision(time);
  const index = segments.findIndex(
    (segment) =>
      point > segment.start + 0.05 &&
      point < segment.end - 0.05,
  );
  if (index < 0) return segments;
  const source = segments[index];
  return [
    ...segments.slice(0, index),
    {
      id: `${source.id}-a-${point}`,
      start: source.start,
      end: point,
      sourceId: source.sourceId,
      sourceUrl: source.sourceUrl,
      sourceName: source.sourceName,
    },
    {
      id: `${source.id}-b-${point}`,
      start: point,
      end: source.end,
      sourceId: source.sourceId,
      sourceUrl: source.sourceUrl,
      sourceName: source.sourceName,
    },
    ...segments.slice(index + 1),
  ];
}

export function timelineSegmentAt(
  segments: VideoEditSegment[],
  time: number,
) {
  const point = Math.max(0, precision(time));
  let offset = 0;
  for (const [index, segment] of segments.entries()) {
    const segmentDuration = segment.end - segment.start;
    if (
      point < offset + segmentDuration ||
      index === segments.length - 1
    ) {
      return {
        segment,
        offset,
        sourceTime: precision(
          segment.start + Math.max(0, point - offset),
        ),
      };
    }
    offset += segmentDuration;
  }
  const segment = segments.at(-1);
  return segment
    ? {
        segment,
        offset: Math.max(0, offset - (segment.end - segment.start)),
        sourceTime: segment.end,
      }
    : undefined;
}

export function splitTimelineAtPosition(
  segments: VideoEditSegment[],
  time: number,
) {
  const target = timelineSegmentAt(segments, time);
  if (!target) return segments;
  const point = target.sourceTime;
  const index = segments.findIndex(
    (segment) => segment.id === target.segment.id,
  );
  if (
    index < 0 ||
    point <= target.segment.start + 0.05 ||
    point >= target.segment.end - 0.05
  ) {
    return segments;
  }
  return [
    ...segments.slice(0, index),
    {
      ...target.segment,
      id: `${target.segment.id}-a-${point}`,
      end: point,
    },
    {
      ...target.segment,
      id: `${target.segment.id}-b-${point}`,
      start: point,
    },
    ...segments.slice(index + 1),
  ];
}

export function timelineOffsetForSegment(
  segments: VideoEditSegment[],
  segmentId: string,
) {
  let offset = 0;
  for (const segment of segments) {
    if (segment.id === segmentId) return precision(offset);
    offset += segment.end - segment.start;
  }
  return 0;
}

export function deleteTimelineSegment(
  segments: VideoEditSegment[],
  segmentId: string,
) {
  if (segments.length <= 1) return segments;
  return segments.filter(
    (segment) => segment.id !== segmentId,
  );
}

export function timelineDuration(
  segments: VideoEditSegment[],
) {
  return precision(
    segments.reduce(
      (total, segment) =>
        total + segment.end - segment.start,
      0,
    ),
  );
}

export function timelineTrimRequests(
  segments: VideoEditSegment[],
) {
  return segments.map((segment) => ({
    segmentId: segment.id,
    startTime: segment.start,
    endTime: segment.end,
    ...(segment.sourceUrl
      ? { sourceUrl: segment.sourceUrl }
      : {}),
  }));
}
