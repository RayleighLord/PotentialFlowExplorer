import { isPointBlocked } from "../model/domain";
import type { FieldStats, FlowElement, FlowField, Guide, Point } from "../types";
import type { Viewport } from "./viewport";

interface Particle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

const SOURCE_SPAWN_PROBABILITY = 0.22;
const ACTIVE_SINGULARITY_BUFFER_FACTOR = 0.007;
const ACTIVE_SINGULARITY_BUFFER_MIN = 0.025;
const CAPTURE_BUFFER_FACTOR = 0.007;
const CAPTURE_BUFFER_MIN = 0.025;

type SourceElement = FlowElement & {
  kind: "source";
  strength: number;
  coreRadius: number;
};

type DoubletElement = FlowElement & {
  kind: "doublet";
  strength: number;
  angleDeg: number;
  coreRadius: number;
};

type EmissiveElement = SourceElement | DoubletElement;
type SinkElement = FlowElement & {
  kind: "sink";
  strength: number;
  coreRadius: number;
};
type CapturingElement = SinkElement | DoubletElement;

export class ParticleEngine {
  private particles: Particle[] = [];
  private lastViewportSignature = "";

  reset(count: number, viewport: Viewport, flowField: FlowField, guides: readonly Guide[]): void {
    const viewportSignature = signatureForViewport(viewport);
    const viewportChanged = viewportSignature !== this.lastViewportSignature;
    this.lastViewportSignature = viewportSignature;

    if (count <= 0) {
      this.particles = [];
      return;
    }

    if (this.particles.length === 0) {
      this.particles = Array.from({ length: count }, () => createRandomParticle(viewport, flowField, guides));
      return;
    }

    if (count > this.particles.length) {
      this.particles.push(
        ...Array.from({ length: count - this.particles.length }, () => createAmbientParticle(viewport, flowField, guides))
      );
    } else if (count < this.particles.length) {
      this.particles.length = count;
    }

    if (!viewportChanged) {
      return;
    }

    for (const particle of this.particles) {
      if (isReusableAfterViewportChange(particle, viewport, flowField, guides)) {
        continue;
      }

      respawnParticleAmbient(particle, viewport, flowField, guides);
    }
  }

  reseed(viewport: Viewport, flowField: FlowField, guides: readonly Guide[]): void {
    this.particles = this.particles.map(() => createRandomParticle(viewport, flowField, guides));
  }

  stepAndRender(
    context: CanvasRenderingContext2D,
    viewport: Viewport,
    flowField: FlowField,
    guides: readonly Guide[],
    fieldStats: FieldStats,
    deltaSeconds: number
  ): void {
    const referenceSpeed = Math.max(fieldStats.sampledSpeedReference, 1e-3);
    const maxSpeedForMotion = referenceSpeed * 5;
    const motionScale = viewport.worldHeight / (6.5 * referenceSpeed);

    context.save();
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "rgba(0, 0, 0, 0.08)";
    context.fillRect(0, 0, viewport.width, viewport.height);
    context.restore();

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";

    for (const particle of this.particles) {
      const previous = { x: particle.x, y: particle.y };
      const velocity = flowField.velocityAt(previous);
      const singularityDistance = flowField.distanceToNearestSingularity(previous);

      if (
        !Number.isFinite(velocity.speed) ||
        singularityDistance < activeSingularityBuffer(viewport.worldHeight) ||
        isPointBlocked(previous, guides)
      ) {
        respawnParticle(particle, viewport, flowField, guides);
        continue;
      }

      const speedFactor = Math.min(velocity.speed, maxSpeedForMotion);
      const velocityScale = velocity.speed > 1e-9 ? speedFactor / velocity.speed : 0;
      const next = {
        x: particle.x + velocity.u * velocityScale * motionScale * deltaSeconds,
        y: particle.y + velocity.v * velocityScale * motionScale * deltaSeconds
      };

      if (shouldCaptureParticleNearSingularity(previous, next, flowField, viewport.worldHeight)) {
        respawnParticle(particle, viewport, flowField, guides);
        continue;
      }

      particle.x = next.x;
      particle.y = next.y;
      particle.age += deltaSeconds;

      if (
        particle.age >= particle.maxAge ||
        particle.x < viewport.bounds.xMin ||
        particle.x > viewport.bounds.xMax ||
        particle.y < viewport.bounds.yMin ||
        particle.y > viewport.bounds.yMax ||
        isPointBlocked({ x: particle.x, y: particle.y }, guides)
      ) {
        respawnParticle(particle, viewport, flowField, guides);
        continue;
      }

      const alpha = clamp(0.16 + 0.26 * (speedFactor / maxSpeedForMotion), 0.12, 0.46);
      const lightness = 56 + 26 * clamp(speedFactor / referenceSpeed, 0, 1.6) / 1.6;
      context.strokeStyle = `hsla(${200 - 6 * clamp(speedFactor / referenceSpeed, 0, 1.3)}, 100%, ${lightness.toFixed(1)}%, ${alpha.toFixed(3)})`;
      context.lineWidth = 0.9 + 0.7 * clamp(speedFactor / referenceSpeed, 0, 1.2) / 1.2;
      context.beginPath();
      context.moveTo(
        ((previous.x - viewport.bounds.xMin) / viewport.worldWidth) * viewport.width,
        ((viewport.bounds.yMax - previous.y) / viewport.worldHeight) * viewport.height
      );
      context.lineTo(
        ((particle.x - viewport.bounds.xMin) / viewport.worldWidth) * viewport.width,
        ((viewport.bounds.yMax - particle.y) / viewport.worldHeight) * viewport.height
      );
      context.stroke();
    }

    context.restore();
  }
}

function createRandomParticle(
  viewport: Viewport,
  flowField: FlowField,
  guides: readonly Guide[]
): Particle {
  const point = chooseParticleSpawnPoint(viewport, flowField, guides);
  return createParticleState(point);
}

function createAmbientParticle(
  viewport: Viewport,
  flowField: FlowField,
  guides: readonly Guide[]
): Particle {
  const point = randomFreePoint(viewport, flowField, guides);
  return createParticleState(point);
}

function createParticleState(point: Point): Particle {
  return {
    x: point.x,
    y: point.y,
    age: Math.random() * 10,
    maxAge: 6 + Math.random() * 8
  };
}

function respawnParticle(
  particle: Particle,
  viewport: Viewport,
  flowField: FlowField,
  guides: readonly Guide[]
): void {
  const point = chooseParticleSpawnPoint(viewport, flowField, guides);
  particle.x = point.x;
  particle.y = point.y;
  particle.age = 0;
  particle.maxAge = 6 + Math.random() * 8;
}

function respawnParticleAmbient(
  particle: Particle,
  viewport: Viewport,
  flowField: FlowField,
  guides: readonly Guide[]
): void {
  const point = randomFreePoint(viewport, flowField, guides);
  particle.x = point.x;
  particle.y = point.y;
  particle.age = 0;
  particle.maxAge = 6 + Math.random() * 8;
}

function chooseParticleSpawnPoint(
  viewport: Viewport,
  flowField: FlowField,
  guides: readonly Guide[]
): Point {
  if (Math.random() < SOURCE_SPAWN_PROBABILITY) {
    const emitterPoint = randomEmitterSpawnPoint(viewport, flowField, guides);
    if (emitterPoint) {
      return emitterPoint;
    }
  }

  return randomFreePoint(viewport, flowField, guides);
}

function randomFreePoint(
  viewport: Viewport,
  flowField: FlowField,
  guides: readonly Guide[]
): Point {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const point = {
      x: viewport.bounds.xMin + Math.random() * viewport.worldWidth,
      y: viewport.bounds.yMin + Math.random() * viewport.worldHeight
    };

    if (isPointBlocked(point, guides)) {
      continue;
    }

    if (flowField.distanceToNearestSingularity(point) < viewport.worldHeight * 0.014) {
      continue;
    }

    return point;
  }

  return {
    x: viewport.bounds.xMin + 0.5 * viewport.worldWidth,
    y: viewport.bounds.yMin + 0.5 * viewport.worldHeight
  };
}

function isReusableAfterViewportChange(
  particle: Particle,
  viewport: Viewport,
  flowField: FlowField,
  guides: readonly Guide[]
): boolean {
  if (![particle.x, particle.y, particle.age, particle.maxAge].every(Number.isFinite)) {
    return false;
  }

  if (
    particle.x < viewport.bounds.xMin ||
    particle.x > viewport.bounds.xMax ||
    particle.y < viewport.bounds.yMin ||
    particle.y > viewport.bounds.yMax
  ) {
    return false;
  }

  if (isPointBlocked({ x: particle.x, y: particle.y }, guides)) {
    return false;
  }

  return flowField.distanceToNearestSingularity({ x: particle.x, y: particle.y }) >= activeSingularityBuffer(viewport.worldHeight);
}

function randomEmitterSpawnPoint(
  viewport: Viewport,
  flowField: FlowField,
  guides: readonly Guide[]
): Point | null {
  const emitters = flowField.elements.filter(isEmissiveElement);
  if (emitters.length === 0) {
    return null;
  }

  const totalWeight = emitters.reduce((sum, emitter) => sum + emitterWeight(emitter), 0);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const emitter = pickWeightedEmitter(emitters, totalWeight);
    const point = randomEmitterPoint(emitter, viewport.worldHeight);

    if (isPointBlocked(point, guides)) {
      continue;
    }

    if (
      point.x < viewport.bounds.xMin ||
      point.x > viewport.bounds.xMax ||
      point.y < viewport.bounds.yMin ||
      point.y > viewport.bounds.yMax
    ) {
      continue;
    }

    return point;
  }

  return null;
}

function randomEmitterPoint(emitter: EmissiveElement, worldHeight: number): Point {
  switch (emitter.kind) {
    case "source":
      return randomPointAroundCenter(emitter.anchor, emitter.coreRadius, worldHeight);
    case "doublet":
      return randomPointAroundCenter(emitter.anchor, emitter.coreRadius, worldHeight * 0.85);
    default:
      return assertNever(emitter);
  }
}

function randomPointAroundCenter(center: Point, coreRadius: number, worldHeight: number): Point {
  const angle = Math.random() * Math.PI * 2;
  const minimumRadius = Math.max(worldHeight * 0.0065, coreRadius * 0.72, 0.02);
  const maximumRadius = Math.max(worldHeight * 0.01, coreRadius * 0.96, minimumRadius + 0.014);
  const radiusT = Math.sqrt(Math.random());
  const spawnRadius = minimumRadius + (maximumRadius - minimumRadius) * radiusT;

  return {
    x: center.x + spawnRadius * Math.cos(angle),
    y: center.y + spawnRadius * Math.sin(angle)
  };
}

function pickWeightedEmitter(
  emitters: readonly EmissiveElement[],
  totalWeight: number
): EmissiveElement {
  let threshold = Math.random() * totalWeight;

  for (const emitter of emitters) {
    threshold -= emitterWeight(emitter);
    if (threshold <= 0) {
      return emitter;
    }
  }

  return emitters[emitters.length - 1];
}

function isSourceElement(element: FlowElement): element is SourceElement {
  return element.kind === "source";
}

function isDoubletElement(element: FlowElement): element is DoubletElement {
  return element.kind === "doublet";
}

function isEmissiveElement(element: FlowElement): element is EmissiveElement {
  return isSourceElement(element) || isDoubletElement(element);
}

function emitterWeight(emitter: EmissiveElement): number {
  switch (emitter.kind) {
    case "source":
      return Math.max(emitter.strength, 1e-6);
    case "doublet":
      return Math.max(Math.abs(emitter.strength), 1e-6);
    default:
      return assertNever(emitter);
  }
}

function shouldCaptureParticleNearSingularity(
  previous: Point,
  next: Point,
  flowField: FlowField,
  worldHeight: number
): boolean {
  const baseCaptureRadius = Math.max(worldHeight * CAPTURE_BUFFER_FACTOR, CAPTURE_BUFFER_MIN);

  for (const element of flowField.elements) {
    if (!isCapturingElement(element)) {
      continue;
    }

    const captureCenter = captureCenterForElement(element, worldHeight);
    const captureRadius = Math.max(baseCaptureRadius, element.coreRadius * 1.05);
    const previousDistance = Math.hypot(previous.x - captureCenter.x, previous.y - captureCenter.y);
    const nextDistance = Math.hypot(next.x - captureCenter.x, next.y - captureCenter.y);

    if (nextDistance <= captureRadius) {
      return true;
    }

    if (nextDistance >= previousDistance) {
      continue;
    }

    if (distancePointToSegment(captureCenter, previous, next) <= captureRadius) {
      return true;
    }
  }

  return false;
}

function isCapturingElement(element: FlowElement): element is CapturingElement {
  return element.kind === "sink" || element.kind === "doublet";
}

function captureCenterForElement(
  element: CapturingElement,
  worldHeight: number
): Point {
  switch (element.kind) {
    case "sink":
      return element.anchor;
    case "doublet":
      return element.anchor;
    default:
      return assertNever(element);
  }
}

function distancePointToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 1e-12) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    0,
    1
  );
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

function signatureForViewport(viewport: Viewport): string {
  const { width, height, dpr, bounds } = viewport;
  return [
    width,
    height,
    dpr.toFixed(4),
    bounds.xMin.toFixed(4),
    bounds.xMax.toFixed(4),
    bounds.yMin.toFixed(4),
    bounds.yMax.toFixed(4)
  ].join(":");
}

function activeSingularityBuffer(worldHeight: number): number {
  return Math.max(worldHeight * ACTIVE_SINGULARITY_BUFFER_FACTOR, ACTIVE_SINGULARITY_BUFFER_MIN);
}
