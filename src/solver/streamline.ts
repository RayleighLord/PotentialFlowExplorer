import { isPointBlocked } from "../model/domain";
import type {
  Bounds,
  FlowElement,
  FlowField,
  Guide,
  Point,
  Streamline,
  StreamlineSeed,
  StreamlineTerminationReason
} from "../types";

interface StreamlineSettings {
  targetArcStep: number;
  maxArcLength: number;
  maxStepsPerDirection: number;
  escapeMargin: number;
  minimumSingularityBuffer: number;
  stagnationSpeedThreshold: number;
}

interface TraceResult {
  points: Point[];
  arcLength: number;
  terminationReason: StreamlineTerminationReason;
}

export function createStreamlineSettings(bounds: Bounds): StreamlineSettings {
  const span = Math.min(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin);
  const targetArcStep = Math.max(span / 320, 0.01);
  const maxArcLength = Math.max(span * 4.6, 18);

  return {
    targetArcStep,
    maxArcLength,
    maxStepsPerDirection: Math.max(2600, Math.ceil((maxArcLength / targetArcStep) * 1.35)),
    escapeMargin: span * 0.08,
    minimumSingularityBuffer: Math.max(span * 0.001, 0.0025),
    stagnationSpeedThreshold: 1e-4
  } satisfies StreamlineSettings;
}

export function solveStreamline(
  seed: StreamlineSeed,
  bounds: Bounds,
  flowField: FlowField,
  guides: readonly Guide[]
): Streamline {
  const settings = createStreamlineSettings(bounds);

  if (isPointBlocked(seed, guides)) {
    return {
      id: seed.id,
      seed,
      points: [{ x: seed.x, y: seed.y }],
      arcLength: 0,
      terminationReason: "blocked"
    };
  }

  const backward = traceDirection(seed, -1, bounds, flowField, guides, settings);
  const forward = traceDirection(seed, 1, bounds, flowField, guides, settings);
  const combinedPoints = [
    ...backward.points.slice().reverse().slice(0, -1),
    ...forward.points
  ];

  return {
    id: seed.id,
    seed,
    points: simplifyPolyline(combinedPoints, settings.targetArcStep * 0.06),
    arcLength: backward.arcLength + forward.arcLength,
    terminationReason: preferTermination(backward.terminationReason, forward.terminationReason)
  };
}

function traceDirection(
  seed: Point,
  direction: -1 | 1,
  bounds: Bounds,
  flowField: FlowField,
  guides: readonly Guide[],
  settings: StreamlineSettings
): TraceResult {
  const points: Point[] = [{ x: seed.x, y: seed.y }];
  let current = { ...seed };
  let arcLength = 0;

  for (let stepIndex = 0; stepIndex < settings.maxStepsPerDirection; stepIndex += 1) {
    if (isInsideSingularityTerminationBuffer(current, flowField, settings.minimumSingularityBuffer)) {
      return {
        points,
        arcLength,
        terminationReason: "singularity"
      };
    }

    const speed = flowField.velocityAt(current).speed;
    if (!Number.isFinite(speed)) {
      return {
        points,
        arcLength,
        terminationReason: "invalid"
      };
    }

    if (speed < settings.stagnationSpeedThreshold && stepIndex > 0) {
      return {
        points,
        arcLength,
        terminationReason: "stagnation"
      };
    }

    const next = rk4Step(
      current,
      direction * settings.targetArcStep,
      (point) => normalizedDirection(point, flowField, settings.stagnationSpeedThreshold)
    );

    if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) {
      return {
        points,
        arcLength,
        terminationReason: "invalid"
      };
    }

    if (isPointBlocked(next, guides)) {
      return {
        points,
        arcLength,
        terminationReason: "blocked"
      };
    }

    if (!isInsideExpandedBounds(next, bounds, settings.escapeMargin)) {
      return {
        points,
        arcLength,
        terminationReason: "escaped-view"
      };
    }

    arcLength += Math.hypot(next.x - current.x, next.y - current.y);
    points.push(next);
    current = next;

    if (arcLength >= settings.maxArcLength) {
      return {
        points,
        arcLength,
        terminationReason: "length-limit"
      };
    }
  }

  return {
    points,
    arcLength,
    terminationReason: "max-steps"
  };
}

function rk4Step(
  point: Point,
  step: number,
  directionField: (point: Point) => Point | null
): Point {
  const k1 = directionField(point);
  if (!k1) {
    return { x: Number.NaN, y: Number.NaN };
  }

  const k2 = directionField({
    x: point.x + 0.5 * step * k1.x,
    y: point.y + 0.5 * step * k1.y
  });
  if (!k2) {
    return { x: Number.NaN, y: Number.NaN };
  }

  const k3 = directionField({
    x: point.x + 0.5 * step * k2.x,
    y: point.y + 0.5 * step * k2.y
  });
  if (!k3) {
    return { x: Number.NaN, y: Number.NaN };
  }

  const k4 = directionField({
    x: point.x + step * k3.x,
    y: point.y + step * k3.y
  });
  if (!k4) {
    return { x: Number.NaN, y: Number.NaN };
  }

  return {
    x: point.x + (step / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: point.y + (step / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y)
  };
}

function normalizedDirection(
  point: Point,
  flowField: FlowField,
  threshold: number
): Point | null {
  const velocity = flowField.velocityAt(point);
  if (!Number.isFinite(velocity.speed) || velocity.speed <= threshold) {
    return null;
  }

  return {
    x: velocity.u / velocity.speed,
    y: velocity.v / velocity.speed
  };
}

function isInsideSingularityTerminationBuffer(
  point: Point,
  flowField: FlowField,
  minimumBuffer: number
): boolean {
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestBuffer = minimumBuffer;

  for (const element of flowField.elements) {
    if (element.kind === "uniform") {
      continue;
    }

    const distance = Math.hypot(point.x - element.anchor.x, point.y - element.anchor.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestBuffer = Math.max(minimumBuffer, elementCoreBuffer(element));
    }
  }

  return nearestDistance < nearestBuffer;
}

function elementCoreBuffer(element: Exclude<FlowElement, { kind: "uniform" }>): number {
  return Math.max(element.coreRadius * 0.24, 0);
}

function isInsideExpandedBounds(point: Point, bounds: Bounds, margin: number): boolean {
  return (
    point.x >= bounds.xMin - margin &&
    point.x <= bounds.xMax + margin &&
    point.y >= bounds.yMin - margin &&
    point.y <= bounds.yMax + margin
  );
}

function preferTermination(
  left: StreamlineTerminationReason,
  right: StreamlineTerminationReason
): StreamlineTerminationReason {
  const order: StreamlineTerminationReason[] = [
    "stagnation",
    "singularity",
    "blocked",
    "length-limit",
    "escaped-view",
    "max-steps",
    "invalid"
  ];

  return order.indexOf(left) <= order.indexOf(right) ? left : right;
}

function simplifyPolyline(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) {
    return [...points];
  }

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  simplifySection(points, keep, 0, points.length - 1, tolerance * tolerance);

  const output: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    if (keep[index] === 1) {
      output.push(points[index]);
    }
  }
  return output;
}

function simplifySection(
  points: readonly Point[],
  keep: Uint8Array,
  startIndex: number,
  endIndex: number,
  toleranceSquared: number
): void {
  if (endIndex - startIndex <= 1) {
    return;
  }

  let maxDistanceSquared = -1;
  let splitIndex = -1;

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const distanceSquared = perpendicularDistanceSquared(points[index], points[startIndex], points[endIndex]);
    if (distanceSquared > maxDistanceSquared) {
      maxDistanceSquared = distanceSquared;
      splitIndex = index;
    }
  }

  if (maxDistanceSquared <= toleranceSquared || splitIndex === -1) {
    return;
  }

  keep[splitIndex] = 1;
  simplifySection(points, keep, startIndex, splitIndex, toleranceSquared);
  simplifySection(points, keep, splitIndex, endIndex, toleranceSquared);
}

function perpendicularDistanceSquared(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  }

  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy
  };

  return (point.x - projection.x) ** 2 + (point.y - projection.y) ** 2;
}
