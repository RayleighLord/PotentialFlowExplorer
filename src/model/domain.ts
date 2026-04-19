import type { Guide, Point } from "../types";

export function isPointBlocked(point: Point, guides: readonly Guide[]): boolean {
  return guides.some((guide) => isPointInsideSolidGuide(point, guide));
}

export function isPointInsideSolidGuide(point: Point, guide: Guide): boolean {
  if (!("solid" in guide) || !guide.solid) {
    return false;
  }

  switch (guide.kind) {
    case "circle":
      return Math.hypot(point.x - guide.center.x, point.y - guide.center.y) < guide.radius;
    case "half-plane":
      return isPointInHalfPlane(point, guide);
    default:
      return assertNever(guide);
  }
}

export function distanceToBlockedGuides(point: Point, guides: readonly Guide[]): number {
  let minDistance = Number.POSITIVE_INFINITY;

  for (const guide of guides) {
    if (!("solid" in guide) || !guide.solid) {
      continue;
    }

    switch (guide.kind) {
      case "circle": {
        const distance = Math.abs(Math.hypot(point.x - guide.center.x, point.y - guide.center.y) - guide.radius);
        minDistance = Math.min(minDistance, distance);
        break;
      }
      case "half-plane": {
        const distance =
          guide.axis === "x" ? Math.abs(point.x - guide.value) : Math.abs(point.y - guide.value);
        minDistance = Math.min(minDistance, distance);
        break;
      }
      default:
        return assertNever(guide);
    }
  }

  return minDistance;
}

function isPointInHalfPlane(point: Point, guide: Extract<Guide, { kind: "half-plane" }>): boolean {
  switch (guide.side) {
    case "above":
      return point.y >= guide.value;
    case "below":
      return point.y <= guide.value;
    case "left":
      return point.x <= guide.value;
    case "right":
      return point.x >= guide.value;
    default:
      return assertNever(guide.side);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
