export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export type ClickMode = "element" | "streamline";

export type FlowElementKind = "uniform" | "source" | "sink" | "vortex" | "doublet";

export interface BaseFlowElement {
  id: string;
  kind: FlowElementKind;
  anchor: Point;
  visible: boolean;
  label?: string;
}

export interface UniformFlowElement extends BaseFlowElement {
  kind: "uniform";
  speed: number;
  angleDeg: number;
}

export interface SourceSinkFlowElement extends BaseFlowElement {
  kind: "source" | "sink";
  strength: number;
  coreRadius: number;
}

export interface VortexFlowElement extends BaseFlowElement {
  kind: "vortex";
  circulation: number;
  coreRadius: number;
}

export interface DoubletFlowElement extends BaseFlowElement {
  kind: "doublet";
  strength: number;
  angleDeg: number;
  coreRadius: number;
}

export type FlowElement =
  | UniformFlowElement
  | SourceSinkFlowElement
  | VortexFlowElement
  | DoubletFlowElement;

export interface FlowFieldVelocity {
  u: number;
  v: number;
  speed: number;
}

export interface FlowFieldEvaluation extends FlowFieldVelocity {
  phi: number;
  psi: number;
}

export interface FlowField {
  elements: readonly FlowElement[];
  velocityAt: (point: Point) => FlowFieldVelocity;
  evaluate: (point: Point) => FlowFieldEvaluation;
  distanceToNearestSingularity: (point: Point) => number;
}

export interface StreamlineSeed extends Point {
  id: string;
}

export type StreamlineTerminationReason =
  | "escaped-view"
  | "length-limit"
  | "max-steps"
  | "singularity"
  | "stagnation"
  | "blocked"
  | "invalid";

export interface Streamline {
  id: string;
  seed: StreamlineSeed;
  points: Point[];
  arcLength: number;
  terminationReason: StreamlineTerminationReason;
}

export interface FieldStats {
  sampledSpeedMax: number;
  sampledSpeedReference: number;
  sampleCount: number;
}

export interface StagnationPoint extends Point {
  residual: number;
}

export type Guide =
  | {
      kind: "line";
      id: string;
      from: Point;
      to: Point;
      label?: string;
    }
  | {
      kind: "circle";
      id: string;
      center: Point;
      radius: number;
      label?: string;
      solid?: boolean;
    }
  | {
      kind: "half-plane";
      id: string;
      axis: "x" | "y";
      value: number;
      side: "above" | "below" | "left" | "right";
      label?: string;
      solid?: boolean;
    };

export interface ViewState {
  center: Point;
  worldHeight: number;
  aspect: number;
}

export interface PlacementTemplate {
  kind: FlowElementKind;
  magnitude: number;
  angleDeg: number;
  coreRadius: number;
}

export interface AppState {
  view: ViewState;
  elements: FlowElement[];
  guides: Guide[];
  streamlineSeeds: StreamlineSeed[];
  autoStreamlinesEnabled: boolean;
  selectedElementId: string | null;
  placement: PlacementTemplate;
  clickMode: ClickMode;
  snapToGrid: boolean;
  animationEnabled: boolean;
  showGrid: boolean;
  showHeatmap: boolean;
  showMarkers: boolean;
  showStagnationPoints: boolean;
  particleDensity: number;
  exampleId: string | null;
}

export interface ExamplePreset {
  id: string;
  label: string;
  description: string;
  view: Pick<ViewState, "center" | "worldHeight">;
  elements: FlowElement[];
  guides?: Guide[];
  streamlineSeeds?: StreamlineSeed[];
}

export interface ViewModel {
  state: AppState;
  flowField: FlowField;
  visibleBounds: Bounds;
  streamlines: Streamline[];
  fieldStats: FieldStats;
  stagnationPoints: StagnationPoint[];
}
