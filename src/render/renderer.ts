import { isPointBlocked } from "../model/domain";
import type { FlowElement, FlowField, Guide, Point, Streamline, ViewModel } from "../types";
import { ParticleEngine } from "./particles";
import {
  createViewport,
  niceGridStep,
  screenToWorld,
  type Viewport,
  worldToScreen
} from "./viewport";

const BACKGROUND_COLOR = "#081019";
const PANEL_DARK = "#0c1522";
const GRID_MINOR = "rgba(116, 170, 255, 0.06)";
const GRID_MID = "rgba(125, 186, 255, 0.1)";
const GRID_MAJOR = "rgba(134, 193, 255, 0.13)";
const AXIS_COLOR = "rgba(201, 230, 255, 0.22)";
const STREAMLINE_COLOR = "rgba(120, 197, 255, 0.55)";
const STREAMLINE_GLOW = "rgba(53, 149, 255, 0.14)";
const GUIDE_COLOR = "rgba(180, 221, 255, 0.75)";
const SOLID_FILL = "rgba(7, 11, 18, 0.68)";
const SOLID_HALF_PLANE_FILL = "rgba(4, 8, 14, 0.56)";
const STAGNATION_COLOR = "rgba(255, 205, 124, 0.95)";
const MARKER_RADIUS_WORLD = 0.085;
const MARKER_FONT_SIZE_WORLD = 0.108;
const MARKER_ARROW_LENGTH_WORLD = 0.142;
const SELECTED_STROKE = "rgb(255, 255, 255)";

export class PotentialFlowRenderer {
  private readonly stageElement: HTMLElement;
  private readonly sceneCanvas: HTMLCanvasElement;
  private readonly flowCanvas: HTMLCanvasElement;
  private readonly sceneContext: CanvasRenderingContext2D;
  private readonly flowContext: CanvasRenderingContext2D;
  private readonly particleEngine = new ParticleEngine();
  private viewport: Viewport;
  private viewModel: ViewModel | null = null;
  private lastTimestamp: number | null = null;
  private animationFrameHandle = 0;
  private onAspectChange?: (aspect: number) => void;
  private onViewportMetricsChange?: (metrics: { width: number; height: number; aspect: number }) => void;

  constructor(sceneCanvas: HTMLCanvasElement, flowCanvas: HTMLCanvasElement) {
    const stageElement = sceneCanvas.parentElement;
    if (!stageElement) {
      throw new Error("Scene canvas must be mounted inside a stage element.");
    }

    this.stageElement = stageElement;
    this.sceneCanvas = sceneCanvas;
    this.flowCanvas = flowCanvas;

    const sceneContext = sceneCanvas.getContext("2d");
    const flowContext = flowCanvas.getContext("2d");

    if (!sceneContext || !flowContext) {
      throw new Error("Canvas 2D rendering context is required.");
    }

    this.sceneContext = sceneContext;
    this.flowContext = flowContext;
    this.viewport = createViewport(1, 1, window.devicePixelRatio || 1, {
      center: { x: 0, y: 0 },
      worldHeight: 8,
      aspect: 1
    });
  }

  setAspectChangeListener(listener: (aspect: number) => void): void {
    this.onAspectChange = listener;
  }

  setViewportMetricsListener(listener: (metrics: { width: number; height: number; aspect: number }) => void): void {
    this.onViewportMetricsChange = listener;
  }

  attachResizeObserver(): void {
    const resize = () => {
      const resized = this.syncSurfaceSize();
      if (resized && this.viewModel) {
        this.render(this.viewModel);
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(this.stageElement);
    window.addEventListener("resize", resize);
  }

  start(): void {
    if (this.animationFrameHandle !== 0) {
      return;
    }

    const tick = (timestamp: number) => {
      this.animationFrameHandle = window.requestAnimationFrame(tick);
      const resized = this.syncSurfaceSize();
      if (!this.viewModel) {
        this.lastTimestamp = timestamp;
        return;
      }

      if (resized) {
        this.render(this.viewModel);
      }

      const deltaSeconds = this.lastTimestamp === null ? 1 / 60 : Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
      this.lastTimestamp = timestamp;

      if (!this.viewModel.state.animationEnabled) {
        this.flowContext.clearRect(0, 0, this.viewport.width, this.viewport.height);
        return;
      }

      const count = this.estimateParticleCount(this.viewModel.state.particleDensity);
      this.particleEngine.reset(count, this.viewport, this.viewModel.flowField, this.viewModel.state.guides);
      this.particleEngine.stepAndRender(
        this.flowContext,
        this.viewport,
        this.viewModel.flowField,
        this.viewModel.state.guides,
        this.viewModel.fieldStats,
        deltaSeconds
      );
    };

    this.animationFrameHandle = window.requestAnimationFrame(tick);
  }

  render(viewModel: ViewModel): void {
    this.viewModel = viewModel;
    this.syncSurfaceSize();
    this.viewport = createViewport(this.viewport.width, this.viewport.height, this.viewport.dpr, viewModel.state.view);
    this.renderScene();
    this.flowContext.clearRect(0, 0, this.viewport.width, this.viewport.height);
  }

  resize(): void {
    const resized = this.syncSurfaceSize();
    if (resized && this.viewModel) {
      this.render(this.viewModel);
    }
  }

  private syncSurfaceSize(): boolean {
    const rect = this.stageElement.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(Math.round(rect.width), 1);
    const height = Math.max(Math.round(rect.height), 1);
    const targetPixelWidth = Math.max(Math.round(width * dpr), 1);
    const targetPixelHeight = Math.max(Math.round(height * dpr), 1);

    const unchanged =
      this.viewport.width === width &&
      this.viewport.height === height &&
      Math.abs(this.viewport.dpr - dpr) < 1e-4 &&
      this.sceneCanvas.width === targetPixelWidth &&
      this.sceneCanvas.height === targetPixelHeight &&
      this.flowCanvas.width === targetPixelWidth &&
      this.flowCanvas.height === targetPixelHeight;

    if (unchanged) {
      return false;
    }

    for (const canvas of [this.sceneCanvas, this.flowCanvas]) {
      canvas.width = targetPixelWidth;
      canvas.height = targetPixelHeight;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }

    this.sceneContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.flowContext.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.viewport = createViewport(width, height, dpr, this.viewModel?.state.view ?? {
      center: { x: 0, y: 0 },
      worldHeight: 8,
      aspect: width / Math.max(height, 1)
    });

    const aspect = width / Math.max(height, 1);
    if (this.onAspectChange) {
      this.onAspectChange(aspect);
    }
    if (this.onViewportMetricsChange) {
      this.onViewportMetricsChange({ width, height, aspect });
    }

    return true;
  }

  clientToWorld(clientX: number, clientY: number): Point | null {
    const rect = this.flowCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return screenToWorld(
      {
        x: clientX - rect.left,
        y: clientY - rect.top
      },
      this.viewport
    );
  }

  hitTestElement(worldPoint: Point): FlowElement | null {
    if (!this.viewModel) {
      return null;
    }

    const tolerance = Math.max(this.viewport.worldHeight * 0.03, 0.18);
    let best: FlowElement | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const element of this.viewModel.state.elements) {
      if (!element.visible) {
        continue;
      }
      const distance = Math.hypot(worldPoint.x - element.anchor.x, worldPoint.y - element.anchor.y);
      if (distance <= tolerance && distance < bestDistance) {
        bestDistance = distance;
        best = element;
      }
    }

    return best;
  }

  estimateGridStep(): number {
    return niceGridStep(this.viewport.bounds);
  }

  estimateSnapStep(): number {
    return this.estimateGridStep() / 2;
  }

  screenPointForWorld(worldPoint: Point): Point {
    return worldToScreen(worldPoint, this.viewport);
  }

  getVisibleBounds() {
    return this.viewport.bounds;
  }

  private estimateParticleCount(density: number): number {
    const base = (this.viewport.width * this.viewport.height) / 9800;
    return Math.max(240, Math.min(Math.round(base * density), 2200));
  }

  private renderScene(): void {
    if (!this.viewModel) {
      return;
    }

    const { state, flowField, fieldStats } = this.viewModel;
    const context = this.sceneContext;

    context.clearRect(0, 0, this.viewport.width, this.viewport.height);
    context.fillStyle = BACKGROUND_COLOR;
    context.fillRect(0, 0, this.viewport.width, this.viewport.height);

    const gradient = context.createRadialGradient(
      this.viewport.width * 0.75,
      this.viewport.height * 0.2,
      0,
      this.viewport.width * 0.75,
      this.viewport.height * 0.2,
      Math.max(this.viewport.width, this.viewport.height)
    );
    gradient.addColorStop(0, "rgba(31, 67, 124, 0.18)");
    gradient.addColorStop(1, "rgba(8, 16, 25, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.viewport.width, this.viewport.height);

    if (state.showHeatmap) {
      this.renderHeatmap(context, flowField, fieldStats.sampledSpeedReference, state.guides);
    }

    if (state.showGrid) {
      this.renderGrid(context);
    }

    this.renderGuides(context, state.guides);
    this.renderStreamlines(context, this.viewModel.streamlines, state.guides);

    if (state.showMarkers) {
      this.renderElementMarkers(context, state.elements, state.selectedElementId);
    }
  }

  private renderHeatmap(
    context: CanvasRenderingContext2D,
    flowField: FlowField,
    referenceSpeed: number,
    guides: readonly Guide[]
  ): void {
    const sampleWidth = Math.max(Math.round(this.viewport.width / 5), 64);
    const sampleHeight = Math.max(Math.round(this.viewport.height / 5), 40);
    const offscreen = document.createElement("canvas");
    offscreen.width = sampleWidth;
    offscreen.height = sampleHeight;
    const offContext = offscreen.getContext("2d");

    if (!offContext) {
      return;
    }

    const image = offContext.createImageData(sampleWidth, sampleHeight);
    const reference = Math.max(referenceSpeed, 1e-3);

    for (let row = 0; row < sampleHeight; row += 1) {
      for (let column = 0; column < sampleWidth; column += 1) {
        const world = screenToWorld(
          {
            x: (column / Math.max(sampleWidth - 1, 1)) * this.viewport.width,
            y: (row / Math.max(sampleHeight - 1, 1)) * this.viewport.height
          },
          this.viewport
        );
        const pixelIndex = (row * sampleWidth + column) * 4;

        if (isPointBlocked(world, guides)) {
          image.data[pixelIndex + 3] = 0;
          continue;
        }

        const velocity = flowField.velocityAt(world);
        const normalized = clamp(velocity.speed / reference, 0, 2.6) / 2.6;
        image.data[pixelIndex] = Math.round(18 + 16 * normalized);
        image.data[pixelIndex + 1] = Math.round(32 + 70 * normalized);
        image.data[pixelIndex + 2] = Math.round(56 + 168 * normalized);
        image.data[pixelIndex + 3] = Math.round(18 + 92 * normalized);
      }
    }

    offContext.putImageData(image, 0, 0);

    context.save();
    context.imageSmoothingEnabled = true;
    context.drawImage(offscreen, 0, 0, this.viewport.width, this.viewport.height);
    context.restore();
  }

  private renderGrid(context: CanvasRenderingContext2D): void {
    const majorStep = niceGridStep(this.viewport.bounds);
    const minorStep = majorStep / 6;
    const snapStep = majorStep / 2;

    context.save();
    context.lineWidth = 1;

    drawGridLines(context, this.viewport, minorStep, GRID_MINOR);
    drawGridLines(context, this.viewport, snapStep, GRID_MID);
    drawGridLines(context, this.viewport, majorStep, GRID_MAJOR);

    if (this.viewport.bounds.xMin <= 0 && this.viewport.bounds.xMax >= 0) {
      const x = worldToScreen({ x: 0, y: 0 }, this.viewport).x;
      context.strokeStyle = AXIS_COLOR;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, this.viewport.height);
      context.stroke();
    }

    if (this.viewport.bounds.yMin <= 0 && this.viewport.bounds.yMax >= 0) {
      const y = worldToScreen({ x: 0, y: 0 }, this.viewport).y;
      context.strokeStyle = AXIS_COLOR;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(this.viewport.width, y);
      context.stroke();
    }

    context.restore();
  }

  private renderGuides(context: CanvasRenderingContext2D, guides: readonly Guide[]): void {
    context.save();

    for (const guide of guides) {
      if (!(("solid" in guide) && guide.solid)) {
        continue;
      }

      switch (guide.kind) {
        case "circle": {
          const center = worldToScreen(guide.center, this.viewport);
          const radius = guide.radius * this.viewport.pixelsPerUnit;
          context.fillStyle = SOLID_FILL;
          context.beginPath();
          context.arc(center.x, center.y, radius, 0, Math.PI * 2);
          context.fill();
          break;
        }
        case "half-plane": {
          context.fillStyle = SOLID_HALF_PLANE_FILL;
          switch (guide.side) {
            case "below": {
              const y = worldToScreen({ x: 0, y: guide.value }, this.viewport).y;
              context.fillRect(0, y, this.viewport.width, this.viewport.height - y);
              break;
            }
            case "above": {
              const y = worldToScreen({ x: 0, y: guide.value }, this.viewport).y;
              context.fillRect(0, 0, this.viewport.width, y);
              break;
            }
            case "left": {
              const x = worldToScreen({ x: guide.value, y: 0 }, this.viewport).x;
              context.fillRect(0, 0, x, this.viewport.height);
              break;
            }
            case "right": {
              const x = worldToScreen({ x: guide.value, y: 0 }, this.viewport).x;
              context.fillRect(x, 0, this.viewport.width - x, this.viewport.height);
              break;
            }
          }
          break;
        }
        default:
          assertNever(guide);
      }
    }

    for (const guide of guides) {
      switch (guide.kind) {
        case "circle": {
          const center = worldToScreen(guide.center, this.viewport);
          const radius = guide.radius * this.viewport.pixelsPerUnit;
          context.strokeStyle = GUIDE_COLOR;
          context.lineWidth = 1.4;
          context.beginPath();
          context.arc(center.x, center.y, radius, 0, Math.PI * 2);
          context.stroke();
          break;
        }
        case "line": {
          const start = worldToScreen(guide.from, this.viewport);
          const end = worldToScreen(guide.to, this.viewport);
          context.strokeStyle = GUIDE_COLOR;
          context.lineWidth = 1.5;
          context.setLineDash([7, 7]);
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();
          context.setLineDash([]);
          break;
        }
        case "half-plane": {
          if (guide.axis === "y") {
            const y = worldToScreen({ x: 0, y: guide.value }, this.viewport).y;
            context.strokeStyle = GUIDE_COLOR;
            context.lineWidth = 1.1;
            context.setLineDash([6, 6]);
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(this.viewport.width, y);
            context.stroke();
            context.setLineDash([]);
          }
          if (guide.axis === "x") {
            const x = worldToScreen({ x: guide.value, y: 0 }, this.viewport).x;
            context.strokeStyle = GUIDE_COLOR;
            context.lineWidth = 1.1;
            context.setLineDash([6, 6]);
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, this.viewport.height);
            context.stroke();
            context.setLineDash([]);
          }
          break;
        }
        default:
          assertNever(guide);
      }
    }

    context.restore();
  }

  private renderStreamlines(
    context: CanvasRenderingContext2D,
    streamlines: readonly Streamline[],
    guides: readonly Guide[]
  ): void {
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";

    for (const streamline of streamlines) {
      if (streamline.points.length < 2) {
        continue;
      }

      context.strokeStyle = STREAMLINE_GLOW;
      context.lineWidth = 5.2;
      context.beginPath();
      tracePolyline(context, streamline.points, this.viewport);
      context.stroke();

      context.strokeStyle = STREAMLINE_COLOR;
      context.lineWidth = 1.8;
      context.beginPath();
      tracePolyline(context, streamline.points, this.viewport);
      context.stroke();
    }

    context.restore();
  }

  private renderStagnationPoints(
    context: CanvasRenderingContext2D,
    points: readonly Point[]
  ): void {
    context.save();
    context.fillStyle = STAGNATION_COLOR;
    context.strokeStyle = "rgba(255, 249, 237, 0.86)";
    context.lineWidth = 1;

    for (const point of points) {
      const center = worldToScreen(point, this.viewport);
      context.beginPath();
      context.moveTo(center.x, center.y - 5.2);
      context.lineTo(center.x + 5.2, center.y);
      context.lineTo(center.x, center.y + 5.2);
      context.lineTo(center.x - 5.2, center.y);
      context.closePath();
      context.fill();
      context.stroke();
    }

    context.restore();
  }

  private renderElementMarkers(
    context: CanvasRenderingContext2D,
    elements: readonly FlowElement[],
    selectedElementId: string | null
  ): void {
    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (const element of elements) {
      if (!element.visible) {
        continue;
      }

      const center = worldToScreen(element.anchor, this.viewport);
      const radius = MARKER_RADIUS_WORLD * this.viewport.pixelsPerUnit;
      const fontSize = markerFontSize(element) * this.viewport.pixelsPerUnit;

      context.beginPath();
      context.arc(center.x, center.y, radius, 0, Math.PI * 2);
      context.fillStyle = markerFill(element.kind);
      context.fill();
      context.lineWidth = selectedElementId === element.id ? 3.1 : 1.35;
      context.strokeStyle = selectedElementId === element.id ? SELECTED_STROKE : "rgb(222, 239, 255)";
      context.stroke();

      context.font = `600 ${fontSize.toFixed(2)}px Inter, system-ui, sans-serif`;
      context.fillStyle = "rgb(245, 251, 255)";
      context.fillText(markerGlyph(element), center.x, center.y + 0.5);

      if (element.kind === "uniform" || element.kind === "doublet") {
        const angleDeg = element.kind === "uniform" ? element.angleDeg : element.angleDeg;
        const angle = (angleDeg * Math.PI) / 180;
        const arrowLength = MARKER_ARROW_LENGTH_WORLD * this.viewport.pixelsPerUnit;
        context.strokeStyle = "rgb(197, 231, 255)";
        context.lineWidth = 1.3;
        context.beginPath();
        context.moveTo(center.x, center.y);
        context.lineTo(center.x + arrowLength * Math.cos(angle), center.y - arrowLength * Math.sin(angle));
        context.stroke();
      }
    }

    context.restore();
  }
}

function drawGridLines(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
  step: number,
  strokeStyle: string
): void {
  if (!Number.isFinite(step) || step <= 0) {
    return;
  }

  context.strokeStyle = strokeStyle;

  const xStart = Math.ceil(viewport.bounds.xMin / step) * step;
  for (let x = xStart; x <= viewport.bounds.xMax; x += step) {
    const screen = worldToScreen({ x, y: 0 }, viewport);
    context.beginPath();
    context.moveTo(screen.x, 0);
    context.lineTo(screen.x, viewport.height);
    context.stroke();
  }

  const yStart = Math.ceil(viewport.bounds.yMin / step) * step;
  for (let y = yStart; y <= viewport.bounds.yMax; y += step) {
    const screen = worldToScreen({ x: 0, y }, viewport);
    context.beginPath();
    context.moveTo(0, screen.y);
    context.lineTo(viewport.width, screen.y);
    context.stroke();
  }
}

function tracePolyline(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  viewport: Viewport
): void {
  if (points.length === 0) {
    return;
  }

  const first = worldToScreen(points[0], viewport);
  context.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = worldToScreen(points[index], viewport);
    context.lineTo(point.x, point.y);
  }
}

function markerGlyph(element: FlowElement): string {
  switch (element.kind) {
    case "uniform":
      return "U";
    case "source":
      return "+";
    case "sink":
      return "−";
    case "vortex":
      return element.circulation >= 0 ? "↺" : "↻";
    case "doublet":
      return "D";
    default:
      return assertNever(element);
  }
}

function markerFill(kind: FlowElement["kind"]): string {
  switch (kind) {
    case "uniform":
      return "rgb(77, 164, 255)";
    case "source":
      return "rgb(255, 132, 132)";
    case "sink":
      return "rgb(24, 98, 196)";
    case "vortex":
      return "rgb(99, 119, 255)";
    case "doublet":
      return "rgb(87, 199, 255)";
    default:
      return assertNever(kind);
  }
}

function markerFontSize(element: FlowElement): number {
  switch (element.kind) {
    case "source":
    case "sink":
      return MARKER_FONT_SIZE_WORLD * 1.22;
    case "uniform":
    case "vortex":
    case "doublet":
      return MARKER_FONT_SIZE_WORLD;
    default:
      return assertNever(element);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
