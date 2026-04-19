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
});
