import type { ExamplePreset, FlowElement, Guide, Point, StreamlineSeed } from "../types";

const DEFAULT_WORLD_HEIGHT = 8;
const DEFAULT_CENTER = { x: 0, y: 0 };
const DEFAULT_UNIFORM_ANCHOR = { x: -5, y: 3 };
const STREAMLINE_DENSITY_MULTIPLIER = 2;
const UNIFORM_MINOR_GRID_BLOCKS_PER_STREAMLINE = 1.5;

const CYLINDER_RADIUS = 1.15;
const CYLINDER_SPEED = 1.05;
const CYLINDER_DOUBLET_STRENGTH = 2 * Math.PI * CYLINDER_SPEED * CYLINDER_RADIUS * CYLINDER_RADIUS;
const WALL_SOURCE_CENTER = { x: 0, y: 0.8 };
const CORNER_CENTER = { x: 0.95, y: 0.95 };
const CORNER_SOURCE_OFFSET = 0.5;

export const EXAMPLE_PRESETS: ExamplePreset[] = [
  {
    id: "source-sink",
    label: "Source–sink pair",
    description: "A source and sink of equal strength create a classic dipole-like pattern before taking the limiting doublet form.",
    view: {
      center: DEFAULT_CENTER,
      worldHeight: DEFAULT_WORLD_HEIGHT
    },
    elements: [
      createSource("source-left", { x: -1.8, y: 0 }, 5.5, 0.16),
      createSink("sink-right", { x: 1.8, y: 0 }, 5.5, 0.16)
    ],
    streamlineSeeds: createScaledSeedGrid(boundsFromView(DEFAULT_CENTER, DEFAULT_WORLD_HEIGHT, 1.6), 8, 6)
  },
  {
    id: "doublet-limit",
    label: "Doublet limit",
    description: "Bringing a source and sink very close together gives a practical doublet approximation while keeping the ingredients explicit.",
    view: {
      center: DEFAULT_CENTER,
      worldHeight: DEFAULT_WORLD_HEIGHT
    },
    elements: [
      createSource("doublet-limit-source", { x: -0.42, y: 0 }, 14, 0.14),
      createSink("doublet-limit-sink", { x: 0.42, y: 0 }, 14, 0.14)
    ],
    streamlineSeeds: createScaledSeedGrid(boundsFromView(DEFAULT_CENTER, DEFAULT_WORLD_HEIGHT, 1.6), 9, 6)
  },
  {
    id: "wall-source",
    label: "Source next to a wall",
    description: "The mirror source below y = 0 enforces a slip wall through the method of images.",
    view: {
      center: WALL_SOURCE_CENTER,
      worldHeight: 7.2
    },
    elements: [
      createSource("wall-source-main", { x: 0, y: 1.15 }, 4.8, 0.14),
      createSource("wall-source-image", { x: 0, y: -1.15 }, 4.8, 0.14)
    ],
    guides: [
      {
        kind: "line",
        id: "wall-line",
        from: { x: -7, y: 0 },
        to: { x: 7, y: 0 },
        label: "wall y = 0"
      },
      {
        kind: "half-plane",
        id: "wall-solid-half-plane",
        axis: "y",
        value: 0,
        side: "below",
        solid: true
      }
    ],
    streamlineSeeds: createScaledSeedGrid(boundsFromView(WALL_SOURCE_CENTER, 7.2, 1.6), 8, 4, (point) => point.y >= 0.18)
  },
  {
    id: "corner-source",
    label: "Corner flow",
    description: "A source in the first quadrant plus three image sources makes both walls streamlines, producing a classical corner image system.",
    view: {
      center: CORNER_CENTER,
      worldHeight: 6.4
    },
    elements: [
      createSource("corner-main", { x: CORNER_SOURCE_OFFSET, y: CORNER_SOURCE_OFFSET }, 4.4, 0.14),
      createSource("corner-image-left", { x: -CORNER_SOURCE_OFFSET, y: CORNER_SOURCE_OFFSET }, 4.4, 0.14),
      createSource("corner-image-bottom", { x: CORNER_SOURCE_OFFSET, y: -CORNER_SOURCE_OFFSET }, 4.4, 0.14),
      createSource("corner-image-diagonal", { x: -CORNER_SOURCE_OFFSET, y: -CORNER_SOURCE_OFFSET }, 4.4, 0.14)
    ],
    guides: [
      {
        kind: "line",
        id: "corner-wall-x",
        from: { x: 0, y: -6 },
        to: { x: 0, y: 6 },
        label: "wall x = 0"
      },
      {
        kind: "line",
        id: "corner-wall-y",
        from: { x: -6, y: 0 },
        to: { x: 6, y: 0 },
        label: "wall y = 0"
      },
      {
        kind: "half-plane",
        id: "corner-solid-left",
        axis: "x",
        value: 0,
        side: "left",
        solid: true
      },
      {
        kind: "half-plane",
        id: "corner-solid-below",
        axis: "y",
        value: 0,
        side: "below",
        solid: true
      }
    ],
    streamlineSeeds: createScaledSeedGrid(
      boundsFromView(CORNER_CENTER, 6.4, 1.6),
      7,
      6,
      (point) => point.x >= 0.12 && point.y >= 0.12
    )
  },
  {
    id: "cylinder",
    label: "Flow past a cylinder",
    description: "A uniform stream plus a doublet produces the classical non-lifting potential flow around a circular cylinder.",
    view: {
      center: DEFAULT_CENTER,
      worldHeight: DEFAULT_WORLD_HEIGHT
    },
    elements: [
      createUniformFlow("cylinder-uniform", DEFAULT_UNIFORM_ANCHOR, CYLINDER_SPEED, 0),
      createDoublet("cylinder-doublet", { x: 0, y: 0 }, CYLINDER_DOUBLET_STRENGTH, 0, 0.06)
    ],
    guides: [
      {
        kind: "circle",
        id: "cylinder-body",
        center: { x: 0, y: 0 },
        radius: CYLINDER_RADIUS,
        label: "r = a",
        solid: true
      }
    ],
    streamlineSeeds: createUniformSeedLine(boundsFromView(DEFAULT_CENTER, DEFAULT_WORLD_HEIGHT, 1.6), 0, 13)
  },
  {
    id: "lifting-cylinder",
    label: "Lifting cylinder",
    description: "Adding a vortex to the cylinder shifts the stagnation points and breaks the top–bottom symmetry.",
    view: {
      center: DEFAULT_CENTER,
      worldHeight: DEFAULT_WORLD_HEIGHT
    },
    elements: [
      createUniformFlow("lifting-uniform", DEFAULT_UNIFORM_ANCHOR, CYLINDER_SPEED, 0),
      createDoublet("lifting-doublet", { x: 0, y: 0 }, CYLINDER_DOUBLET_STRENGTH, 0, 0.06),
      createVortex("lifting-vortex", { x: 0, y: 0 }, 5.5, 0.22)
    ],
    guides: [
      {
        kind: "circle",
        id: "lifting-cylinder-body",
        center: { x: 0, y: 0 },
        radius: CYLINDER_RADIUS,
        label: "r = a",
        solid: true
      }
    ],
    streamlineSeeds: createUniformSeedLine(boundsFromView(DEFAULT_CENTER, DEFAULT_WORLD_HEIGHT, 1.6), 0, 13)
  },
  {
    id: "rankine-oval",
    label: "Rankine oval",
    description: "A uniform stream plus an equal source–sink pair generates the classic Rankine oval family of streamlines.",
    view: {
      center: DEFAULT_CENTER,
      worldHeight: 7.6
    },
    elements: [
      createUniformFlow("oval-uniform", DEFAULT_UNIFORM_ANCHOR, 1.0, 0),
      createSource("oval-source", { x: -1.55, y: 0 }, 5.2, 0.14),
      createSink("oval-sink", { x: 1.55, y: 0 }, 5.2, 0.14)
    ],
    streamlineSeeds: createScaledSeedGrid(boundsFromView(DEFAULT_CENTER, 7.6, 1.6), 9, 6)
  }
];

export function getExampleById(id: string): ExamplePreset | undefined {
  return EXAMPLE_PRESETS.find((preset) => preset.id === id);
}

function createUniformFlow(id: string, anchor: Point, speed: number, angleDeg: number): FlowElement {
  return {
    id,
    kind: "uniform",
    anchor,
    visible: true,
    speed,
    angleDeg
  };
}

function createSource(id: string, anchor: Point, strength: number, coreRadius: number): FlowElement {
  return {
    id,
    kind: "source",
    anchor,
    visible: true,
    strength,
    coreRadius
  };
}

function createSink(id: string, anchor: Point, strength: number, coreRadius: number): FlowElement {
  return {
    id,
    kind: "sink",
    anchor,
    visible: true,
    strength,
    coreRadius
  };
}

function createVortex(id: string, anchor: Point, circulation: number, coreRadius: number): FlowElement {
  return {
    id,
    kind: "vortex",
    anchor,
    visible: true,
    circulation,
    coreRadius
  };
}

function createDoublet(
  id: string,
  anchor: Point,
  strength: number,
  angleDeg: number,
  coreRadius: number
): FlowElement {
  return {
    id,
    kind: "doublet",
    anchor,
    visible: true,
    strength,
    angleDeg,
    coreRadius
  };
}

function boundsFromView(center: Point, worldHeight: number, aspect: number) {
  const worldWidth = worldHeight * aspect;
  return {
    xMin: center.x - worldWidth / 2,
    xMax: center.x + worldWidth / 2,
    yMin: center.y - worldHeight / 2,
    yMax: center.y + worldHeight / 2
  };
}

function createSeedGrid(
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  columns: number,
  rows: number,
  filter?: (point: Point) => boolean
): StreamlineSeed[] {
  const seeds: StreamlineSeed[] = [];
  const xMargin = (bounds.xMax - bounds.xMin) * 0.08;
  const yMargin = (bounds.yMax - bounds.yMin) * 0.08;
  const xMin = bounds.xMin + xMargin;
  const xMax = bounds.xMax - xMargin;
  const yMin = bounds.yMin + yMargin;
  const yMax = bounds.yMax - yMargin;

  let counter = 1;
  for (let row = 0; row < rows; row += 1) {
    const y = interpolate(yMax, yMin, row / Math.max(rows - 1, 1));
    for (let column = 0; column < columns; column += 1) {
      const x = interpolate(xMin, xMax, column / Math.max(columns - 1, 1));
      const point = { x, y };
      if (filter && !filter(point)) {
        continue;
      }
      seeds.push({
        id: `preset-seed-${counter}`,
        x,
        y
      });
      counter += 1;
    }
  }

  return seeds;
}

function createScaledSeedGrid(
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  columns: number,
  rows: number,
  filter?: (point: Point) => boolean
): StreamlineSeed[] {
  const scaled = scaleGridDimensions(columns, rows, STREAMLINE_DENSITY_MULTIPLIER);
  return createSeedGrid(bounds, scaled.columns, scaled.rows, filter);
}

function createUniformSeedLine(
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  angleDeg: number,
  count: number
): StreamlineSeed[] {
  const direction = unitFromAngle(angleDeg);
  const normal = perpendicular(direction);
  const center = {
    x: 0.5 * (bounds.xMin + bounds.xMax),
    y: 0.5 * (bounds.yMin + bounds.yMax)
  };
  const upstreamDistance = distanceToBounds(center, negate(direction), bounds) * 0.88;
  const origin = {
    x: center.x - direction.x * upstreamDistance,
    y: center.y - direction.y * upstreamDistance
  };
  const rawNegativeSpan = distanceToBounds(origin, negate(normal), bounds);
  const rawPositiveSpan = distanceToBounds(origin, normal, bounds);

  if (isCardinalAngle(angleDeg)) {
    const spacing = (majorGridStep(bounds) / 6) * UNIFORM_MINOR_GRID_BLOCKS_PER_STREAMLINE;
    return createGridAlignedLineSeeds(origin, normal, rawNegativeSpan, rawPositiveSpan, spacing, "preset-seed");
  }

  const negativeSpan = rawNegativeSpan * 0.96;
  const positiveSpan = rawPositiveSpan * 0.96;
  return createLineSeeds(
    origin,
    normal,
    -negativeSpan,
    positiveSpan,
    count * STREAMLINE_DENSITY_MULTIPLIER,
    "preset-seed"
  );
}

function createLineSeeds(
  origin: Point,
  direction: Point,
  startOffset: number,
  endOffset: number,
  count: number,
  idPrefix: string
): StreamlineSeed[] {
  const seeds: StreamlineSeed[] = [];

  for (let index = 0; index < count; index += 1) {
    const offset = interpolate(startOffset, endOffset, index / Math.max(count - 1, 1));
    seeds.push({
      id: `${idPrefix}-${index + 1}`,
      x: origin.x + direction.x * offset,
      y: origin.y + direction.y * offset
    });
  }

  return seeds;
}

function createGridAlignedLineSeeds(
  origin: Point,
  direction: Point,
  negativeSpan: number,
  positiveSpan: number,
  spacing: number,
  idPrefix: string
): StreamlineSeed[] {
  const seeds: StreamlineSeed[] = [];
  let counter = 1;

  for (const offset of centeredGridOffsets(negativeSpan, positiveSpan, spacing)) {
    seeds.push({
      id: `${idPrefix}-${counter}`,
      x: origin.x + direction.x * offset,
      y: origin.y + direction.y * offset
    });
    counter += 1;
  }

  return seeds;
}

function distanceToBounds(
  origin: Point,
  direction: Point,
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number }
): number {
  const distances: number[] = [];

  if (Math.abs(direction.x) > 1e-10) {
    const txMin = (bounds.xMin - origin.x) / direction.x;
    const txMax = (bounds.xMax - origin.x) / direction.x;
    if (txMin > 0) {
      distances.push(txMin);
    }
    if (txMax > 0) {
      distances.push(txMax);
    }
  }

  if (Math.abs(direction.y) > 1e-10) {
    const tyMin = (bounds.yMin - origin.y) / direction.y;
    const tyMax = (bounds.yMax - origin.y) / direction.y;
    if (tyMin > 0) {
      distances.push(tyMin);
    }
    if (tyMax > 0) {
      distances.push(tyMax);
    }
  }

  return distances.length > 0 ? Math.min(...distances) : 0;
}

function unitFromAngle(angleDeg: number): Point {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: Math.cos(radians),
    y: Math.sin(radians)
  };
}

function perpendicular(vector: Point): Point {
  return {
    x: -vector.y,
    y: vector.x
  };
}

function negate(vector: Point): Point {
  return {
    x: -vector.x,
    y: -vector.y
  };
}

function centeredGridOffsets(negativeSpan: number, positiveSpan: number, spacing: number): number[] {
  const safeSpacing = Math.max(spacing, 1e-6);
  const negativeCount = Math.floor(negativeSpan / safeSpacing);
  const positiveCount = Math.floor(positiveSpan / safeSpacing);
  const offsets: number[] = [];

  for (let index = -negativeCount; index <= positiveCount; index += 1) {
    offsets.push(index * safeSpacing);
  }

  return offsets;
}

function majorGridStep(bounds: { xMin: number; xMax: number; yMin: number; yMax: number }): number {
  const span = Math.min(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin);
  const rawStep = span / 10;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }
  if (normalized <= 2) {
    return 2 * magnitude;
  }
  if (normalized <= 5) {
    return 5 * magnitude;
  }
  return 10 * magnitude;
}

function isCardinalAngle(angleDeg: number): boolean {
  const normalized = ((angleDeg % 90) + 90) % 90;
  return Math.min(normalized, 90 - normalized) < 1e-6;
}

function scaleGridDimensions(columns: number, rows: number, densityMultiplier: number): { columns: number; rows: number } {
  const target = columns * rows * densityMultiplier;
  const scale = Math.sqrt(densityMultiplier);
  let scaledColumns = Math.max(Math.round(columns * scale), 1);
  let scaledRows = Math.max(Math.round(rows * scale), 1);

  while (scaledColumns * scaledRows < target) {
    const columnScale = scaledColumns / Math.max(columns, 1);
    const rowScale = scaledRows / Math.max(rows, 1);
    if (columnScale <= rowScale) {
      scaledColumns += 1;
    } else {
      scaledRows += 1;
    }
  }

  return {
    columns: scaledColumns,
    rows: scaledRows
  };
}

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}
