import { isPointBlocked } from "../model/domain";
import type { FieldStats, FlowField, Guide, Point } from "../types";
import type { Viewport } from "./viewport";

interface Particle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

export class ParticleEngine {
  private particles: Particle[] = [];
  private cachedCount = 0;

  reset(count: number, viewport: Viewport, flowField: FlowField, guides: readonly Guide[]): void {
    if (count === this.cachedCount && this.particles.length === count) {
      return;
    }

    this.cachedCount = count;
    this.particles = Array.from({ length: count }, () => createRandomParticle(viewport, flowField, guides));
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
        singularityDistance < viewport.worldHeight * 0.012 ||
        isPointBlocked(previous, guides)
      ) {
        respawnParticle(particle, viewport, flowField, guides);
        continue;
      }

      const speedFactor = Math.min(velocity.speed, maxSpeedForMotion);
      particle.x += velocity.u * motionScale * deltaSeconds;
      particle.y += velocity.v * motionScale * deltaSeconds;
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
  const point = randomFreePoint(viewport, flowField, guides);
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
  const point = randomFreePoint(viewport, flowField, guides);
  particle.x = point.x;
  particle.y = point.y;
  particle.age = 0;
  particle.maxAge = 6 + Math.random() * 8;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
