import { describe, expect, it } from "vitest";

import { AppController } from "../ui/controller";

describe("example presets", () => {
  it("loads the uniform example with the marker on a major-grid intersection", () => {
    const controller = new AppController();
    controller.loadExample("uniform");

    const uniform = controller.getViewModel().state.elements.find((element) => element.kind === "uniform");

    expect(uniform?.anchor).toEqual({ x: -5, y: 3 });
  });

  it("loads the cylinder example with an upstream uniform-style seed line", () => {
    const controller = new AppController();
    controller.loadExample("cylinder");

    const streamlines = controller.getViewModel().streamlines;
    const seedXs = streamlines.map((streamline) => streamline.seed.x);
    const seedYs = streamlines.map((streamline) => streamline.seed.y).sort((left, right) => left - right);
    const spacings = seedYs.slice(1).map((value, index) => value - seedYs[index]);

    expect(streamlines.length).toBeGreaterThanOrEqual(20);
    expect(Math.max(...seedXs) - Math.min(...seedXs)).toBeLessThan(0.05);
    expect(Math.max(...spacings) - Math.min(...spacings)).toBeLessThan(0.001);
    expect(spacings[0]).toBeCloseTo(0.25, 6);
  });
});
