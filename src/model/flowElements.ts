import type {
  DoubletFlowElement,
  FlowElement,
  FlowElementKind,
  PlacementTemplate,
  Point,
  UniformFlowElement,
  VortexFlowElement
} from "../types";

const DEFAULT_VISIBLE = true;

export const FLOW_KIND_LABELS: Record<FlowElementKind, string> = {
  uniform: "Uniform flow",
  source: "Source",
  sink: "Sink",
  vortex: "Vortex",
  doublet: "Doublet"
};

export function createElementFromTemplate(
  template: PlacementTemplate,
  anchor: Point,
  id: string
): FlowElement {
  switch (template.kind) {
    case "uniform":
      return {
        id,
        kind: "uniform",
        anchor,
        visible: DEFAULT_VISIBLE,
        speed: template.magnitude,
        angleDeg: template.angleDeg
      } satisfies UniformFlowElement;
    case "source":
    case "sink":
      return {
        id,
        kind: template.kind,
        anchor,
        visible: DEFAULT_VISIBLE,
        strength: Math.abs(template.magnitude),
        coreRadius: Math.max(template.coreRadius, 0)
      };
    case "vortex":
      return {
        id,
        kind: "vortex",
        anchor,
        visible: DEFAULT_VISIBLE,
        circulation: template.magnitude,
        coreRadius: Math.max(template.coreRadius, 0)
      } satisfies VortexFlowElement;
    case "doublet":
      return {
        id,
        kind: "doublet",
        anchor,
        visible: DEFAULT_VISIBLE,
        strength: template.magnitude,
        angleDeg: template.angleDeg,
        coreRadius: Math.max(template.coreRadius, 0)
      } satisfies DoubletFlowElement;
    default:
      return assertNever(template.kind);
  }
}

export function hasAngleParameter(kind: FlowElementKind): boolean {
  return kind === "uniform" || kind === "doublet";
}

export function hasCoreRadiusParameter(kind: FlowElementKind): boolean {
  return kind !== "uniform";
}

export function primaryMagnitudeLabel(kind: FlowElementKind): string {
  switch (kind) {
    case "uniform":
      return "Speed";
    case "source":
    case "sink":
      return "Strength";
    case "vortex":
      return "Circulation";
    case "doublet":
      return "Strength";
    default:
      return assertNever(kind);
  }
}

export function getPrimaryMagnitude(element: FlowElement): number {
  switch (element.kind) {
    case "uniform":
      return element.speed;
    case "source":
    case "sink":
      return element.strength;
    case "vortex":
      return element.circulation;
    case "doublet":
      return element.strength;
    default:
      return assertNever(element);
  }
}

export function getElementAngleDeg(element: FlowElement): number {
  switch (element.kind) {
    case "uniform":
    case "doublet":
      return element.angleDeg;
    case "source":
    case "sink":
    case "vortex":
      return 0;
    default:
      return assertNever(element);
  }
}

export function getElementCoreRadius(element: FlowElement): number {
  switch (element.kind) {
    case "uniform":
      return 0;
    case "source":
    case "sink":
    case "vortex":
    case "doublet":
      return element.coreRadius;
    default:
      return assertNever(element);
  }
}

export function updateElementParameters(
  element: FlowElement,
  updates: {
    magnitude?: number;
    angleDeg?: number;
    coreRadius?: number;
    anchor?: Point;
    visible?: boolean;
  }
): FlowElement {
  const nextVisible = updates.visible ?? element.visible;
  const nextAnchor = updates.anchor ?? element.anchor;

  switch (element.kind) {
    case "uniform":
      return {
        ...element,
        visible: nextVisible,
        anchor: nextAnchor,
        speed: updates.magnitude ?? element.speed,
        angleDeg: updates.angleDeg ?? element.angleDeg
      };
    case "source":
    case "sink":
      return {
        ...element,
        visible: nextVisible,
        anchor: nextAnchor,
        strength: Math.abs(updates.magnitude ?? element.strength),
        coreRadius: Math.max(updates.coreRadius ?? element.coreRadius, 0)
      };
    case "vortex":
      return {
        ...element,
        visible: nextVisible,
        anchor: nextAnchor,
        circulation: updates.magnitude ?? element.circulation,
        coreRadius: Math.max(updates.coreRadius ?? element.coreRadius, 0)
      };
    case "doublet":
      return {
        ...element,
        visible: nextVisible,
        anchor: nextAnchor,
        strength: updates.magnitude ?? element.strength,
        angleDeg: updates.angleDeg ?? element.angleDeg,
        coreRadius: Math.max(updates.coreRadius ?? element.coreRadius, 0)
      };
    default:
      return assertNever(element);
  }
}

export function elementSummary(element: FlowElement): string {
  const point = `(${formatNumber(element.anchor.x)}, ${formatNumber(element.anchor.y)})`;

  switch (element.kind) {
    case "uniform":
      return `${FLOW_KIND_LABELS[element.kind]} • U=${formatNumber(element.speed)} • α=${formatNumber(element.angleDeg)}°`;
    case "source":
    case "sink":
      return `${FLOW_KIND_LABELS[element.kind]} • Q=${formatNumber(element.strength)} • z₀=${point}`;
    case "vortex":
      return `${FLOW_KIND_LABELS[element.kind]} • Γ=${formatNumber(element.circulation)} • z₀=${point}`;
    case "doublet":
      return `${FLOW_KIND_LABELS[element.kind]} • μ=${formatNumber(element.strength)} • α=${formatNumber(element.angleDeg)}° • z₀=${point}`;
    default:
      return assertNever(element);
  }
}

export function cloneElement(element: FlowElement, id: string): FlowElement {
  return {
    ...element,
    id
  };
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3);
  return rounded.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
