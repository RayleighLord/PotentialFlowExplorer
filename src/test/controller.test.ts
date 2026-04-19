import { describe, expect, it } from "vitest";

import { AppController } from "../ui/controller";

describe("AppController fixed view", () => {
  it("keeps the visible window fixed when zoom and pan are requested", () => {
    const controller = new AppController();
    const initialView = controller.getViewModel().state.view;

    controller.zoomAt({ x: 0, y: 0 }, 0.35);
    controller.panBy({ x: 8, y: -6 });

    expect(controller.getViewModel().state.view).toEqual(initialView);
  });

  it("loads examples with their configured fixed view and initial streamlines", () => {
    const controller = new AppController();
    controller.loadExample("cylinder");

    const viewModel = controller.getViewModel();
    expect(viewModel.state.view.center).toEqual({ x: 0, y: 0 });
    expect(viewModel.state.view.worldHeight).toBe(8);
    expect(viewModel.streamlines.length).toBeGreaterThan(0);
  });

  it("does not auto-select a newly placed element", () => {
    const controller = new AppController();

    controller.addElementAt({ x: 0.5, y: -0.25 });

    expect(controller.getViewModel().state.selectedElementId).toBeNull();
  });

  it("uses per-tool default placement magnitudes", () => {
    const controller = new AppController();

    expect(controller.getViewModel().state.placement.magnitude).toBe(50);

    controller.setPlacementTemplate({ kind: "uniform" });
    expect(controller.getViewModel().state.placement.magnitude).toBe(5);

    controller.setPlacementTemplate({ kind: "vortex" });
    expect(controller.getViewModel().state.placement.magnitude).toBe(30);
  });

  it("resets custom streamline seeds back to the default automatic streamlines", () => {
    const controller = new AppController();

    controller.addElementAt({ x: 0, y: 0 });
    controller.addStreamlineSeed({ x: 1, y: 0 });

    expect(controller.getViewModel().state.streamlineSeeds).toHaveLength(1);

    controller.resetStreamlines();

    const viewModel = controller.getViewModel();
    expect(viewModel.state.streamlineSeeds).toHaveLength(0);
    expect(viewModel.state.autoStreamlinesEnabled).toBe(true);
    expect(viewModel.streamlines.length).toBeGreaterThan(0);
  });

  it("restores preset streamline seeds when resetting an example", () => {
    const controller = new AppController();

    controller.loadExample("cylinder");
    const initialSeedCount = controller.getViewModel().state.streamlineSeeds.length;

    controller.addStreamlineSeed({ x: 0, y: 1.5 });
    expect(controller.getViewModel().state.streamlineSeeds.length).toBe(initialSeedCount + 1);

    controller.resetStreamlines();

    const viewModel = controller.getViewModel();
    expect(viewModel.state.exampleId).toBe("cylinder");
    expect(viewModel.state.streamlineSeeds).toHaveLength(initialSeedCount);
    expect(viewModel.state.autoStreamlinesEnabled).toBe(false);
  });
});
