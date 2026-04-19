import type { Bounds, FieldStats, FlowField, Point, StagnationPoint } from "../types";

interface SampleSpeedOptions {
  columns?: number;
  rows?: number;
  singularityExclusionRadius?: number;
}

interface StagnationSearchOptions {
  gridSize?: number;
  tolerance?: number;
  maxIterations?: number;
  dedupeTolerance?: number;
  singularityExclusionRadius?: number;
}

export function computeFieldStats(
  flowField: FlowField,
  bounds: Bounds,
  options: SampleSpeedOptions = {}
): FieldStats {
  const columns = options.columns ?? 44;
  const rows = options.rows ?? 28;
  const singularityExclusionRadius =
    options.singularityExclusionRadius ?? Math.min(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin) * 0.035;

  const speeds: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    const y = interpolate(bounds.yMax, bounds.yMin, row / Math.max(rows - 1, 1));
    for (let column = 0; column < columns; column += 1) {
      const x = interpolate(bounds.xMin, bounds.xMax, column / Math.max(columns - 1, 1));
      if (flowField.distanceToNearestSingularity({ x, y }) < singularityExclusionRadius) {
        continue;
      }
      const speed = flowField.velocityAt({ x, y }).speed;
      if (Number.isFinite(speed)) {
        speeds.push(speed);
      }
    }
  }

  speeds.sort((left, right) => left - right);

  return {
    sampledSpeedMax: speeds.length > 0 ? speeds[speeds.length - 1] : 0,
    sampledSpeedReference: quantile(speeds, 0.9) || quantile(speeds, 0.75) || 1,
    sampleCount: speeds.length
  } satisfies FieldStats;
}

export function findStagnationPoints(
  flowField: FlowField,
  bounds: Bounds,
  options: StagnationSearchOptions = {}
): StagnationPoint[] {
  if (flowField.elements.length === 0) {
    return [];
  }

  const gridSize = options.gridSize ?? 11;
  const tolerance = options.tolerance ?? 1e-5;
  const maxIterations = options.maxIterations ?? 22;
  const dedupeTolerance =
    options.dedupeTolerance ?? Math.min(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin) * 0.02;
  const singularityExclusionRadius =
    options.singularityExclusionRadius ?? Math.min(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin) * 0.05;

  const candidates: StagnationPoint[] = [];
  const xStep = (bounds.xMax - bounds.xMin) / Math.max(gridSize - 1, 1);
  const yStep = (bounds.yMax - bounds.yMin) / Math.max(gridSize - 1, 1);

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const seed = {
        x: bounds.xMin + column * xStep,
        y: bounds.yMin + row * yStep
      };

      const speed = flowField.velocityAt(seed).speed;
      if (!Number.isFinite(speed)) {
        continue;
      }

      if (flowField.distanceToNearestSingularity(seed) < singularityExclusionRadius) {
        continue;
      }

      const candidate = refineStagnationPoint(
        flowField,
        bounds,
        seed,
        tolerance,
        maxIterations,
        singularityExclusionRadius
      );

      if (!candidate) {
        continue;
      }

      if (!isPointInsideBounds(candidate, bounds)) {
        continue;
      }

      if (candidates.some((existing) => distanceBetween(existing, candidate) <= dedupeTolerance)) {
        continue;
      }

      candidates.push(candidate);
    }
  }

  return candidates.sort((left, right) => left.residual - right.residual || distanceToCenter(left, bounds) - distanceToCenter(right, bounds));
}

export function computeVelocityJacobian(
  flowField: FlowField,
  point: Point,
  bounds: Bounds
): { ux: number; uy: number; vx: number; vy: number } | null {
  const spanX = bounds.xMax - bounds.xMin;
  const spanY = bounds.yMax - bounds.yMin;
  const stepX = Math.max(Math.abs(point.x) * 1e-4, spanX * 8e-5, 1e-5);
  const stepY = Math.max(Math.abs(point.y) * 1e-4, spanY * 8e-5, 1e-5);

  const left = flowField.velocityAt({ x: point.x - stepX, y: point.y });
  const right = flowField.velocityAt({ x: point.x + stepX, y: point.y });
  const down = flowField.velocityAt({ x: point.x, y: point.y - stepY });
  const up = flowField.velocityAt({ x: point.x, y: point.y + stepY });

  if (![left.u, right.u, down.u, up.u, left.v, right.v, down.v, up.v].every(Number.isFinite)) {
    return null;
  }

  return {
    ux: (right.u - left.u) / (2 * stepX),
    uy: (up.u - down.u) / (2 * stepY),
    vx: (right.v - left.v) / (2 * stepX),
    vy: (up.v - down.v) / (2 * stepY)
  };
}

function refineStagnationPoint(
  flowField: FlowField,
  bounds: Bounds,
  seed: Point,
  tolerance: number,
  maxIterations: number,
  singularityExclusionRadius: number
): StagnationPoint | null {
  let current = { ...seed };

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (flowField.distanceToNearestSingularity(current) < singularityExclusionRadius) {
      return null;
    }

    const value = flowField.velocityAt(current);
    const residual = value.speed;

    if (!Number.isFinite(residual)) {
      return null;
    }

    if (residual <= tolerance) {
      return {
        ...current,
        residual
      };
    }

    const jacobian = computeVelocityJacobian(flowField, current, bounds);
    if (!jacobian) {
      return null;
    }

    const step = solveLinearSystem(jacobian, value.u, value.v);
    if (!step) {
      return null;
    }

    current = {
      x: current.x + step.x,
      y: current.y + step.y
    };

    if (!Number.isFinite(current.x) || !Number.isFinite(current.y)) {
      return null;
    }
  }

  const terminal = flowField.velocityAt(current);
  if (!Number.isFinite(terminal.speed) || terminal.speed > tolerance * 4) {
    return null;
  }

  return {
    ...current,
    residual: terminal.speed
  };
}

function solveLinearSystem(
  jacobian: { ux: number; uy: number; vx: number; vy: number },
  u: number,
  v: number
): Point | null {
  const determinant = jacobian.ux * jacobian.vy - jacobian.uy * jacobian.vx;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-11) {
    return null;
  }

  return {
    x: (-u * jacobian.vy + jacobian.uy * v) / determinant,
    y: (jacobian.vx * u - jacobian.ux * v) / determinant
  };
}

function isPointInsideBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.xMin &&
    point.x <= bounds.xMax &&
    point.y >= bounds.yMin &&
    point.y <= bounds.yMax
  );
}

function distanceBetween(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function distanceToCenter(point: Point, bounds: Bounds): number {
  const cx = 0.5 * (bounds.xMin + bounds.xMax);
  const cy = 0.5 * (bounds.yMin + bounds.yMax);
  return Math.hypot(point.x - cx, point.y - cy);
}

function quantile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const index = (values.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return values[lower];
  }

  const fraction = index - lower;
  return values[lower] * (1 - fraction) + values[upper] * fraction;
}

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}
