import type { Bounds, Point, ViewState } from "../types";

export interface Viewport {
  width: number;
  height: number;
  dpr: number;
  worldWidth: number;
  worldHeight: number;
  bounds: Bounds;
  pixelsPerUnit: number;
  unitsPerPixel: number;
}

export function createViewport(
  width: number,
  height: number,
  dpr: number,
  viewState: ViewState
): Viewport {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const aspect = safeWidth / safeHeight;
  const worldHeight = Math.max(viewState.worldHeight, 0.1);
  const worldWidth = worldHeight * aspect;
  const bounds = {
    xMin: viewState.center.x - worldWidth / 2,
    xMax: viewState.center.x + worldWidth / 2,
    yMin: viewState.center.y - worldHeight / 2,
    yMax: viewState.center.y + worldHeight / 2
  } satisfies Bounds;

  return {
    width: safeWidth,
    height: safeHeight,
    dpr,
    worldWidth,
    worldHeight,
    bounds,
    pixelsPerUnit: safeHeight / worldHeight,
    unitsPerPixel: worldHeight / safeHeight
  };
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: ((point.x - viewport.bounds.xMin) / viewport.worldWidth) * viewport.width,
    y: ((viewport.bounds.yMax - point.y) / viewport.worldHeight) * viewport.height
  };
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: viewport.bounds.xMin + (point.x / viewport.width) * viewport.worldWidth,
    y: viewport.bounds.yMax - (point.y / viewport.height) * viewport.worldHeight
  };
}

export function niceGridStep(bounds: Bounds, targetLineCount = 10): number {
  const span = Math.min(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin);
  const rawStep = span / Math.max(targetLineCount, 2);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }
  if (normalized <= 2) {
    return 2 * magnitude;
  }
  if (normalized <= 5) {
    return 5 * magnitude;
  }
  return 10 * magnitude;
}

export function snapPointToGrid(point: Point, step: number): Point {
  if (!Number.isFinite(step) || step <= 0) {
    return { ...point };
  }

  return {
    x: Math.round(point.x / step) * step,
    y: Math.round(point.y / step) * step
  };
}
