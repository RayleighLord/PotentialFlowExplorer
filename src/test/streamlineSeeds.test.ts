import { describe, expect, it } from "vitest";

import { createFlowField } from "../model/flowField";
import { generateAutoStreamlineSeeds } from "../model/streamlineSeeds";

describe("generateAutoStreamlineSeeds", () => {
  it("places source seeds with nearly uniform angular spacing around one ring", () => {
    const source = {
      id: "source",
      kind: "source" as const,
      anchor: { x: 0, y: 0 },
      visible: true,
      strength: 6,
      coreRadius: 0.12
    };

    const seeds = generateAutoStreamlineSeeds(
      createFlowField([source]),
      [source],
      { xMin: -4, xMax: 4, yMin: -4, yMax: 4 },
      []
    );

    const radii = seeds.map((seed) => Math.hypot(seed.x, seed.y));
    const angles = seeds
      .map((seed) => Math.atan2(seed.y, seed.x))
      .sort((left, right) => left - right);
    const spacings = angles.map((angle, index) => {
      const next = index === angles.length - 1 ? angles[0] + 2 * Math.PI : angles[index + 1];
      return next - angle;
    });

    expect(seeds.length).toBeGreaterThanOrEqual(12);
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.05);
    expect(Math.max(...spacings) - Math.min(...spacings)).toBeLessThan(0.08);
  });

  it("places uniform-flow seeds along a cross-stream line with even spacing", () => {
    const uniform = {
      id: "uniform",
      kind: "uniform" as const,
      anchor: { x: 0, y: 0 },
      visible: true,
      speed: 1,
      angleDeg: 0
    };

    const seeds = generateAutoStreamlineSeeds(
      createFlowField([uniform]),
      [uniform],
      { xMin: -4, xMax: 4, yMin: -4, yMax: 4 },
      []
    );

    const xs = seeds.map((seed) => seed.x);
    const ys = seeds.map((seed) => seed.y).sort((left, right) => left - right);
    const spacings = ys.slice(1).map((value, index) => value - ys[index]);

    expect(seeds.length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.05);
    expect(Math.max(...spacings) - Math.min(...spacings)).toBeLessThan(0.08);
  });

  it("places vortex seeds along one radial line with changing radius", () => {
    const vortex = {
      id: "vortex",
      kind: "vortex" as const,
      anchor: { x: 0, y: 0 },
      visible: true,
      circulation: 5,
      coreRadius: 0.16
    };

    const seeds = generateAutoStreamlineSeeds(
      createFlowField([vortex]),
      [vortex],
      { xMin: -4, xMax: 4, yMin: -4, yMax: 4 },
      []
    );

    const rayAngles = seeds.map((seed) => Math.atan2(seed.y, seed.x));
    const radii = seeds.map((seed) => Math.hypot(seed.x, seed.y)).sort((left, right) => left - right);
    const spacings = radii.slice(1).map((value, index) => value - radii[index]);

    expect(seeds.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...rayAngles) - Math.min(...rayAngles)).toBeLessThan(0.05);
    expect(Math.max(...spacings) - Math.min(...spacings)).toBeLessThan(0.1);
  });

  it("places doublet seeds along the radial normal direction on both sides", () => {
    const doublet = {
      id: "doublet",
      kind: "doublet" as const,
      anchor: { x: 0, y: 0 },
      visible: true,
      strength: 5,
      angleDeg: 0,
      coreRadius: 0.12
    };

    const seeds = generateAutoStreamlineSeeds(
      createFlowField([doublet]),
      [doublet],
      { xMin: -4, xMax: 4, yMin: -4, yMax: 4 },
      []
    );

    const xs = seeds.map((seed) => seed.x);
    const positive = seeds.filter((seed) => seed.y > 0).map((seed) => seed.y).sort((left, right) => left - right);
    const negative = seeds.filter((seed) => seed.y < 0).map((seed) => Math.abs(seed.y)).sort((left, right) => left - right);

    expect(seeds.length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.05);
    expect(positive.length).toBeGreaterThanOrEqual(5);
    expect(negative.length).toBeGreaterThanOrEqual(5);
  });
});
