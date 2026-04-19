import { describe, expect, it } from "vitest";

import { AppController } from "../ui/controller";

describe("AppController streamlines", () => {
  it("keeps manual streamlines fixed while the camera pans and zooms", () => {
    const controller = new AppController();
    controller.setPlacementTemplate({ kind: "uniform", magnitude: 1, angleDeg: 0 });
    controller.addElementAt({ x: 0, y: 0 });
    controller.clearStreamlines();
    controller.addStreamlineSeed({ x: -2, y: 1 });

    const initial = controller
      .getViewModel()
      .streamlines.map((streamline) => streamline.points.map((point) => ({ ...point })));

    controller.zoomAt({ x: 0, y: 0 }, 2.6);
    const afterPan = controller
      .getViewModel()
      .streamlines.map((streamline) => streamline.points.map((point) => ({ ...point })));

    controller.panBy({ x: 6, y: -4 });
    const afterZoom = controller
      .getViewModel()
      .streamlines.map((streamline) => streamline.points.map((point) => ({ ...point })));

    expect(afterPan).toEqual(initial);
    expect(afterZoom).toEqual(initial);
  });

  it("reuses auto streamlines across small zoom changes for smoother interaction", () => {
    const controller = new AppController();
    controller.setPlacementTemplate({ kind: "doublet", magnitude: 5, angleDeg: 0, coreRadius: 0.12 });
    controller.addElementAt({ x: 0, y: 0 });

    const initial = controller
      .getViewModel()
      .streamlines.map((streamline) => streamline.points.map((point) => ({ ...point })));

    controller.zoomAt({ x: 0, y: 0 }, 1.08);
    const afterSmallZoom = controller
      .getViewModel()
      .streamlines.map((streamline) => streamline.points.map((point) => ({ ...point })));

    expect(afterSmallZoom).toEqual(initial);
  });

  it("recalculates auto uniform streamlines to keep a similar count across zoom levels", () => {
    const controller = new AppController();
    controller.setPlacementTemplate({ kind: "uniform", magnitude: 1, angleDeg: 0 });
    controller.addElementAt({ x: 0, y: 0 });

    const initialStreamlines = controller.getViewModel().streamlines;
    const initialExtent = maxStreamlineRadius(initialStreamlines);
    const initialCount = initialStreamlines.length;

    controller.zoomAt({ x: 0, y: 0 }, 2.6);
    const expandedStreamlines = controller.getViewModel().streamlines;
    const expandedExtent = maxStreamlineRadius(expandedStreamlines);
    const expandedCount = expandedStreamlines.length;

    expect(expandedExtent).toBeGreaterThan(initialExtent + 1);
    expect(Math.abs(expandedCount - initialCount)).toBeLessThanOrEqual(2);
  });

  it("clamps panning so the visible window stays inside the maximum zoom-out domain", () => {
    const controller = new AppController();

    controller.panBy({ x: 200, y: -200 });
    const bounds = controller.getViewModel().visibleBounds;

    expect(bounds.xMax).toBeLessThanOrEqual(24.0001);
    expect(bounds.xMin).toBeGreaterThanOrEqual(-24.0001);
    expect(bounds.yMax).toBeLessThanOrEqual(15.0001);
    expect(bounds.yMin).toBeGreaterThanOrEqual(-15.0001);
  });
});

function maxStreamlineRadius(
  streamlines: ReturnType<AppController["getViewModel"]>["streamlines"]
): number {
  return Math.max(
    ...streamlines.flatMap((streamline) =>
      streamline.points.map((point) => Math.hypot(point.x, point.y))
    )
  );
}
