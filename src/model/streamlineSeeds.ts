import { computeVelocityJacobian } from "./analysis";
import { isPointBlocked } from "./domain";
import type { Bounds, FlowElement, FlowField, Guide, Point, StagnationPoint, StreamlineSeed } from "../types";

const TAU = 2 * Math.PI;
const STREAMLINE_DENSITY_MULTIPLIER = 2;
const UNIFORM_MINOR_GRID_BLOCKS_PER_STREAMLINE = 1.5;

export function generateAutoStreamlineSeeds(
  flowField: FlowField,
  elements: readonly FlowElement[],
  bounds: Bounds,
  guides: readonly Guide[],
  stagnationPoints: readonly StagnationPoint[] = [],
  maxCount = 240
): StreamlineSeed[] {
  const visibleElements = elements.filter((element) => element.visible);
  if (visibleElements.length === 0) {
    return [];
  }

  const span = Math.min(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin);
  const minSpacing = Math.max(span / (120 * STREAMLINE_DENSITY_MULTIPLIER), 0.025);
  const singularityBuffer = Math.max(span * 0.016, 0.05);
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
      return createSourceSinkSeeds(element.anchor, element.coreRadius, span);
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
  const spacing = (majorGridStep(bounds) / 6) * UNIFORM_MINOR_GRID_BLOCKS_PER_STREAMLINE;

  if (isCardinalAngle(angleDeg)) {
    const center = boundsCenter(bounds);
    const upstreamDistance = distanceToBounds(center, negate(direction), bounds) * 0.88;
    const origin = {
      x: center.x - direction.x * upstreamDistance,
      y: center.y - direction.y * upstreamDistance
    };
    const rawNegativeSpan = distanceToBounds(origin, negate(normal), bounds);
    const rawPositiveSpan = distanceToBounds(origin, normal, bounds);

    return createGridAlignedLineCandidates(origin, normal, rawNegativeSpan, rawPositiveSpan, spacing);
  }

  return createProjectedUniformLineCandidates(bounds, normal, spacing);
}

function createSourceSinkSeeds(anchor: Point, coreRadius: number, span: number): Point[] {
  const radius = Math.max(coreRadius * 2.2, span * 0.04);
  const circumference = TAU * radius;
  const count = countFromSpan(
    circumference,
    Math.max(span * 0.06, 0.45) / STREAMLINE_DENSITY_MULTIPLIER,
    28,
    80
  );
  return createBalancedRingCandidates(anchor, radius, count);
}

function createDoubletSeeds(
  anchor: Point,
  angleDeg: number,
  coreRadius: number,
  bounds: Bounds,
  span: number
): Point[] {
  const axis = unitFromAngle(angleDeg);
  const normal = perpendicular(axis);
  const innerRadius = Math.max(coreRadius * 2.1, span * 0.04);
  const sideTargetSpacing = Math.max(span * 0.07, 0.45) / STREAMLINE_DENSITY_MULTIPLIER;
  const referenceCenter = boundsCenter(bounds);
  const referenceRadialSpacing = centeredReferenceSpacing(
    bounds,
    referenceCenter,
    normal,
    innerRadius,
    sideTargetSpacing,
    16,
    36,
    0.96
  );
  const topDistance = distanceToBounds(anchor, normal, bounds);
  const bottomDistance = distanceToBounds(anchor, negate(normal), bounds);
  const topOuter = topDistance * 0.96;
  const bottomOuter = bottomDistance * 0.96;
  const top = createFixedSpacingRadialCandidates(anchor, normal, innerRadius, topOuter, referenceRadialSpacing);
  const bottom = createFixedSpacingRadialCandidates(anchor, negate(normal), innerRadius, bottomOuter, referenceRadialSpacing);
  const axisAngle = Math.atan2(axis.y, axis.x);
  const axisDistance = distanceToBounds(anchor, axis, bounds);
  const oppositeAxisDistance = distanceToBounds(anchor, negate(axis), bounds);
  const sideArcHalfSpan = (56 * Math.PI) / 180;
  const sideArcTargetSpacing = Math.max(span * 0.14, 0.9) / STREAMLINE_DENSITY_MULTIPLIER;
  const referenceArcRadius = largeRadiusForDoubletSideArc(
    distanceToBounds(referenceCenter, axis, bounds),
    innerRadius,
    span
  );
  const referenceArcSpacing = referenceSpacingFromSpan(
    referenceArcRadius * sideArcHalfSpan * 2,
    sideArcTargetSpacing,
    8,
    18
  );
  const rightArcRadius = largeRadiusForDoubletSideArc(axisDistance, innerRadius, span);
  const leftArcRadius = largeRadiusForDoubletSideArc(oppositeAxisDistance, innerRadius, span);
  const rightArc = createBalancedArcCandidates(
    anchor,
    axisAngle,
    rightArcRadius,
    sideArcHalfSpan,
    countFromReferenceSpacing(rightArcRadius * sideArcHalfSpan * 2, referenceArcSpacing, 18),
    0,
    true,
    referenceArcSpacing
  );
  const leftArc = createBalancedArcCandidates(
    anchor,
    axisAngle + Math.PI,
    leftArcRadius,
    sideArcHalfSpan,
    countFromReferenceSpacing(leftArcRadius * sideArcHalfSpan * 2, referenceArcSpacing, 18),
    0.5,
    true,
    referenceArcSpacing
  );

  return [
    ...interleavePoints(top, bottom),
    ...interleavePoints(rightArc, leftArc)
  ];
}

function createVortexSeeds(
  anchor: Point,
  coreRadius: number,
  bounds: Bounds,
  span: number
): Point[] {
  const innerRadius = Math.max(coreRadius * 2, span * 0.04);
  const referenceCenter = boundsCenter(bounds);
  const targetSpacing = Math.max(span * 0.07, 0.45) / STREAMLINE_DENSITY_MULTIPLIER;
  const referenceOuterRadius = Math.max(
    innerRadius + span * 0.18,
    distanceToBounds(referenceCenter, { x: 1, y: 0 }, bounds) * 0.995
  );
  const referenceRadialSpacing = referenceSpacingFromSpan(
    referenceOuterRadius - innerRadius,
    targetSpacing,
    16,
    36
  );
  const rightOuterRadius = Math.max(
    innerRadius + span * 0.18,
    distanceToBounds(anchor, { x: 1, y: 0 }, bounds) * 0.995
  );
  const leftOuterRadius = Math.max(
    innerRadius + span * 0.18,
    distanceToBounds(anchor, { x: -1, y: 0 }, bounds) * 0.995
  );
  return interleavePoints(
    createFixedSpacingRadialCandidates(anchor, { x: 1, y: 0 }, innerRadius, rightOuterRadius, referenceRadialSpacing),
    createFixedSpacingRadialCandidates(anchor, { x: -1, y: 0 }, innerRadius, leftOuterRadius, referenceRadialSpacing)
  );
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
  const offset = clamp(span * 0.018, 0.05, 0.15);
  const candidates: Point[] = [];

  for (const point of stagnationPoints) {
    const jacobian = computeVelocityJacobian(flowField, point, bounds);
    if (!jacobian) {
      continue;
    }

    for (const direction of realEigenDirections(jacobian)) {
      candidates.push(
        { x: point.x + direction.x * offset, y: point.y + direction.y * offset },
        { x: point.x - direction.x * offset, y: point.y - direction.y * offset }
      );
    }
  }

  return candidates;
}

function createBalancedRingCandidates(center: Point, radius: number, count: number): Point[] {
  const orderedIndices = spreadOrderIndices(count);
  return orderedIndices.map((index) => {
    const angle = (index / count) * TAU;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    };
  });
}

function createBalancedLineCandidates(
  origin: Point,
  direction: Point,
  startOffset: number,
  endOffset: number,
  count: number
): Point[] {
  const offsets = Array.from({ length: count }, (_, index) =>
    interpolate(startOffset, endOffset, index / Math.max(count - 1, 1))
  );

  return centerOutIndices(count).map((index) => ({
    x: origin.x + direction.x * offsets[index],
    y: origin.y + direction.y * offsets[index]
  }));
}

function createGridAlignedLineCandidates(
  origin: Point,
  direction: Point,
  negativeSpan: number,
  positiveSpan: number,
  spacing: number
): Point[] {
  return centeredGridOffsets(negativeSpan, positiveSpan, spacing).map((offset) => ({
    x: origin.x + direction.x * offset,
    y: origin.y + direction.y * offset
  }));
}

function createBalancedArcCandidates(
  center: Point,
  axisAngle: number,
  radius: number,
  halfSpan: number,
  count: number,
  phaseOffset = 0,
  trimAngularEndpoints = false,
  preferredArcSpacing?: number
): Point[] {
  if (!Number.isFinite(radius) || radius <= 0 || count <= 0) {
    return [];
  }

  const step = preferredArcSpacing && preferredArcSpacing > 0
    ? preferredArcSpacing / radius
    : count > 1
      ? (2 * halfSpan) / (Math.abs(phaseOffset) > 1e-9 ? count : count - 1)
      : 0;
  const rawAngleOffsets = fixedArcAngleOffsets(halfSpan, step, phaseOffset, count);
  const angleOffsets =
    trimAngularEndpoints && rawAngleOffsets.length > 2
      ? rawAngleOffsets.slice(1, -1)
      : rawAngleOffsets;

  return centerOutIndices(angleOffsets.length).map((index) => {
    const angle = axisAngle + angleOffsets[index];
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    };
  });
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

function fixedArcAngleOffsets(
  halfSpan: number,
  step: number,
  phaseOffset: number,
  fallbackCount: number
): number[] {
  if (!Number.isFinite(step) || step <= 0) {
    return Array.from({ length: fallbackCount }, (_, index) =>
      interpolate(-halfSpan, halfSpan, index / Math.max(fallbackCount - 1, 1))
    );
  }

  const useShiftedInteriorSpacing = Math.abs(phaseOffset) > 1e-9;
  const start = useShiftedInteriorSpacing ? -halfSpan + phaseOffset * step : -halfSpan;
  const offsets: number[] = [];

  for (let angle = start; angle <= halfSpan + 1e-9; angle += step) {
    if (angle >= -halfSpan - 1e-9) {
      offsets.push(clamp(angle, -halfSpan, halfSpan));
    }
  }

  if (offsets.length === 0) {
    offsets.push(0);
  }

  return offsets;
}

function createFixedSpacingRadialCandidates(
  anchor: Point,
  direction: Point,
  innerRadius: number,
  outerRadius: number,
  spacing: number
): Point[] {
  const clampedOuter = Math.max(outerRadius, innerRadius);
  const safeSpacing = Math.max(spacing, 1e-6);
  const points: Point[] = [];

  for (let radius = innerRadius; radius <= clampedOuter + 1e-9; radius += safeSpacing) {
    points.push({
      x: anchor.x + direction.x * radius,
      y: anchor.y + direction.y * radius
    });
  }

  return points;
}

function createProjectedUniformLineCandidates(
  bounds: Bounds,
  normal: Point,
  spacing: number
): Point[] {
  const center = boundsCenter(bounds);
  const startOffset = -distanceToBounds(center, negate(normal), bounds);
  const endOffset = distanceToBounds(center, normal, bounds);
  const origin = {
    x: center.x,
    y: center.y
  };

  return createAlignedLineCandidates(origin, normal, startOffset, endOffset, spacing);
}

function createAlignedLineCandidates(
  origin: Point,
  direction: Point,
  startOffset: number,
  endOffset: number,
  spacing: number
): Point[] {
  const safeSpacing = Math.max(spacing, 1e-6);
  const points: Point[] = [];
  const start = Math.ceil(startOffset / safeSpacing) * safeSpacing;
  const end = Math.floor(endOffset / safeSpacing) * safeSpacing;

  for (let offset = start; offset <= end + 1e-9; offset += safeSpacing) {
    points.push({
      x: origin.x + direction.x * offset,
      y: origin.y + direction.y * offset
    });
  }

  return points;
}

function largeRadiusForDoubletSideArc(
  distanceToEdge: number,
  innerRadius: number,
  span: number
): number {
  const maxRadius = Math.max(distanceToEdge * 0.82, 0);
  const desiredRadius = Math.max(span * 0.4, innerRadius + span * 0.18);

  return Math.min(desiredRadius, maxRadius);
}

function centeredReferenceSpacing(
  bounds: Bounds,
  referenceCenter: Point,
  direction: Point,
  innerRadius: number,
  targetSpacing: number,
  minCount: number,
  maxCount: number,
  outerScale = 1
): number {
  const referenceOuter = distanceToBounds(referenceCenter, direction, bounds) * outerScale;
  return referenceSpacingFromSpan(referenceOuter - innerRadius, targetSpacing, minCount, maxCount);
}

function referenceSpacingFromSpan(
  span: number,
  targetSpacing: number,
  minCount: number,
  maxCount: number
): number {
  if (!Number.isFinite(span) || span <= 0) {
    return Math.max(targetSpacing, 1e-6);
  }

  const count = countFromSpan(span, targetSpacing, minCount, maxCount);
  if (count <= 1) {
    return Math.max(span, targetSpacing, 1e-6);
  }

  return span / (count - 1);
}

function countFromReferenceSpacing(span: number, referenceSpacing: number, maxCount: number): number {
  if (!Number.isFinite(span) || span <= 0) {
    return 0;
  }

  return clamp(Math.floor(span / Math.max(referenceSpacing, 1e-6)) + 1, 1, maxCount);
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

function centeredGridOffsets(negativeSpan: number, positiveSpan: number, spacing: number): number[] {
  const safeSpacing = Math.max(spacing, 1e-6);
  const negativeCount = Math.floor(negativeSpan / safeSpacing);
  const positiveCount = Math.floor(positiveSpan / safeSpacing);
  const offsets: number[] = [];

  for (let index = -negativeCount; index <= positiveCount; index += 1) {
    offsets.push(index * safeSpacing);
  }

  return offsets;
}

function majorGridStep(bounds: Bounds): number {
  const span = Math.min(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin);
  const rawStep = span / 10;
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

function isCardinalAngle(angleDeg: number): boolean {
  const normalized = ((angleDeg % 90) + 90) % 90;
  return Math.min(normalized, 90 - normalized) < 1e-6;
}

function countFromSpan(span: number, targetSpacing: number, minCount: number, maxCount: number): number {
  if (!Number.isFinite(span) || span <= 0) {
    return minCount;
  }

  return clamp(Math.ceil(span / Math.max(targetSpacing, 1e-6)) + 1, minCount, maxCount);
}

function realEigenDirections(jacobian: { ux: number; uy: number; vx: number; vy: number }): Point[] {
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
  jacobian: { ux: number; uy: number; vx: number; vy: number },
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

function centerOutIndices(count: number): number[] {
  if (count <= 0) {
    return [];
  }

  const indices: number[] = [];
  const lowerCenter = Math.floor((count - 1) / 2);
  const upperCenter = Math.ceil((count - 1) / 2);
  indices.push(lowerCenter);
  if (upperCenter !== lowerCenter) {
    indices.push(upperCenter);
  }

  for (let offset = 1; indices.length < count; offset += 1) {
    const left = lowerCenter - offset;
    const right = upperCenter + offset;
    if (right < count) {
      indices.push(right);
    }
    if (left >= 0) {
      indices.push(left);
    }
  }

  return indices;
}

function spreadOrderIndices(count: number): number[] {
  const ordered: number[] = [];
  const seen = new Set<number>();

  for (let index = 0; index < count; index += 1) {
    const candidate = Math.floor(radicalInverseBase2(index) * count) % count;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      ordered.push(candidate);
    }
  }

  for (let index = 0; index < count; index += 1) {
    if (!seen.has(index)) {
      ordered.push(index);
    }
  }

  return ordered;
}

function radicalInverseBase2(index: number): number {
  let value = 0;
  let denominator = 2;
  let current = index;

  while (current > 0) {
    value += (current % 2) / denominator;
    current = Math.floor(current / 2);
    denominator *= 2;
  }

  return value;
}

function interleavePoints(left: readonly Point[], right: readonly Point[]): Point[] {
  const points: Point[] = [];
  const count = Math.max(left.length, right.length);

  for (let index = 0; index < count; index += 1) {
    if (index < left.length) {
      points.push(left[index]);
    }
    if (index < right.length) {
      points.push(right[index]);
    }
  }

  return points;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
