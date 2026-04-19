import { afterEach, describe, expect, it, vi } from "vitest";

import { createFlowField } from "../model/flowField";
import { ParticleEngine } from "../render/particles";
import { createViewport } from "../render/viewport";
import type { Viewport } from "../render/viewport";

interface ParticleSnapshot {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

describe("ParticleEngine resize behavior", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves existing particles and avoids source bursts when the particle count grows", () => {
    const field = createFlowField([
      {
        id: "source",
        kind: "source",
        anchor: { x: 0, y: 0 },
        visible: true,
        strength: 5,
        coreRadius: 0.14
      }
    ]);
    const viewport = createTestViewport(800, 800);
    const engine = new ParticleEngine();

    mockRandomSequence([
      0.9, 0.25, 0.25, 0.4, 0.5,
      0.9, 0.75, 0.75, 0.6, 0.7
    ]);

    engine.reset(2, viewport, field, []);
    const particles = getParticles(engine);
    const initialPositions = particles.map(({ x, y }) => ({ x, y }));

    engine.reset(6, viewport, field, []);

    expect(particles.slice(0, 2).map(({ x, y }) => ({ x, y }))).toEqual(initialPositions);
    expect(particles.slice(2).every((particle) => Math.hypot(particle.x, particle.y) > 1)).toBe(true);
  });

  it("avoids doublet-center bursts when resize adds new particles", () => {
    const field = createFlowField([
      {
        id: "doublet",
        kind: "doublet",
        anchor: { x: 0, y: 0 },
        visible: true,
        strength: 4,
        angleDeg: 0,
        coreRadius: 0.12
      }
    ]);
    const viewport = createTestViewport(800, 800);
    const engine = new ParticleEngine();

    mockRandomSequence([0.9, 0.25, 0.25, 0.4, 0.5]);

    engine.reset(1, viewport, field, []);
    const particles = getParticles(engine);
    const initialPosition = { x: particles[0].x, y: particles[0].y };

    engine.reset(4, viewport, field, []);

    expect({ x: particles[0].x, y: particles[0].y }).toEqual(initialPosition);
    expect(
      particles
        .slice(1)
        .every((particle) => Math.hypot(particle.x, particle.y) > 0.25)
    ).toBe(true);
  });

  it("repositions particles ambiently when a resize makes them fall outside the visible window", () => {
    const field = createFlowField([
      {
        id: "source",
        kind: "source",
        anchor: { x: 0, y: 0 },
        visible: true,
        strength: 5,
        coreRadius: 0.14
      }
    ]);
    const wideViewport = createTestViewport(1200, 600);
    const narrowViewport = createTestViewport(600, 600);
    const engine = new ParticleEngine();

    mockRandomSequence([0.9, 0.25, 0.25, 0.4, 0.5]);

    engine.reset(1, wideViewport, field, []);
    const particles = getParticles(engine);
    particles[0] = { x: 7.5, y: 0, age: 1, maxAge: 10 };

    engine.reset(1, narrowViewport, field, []);

    expect(particles[0].x).toBeGreaterThanOrEqual(narrowViewport.bounds.xMin);
    expect(particles[0].x).toBeLessThanOrEqual(narrowViewport.bounds.xMax);
    expect(particles[0].y).toBeGreaterThanOrEqual(narrowViewport.bounds.yMin);
    expect(particles[0].y).toBeLessThanOrEqual(narrowViewport.bounds.yMax);
    expect(Math.hypot(particles[0].x, particles[0].y)).toBeGreaterThan(1);
  });
});

describe("ParticleEngine near-core emission", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spawns source particles close enough to read as emerging from the marker", () => {
    const field = createFlowField([
      {
        id: "source",
        kind: "source",
        anchor: { x: 0, y: 0 },
        visible: true,
        strength: 5,
        coreRadius: 0.14
      }
    ]);
    const viewport = createTestViewport(800, 800);
    const engine = new ParticleEngine();

    mockRandomSequence([0.1, 0, 0, 0.25, 0.4, 0.5]);

    engine.reset(1, viewport, field, []);

    const particle = getParticles(engine)[0];
    expect(Math.hypot(particle.x, particle.y)).toBeLessThan(0.14);
  });

  it("spawns doublet particles close to the placed center", () => {
    const field = createFlowField([
      {
        id: "doublet",
        kind: "doublet",
        anchor: { x: 0, y: 0 },
        visible: true,
        strength: 4,
        angleDeg: 0,
        coreRadius: 0.12
      }
    ]);
    const viewport = createTestViewport(800, 800);
    const engine = new ParticleEngine();

    mockRandomSequence([0.1, 0, 0, 0.25, 0.4, 0.5]);

    engine.reset(1, viewport, field, []);

    const particle = getParticles(engine)[0];
    expect(Math.hypot(particle.x, particle.y)).toBeLessThan(0.14);
  });
});

function createTestViewport(width: number, height: number): Viewport {
  return createViewport(width, height, 1, {
    center: { x: 0, y: 0 },
    worldHeight: 8,
    aspect: width / height
  });
}

function getParticles(engine: ParticleEngine): ParticleSnapshot[] {
  return (engine as unknown as { particles: ParticleSnapshot[] }).particles;
}

function mockRandomSequence(values: number[]): void {
  const queue = [...values];
  vi.spyOn(Math, "random").mockImplementation(() => queue.shift() ?? 0);
}
