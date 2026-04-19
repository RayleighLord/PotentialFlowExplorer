import { elementSummary, FLOW_KIND_LABELS, formatNumber, getElementAngleDeg, getElementCoreRadius, getPrimaryMagnitude, hasAngleParameter, hasCoreRadiusParameter, primaryMagnitudeLabel } from "./model/flowElements";
import { PotentialFlowRenderer } from "./render/renderer";
import { snapPointToGrid } from "./render/viewport";
import { AppController, EXAMPLE_PRESETS } from "./ui/controller";
import type { FlowElement, FlowElementKind, Point, ViewModel } from "./types";

interface DragState {
  elementId: string;
  originClient: Point;
  toggleSelectionOnRelease: boolean;
  hasMoved: boolean;
}

const DRAG_START_THRESHOLD_PX = 4;

export function startApp(): void {
  clearLegacyShellSizing();
  const sceneCanvas = getElement<HTMLCanvasElement>("scene-canvas");
  const flowCanvas = getElement<HTMLCanvasElement>("flow-canvas");
  const exampleSelect = getElement<HTMLSelectElement>("example-select");
  const exampleDescription = getElement<HTMLElement>("example-description");
  const toolSelect = getElement<HTMLSelectElement>("tool-select");
  const magnitudeLabel = getElement<HTMLElement>("magnitude-label");
  const magnitudeInput = getElement<HTMLInputElement>("magnitude-input");
  const angleField = getElement<HTMLElement>("angle-field");
  const angleInput = getElement<HTMLInputElement>("angle-input");
  const coreRadiusField = getElement<HTMLElement>("core-radius-field");
  const coreRadiusInput = getElement<HTMLInputElement>("core-radius-input");
  const selectedSummary = getElement<HTMLElement>("selected-summary");
  const selectedInspector = getElement<HTMLElement>("selected-inspector");
  const selectedMagnitudeLabel = getElement<HTMLElement>("selected-magnitude-label");
  const selectedMagnitudeInput = getElement<HTMLInputElement>("selected-magnitude-input");
  const selectedAngleField = getElement<HTMLElement>("selected-angle-field");
  const selectedAngleInput = getElement<HTMLInputElement>("selected-angle-input");
  const selectedCoreRadiusField = getElement<HTMLElement>("selected-core-radius-field");
  const selectedCoreRadiusInput = getElement<HTMLInputElement>("selected-core-radius-input");
  const applySelectedButton = getElement<HTMLButtonElement>("apply-selected-button");
  const deleteSelectedButton = getElement<HTMLButtonElement>("delete-selected-button");
  const animationToggle = getElement<HTMLInputElement>("animation-toggle");
  const heatmapToggle = getElement<HTMLInputElement>("heatmap-toggle");
  const gridToggle = getElement<HTMLInputElement>("grid-toggle");
  const markersToggle = getElement<HTMLInputElement>("markers-toggle");
  const stagnationToggle = getElement<HTMLInputElement>("stagnation-toggle");
  const snapToggle = getElement<HTMLInputElement>("snap-toggle");
  const particleDensityInput = getElement<HTMLInputElement>("particle-density-input");
  const resetStreamlinesButton = getElement<HTMLButtonElement>("reset-streamlines-button");
  const clearElementsButton = getElement<HTMLButtonElement>("clear-elements-button");
  const elementCount = getElement<HTMLElement>("element-count");
  const elementList = getElement<HTMLElement>("element-list");
  const stagnationCount = getElement<HTMLElement>("stagnation-count");
  const stagnationList = getElement<HTMLElement>("stagnation-list");
  const cursorPosition = getElement<HTMLElement>("cursor-position");
  const cursorVelocity = getElement<HTMLElement>("cursor-velocity");
  const cursorPotential = getElement<HTMLElement>("cursor-potential");

  const controller = new AppController();
  const renderer = new PotentialFlowRenderer(sceneCanvas, flowCanvas);
  renderer.setViewportMetricsListener((metrics) => controller.setViewportMetrics(metrics));
  renderer.attachResizeObserver();
  renderer.start();

  let currentViewModel = controller.getViewModel();
  let dragState: DragState | null = null;
  let isSpacePressed = false;

  populateExampleSelect(exampleSelect);
  populateToolSelect(toolSelect);

  controller.subscribe((viewModel) => {
    currentViewModel = viewModel;
    renderer.render(viewModel);
    syncControls(viewModel, {
      exampleSelect,
      exampleDescription,
      toolSelect,
      magnitudeLabel,
      magnitudeInput,
      angleField,
      angleInput,
      coreRadiusField,
      coreRadiusInput,
      selectedSummary,
      selectedInspector,
      selectedMagnitudeLabel,
      selectedMagnitudeInput,
      selectedAngleField,
      selectedAngleInput,
      selectedCoreRadiusField,
      selectedCoreRadiusInput,
      animationToggle,
      heatmapToggle,
      gridToggle,
      markersToggle,
      stagnationToggle,
      snapToggle,
      particleDensityInput,
      elementCount,
      elementList,
      stagnationCount,
      stagnationList
    }, controller);
    syncCanvasCursor(flowCanvas, !!dragState);
  });

  exampleSelect.addEventListener("change", () => {
    if (exampleSelect.value) {
      controller.loadExample(exampleSelect.value);
    }
  });

  toolSelect.addEventListener("change", () => {
    controller.setPlacementTemplate({ kind: toolSelect.value as FlowElementKind });
  });
  magnitudeInput.addEventListener("input", () => {
    controller.setPlacementTemplate({ magnitude: Number(magnitudeInput.value) });
  });
  angleInput.addEventListener("input", () => {
    controller.setPlacementTemplate({ angleDeg: Number(angleInput.value) });
  });
  coreRadiusInput.addEventListener("input", () => {
    controller.setPlacementTemplate({ coreRadius: Number(coreRadiusInput.value) });
  });

  applySelectedButton.addEventListener("click", () => {
    controller.updateSelectedElement({
      magnitude: Number(selectedMagnitudeInput.value),
      angleDeg: Number(selectedAngleInput.value),
      coreRadius: Number(selectedCoreRadiusInput.value)
    });
  });
  deleteSelectedButton.addEventListener("click", () => controller.deleteSelectedElement());

  animationToggle.addEventListener("change", () => controller.setAnimationEnabled(animationToggle.checked));
  heatmapToggle.addEventListener("change", () => controller.setShowHeatmap(heatmapToggle.checked));
  gridToggle.addEventListener("change", () => controller.setShowGrid(gridToggle.checked));
  markersToggle.addEventListener("change", () => controller.setShowMarkers(markersToggle.checked));
  stagnationToggle.addEventListener("change", () => controller.setShowStagnationPoints(stagnationToggle.checked));
  snapToggle.addEventListener("change", () => controller.setSnapToGrid(snapToggle.checked));
  particleDensityInput.addEventListener("input", () => controller.setParticleDensity(Number(particleDensityInput.value)));

  resetStreamlinesButton.addEventListener("click", () => controller.resetStreamlines());
  clearElementsButton.addEventListener("click", () => controller.clearElements());

  elementList.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const row = target?.closest<HTMLElement>("[data-element-id]");
    if (!row) {
      return;
    }
    const id = row.dataset.elementId ?? "";
    if (target?.matches("[data-action='toggle-visibility']")) {
      controller.toggleElementVisibility(id);
      return;
    }
    if (target?.matches("[data-action='delete-element']")) {
      controller.deleteElement(id);
      return;
    }
    controller.setSelectedElementId(currentViewModel.state.selectedElementId === id ? null : id);
  });

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || isTextEntryTarget(event.target)) {
      return;
    }

    isSpacePressed = true;
    event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    if (event.code !== "Space") {
      return;
    }

    isSpacePressed = false;
    if (!isTextEntryTarget(event.target)) {
      event.preventDefault();
    }
  });

  window.addEventListener("blur", () => {
    isSpacePressed = false;
  });

  flowCanvas.addEventListener("pointerdown", (event) => {
    const world = renderer.clientToWorld(event.clientX, event.clientY);
    if (!world) {
      return;
    }

    const hit = renderer.hitTestElement(world);
    const isStreamlineGesture = event.button === 1 || (event.button === 0 && isSpacePressed);

    if (event.button === 2) {
      if (hit) {
        controller.deleteElement(hit.id);
      }
      return;
    }

    if (isStreamlineGesture) {
      event.preventDefault();
      controller.addStreamlineSeed(world);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (hit) {
      const wasSelected = currentViewModel.state.selectedElementId === hit.id;
      controller.setSelectedElementId(hit.id);
      dragState = {
        elementId: hit.id,
        originClient: { x: event.clientX, y: event.clientY },
        toggleSelectionOnRelease: wasSelected,
        hasMoved: false
      };
      flowCanvas.setPointerCapture(event.pointerId);
      syncCanvasCursor(flowCanvas, false);
      return;
    }

    const finalPoint = currentViewModel.state.snapToGrid
      ? snapPointToGrid(world, snapStepForPlacementTemplate(currentViewModel, renderer))
      : world;

    controller.addElementAt(finalPoint);
  });

  flowCanvas.addEventListener("pointermove", (event) => {
    const world = renderer.clientToWorld(event.clientX, event.clientY);
    if (world) {
      const evaluation = currentViewModel.flowField.evaluate(world);
      cursorPosition.textContent = `x=${formatNumber(world.x)}, y=${formatNumber(world.y)}`;
      cursorVelocity.textContent = `u=${formatNumber(evaluation.u)}, v=${formatNumber(evaluation.v)}, |V|=${formatNumber(evaluation.speed)}`;
      cursorPotential.textContent = `φ=${formatNumber(evaluation.phi)}, ψ=${formatNumber(evaluation.psi)}`;
    }

    if (dragState && world) {
      if (!dragState.hasMoved) {
        const dragDistance = Math.hypot(
          event.clientX - dragState.originClient.x,
          event.clientY - dragState.originClient.y
        );
        if (dragDistance < DRAG_START_THRESHOLD_PX) {
          return;
        }
        dragState = {
          ...dragState,
          hasMoved: true
        };
        syncCanvasCursor(flowCanvas, true);
      }

      const anchor = currentViewModel.state.snapToGrid
        ? snapPointToGrid(world, snapStepForElement(dragState.elementId, currentViewModel, renderer))
        : world;
      controller.moveElement(dragState.elementId, anchor);
      return;
    }
  });

  flowCanvas.addEventListener("pointerup", (event) => {
    if (dragState && !dragState.hasMoved && dragState.toggleSelectionOnRelease) {
      controller.setSelectedElementId(null);
    }
    dragState = null;
    if (flowCanvas.hasPointerCapture(event.pointerId)) {
      flowCanvas.releasePointerCapture(event.pointerId);
    }
    syncCanvasCursor(flowCanvas, false);
  });

  flowCanvas.addEventListener("pointercancel", (event) => {
    dragState = null;
    if (flowCanvas.hasPointerCapture(event.pointerId)) {
      flowCanvas.releasePointerCapture(event.pointerId);
    }
    syncCanvasCursor(flowCanvas, false);
  });

  flowCanvas.addEventListener("pointerleave", () => {
    cursorPosition.textContent = "—";
    cursorVelocity.textContent = "—";
    cursorPotential.textContent = "—";
  });

  flowCanvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  flowCanvas.addEventListener("auxclick", (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  });

  flowCanvas.addEventListener("dblclick", (event) => {
    event.preventDefault();
  });
}

function populateExampleSelect(select: HTMLSelectElement): void {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose example";
  select.replaceChildren(
    placeholder,
    ...EXAMPLE_PRESETS.map((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      return option;
    })
  );
}

function populateToolSelect(select: HTMLSelectElement): void {
  select.replaceChildren(
    ...(["uniform", "source", "sink", "vortex", "doublet"] as const).map((kind) => {
      const option = document.createElement("option");
      option.value = kind;
      option.textContent = FLOW_KIND_LABELS[kind];
      return option;
    })
  );
}

function syncControls(
  viewModel: ViewModel,
  elements: {
    exampleSelect: HTMLSelectElement;
    exampleDescription: HTMLElement;
    toolSelect: HTMLSelectElement;
    magnitudeLabel: HTMLElement;
    magnitudeInput: HTMLInputElement;
    angleField: HTMLElement;
    angleInput: HTMLInputElement;
    coreRadiusField: HTMLElement;
    coreRadiusInput: HTMLInputElement;
    selectedSummary: HTMLElement;
    selectedInspector: HTMLElement;
    selectedMagnitudeLabel: HTMLElement;
    selectedMagnitudeInput: HTMLInputElement;
    selectedAngleField: HTMLElement;
    selectedAngleInput: HTMLInputElement;
    selectedCoreRadiusField: HTMLElement;
    selectedCoreRadiusInput: HTMLInputElement;
    animationToggle: HTMLInputElement;
    heatmapToggle: HTMLInputElement;
    gridToggle: HTMLInputElement;
    markersToggle: HTMLInputElement;
    stagnationToggle: HTMLInputElement;
    snapToggle: HTMLInputElement;
    particleDensityInput: HTMLInputElement;
    elementCount: HTMLElement;
    elementList: HTMLElement;
    stagnationCount: HTMLElement;
    stagnationList: HTMLElement;
  },
  controller: AppController
): void {
  elements.exampleSelect.value = viewModel.state.exampleId ?? "";
  elements.exampleDescription.textContent = EXAMPLE_PRESETS.find((preset) => preset.id === viewModel.state.exampleId)?.description ?? "Build your own superposition by placing elementary flows on the canvas.";

  elements.toolSelect.value = viewModel.state.placement.kind;
  elements.magnitudeLabel.textContent = primaryMagnitudeLabel(viewModel.state.placement.kind);
  syncNumericInput(elements.magnitudeInput, viewModel.state.placement.magnitude);
  elements.angleField.classList.toggle("is-hidden", !hasAngleParameter(viewModel.state.placement.kind));
  syncNumericInput(elements.angleInput, viewModel.state.placement.angleDeg);
  elements.coreRadiusField.classList.toggle("is-hidden", !hasCoreRadiusParameter(viewModel.state.placement.kind));
  syncNumericInput(elements.coreRadiusInput, viewModel.state.placement.coreRadius);

  const selectedElement = controller.getSelectedElement();
  if (!selectedElement) {
    elements.selectedSummary.textContent = "Click or drag a marker to inspect and edit it.";
    elements.selectedSummary.classList.add("is-empty");
    elements.selectedInspector.classList.add("is-disabled");
  } else {
    elements.selectedSummary.textContent = elementSummary(selectedElement);
    elements.selectedSummary.classList.remove("is-empty");
    elements.selectedInspector.classList.remove("is-disabled");
    elements.selectedMagnitudeLabel.textContent = primaryMagnitudeLabel(selectedElement.kind);
    syncNumericInput(elements.selectedMagnitudeInput, getPrimaryMagnitude(selectedElement));
    elements.selectedAngleField.classList.toggle("is-hidden", !hasAngleParameter(selectedElement.kind));
    syncNumericInput(elements.selectedAngleInput, getElementAngleDeg(selectedElement));
    elements.selectedCoreRadiusField.classList.toggle("is-hidden", !hasCoreRadiusParameter(selectedElement.kind));
    syncNumericInput(elements.selectedCoreRadiusInput, getElementCoreRadius(selectedElement));
  }

  elements.animationToggle.checked = viewModel.state.animationEnabled;
  elements.heatmapToggle.checked = viewModel.state.showHeatmap;
  elements.gridToggle.checked = viewModel.state.showGrid;
  elements.markersToggle.checked = viewModel.state.showMarkers;
  elements.stagnationToggle.checked = viewModel.state.showStagnationPoints;
  elements.snapToggle.checked = viewModel.state.snapToGrid;
  elements.particleDensityInput.value = `${viewModel.state.particleDensity}`;

  elements.elementCount.textContent = `${viewModel.state.elements.length}`;
  elements.elementList.replaceChildren(
    ...viewModel.state.elements.map((element) => {
      const row = document.createElement("div");
      row.className = `stack-row${element.id === viewModel.state.selectedElementId ? " is-selected" : ""}`;
      row.dataset.elementId = element.id;

      const text = document.createElement("div");
      text.className = "stack-row-text";
      text.textContent = elementSummary(element);

      const actions = document.createElement("div");
      actions.className = "stack-row-actions";
      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "mini-button";
      toggleButton.dataset.action = "toggle-visibility";
      toggleButton.textContent = element.visible ? "Hide" : "Show";
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "mini-button danger";
      deleteButton.dataset.action = "delete-element";
      deleteButton.textContent = "Delete";
      actions.append(toggleButton, deleteButton);
      row.append(text, actions);
      return row;
    })
  );
  if (viewModel.state.elements.length === 0) {
    elements.elementList.textContent = "No elements placed yet.";
    elements.elementList.classList.add("is-empty");
  } else {
    elements.elementList.classList.remove("is-empty");
  }

  elements.stagnationCount.textContent = `${viewModel.stagnationPoints.length}`;
  elements.stagnationList.replaceChildren(
    ...viewModel.stagnationPoints.map((point, index) => {
      const row = document.createElement("div");
      row.className = "stack-row";
      row.textContent = `#${index + 1} • (${formatNumber(point.x)}, ${formatNumber(point.y)}) • residual ${formatNumber(point.residual)}`;
      return row;
    })
  );
  if (viewModel.stagnationPoints.length === 0) {
    elements.stagnationList.textContent = "No stagnation points detected in the visible window.";
    elements.stagnationList.classList.add("is-empty");
  } else {
    elements.stagnationList.classList.remove("is-empty");
  }
}

function snapStepForPlacementTemplate(viewModel: ViewModel, renderer: PotentialFlowRenderer): number {
  const { kind, angleDeg } = viewModel.state.placement;
  return snapStepForFlow(kind, angleDeg, renderer);
}

function snapStepForElement(id: string, viewModel: ViewModel, renderer: PotentialFlowRenderer): number {
  const element = viewModel.state.elements.find((candidate) => candidate.id === id);
  if (!element) {
    return renderer.estimateSnapStep();
  }

  return snapStepForFlow(element.kind, getSnapAngleDeg(element), renderer);
}

function snapStepForFlow(kind: FlowElementKind, angleDeg: number, renderer: PotentialFlowRenderer): number {
  if (kind === "uniform" && isCardinalAngle(angleDeg)) {
    return renderer.estimateGridStep();
  }

  return renderer.estimateSnapStep();
}

function getSnapAngleDeg(element: FlowElement): number {
  return element.kind === "uniform" ? element.angleDeg : 0;
}

function isCardinalAngle(angleDeg: number): boolean {
  const normalized = ((angleDeg % 90) + 90) % 90;
  return Math.min(normalized, 90 - normalized) < 1e-6;
}

function syncCanvasCursor(canvas: HTMLCanvasElement, isDraggingElement: boolean): void {
  if (isDraggingElement) {
    canvas.style.cursor = "grabbing";
    return;
  }

  canvas.style.cursor = "crosshair";
}

function syncNumericInput(input: HTMLInputElement, value: number): void {
  if (document.activeElement === input) {
    return;
  }

  input.value = `${value}`;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    target.isContentEditable ||
    target.closest("[contenteditable='true']") !== null
  );
}

function clearLegacyShellSizing(): void {
  const root = document.querySelector<HTMLElement>(".app-root");
  if (!root) {
    return;
  }

  root.style.left = "";
  root.style.top = "";
  root.style.width = "";
  root.style.height = "";
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}
