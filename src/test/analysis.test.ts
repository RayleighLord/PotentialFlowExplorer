import { describe, expect, it } from "vitest";

import { findStagnationPoints } from "../model/analysis";
import { createFlowField } from "../model/flowField";

describe("findStagnationPoints", () => {
  it("returns no stagnation points when no elements are plotted", () => {
    const field = createFlowField([]);

    const stagnationPoints = findStagnationPoints(field, {
      xMin: -3,
      xMax: 3,
      yMin: -2,
      yMax: 2
    });

    expect(stagnationPoints).toEqual([]);
  });

  it("detects the front and rear stagnation points of the cylinder example", () => {
    const radius = 1.1;
    const speed = 1.0;
    const doubletStrength = 2 * Math.PI * speed * radius * radius;
    const field = createFlowField([
      {
        id: "uniform",
        kind: "uniform",
        anchor: { x: -5, y: 3 },
        visible: true,
        speed,
        angleDeg: 0
      },
      {
        id: "doublet",
        kind: "doublet",
        anchor: { x: 0, y: 0 },
        visible: true,
        strength: doubletStrength,
        angleDeg: 0,
        coreRadius: 0
      }
    ]);

    const stagnationPoints = findStagnationPoints(field, {
      xMin: -3,
      xMax: 3,
      yMin: -2,
      yMax: 2
    });

    expect(stagnationPoints.length).toBeGreaterThanOrEqual(2);
    expect(stagnationPoints.some((point) => Math.abs(point.x - radius) < 0.05 && Math.abs(point.y) < 0.05)).toBe(true);
    expect(stagnationPoints.some((point) => Math.abs(point.x + radius) < 0.05 && Math.abs(point.y) < 0.05)).toBe(true);
  });
});
