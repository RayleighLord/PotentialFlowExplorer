import { describe, expect, it } from "vitest";

import { createFlowField } from "../model/flowField";

describe("createFlowField", () => {
  it("produces radial velocity for a source", () => {
    const field = createFlowField([
      {
        id: "source-1",
        kind: "source",
        anchor: { x: 0, y: 0 },
        visible: true,
        strength: 2 * Math.PI,
        coreRadius: 0
      }
    ]);

    const value = field.velocityAt({ x: 2, y: 0 });
    expect(value.u).toBeCloseTo(0.5, 8);
    expect(value.v).toBeCloseTo(0, 8);
  });

  it("produces tangential velocity for a positive vortex", () => {
    const field = createFlowField([
      {
        id: "vortex-1",
        kind: "vortex",
        anchor: { x: 0, y: 0 },
        visible: true,
        circulation: 2 * Math.PI,
        coreRadius: 0
      }
    ]);

    const value = field.velocityAt({ x: 2, y: 0 });
    expect(value.u).toBeCloseTo(0, 8);
    expect(value.v).toBeCloseTo(0.5, 8);
  });

  it("superimposes linearly", () => {
    const field = createFlowField([
      {
        id: "uniform-1",
        kind: "uniform",
        anchor: { x: 0, y: 0 },
        visible: true,
        speed: 1,
        angleDeg: 0
      },
      {
        id: "uniform-2",
        kind: "uniform",
        anchor: { x: 0, y: 0 },
        visible: true,
        speed: 2,
        angleDeg: 90
      }
    ]);

    const value = field.velocityAt({ x: 1, y: 1 });
    expect(value.u).toBeCloseTo(1, 8);
    expect(value.v).toBeCloseTo(2, 8);
  });

  it("matches the x-directed doublet sign on the positive x-axis", () => {
    const field = createFlowField([
      {
        id: "doublet-1",
        kind: "doublet",
        anchor: { x: 0, y: 0 },
        visible: true,
        strength: 2 * Math.PI,
        angleDeg: 0,
        coreRadius: 0
      }
    ]);

    const value = field.velocityAt({ x: 2, y: 0 });
    expect(value.u).toBeLessThan(0);
    expect(Math.abs(value.v)).toBeLessThan(1e-10);
  });
});
