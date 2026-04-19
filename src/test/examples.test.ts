import { describe, expect, it } from "vitest";

import { EXAMPLE_PRESETS } from "../model/examples";
import { AppController } from "../ui/controller";

describe("example presets", () => {
  it("loads the cylinder example with an upstream uniform-style seed line", () => {
    const controller = new AppController();
    controller.loadExample("cylinder");

    const streamlines = controller.getViewModel().streamlines;
    const seedXs = streamlines.map((streamline) => streamline.seed.x);
    const seedYs = streamlines.map((streamline) => streamline.seed.y).sort((left, right) => left - right);
    const spacings = seedYs.slice(1).map((value, index) => value - seedYs[index]);

    expect(streamlines.length).toBe(EXAMPLE_PRESETS.find((preset) => preset.id === "cylinder")?.streamlineSeeds?.length);
    expect(Math.max(...seedXs) - Math.min(...seedXs)).toBeLessThan(0.05);
    expect(Math.max(...spacings) - Math.min(...spacings)).toBeLessThan(0.08);
  });
});
