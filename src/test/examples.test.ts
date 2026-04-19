import { describe, expect, it } from "vitest";

import { AppController } from "../ui/controller";

describe("example presets", () => {
  it("loads the source-sink example from the preset library", () => {
    const controller = new AppController();
    controller.loadExample("source-sink");

    const kinds = controller.getViewModel().state.elements.map((element) => element.kind).sort();

    expect(kinds).toEqual(["sink", "source"]);
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

  it("loads the corner-flow example with quarter-plane guides and image sources", () => {
    const controller = new AppController();
    controller.loadExample("corner-source");

    const viewModel = controller.getViewModel();
    const anchors = viewModel.state.elements
      .map((element) => element.anchor)
      .sort((left, right) => left.x - right.x || left.y - right.y);

    expect(viewModel.state.elements).toHaveLength(4);
    expect(viewModel.state.guides.filter((guide) => guide.kind === "half-plane")).toHaveLength(2);
    expect(anchors).toEqual([
      { x: -0.5, y: -0.5 },
      { x: -0.5, y: 0.5 },
      { x: 0.5, y: -0.5 },
      { x: 0.5, y: 0.5 }
    ]);
    expect(viewModel.streamlines.length).toBeGreaterThan(0);
  });
});
