import { describe, expect, it } from "vitest";

import { findStagnationPoints } from "../model/analysis";
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

    expect(seeds.length).toBeGreaterThanOrEqual(24);
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.05);
    expect(Math.max(...radii)).toBeLessThan(0.4);
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

    expect(seeds.length).toBeGreaterThanOrEqual(20);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.05);
    expect(Math.max(...spacings) - Math.min(...spacings)).toBeLessThan(0.001);
    expect(spacings[0]).toBeCloseTo(0.25, 6);
    expect(ys[0]).toBeCloseTo(-4, 6);
    expect(ys[ys.length - 1]).toBeCloseTo(4, 6);
  });

  it("places vortex seeds on evenly spaced left and right horizontal rays", () => {
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
    const rightRay = rayAngles.filter((angle) => Math.abs(angle) < 0.08);
    const leftRay = rayAngles.filter((angle) => Math.abs(Math.abs(angle) - Math.PI) < 0.08);
    const rightRadii = radialDistancesAlongAxis(seeds, vortex.anchor, { x: 1, y: 0 });
    const leftRadii = radialDistancesAlongAxis(seeds, vortex.anchor, { x: -1, y: 0 });

    expect(seeds.length).toBeGreaterThanOrEqual(24);
    expect(rightRay.length).toBeGreaterThanOrEqual(8);
    expect(leftRay.length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...rightRadii) - Math.min(...rightRadii)).toBeGreaterThan(3.4);
    expect(Math.max(...leftRadii) - Math.min(...leftRadii)).toBeGreaterThan(3.4);
    expect(minSpacing(rightRadii)).toBeCloseTo(minSpacing(leftRadii), 6);
    expect(spacingVariation(rightRadii)).toBeLessThan(0.001);
    expect(spacingVariation(leftRadii)).toBeLessThan(0.001);
    expect(Math.min(...radii)).toBeLessThan(0.4);
    expect(Math.max(...radii)).toBeGreaterThan(3.9);
  });

  it("preserves the doublet top and bottom rays while adding outer side-arc seeds", () => {
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

    const axialSeeds = seeds.filter((seed) => Math.abs(seed.x) < 0.05);
    const positive = axialSeeds
      .filter((seed) => seed.y > 0)
      .map((seed) => seed.y)
      .sort((left, right) => left - right);
    const negative = axialSeeds
      .filter((seed) => seed.y < 0)
      .map((seed) => Math.abs(seed.y))
      .sort((left, right) => left - right);
    const rightArc = seeds.filter((seed) => seed.x > 1.5);
    const leftArc = seeds.filter((seed) => seed.x < -1.5);
    const rightArcRadii = rightArc.map((seed) => Math.hypot(seed.x, seed.y));
    const leftArcRadii = leftArc.map((seed) => Math.hypot(seed.x, seed.y));

    expect(seeds.length).toBeGreaterThanOrEqual(36);
    expect(positive.length).toBeGreaterThanOrEqual(12);
    expect(negative.length).toBeGreaterThanOrEqual(12);
    expect(Math.min(...positive)).toBeLessThan(0.35);
    expect(Math.min(...negative)).toBeLessThan(0.35);
    expect(Math.max(...positive)).toBeGreaterThan(3.7);
    expect(Math.max(...negative)).toBeGreaterThan(3.7);
    expect(rightArc.length).toBeGreaterThanOrEqual(8);
    expect(leftArc.length).toBeGreaterThanOrEqual(8);
    expect(rightArc.some((seed) => Math.abs(seed.y) < 0.05)).toBe(true);
    expect(rightArc.some((seed) => seed.y > 0.45)).toBe(true);
    expect(rightArc.some((seed) => seed.y < -0.45)).toBe(true);
    expect(leftArc.some((seed) => seed.y > 0.45)).toBe(true);
    expect(leftArc.some((seed) => seed.y < -0.45)).toBe(true);
    expect(Math.max(...rightArcRadii) - Math.min(...rightArcRadii)).toBeLessThan(0.18);
    expect(Math.max(...leftArcRadii) - Math.min(...leftArcRadii)).toBeLessThan(0.18);
  });

  it("keeps doublet radial spacing consistent when the element is offset toward the top boundary", () => {
    const centeredDoublet = {
      id: "doublet-centered",
      kind: "doublet" as const,
      anchor: { x: 0, y: 0 },
      visible: true,
      strength: 5,
      angleDeg: 0,
      coreRadius: 0.12
    };
    const offsetDoublet = {
      ...centeredDoublet,
      id: "doublet-offset",
      anchor: { x: 0, y: 2.1 }
    };
    const bounds = { xMin: -4, xMax: 4, yMin: -4, yMax: 4 };

    const centeredSeeds = generateAutoStreamlineSeeds(
      createFlowField([centeredDoublet]),
      [centeredDoublet],
      bounds,
      []
    );
    const offsetSeeds = generateAutoStreamlineSeeds(
      createFlowField([offsetDoublet]),
      [offsetDoublet],
      bounds,
      []
    );

    const centeredTopRadii = radialDistancesAlongAxis(centeredSeeds, centeredDoublet.anchor, { x: 0, y: 1 });
    const offsetTopRadii = radialDistancesAlongAxis(offsetSeeds, offsetDoublet.anchor, { x: 0, y: 1 });

    expect(offsetTopRadii.length).toBeLessThan(centeredTopRadii.length);
    expect(minSpacing(offsetTopRadii)).toBeGreaterThanOrEqual(minSpacing(centeredTopRadii) * 0.98);
  });

  it("keeps vortex spacing while revealing additional rays on the more open side after offset", () => {
    const centeredVortex = {
      id: "vortex-centered",
      kind: "vortex" as const,
      anchor: { x: 0, y: 0 },
      visible: true,
      circulation: 5,
      coreRadius: 0.16
    };
    const offsetVortex = {
      ...centeredVortex,
      id: "vortex-offset",
      anchor: { x: 2.1, y: 2.1 }
    };
    const bounds = { xMin: -4, xMax: 4, yMin: -4, yMax: 4 };

    const centeredSeeds = generateAutoStreamlineSeeds(
      createFlowField([centeredVortex]),
      [centeredVortex],
      bounds,
      []
    );
    const offsetSeeds = generateAutoStreamlineSeeds(
      createFlowField([offsetVortex]),
      [offsetVortex],
      bounds,
      []
    );

    const centeredRightRadii = radialDistancesAlongAxis(centeredSeeds, centeredVortex.anchor, { x: 1, y: 0 });
    const centeredLeftRadii = radialDistancesAlongAxis(centeredSeeds, centeredVortex.anchor, { x: -1, y: 0 });
    const offsetRightRadii = radialDistancesAlongAxis(offsetSeeds, offsetVortex.anchor, { x: 1, y: 0 });
    const offsetLeftRadii = radialDistancesAlongAxis(offsetSeeds, offsetVortex.anchor, { x: -1, y: 0 });
    const centeredSpacing = minSpacing(centeredRightRadii);

    expect(centeredLeftRadii.length).toBe(centeredRightRadii.length);
    expect(offsetRightRadii.length).toBeGreaterThan(0);
    expect(offsetLeftRadii.length).toBeGreaterThan(offsetRightRadii.length);
    expect(minSpacing(offsetRightRadii)).toBeGreaterThanOrEqual(centeredSpacing * 0.98);
    expect(minSpacing(offsetRightRadii)).toBeLessThanOrEqual(centeredSpacing * 1.03);
    expect(minSpacing(offsetLeftRadii)).toBeGreaterThanOrEqual(centeredSpacing * 0.98);
    expect(minSpacing(offsetLeftRadii)).toBeLessThanOrEqual(centeredSpacing * 1.03);
    expect(Math.max(...offsetLeftRadii)).toBeGreaterThan(centeredLeftRadii[centeredLeftRadii.length - 1]);
  });

  it("adds offset seeds on both eigendirections around a visible stagnation point", () => {
    const leftSource = {
      id: "left-source",
      kind: "source" as const,
      anchor: { x: -1.6, y: 0 },
      visible: true,
      strength: 5,
      coreRadius: 0.12
    };
    const rightSource = {
      id: "right-source",
      kind: "source" as const,
      anchor: { x: 1.6, y: 0 },
      visible: true,
      strength: 5,
      coreRadius: 0.12
    };
    const bounds = { xMin: -4, xMax: 4, yMin: -4, yMax: 4 };
    const field = createFlowField([leftSource, rightSource]);
    const stagnationPoints = findStagnationPoints(field, bounds);

    const seeds = generateAutoStreamlineSeeds(
      field,
      [leftSource, rightSource],
      bounds,
      [],
      stagnationPoints
    );

    const nearCenter = seeds.filter((seed) => Math.hypot(seed.x, seed.y) < 0.25);

    expect(nearCenter.some((seed) => seed.x > 0.04 && Math.abs(seed.y) < 0.04)).toBe(true);
    expect(nearCenter.some((seed) => seed.x < -0.04 && Math.abs(seed.y) < 0.04)).toBe(true);
    expect(nearCenter.some((seed) => seed.y > 0.04 && Math.abs(seed.x) < 0.04)).toBe(true);
    expect(nearCenter.some((seed) => seed.y < -0.04 && Math.abs(seed.x) < 0.04)).toBe(true);
  });
});

function radialDistancesAlongAxis(
  seeds: ReadonlyArray<{ x: number; y: number }>,
  anchor: { x: number; y: number },
  direction: { x: number; y: number }
): number[] {
  const tolerance = 0.05;

  return seeds
    .filter((seed) => {
      const dx = seed.x - anchor.x;
      const dy = seed.y - anchor.y;
      const axial = dx * direction.x + dy * direction.y;
      const normal = Math.abs(dx * -direction.y + dy * direction.x);

      return axial > 0 && normal < tolerance;
    })
    .map((seed) => Math.hypot(seed.x - anchor.x, seed.y - anchor.y))
    .sort((left, right) => left - right);
}

function spacingVariation(values: readonly number[]): number {
  if (values.length < 3) {
    return 0;
  }

  const spacings = values.slice(1).map((value, index) => value - values[index]);
  return Math.max(...spacings) - Math.min(...spacings);
}

function minSpacing(values: readonly number[]): number {
  if (values.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  let min = Number.POSITIVE_INFINITY;
  for (let index = 1; index < values.length; index += 1) {
    min = Math.min(min, values[index] - values[index - 1]);
  }
  return min;
}
