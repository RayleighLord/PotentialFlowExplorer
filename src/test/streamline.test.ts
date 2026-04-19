import { describe, expect, it } from "vitest";

import { createFlowField } from "../model/flowField";
import { solveStreamline } from "../solver/streamline";

describe("solveStreamline", () => {
  it("keeps the streamline nearly horizontal in a uniform flow", () => {
    const field = createFlowField([
      {
        id: "uniform",
        kind: "uniform",
        anchor: { x: 0, y: 0 },
        visible: true,
        speed: 1,
        angleDeg: 0
      }
    ]);

    const streamline = solveStreamline(
      { id: "seed-1", x: -2, y: 1 },
      { xMin: -3, xMax: 3, yMin: -2, yMax: 2 },
      field,
      []
    );

    expect(streamline.points.length).toBeGreaterThanOrEqual(2);
    const maxDeviation = Math.max(...streamline.points.map((point) => Math.abs(point.y - 1)));
    expect(maxDeviation).toBeLessThan(0.02);
    expect(streamline.points[0].x).toBeLessThan(-1.9);
    expect(streamline.points[streamline.points.length - 1].x).toBeGreaterThan(1.9);
  });

  it("approaches much closer to a source core before terminating", () => {
    const field = createFlowField([
      {
        id: "source",
        kind: "source",
        anchor: { x: 0, y: 0 },
        visible: true,
        strength: 6,
        coreRadius: 0.12
      }
    ]);

    const streamline = solveStreamline(
      { id: "seed-2", x: 0.9, y: 0 },
      { xMin: -6, xMax: 6, yMin: -6, yMax: 6 },
      field,
      []
    );

    const minRadius = Math.min(...streamline.points.map((point) => Math.hypot(point.x, point.y)));
    expect(minRadius).toBeLessThan(0.06);
  });
});
