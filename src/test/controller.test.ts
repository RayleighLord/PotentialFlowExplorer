import { describe, expect, it } from "vitest";

import { AppController } from "../ui/controller";

describe("AppController streamlines", () => {
  it("keeps auto streamlines fixed while the camera stays inside the current streamline domain", () => {
    const controller = new AppController();
    controller.addElementAt({ x: 0, y: 0 });

    const initial = controller
      .getViewModel()
      .streamlines.map((streamline) => streamline.points.map((point) => ({ ...point })));

    controller.panBy({ x: 0.5, y: -0.2 });
    const afterPan = controller
      .getViewModel()
      .streamlines.map((streamline) => streamline.points.map((point) => ({ ...point })));

    controller.zoomAt({ x: 0, y: 0 }, 0.7);
    const afterZoom = controller
      .getViewModel()
      .streamlines.map((streamline) => streamline.points.map((point) => ({ ...point })));

    expect(afterPan).toEqual(initial);
    expect(afterZoom).toEqual(initial);
  });

  it("extends streamline reach when the view zooms out beyond the seed domain", () => {
    const controller = new AppController();
    controller.addElementAt({ x: 0, y: 0 });

    const initialExtent = maxStreamlineRadius(controller.getViewModel().streamlines);

    controller.zoomAt({ x: 0, y: 0 }, 2.6);
    const expandedExtent = maxStreamlineRadius(controller.getViewModel().streamlines);

    expect(expandedExtent).toBeGreaterThan(initialExtent + 1);
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
