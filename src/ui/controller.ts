import { computeFieldStats, findStagnationPoints } from "../model/analysis";
import { isPointBlocked } from "../model/domain";
import { createElementFromTemplate, updateElementParameters } from "../model/flowElements";
import { EXAMPLE_PRESETS, getExampleById } from "../model/examples";
import { createFlowField } from "../model/flowField";
import { generateAutoStreamlineSeeds } from "../model/streamlineSeeds";
import { solveStreamline } from "../solver/streamline";
import type {
  AppState,
  Bounds,
  ClickMode,
  ExamplePreset,
  FlowElement,
  PlacementTemplate,
  Point,
  StreamlineSeed,
  ViewModel
} from "../types";

export { EXAMPLE_PRESETS };

export interface ViewResetSnapshot {
  center: Point;
  worldHeight: number;
}

type Listener = (viewModel: ViewModel) => void;

const DEFAULT_VIEW_RESET: ViewResetSnapshot = {
  center: { x: 0, y: 0 },
  worldHeight: 8
};
const MIN_WORLD_HEIGHT = 1.5;
const MAX_WORLD_HEIGHT = 30;

export class AppController {
  private state: AppState;
  private viewModel: ViewModel;
  private readonly listeners = new Set<Listener>();
  private elementCounter = 1;
  private streamlineCounter = 1;
  private baseViewReset: ViewResetSnapshot = { ...DEFAULT_VIEW_RESET };
  private readonly baseViewAspect: number;
  private autoStreamlineCache: {
    elementsRef: AppState["elements"];
    guidesRef: AppState["guides"];
    seedBounds: Bounds;
    referenceWorldHeight: number;
    streamlines: ViewModel["streamlines"];
  } | null = null;

  constructor(initialState = createDefaultState()) {
    this.state = initialState;
    this.baseViewAspect = initialState.view.aspect;
    this.viewModel = this.buildViewModel(initialState);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.viewModel);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getViewModel(): ViewModel {
    return this.viewModel;
  }

  setViewportAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0) {
      return;
    }

    if (Math.abs(this.state.view.aspect - aspect) < 1e-4) {
      return;
    }

    this.state = {
      ...this.state,
      view: {
        ...clampViewToPanDomain(
          {
            ...this.state.view,
            aspect
          },
          this.baseViewReset
        )
      }
    };
    this.refresh();
  }

  setClickMode(clickMode: ClickMode): void {
    this.state = {
      ...this.state,
      clickMode
    };
    this.refresh();
  }

  setPlacementTemplate(nextTemplate: Partial<PlacementTemplate>): void {
    this.state = {
      ...this.state,
      placement: {
        ...this.state.placement,
        ...nextTemplate
      }
    };
    this.refresh();
  }

  setSelectedElementId(id: string | null): void {
    this.state = {
      ...this.state,
      selectedElementId: id
    };
    this.refresh();
  }

  setAnimationEnabled(animationEnabled: boolean): void {
    this.state = {
      ...this.state,
      animationEnabled
    };
    this.refresh();
  }

  setShowHeatmap(showHeatmap: boolean): void {
    this.state = {
      ...this.state,
      showHeatmap
    };
    this.refresh();
  }

  setShowGrid(showGrid: boolean): void {
    this.state = {
      ...this.state,
      showGrid
    };
    this.refresh();
  }

  setShowMarkers(showMarkers: boolean): void {
    this.state = {
      ...this.state,
      showMarkers
    };
    this.refresh();
  }

  setShowStagnationPoints(showStagnationPoints: boolean): void {
    this.state = {
      ...this.state,
      showStagnationPoints
    };
    this.refresh();
  }

  setSnapToGrid(snapToGrid: boolean): void {
    this.state = {
      ...this.state,
      snapToGrid
    };
    this.refresh();
  }

  setParticleDensity(particleDensity: number): void {
    this.state = {
      ...this.state,
      particleDensity: clamp(particleDensity, 0.5, 2.4)
    };
    this.refresh();
  }

  loadExample(id: string): void {
    const preset = getExampleById(id);
    if (!preset) {
      return;
    }

    this.baseViewReset = {
      center: { ...preset.view.center },
      worldHeight: preset.view.worldHeight
    };

    this.state = {
      ...this.state,
      exampleId: preset.id,
      view: {
        ...this.state.view,
        center: { ...preset.view.center },
        worldHeight: preset.view.worldHeight
      },
      elements: preset.elements.map((element) => ({ ...element })),
      guides: preset.guides ? preset.guides.map((guide) => cloneGuide(guide)) : [],
      streamlineSeeds: (preset.streamlineSeeds ?? []).map((seed) => ({ ...seed })),
      autoStreamlinesEnabled: !preset.streamlineSeeds || preset.streamlineSeeds.length === 0,
      selectedElementId: null
    };

    this.elementCounter = this.state.elements.length + 1;
    this.streamlineCounter = this.state.streamlineSeeds.length + 1;
    this.refresh();
  }

  clearElements(): void {
    this.state = {
      ...this.state,
      elements: [],
      guides: [],
      streamlineSeeds: [],
      exampleId: null,
      selectedElementId: null
    };
    this.refresh();
  }

  clearStreamlines(): void {
    this.state = {
      ...this.state,
      streamlineSeeds: [],
      autoStreamlinesEnabled: false
    };
    this.refresh();
  }

  sampleStreamlines(): void {
    this.state = {
      ...this.state,
      streamlineSeeds: [],
      autoStreamlinesEnabled: true
    };
    this.streamlineCounter = 1;
    this.refresh();
  }

  resetView(): void {
    this.state = {
      ...this.state,
      view: {
        ...this.state.view,
        center: { ...this.baseViewReset.center },
        worldHeight: this.baseViewReset.worldHeight
      }
    };
    this.refresh();
  }

  zoomAt(anchor: Point, zoomFactor: number): void {
    const nextWorldHeight = clamp(this.state.view.worldHeight * zoomFactor, MIN_WORLD_HEIGHT, MAX_WORLD_HEIGHT);
    const boundsBefore = deriveBounds(this.state);
    const boundsAfter = {
      xMin: 0,
      xMax: 0,
      yMin: 0,
      yMax: 0
    } satisfies Bounds;
    const nextWorldWidth = nextWorldHeight * this.state.view.aspect;
    boundsAfter.xMin = this.state.view.center.x - nextWorldWidth / 2;
    boundsAfter.xMax = this.state.view.center.x + nextWorldWidth / 2;
    boundsAfter.yMin = this.state.view.center.y - nextWorldHeight / 2;
    boundsAfter.yMax = this.state.view.center.y + nextWorldHeight / 2;

    const tx = (anchor.x - boundsBefore.xMin) / (boundsBefore.xMax - boundsBefore.xMin);
    const ty = (anchor.y - boundsBefore.yMin) / (boundsBefore.yMax - boundsBefore.yMin);

    const nextCenter = {
      x: anchor.x - (tx - 0.5) * nextWorldWidth,
      y: anchor.y - (ty - 0.5) * nextWorldHeight
    };

    this.state = {
      ...this.state,
      view: clampViewToPanDomain(
        {
          ...this.state.view,
          center: nextCenter,
          worldHeight: nextWorldHeight
        },
        this.baseViewReset
      )
    };
    this.refresh();
  }

  panBy(deltaWorld: Point): void {
    this.state = {
      ...this.state,
      view: clampViewToPanDomain(
        {
          ...this.state.view,
          center: {
            x: this.state.view.center.x + deltaWorld.x,
            y: this.state.view.center.y + deltaWorld.y
          }
        },
        this.baseViewReset
      )
    };
    this.refresh();
  }

  addElementAt(anchor: Point): void {
    if (isPointBlocked(anchor, this.state.guides)) {
      return;
    }

    const element = createElementFromTemplate(this.state.placement, anchor, `element-${this.elementCounter}`);
    this.elementCounter += 1;
    this.state = {
      ...this.state,
      exampleId: null,
      elements: [...this.state.elements, element],
      autoStreamlinesEnabled: true,
      selectedElementId: this.state.selectedElementId
    };
    this.refresh();
  }

  addStreamlineSeed(point: Point): void {
    if (isPointBlocked(point, this.state.guides)) {
      return;
    }

    const seed = {
      id: `streamline-${this.streamlineCounter}`,
      x: point.x,
      y: point.y
    } satisfies StreamlineSeed;
    this.streamlineCounter += 1;

    this.state = {
      ...this.state,
      streamlineSeeds: [...this.state.streamlineSeeds, seed]
    };
    this.refresh();
  }

  moveElement(id: string, anchor: Point): void {
    this.state = {
      ...this.state,
      elements: this.state.elements.map((element) =>
        element.id === id ? updateElementParameters(element, { anchor }) : element
      )
    };
    this.refresh();
  }

  updateSelectedElement(updates: { magnitude?: number; angleDeg?: number; coreRadius?: number }): void {
    if (!this.state.selectedElementId) {
      return;
    }

    this.state = {
      ...this.state,
      elements: this.state.elements.map((element) =>
        element.id === this.state.selectedElementId ? updateElementParameters(element, updates) : element
      )
    };
    this.refresh();
  }

  deleteElement(id: string): void {
    this.state = {
      ...this.state,
      elements: this.state.elements.filter((element) => element.id !== id),
      selectedElementId: this.state.selectedElementId === id ? null : this.state.selectedElementId,
      exampleId: null
    };
    this.refresh();
  }

  deleteSelectedElement(): void {
    if (!this.state.selectedElementId) {
      return;
    }

    this.deleteElement(this.state.selectedElementId);
  }

  toggleElementVisibility(id: string): void {
    this.state = {
      ...this.state,
      elements: this.state.elements.map((element) =>
        element.id === id ? updateElementParameters(element, { visible: !element.visible }) : element
      )
    };
    this.refresh();
  }

  getSelectedElement(): FlowElement | null {
    return this.state.selectedElementId
      ? this.state.elements.find((element) => element.id === this.state.selectedElementId) ?? null
      : null;
  }

  private refresh(): void {
    this.viewModel = this.buildViewModel(this.state);
    this.listeners.forEach((listener) => listener(this.viewModel));
  }

  private buildViewModel(state: AppState): ViewModel {
    const flowField = createFlowField(state.elements);
    const visibleBounds = deriveBounds(state);
    const navigationBounds = derivePanDomain(this.baseViewReset, state.view.aspect);
    const streamlineSeedBounds = deriveStreamlineBounds(
      state,
      this.baseViewReset,
      this.baseViewAspect
    );
    const fieldStats = computeFieldStats(flowField, visibleBounds);
    const stagnationPoints = findStagnationPoints(flowField, visibleBounds);
    const manualSolveBounds = unionBounds(streamlineSeedBounds, navigationBounds);
    const autoStreamlines = state.autoStreamlinesEnabled
      ? this.getAutoStreamlines(
          state,
          flowField,
          visibleBounds,
          navigationBounds,
          stagnationPoints
        )
      : [];
    const manualStreamlines = state.streamlineSeeds.map((seed) =>
      solveStreamline(seed, manualSolveBounds, flowField, state.guides)
    );
    const streamlines = [...autoStreamlines, ...manualStreamlines];

    return {
      state,
      flowField,
      visibleBounds,
      fieldStats,
      stagnationPoints,
      streamlines
    };
  }

  private getAutoStreamlines(
    state: AppState,
    flowField: ViewModel["flowField"],
    visibleBounds: Bounds,
    navigationBounds: Bounds,
    stagnationPoints: ViewModel["stagnationPoints"]
  ): ViewModel["streamlines"] {
    if (
      this.autoStreamlineCache &&
      this.autoStreamlineCache.elementsRef === state.elements &&
      this.autoStreamlineCache.guidesRef === state.guides &&
      isBoundsInside(visibleBounds, shrinkBounds(this.autoStreamlineCache.seedBounds, 0.06)) &&
      state.view.worldHeight >= this.autoStreamlineCache.referenceWorldHeight * 0.78 &&
      state.view.worldHeight <= this.autoStreamlineCache.referenceWorldHeight * 1.28
    ) {
      return this.autoStreamlineCache.streamlines;
    }

    const autoSeedBounds = clampBoundsToDomain(expandBounds(visibleBounds, 0.12), navigationBounds);
    const autoSolveBounds = clampBoundsToDomain(expandBounds(autoSeedBounds, 0.22), navigationBounds);
    const streamlines = generateAutoStreamlineSeeds(
      flowField,
      state.elements,
      autoSeedBounds,
      state.guides,
      stagnationPoints
    ).map((seed) => solveStreamline(seed, autoSolveBounds, flowField, state.guides));

    this.autoStreamlineCache = {
      elementsRef: state.elements,
      guidesRef: state.guides,
      seedBounds: autoSeedBounds,
      referenceWorldHeight: state.view.worldHeight,
      streamlines
    };

    return streamlines;
  }
}

export function createDefaultState(): AppState {
  return {
    view: {
      center: { ...DEFAULT_VIEW_RESET.center },
      worldHeight: DEFAULT_VIEW_RESET.worldHeight,
      aspect: 16 / 10
    },
    elements: [],
    guides: [],
    streamlineSeeds: [],
    autoStreamlinesEnabled: true,
    selectedElementId: null,
    placement: {
      kind: "source",
      magnitude: 5,
      angleDeg: 0,
      coreRadius: 0.14
    },
    clickMode: "element",
    snapToGrid: true,
    animationEnabled: true,
    showGrid: true,
    showHeatmap: true,
    showMarkers: true,
    showStagnationPoints: true,
    particleDensity: 2.4,
    exampleId: null
  };
}

function deriveBounds(state: AppState): Bounds {
  const worldWidth = state.view.worldHeight * state.view.aspect;
  return {
    xMin: state.view.center.x - worldWidth / 2,
    xMax: state.view.center.x + worldWidth / 2,
    yMin: state.view.center.y - state.view.worldHeight / 2,
    yMax: state.view.center.y + state.view.worldHeight / 2
  } satisfies Bounds;
}

function deriveBoundsFromView(
  view: Pick<AppState["view"], "center" | "worldHeight" | "aspect">
): Bounds {
  const worldWidth = view.worldHeight * view.aspect;
  return {
    xMin: view.center.x - worldWidth / 2,
    xMax: view.center.x + worldWidth / 2,
    yMin: view.center.y - view.worldHeight / 2,
    yMax: view.center.y + view.worldHeight / 2
  } satisfies Bounds;
}

function clampViewToPanDomain(
  view: AppState["view"],
  baseViewReset: ViewResetSnapshot
): AppState["view"] {
  const panDomain = derivePanDomain(baseViewReset, view.aspect);
  const currentBounds = deriveBoundsFromView(view);
  const halfWidth = (currentBounds.xMax - currentBounds.xMin) / 2;
  const halfHeight = (currentBounds.yMax - currentBounds.yMin) / 2;
  const minCenterX = panDomain.xMin + halfWidth;
  const maxCenterX = panDomain.xMax - halfWidth;
  const minCenterY = panDomain.yMin + halfHeight;
  const maxCenterY = panDomain.yMax - halfHeight;

  return {
    ...view,
    center: {
      x: clamp(view.center.x, minCenterX, maxCenterX),
      y: clamp(view.center.y, minCenterY, maxCenterY)
    }
  };
}

function derivePanDomain(
  baseViewReset: ViewResetSnapshot,
  aspect: number
): Bounds {
  return deriveBoundsFromView({
    center: baseViewReset.center,
    worldHeight: MAX_WORLD_HEIGHT,
    aspect
  });
}

function expandBounds(bounds: Bounds, relativeMargin: number): Bounds {
  const marginX = (bounds.xMax - bounds.xMin) * relativeMargin;
  const marginY = (bounds.yMax - bounds.yMin) * relativeMargin;
  return {
    xMin: bounds.xMin - marginX,
    xMax: bounds.xMax + marginX,
    yMin: bounds.yMin - marginY,
    yMax: bounds.yMax + marginY
  } satisfies Bounds;
}

function clampBoundsToDomain(bounds: Bounds, domain: Bounds): Bounds {
  return {
    xMin: clamp(bounds.xMin, domain.xMin, domain.xMax),
    xMax: clamp(bounds.xMax, domain.xMin, domain.xMax),
    yMin: clamp(bounds.yMin, domain.yMin, domain.yMax),
    yMax: clamp(bounds.yMax, domain.yMin, domain.yMax)
  } satisfies Bounds;
}

function shrinkBounds(bounds: Bounds, relativeMargin: number): Bounds {
  const marginX = (bounds.xMax - bounds.xMin) * relativeMargin;
  const marginY = (bounds.yMax - bounds.yMin) * relativeMargin;
  return {
    xMin: bounds.xMin + marginX,
    xMax: bounds.xMax - marginX,
    yMin: bounds.yMin + marginY,
    yMax: bounds.yMax - marginY
  } satisfies Bounds;
}

function isBoundsInside(inner: Bounds, outer: Bounds): boolean {
  return (
    inner.xMin >= outer.xMin &&
    inner.xMax <= outer.xMax &&
    inner.yMin >= outer.yMin &&
    inner.yMax <= outer.yMax
  );
}

function deriveStreamlineBounds(
  state: AppState,
  baseViewReset: ViewResetSnapshot,
  baseAspect: number
): Bounds {
  const baseBounds = {
    xMin: baseViewReset.center.x - (baseViewReset.worldHeight * baseAspect) / 2,
    xMax: baseViewReset.center.x + (baseViewReset.worldHeight * baseAspect) / 2,
    yMin: baseViewReset.center.y - baseViewReset.worldHeight / 2,
    yMax: baseViewReset.center.y + baseViewReset.worldHeight / 2
  } satisfies Bounds;

  const extentPoints: Point[] = [
    ...state.streamlineSeeds,
    ...state.elements
      .filter((element) => element.visible && element.kind !== "uniform")
      .map((element) => element.anchor),
    ...state.guides.flatMap((guide) => guideExtentPoints(guide, baseBounds))
  ];

  if (extentPoints.length === 0) {
    return baseBounds;
  }

  const minX = Math.min(baseBounds.xMin, ...extentPoints.map((point) => point.x));
  const maxX = Math.max(baseBounds.xMax, ...extentPoints.map((point) => point.x));
  const minY = Math.min(baseBounds.yMin, ...extentPoints.map((point) => point.y));
  const maxY = Math.max(baseBounds.yMax, ...extentPoints.map((point) => point.y));
  const marginX = Math.max((maxX - minX) * 0.14, 0.8);
  const marginY = Math.max((maxY - minY) * 0.14, 0.8);

  return {
    xMin: minX - marginX,
    xMax: maxX + marginX,
    yMin: minY - marginY,
    yMax: maxY + marginY
  } satisfies Bounds;
}

function unionBounds(left: Bounds, right: Bounds): Bounds {
  return {
    xMin: Math.min(left.xMin, right.xMin),
    xMax: Math.max(left.xMax, right.xMax),
    yMin: Math.min(left.yMin, right.yMin),
    yMax: Math.max(left.yMax, right.yMax)
  } satisfies Bounds;
}

function guideExtentPoints(guide: NonNullable<AppState["guides"]>[number], fallbackBounds: Bounds): Point[] {
  switch (guide.kind) {
    case "line":
      return [guide.from, guide.to];
    case "circle":
      return [
        { x: guide.center.x - guide.radius, y: guide.center.y },
        { x: guide.center.x + guide.radius, y: guide.center.y },
        { x: guide.center.x, y: guide.center.y - guide.radius },
        { x: guide.center.x, y: guide.center.y + guide.radius }
      ];
    case "half-plane":
      if (guide.axis === "x") {
        return [
          { x: guide.value, y: fallbackBounds.yMin },
          { x: guide.value, y: fallbackBounds.yMax }
        ];
      }
      return [
        { x: fallbackBounds.xMin, y: guide.value },
        { x: fallbackBounds.xMax, y: guide.value }
      ];
    default:
      return assertNever(guide);
  }
}

function cloneGuide(guide: NonNullable<ExamplePreset["guides"]>[number]) {
  return JSON.parse(JSON.stringify(guide));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
