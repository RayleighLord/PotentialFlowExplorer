import { computeVelocityJacobian } from "./analysis";
import type { Bounds, FlowElement, FlowField, Guide, Point, StagnationPoint, StreamlineSeed } from "../types";
import { isPointBlocked } from "./domain";

const TAU = 2 * Math.PI;

export function generateAutoStreamlineSeeds(
  flowField: FlowField,
  elements: readonly FlowElement[],
  bounds: Bounds,
  guides: readonly Guide[],
  stagnationPoints: readonly StagnationPoint[] = [],
  maxCount = 80
): StreamlineSeed[] {
  const visibleElements = elements.filter((element) => element.visible);
  if (visibleElements.length === 0) {
    return [];
  }

  const span = Math.min(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin);
  const minSpacing = Math.max(span / 120, 0.06);
  const singularityBuffer = Math.max(span * 0.03, 0.08);
  const candidates = [
    ...createStagnationSeedCandidates(flowField, bounds, stagnationPoints),
    ...visibleElements.flatMap((element) => createElementSeedCandidates(element, bounds))
  ];
  const accepted = acceptSeedCandidates(
    candidates,
    flowField,
    bounds,
    guides,
    minSpacing,
    singularityBuffer,
    maxCount
  );

  return accepted.map((point, index) => ({
    id: `auto-seed-${index + 1}`,
    x: point.x,
    y: point.y
  }));
}

function createElementSeedCandidates(element: FlowElement, bounds: Bounds): Point[] {
  const span = Math.min(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin);

  switch (element.kind) {
    case "uniform":
      return createUniformSeeds(element.angleDeg, bounds, span);
    case "source":
    case "sink":
      return createSourceSinkSeeds(element.anchor, element.coreRadius, span, 14);
    case "doublet":
      return createDoubletSeeds(element.anchor, element.angleDeg, element.coreRadius, bounds, span);
    case "vortex":
      return createVortexSeeds(element.anchor, element.coreRadius, bounds, span);
    default:
      return assertNever(element);
  }
}

function createUniformSeeds(angleDeg: number, bounds: Bounds, span: number): Point[] {
  const direction = unitFromAngle(angleDeg);
  const normal = perpendicular(direction);
  const center = boundsCenter(bounds);
  const upstreamDistance = distanceToBounds(center, negate(direction), bounds) * 0.88;
  const origin = {
    x: center.x - direction.x * upstreamDistance,
    y: center.y - direction.y * upstreamDistance
  };
  const negativeSpan = distanceToBounds(origin, negate(normal), bounds) * 0.92;
  const positiveSpan = distanceToBounds(origin, normal, bounds) * 0.92;
  const totalCrossSpan = negativeSpan + positiveSpan;
  const count = countFromSpan(totalCrossSpan, Math.max(span * 0.07, 0.52), 13, 28);

  return createLineCandidates(origin, normal, -negativeSpan, positiveSpan, count);
}

function createSourceSinkSeeds(
  anchor: Point,
  coreRadius: number,
  span: number,
  count: number
): Point[] {
  const radius = Math.max(coreRadius * 6, span * 0.12);
  return createRingCandidates(anchor, radius, count);
}

function createDoubletSeeds(
  anchor: Point,
  angleDeg: number,
  coreRadius: number,
  bounds: Bounds,
  span: number
): Point[] {
  const axis = unitFromAngle(angleDeg);
  const radialDirection = perpendicular(axis);
  const maxRadius = Math.min(
    distanceToBounds(anchor, radialDirection, bounds),
    distanceToBounds(anchor, negate(radialDirection), bounds)
  ) * 0.88;
  const innerRadius = Math.max(coreRadius * 5, span * 0.07);
  const outerRadius = Math.max(innerRadius + span * 0.12, maxRadius);
  const countPerSide = countFromSpan(outerRadius - innerRadius, Math.max(span * 0.075, 0.48), 6, 14);

  return [
    ...createRadialCandidates(anchor, radialDirection, innerRadius, outerRadius, countPerSide),
    ...createRadialCandidates(anchor, negate(radialDirection), innerRadius, outerRadius, countPerSide)
  ];
}

function createVortexSeeds(
  anchor: Point,
  coreRadius: number,
  bounds: Bounds,
  span: number
): Point[] {
  const radialDirection = preferredRadialDirection(anchor, bounds);
  const innerRadius = Math.max(coreRadius * 4, span * 0.07);
  const outerRadius = Math.max(
    innerRadius + span * 0.18,
    distanceToBounds(anchor, radialDirection, bounds) * 0.9
  );
  const count = countFromSpan(outerRadius - innerRadius, Math.max(span * 0.075, 0.48), 7, 14);

  return createRadialCandidates(anchor, radialDirection, innerRadius, outerRadius, count);
}

function createStagnationSeedCandidates(
  flowField: FlowField,
  bounds: Bounds,
  stagnationPoints: readonly StagnationPoint[]
): Point[] {
  if (stagnationPoints.length === 0) {
    return [];
  }

  const span = Math.min(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin);
  const offset = clamp(span * 0.02, 0.06, 0.18);
  const candidates: Point[] = [];

  for (const point of stagnationPoints) {
    const jacobian = computeVelocityJacobian(flowField, point, bounds);
    if (!jacobian) {
      continue;
    }

    for (const direction of realEigenDirections(jacobian)) {
      candidates.push(
        {
          x: point.x + direction.x * offset,
          y: point.y + direction.y * offset
        },
        {
          x: point.x - direction.x * offset,
          y: point.y - direction.y * offset
        }
      );
    }
  }

  return candidates;
}

function createRingCandidates(center: Point, radius: number, count: number): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * TAU;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    });
  }
  return points;
}

function createLineCandidates(
  origin: Point,
  direction: Point,
  startOffset: number,
  endOffset: number,
  count: number
): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = interpolate(startOffset, endOffset, index / Math.max(count - 1, 1));
    points.push({
      x: origin.x + direction.x * offset,
      y: origin.y + direction.y * offset
    });
  }
  return points;
}

function createRadialCandidates(
  anchor: Point,
  direction: Point,
  innerRadius: number,
  outerRadius: number,
  count: number
): Point[] {
  const clampedOuter = Math.max(outerRadius, innerRadius);
  const points: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const radius = interpolate(innerRadius, clampedOuter, index / Math.max(count - 1, 1));
    points.push({
      x: anchor.x + direction.x * radius,
      y: anchor.y + direction.y * radius
    });
  }
  return points;
}

function acceptSeedCandidates(
  candidates: readonly Point[],
  flowField: FlowField,
  bounds: Bounds,
  guides: readonly Guide[],
  minSpacing: number,
  singularityBuffer: number,
  maxCount: number
): Point[] {
  const accepted: Point[] = [];

  for (const candidate of candidates) {
    if (!isInsideBounds(candidate, bounds)) {
      continue;
    }
    if (isPointBlocked(candidate, guides)) {
      continue;
    }
    if (flowField.distanceToNearestSingularity(candidate) < singularityBuffer) {
      continue;
    }

    const speed = flowField.velocityAt(candidate).speed;
    if (!Number.isFinite(speed) || speed < 1e-4) {
      continue;
    }

    if (accepted.some((existing) => distanceBetween(existing, candidate) < minSpacing)) {
      continue;
    }

    accepted.push(candidate);
    if (accepted.length >= maxCount) {
      break;
    }
  }

  return accepted;
}

function preferredRadialDirection(anchor: Point, bounds: Bounds): Point {
  const directions = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 }
  ];

  let bestDirection = directions[0];
  let bestDistance = -1;

  for (const direction of directions) {
    const distance = distanceToBounds(anchor, direction, bounds);
    if (distance > bestDistance) {
      bestDirection = direction;
      bestDistance = distance;
    }
  }

  return bestDirection;
}

function distanceToBounds(origin: Point, direction: Point, bounds: Bounds): number {
  const distances: number[] = [];

  if (Math.abs(direction.x) > 1e-10) {
    const txMin = (bounds.xMin - origin.x) / direction.x;
    const txMax = (bounds.xMax - origin.x) / direction.x;
    if (txMin > 0) {
      distances.push(txMin);
    }
    if (txMax > 0) {
      distances.push(txMax);
    }
  }

  if (Math.abs(direction.y) > 1e-10) {
    const tyMin = (bounds.yMin - origin.y) / direction.y;
    const tyMax = (bounds.yMax - origin.y) / direction.y;
    if (tyMin > 0) {
      distances.push(tyMin);
    }
    if (tyMax > 0) {
      distances.push(tyMax);
    }
  }

  return distances.length > 0 ? Math.min(...distances) : 0;
}

function boundsCenter(bounds: Bounds): Point {
  return {
    x: 0.5 * (bounds.xMin + bounds.xMax),
    y: 0.5 * (bounds.yMin + bounds.yMax)
  };
}

function unitFromAngle(angleDeg: number): Point {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: Math.cos(radians),
    y: Math.sin(radians)
  };
}

function perpendicular(vector: Point): Point {
  return {
    x: -vector.y,
    y: vector.x
  };
}

function negate(vector: Point): Point {
  return {
    x: -vector.x,
    y: -vector.y
  };
}

function isInsideBounds(point: Point, bounds: Bounds): boolean {
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

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function countFromSpan(span: number, targetSpacing: number, minCount: number, maxCount: number): number {
  if (!Number.isFinite(span) || span <= 0) {
    return minCount;
  }

  return clamp(Math.ceil(span / Math.max(targetSpacing, 1e-6)) + 1, minCount, maxCount);
}

function realEigenDirections(jacobian: {
  ux: number;
  uy: number;
  vx: number;
  vy: number;
}): Point[] {
  const trace = jacobian.ux + jacobian.vy;
  const determinant = jacobian.ux * jacobian.vy - jacobian.uy * jacobian.vx;
  const discriminant = trace * trace - 4 * determinant;

  if (!Number.isFinite(discriminant) || discriminant < 1e-12) {
    return [];
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const eigenvalues = [
    0.5 * (trace + sqrtDiscriminant),
    0.5 * (trace - sqrtDiscriminant)
  ];
  const directions = eigenvalues
    .map((eigenvalue) => eigenvectorForEigenvalue(jacobian, eigenvalue))
    .filter((vector): vector is Point => vector !== null);

  if (directions.length < 2) {
    return directions;
  }

  const uniqueDirections: Point[] = [];
  for (const direction of directions) {
    if (uniqueDirections.some((existing) => Math.abs(existing.x * direction.x + existing.y * direction.y) > 0.98)) {
      continue;
    }
    uniqueDirections.push(direction);
  }

  return uniqueDirections;
}

function eigenvectorForEigenvalue(
  jacobian: {
    ux: number;
    uy: number;
    vx: number;
    vy: number;
  },
  eigenvalue: number
): Point | null {
  let vector: Point | null = null;

  if (Math.abs(jacobian.uy) > Math.abs(jacobian.vx) && Math.abs(jacobian.uy) > 1e-10) {
    vector = {
      x: 1,
      y: -(jacobian.ux - eigenvalue) / jacobian.uy
    };
  } else if (Math.abs(jacobian.vx) > 1e-10) {
    vector = {
      x: -(jacobian.vy - eigenvalue) / jacobian.vx,
      y: 1
    };
  } else if (Math.abs(jacobian.ux - eigenvalue) > 1e-10) {
    vector = { x: -(jacobian.uy || 0), y: jacobian.ux - eigenvalue };
  } else if (Math.abs(jacobian.vy - eigenvalue) > 1e-10) {
    vector = { x: jacobian.vy - eigenvalue, y: -(jacobian.vx || 0) };
  }

  if (!vector) {
    return null;
  }

  const norm = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(norm) || norm < 1e-12) {
    return null;
  }

  return {
    x: vector.x / norm,
    y: vector.y / norm
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
