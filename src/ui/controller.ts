import { computeFieldStats, findStagnationPoints } from "../model/analysis";
import { isPointBlocked } from "../model/domain";
import { createElementFromTemplate, defaultPlacementMagnitude, updateElementParameters } from "../model/flowElements";
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

interface ViewportMetrics {
  aspect: number;
}

type Listener = (viewModel: ViewModel) => void;

const DEFAULT_VIEW_RESET: ViewResetSnapshot = {
  center: { x: 0, y: 0 },
  worldHeight: 8
};

export class AppController {
  private state: AppState;
  private viewModel: ViewModel;
  private readonly listeners = new Set<Listener>();
  private elementCounter = 1;
  private streamlineCounter = 1;
  private baseViewReset: ViewResetSnapshot = { ...DEFAULT_VIEW_RESET };

  constructor(initialState = createDefaultState()) {
    this.state = initialState;
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

  setViewportMetrics(metrics: ViewportMetrics): void {
    if (!Number.isFinite(metrics.aspect) || metrics.aspect <= 0) {
      return;
    }

    if (Math.abs(this.state.view.aspect - metrics.aspect) < 1e-4) {
      return;
    }

    this.state = {
      ...this.state,
      view: {
        ...this.state.view,
        aspect: metrics.aspect
      }
    };
    this.refresh();
  }

  setViewportAspect(aspect: number): void {
    this.setViewportMetrics({ aspect });
  }

  setClickMode(clickMode: ClickMode): void {
    this.state = {
      ...this.state,
      clickMode
    };
    this.refresh();
  }

  setPlacementTemplate(nextTemplate: Partial<PlacementTemplate>): void {
    const nextKind = nextTemplate.kind ?? this.state.placement.kind;
    const shouldResetMagnitude =
      nextTemplate.kind !== undefined &&
      nextTemplate.kind !== this.state.placement.kind &&
      nextTemplate.magnitude === undefined;

    this.state = {
      ...this.state,
      placement: {
        ...this.state.placement,
        ...(shouldResetMagnitude ? { magnitude: defaultPlacementMagnitude(nextKind) } : {}),
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
      autoStreamlinesEnabled: true,
      exampleId: null,
      selectedElementId: null
    };
    this.streamlineCounter = 1;
    this.refresh();
  }

  clearStreamlines(): void {
    this.state = {
      ...this.state,
      streamlineSeeds: [],
      autoStreamlinesEnabled: false
    };
    this.streamlineCounter = 1;
    this.refresh();
  }

  resetStreamlines(): void {
    if (this.state.exampleId !== null) {
      const preset = getExampleById(this.state.exampleId);
      if (!preset) {
        return;
      }

      this.state = {
        ...this.state,
        streamlineSeeds: (preset.streamlineSeeds ?? []).map((seed) => ({ ...seed })),
        autoStreamlinesEnabled: !preset.streamlineSeeds || preset.streamlineSeeds.length === 0
      };
      this.streamlineCounter = this.state.streamlineSeeds.length + 1;
      this.refresh();
      return;
    }

    this.state = {
      ...this.state,
      streamlineSeeds: [],
      autoStreamlinesEnabled: true
    };
    this.streamlineCounter = 1;
    this.refresh();
  }

  sampleStreamlines(_columns = 9, _rows = 6): void {
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

  zoomAt(_anchor: Point, _zoomFactor: number): void {}

  panBy(_deltaWorld: Point): void {}

  addElementAt(anchor: Point): void {
    if (isPointBlocked(anchor, this.state.guides)) {
      return;
    }

    const element = createElementFromTemplate(this.state.placement, anchor, `element-${this.elementCounter}`);
    this.elementCounter += 1;
    const editedExample = this.state.exampleId !== null;
    this.state = {
      ...this.state,
      exampleId: null,
      elements: [...this.state.elements, element],
      streamlineSeeds: editedExample ? [] : this.state.streamlineSeeds,
      autoStreamlinesEnabled: editedExample ? true : this.state.autoStreamlinesEnabled,
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
    const nextState = this.elementEditState();
    this.state = {
      ...this.state,
      ...nextState,
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

    const nextState = this.elementEditState();
    this.state = {
      ...this.state,
      ...nextState,
      elements: this.state.elements.map((element) =>
        element.id === this.state.selectedElementId ? updateElementParameters(element, updates) : element
      )
    };
    this.refresh();
  }

  deleteElement(id: string): void {
    const nextState = this.elementEditState();
    this.state = {
      ...this.state,
      ...nextState,
      elements: this.state.elements.filter((element) => element.id !== id),
      selectedElementId: this.state.selectedElementId === id ? null : this.state.selectedElementId
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
    const nextState = this.elementEditState();
    this.state = {
      ...this.state,
      ...nextState,
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

  private elementEditState(): Pick<AppState, "exampleId" | "streamlineSeeds" | "autoStreamlinesEnabled"> {
    if (this.state.exampleId !== null) {
      return {
        exampleId: null,
        streamlineSeeds: [],
        autoStreamlinesEnabled: true
      };
    }

    return {
      exampleId: null,
      streamlineSeeds: this.state.streamlineSeeds,
      autoStreamlinesEnabled: this.state.autoStreamlinesEnabled
    };
  }

  private refresh(): void {
    this.viewModel = this.buildViewModel(this.state);
    this.listeners.forEach((listener) => listener(this.viewModel));
  }

  private buildViewModel(state: AppState): ViewModel {
    const flowField = createFlowField(state.elements);
    const visibleBounds = deriveBounds(state);
    const fieldStats = computeFieldStats(flowField, visibleBounds);
    const stagnationPoints = findStagnationPoints(flowField, visibleBounds);
    const autoStreamlines = state.autoStreamlinesEnabled
      ? generateAutoStreamlineSeeds(flowField, state.elements, visibleBounds, state.guides, stagnationPoints).map((seed) =>
          solveStreamline(seed, visibleBounds, flowField, state.guides)
        )
      : [];
    const manualStreamlines = state.streamlineSeeds.map((seed) =>
      solveStreamline(seed, visibleBounds, flowField, state.guides)
    );

    return {
      state,
      flowField,
      visibleBounds,
      fieldStats,
      stagnationPoints,
      streamlines: [...autoStreamlines, ...manualStreamlines]
    };
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
      magnitude: defaultPlacementMagnitude("source"),
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

function cloneGuide(guide: NonNullable<ExamplePreset["guides"]>[number]) {
  return JSON.parse(JSON.stringify(guide));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
