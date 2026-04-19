import type {
  FlowElement,
  FlowField,
  FlowFieldEvaluation,
  FlowFieldVelocity,
  Point
} from "../types";

const TAU = 2 * Math.PI;
const MIN_REGULARIZATION = 1e-8;

export function createFlowField(elements: readonly FlowElement[]): FlowField {
  const visibleElements = elements.filter((element) => element.visible);

  return {
    elements: visibleElements,
    velocityAt(point) {
      let u = 0;
      let v = 0;

      for (const element of visibleElements) {
        const contribution = evaluateVelocityContribution(element, point);
        u += contribution.u;
        v += contribution.v;
      }

      return {
        u,
        v,
        speed: Math.hypot(u, v)
      } satisfies FlowFieldVelocity;
    },
    evaluate(point) {
      let u = 0;
      let v = 0;
      let phi = 0;
      let psi = 0;

      for (const element of visibleElements) {
        const contribution = evaluateContribution(element, point);
        u += contribution.u;
        v += contribution.v;
        phi += contribution.phi;
        psi += contribution.psi;
      }

      return {
        u,
        v,
        speed: Math.hypot(u, v),
        phi,
        psi
      } satisfies FlowFieldEvaluation;
    },
    distanceToNearestSingularity(point) {
      let minDistance = Number.POSITIVE_INFINITY;

      for (const element of visibleElements) {
        if (element.kind === "uniform") {
          continue;
        }

        const distance = Math.hypot(point.x - element.anchor.x, point.y - element.anchor.y);
        if (distance < minDistance) {
          minDistance = distance;
        }
      }

      return minDistance;
    }
  } satisfies FlowField;
}

function evaluateContribution(element: FlowElement, point: Point): FlowFieldEvaluation {
  switch (element.kind) {
    case "uniform":
      return evaluateUniformFlow(element.speed, element.angleDeg, point, element.anchor);
    case "source":
      return evaluateSourceSink(Math.abs(element.strength), point, element.anchor, element.coreRadius);
    case "sink":
      return evaluateSourceSink(-Math.abs(element.strength), point, element.anchor, element.coreRadius);
    case "vortex":
      return evaluateVortex(element.circulation, point, element.anchor, element.coreRadius);
    case "doublet":
      return evaluateDoublet(element.strength, element.angleDeg, point, element.anchor, element.coreRadius);
    default:
      return assertNever(element);
  }
}

function evaluateVelocityContribution(element: FlowElement, point: Point): FlowFieldVelocity {
  const value = evaluateContribution(element, point);
  return {
    u: value.u,
    v: value.v,
    speed: value.speed
  };
}

function evaluateUniformFlow(
  speed: number,
  angleDeg: number,
  point: Point,
  anchor: Point
): FlowFieldEvaluation {
  const angle = degreesToRadians(angleDeg);
  const u = speed * Math.cos(angle);
  const v = speed * Math.sin(angle);
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;

  return {
    u,
    v,
    speed: Math.hypot(u, v),
    phi: u * dx + v * dy,
    psi: u * dy - v * dx
  };
}

function evaluateSourceSink(
  signedStrength: number,
  point: Point,
  anchor: Point,
  coreRadius: number
): FlowFieldEvaluation {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const r2 = regularizedRadiusSquared(dx, dy, coreRadius);
  const coefficient = signedStrength / (TAU * r2);
  const u = coefficient * dx;
  const v = coefficient * dy;

  return {
    u,
    v,
    speed: Math.hypot(u, v),
    phi: (signedStrength / (4 * Math.PI)) * Math.log(r2),
    psi: (signedStrength / TAU) * Math.atan2(dy, dx)
  };
}

function evaluateVortex(
  circulation: number,
  point: Point,
  anchor: Point,
  coreRadius: number
): FlowFieldEvaluation {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const r2 = regularizedRadiusSquared(dx, dy, coreRadius);
  const coefficient = circulation / (TAU * r2);
  const u = -coefficient * dy;
  const v = coefficient * dx;

  return {
    u,
    v,
    speed: Math.hypot(u, v),
    phi: (circulation / TAU) * Math.atan2(dy, dx),
    psi: -(circulation / (4 * Math.PI)) * Math.log(r2)
  };
}

function evaluateDoublet(
  strength: number,
  angleDeg: number,
  point: Point,
  anchor: Point,
  coreRadius: number
): FlowFieldEvaluation {
  const angle = degreesToRadians(angleDeg);
  const direction = {
    x: Math.cos(angle),
    y: Math.sin(angle)
  };
  const normal = {
    x: -Math.sin(angle),
    y: Math.cos(angle)
  };
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const r2 = regularizedRadiusSquared(dx, dy, coreRadius);
  const dot = direction.x * dx + direction.y * dy;
  const factor = strength / TAU;
  const u = factor * (direction.x / r2 - (2 * dot * dx) / (r2 * r2));
  const v = factor * (direction.y / r2 - (2 * dot * dy) / (r2 * r2));

  return {
    u,
    v,
    speed: Math.hypot(u, v),
    phi: factor * dot / r2,
    psi: -factor * (normal.x * dx + normal.y * dy) / r2
  };
}

function regularizedRadiusSquared(dx: number, dy: number, coreRadius: number): number {
  const regularization = Math.max(coreRadius * coreRadius, MIN_REGULARIZATION);
  return dx * dx + dy * dy + regularization;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
