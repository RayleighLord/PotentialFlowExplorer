import type { Bounds, Point, Streamline } from "../types";

export interface StreamlineScreenSelectionOptions {
  widthPx: number;
  heightPx: number;
  spacingPx: number;
  sampleStepPx?: number;
  overlapRatioThreshold?: number;
  minUncoveredSamples?: number;
}

interface ScreenSample extends Point {}

// Greedily keep only streamlines that add visible screen-space coverage. This gives the
// equispaced look the current app already has, while naturally merging crowded lines when
// zooming out and revealing additional detail when zooming in.
export function selectScreenSpaceStreamlines(
  candidates: readonly Streamline[],
  bounds: Bounds,
  options: StreamlineScreenSelectionOptions
): Streamline[] {
  const widthPx = Math.max(Math.round(options.widthPx), 1);
  const heightPx = Math.max(Math.round(options.heightPx), 1);
  const spacingPx = clamp(options.spacingPx, 18, 140);
  const sampleStepPx = Math.max(options.sampleStepPx ?? spacingPx * 0.42, 5);
  const searchRadiusPx = Math.max(spacingPx * 0.84, 10);
  const overlapRatioThreshold = clamp(options.overlapRatioThreshold ?? 0.8, 0.35, 0.96);
  const minUncoveredSamples = Math.max(options.minUncoveredSamples ?? 2, 1);
  const minVisibleSamples = Math.max(Math.ceil(spacingPx / sampleStepPx), 3);
  const grid = new SampleSpatialHash(Math.max(searchRadiusPx * 0.58, 8));
  const accepted: Streamline[] = [];

  for (const candidate of candidates) {
    const samples = sampleVisiblePolyline(candidate.points, bounds, widthPx, heightPx, sampleStepPx, searchRadiusPx);
    if (samples.length < minVisibleSamples) {
      continue;
    }

    let overlapCount = 0;
    for (const sample of samples) {
      if (grid.hasNeighbor(sample, searchRadiusPx)) {
        overlapCount += 1;
      }
    }

    const uncoveredCount = samples.length - overlapCount;
    const uncoveredRatio = uncoveredCount / Math.max(samples.length, 1);
    const uncoveredLengthPx = uncoveredCount * sampleStepPx;

    if (
      accepted.length > 0 &&
      uncoveredCount < minUncoveredSamples &&
      overlapCount / Math.max(samples.length, 1) >= overlapRatioThreshold
    ) {
      continue;
    }

    if (
      accepted.length > 0 &&
      uncoveredRatio < 1 - overlapRatioThreshold &&
      uncoveredLengthPx < spacingPx * 0.95
    ) {
      continue;
    }

    accepted.push(candidate);
    for (const sample of samples) {
      grid.insert(sample);
    }
  }

  return accepted;
}

function sampleVisiblePolyline(
  points: readonly Point[],
  bounds: Bounds,
  widthPx: number,
  heightPx: number,
  sampleStepPx: number,
  marginPx: number
): ScreenSample[] {
  const samples: ScreenSample[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const start = worldToScreen(points[index - 1], bounds, widthPx, heightPx);
    const end = worldToScreen(points[index], bounds, widthPx, heightPx);
    const segmentLengthPx = Math.hypot(end.x - start.x, end.y - start.y);

    if (!Number.isFinite(segmentLengthPx) || segmentLengthPx < 1e-6) {
      continue;
    }

    const steps = Math.max(1, Math.ceil(segmentLengthPx / sampleStepPx));
    const startStep = index === 1 ? 0 : 1;

    for (let step = startStep; step <= steps; step += 1) {
      const t = step / steps;
      const sample = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t
      } satisfies ScreenSample;

      if (isInsideExpandedScreen(sample, widthPx, heightPx, marginPx)) {
        samples.push(sample);
      }
    }
  }

  return samples;
}

function worldToScreen(point: Point, bounds: Bounds, widthPx: number, heightPx: number): ScreenSample {
  const width = bounds.xMax - bounds.xMin;
  const height = bounds.yMax - bounds.yMin;

  return {
    x: ((point.x - bounds.xMin) / width) * widthPx,
    y: ((bounds.yMax - point.y) / height) * heightPx
  } satisfies ScreenSample;
}

function isInsideExpandedScreen(point: ScreenSample, widthPx: number, heightPx: number, marginPx: number): boolean {
  return (
    point.x >= -marginPx &&
    point.x <= widthPx + marginPx &&
    point.y >= -marginPx &&
    point.y <= heightPx + marginPx
  );
}

class SampleSpatialHash {
  private readonly buckets = new Map<string, ScreenSample[]>();

  constructor(private readonly cellSize: number) {}

  insert(point: ScreenSample): void {
    const key = this.keyFor(point);
    const bucket = this.buckets.get(key);
    if (bucket) {
      bucket.push(point);
      return;
    }
    this.buckets.set(key, [point]);
  }

  hasNeighbor(point: ScreenSample, radius: number): boolean {
    const cellX = Math.floor(point.x / this.cellSize);
    const cellY = Math.floor(point.y / this.cellSize);
    const searchRadiusCells = Math.max(1, Math.ceil(radius / this.cellSize));
    const radiusSquared = radius * radius;

    for (let dy = -searchRadiusCells; dy <= searchRadiusCells; dy += 1) {
      for (let dx = -searchRadiusCells; dx <= searchRadiusCells; dx += 1) {
        const bucket = this.buckets.get(`${cellX + dx}:${cellY + dy}`);
        if (!bucket) {
          continue;
        }

        for (const other of bucket) {
          const distanceSquared = (other.x - point.x) ** 2 + (other.y - point.y) ** 2;
          if (distanceSquared <= radiusSquared) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private keyFor(point: ScreenSample): string {
    return `${Math.floor(point.x / this.cellSize)}:${Math.floor(point.y / this.cellSize)}`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
