import { elementSummary, FLOW_KIND_LABELS, formatNumber, getElementAngleDeg, getElementCoreRadius, getPrimaryMagnitude, hasAngleParameter, hasCoreRadiusParameter, primaryMagnitudeLabel } from "./model/flowElements";
import { PotentialFlowRenderer } from "./render/renderer";
import { snapPointToGrid } from "./render/viewport";
import { AppController, EXAMPLE_PRESETS } from "./ui/controller";
import type { ClickMode, FlowElementKind, Point, ViewModel } from "./types";

interface DragState {
  elementId: string;
}

interface PanState {
  originClient: Point;
}

type InteractionMode = ClickMode | "pan";

export function startApp(): void {
  const stage = getElement<HTMLDivElement>("stage");
  const sceneCanvas = getElement<HTMLCanvasElement>("scene-canvas");
  const flowCanvas = getElement<HTMLCanvasElement>("flow-canvas");
  const exampleSelect = getElement<HTMLSelectElement>("example-select");
  const exampleDescription = getElement<HTMLElement>("example-description");
  const modeElementButton = getElement<HTMLButtonElement>("mode-element-button");
  const modeStreamlineButton = getElement<HTMLButtonElement>("mode-streamline-button");
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
  const sampleStreamlinesButton = getElement<HTMLButtonElement>("sample-streamlines-button");
  const clearStreamlinesButton = getElement<HTMLButtonElement>("clear-streamlines-button");
  const resetViewButton = getElement<HTMLButtonElement>("reset-view-button");
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
  renderer.setAspectChangeListener((aspect) => controller.setViewportAspect(aspect));
  renderer.attachResizeObserver();
  renderer.start();

  let currentViewModel = controller.getViewModel();
  let dragState: DragState | null = null;
  let panState: PanState | null = null;
  let spacePanActive = false;

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
      modeElementButton,
      modeStreamlineButton,
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
    syncCanvasCursor(flowCanvas, currentViewModel.state.clickMode, !!dragState, !!panState, spacePanActive);
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

  modeElementButton.addEventListener("click", () => controller.setClickMode("element"));
  modeStreamlineButton.addEventListener("click", () => controller.setClickMode("streamline"));

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

  sampleStreamlinesButton.addEventListener("click", () => controller.sampleStreamlines());
  clearStreamlinesButton.addEventListener("click", () => controller.clearStreamlines());
  resetViewButton.addEventListener("click", () => controller.resetView());
  clearElementsButton.addEventListener("click", () => controller.clearElements());

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || isEditableTarget(event.target)) {
      return;
    }

    if (!spacePanActive) {
      spacePanActive = true;
      syncCanvasCursor(flowCanvas, currentViewModel.state.clickMode, !!dragState, !!panState, spacePanActive);
    }
    event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    if (event.code !== "Space") {
      return;
    }

    spacePanActive = false;
    syncCanvasCursor(flowCanvas, currentViewModel.state.clickMode, !!dragState, !!panState, spacePanActive);
  });

  window.addEventListener("blur", () => {
    dragState = null;
    panState = null;
    spacePanActive = false;
    syncCanvasCursor(flowCanvas, currentViewModel.state.clickMode, false, false, false);
  });

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
    controller.setSelectedElementId(id);
  });

  flowCanvas.addEventListener("pointerdown", (event) => {
    const world = renderer.clientToWorld(event.clientX, event.clientY);
    if (!world) {
      return;
    }

    const hit = renderer.hitTestElement(world);
    const interactionMode = resolveInteractionMode(currentViewModel.state.clickMode, event.shiftKey, spacePanActive);

    if (event.button === 2) {
      if (hit) {
        controller.deleteElement(hit.id);
      }
      return;
    }

    if (event.button === 1 || (event.button === 0 && interactionMode === "pan")) {
      panState = {
        originClient: { x: event.clientX, y: event.clientY }
      };
      flowCanvas.setPointerCapture(event.pointerId);
      syncCanvasCursor(flowCanvas, currentViewModel.state.clickMode, !!dragState, true, spacePanActive);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (hit) {
      controller.setSelectedElementId(hit.id);
      dragState = { elementId: hit.id };
      flowCanvas.setPointerCapture(event.pointerId);
      syncCanvasCursor(flowCanvas, currentViewModel.state.clickMode, true, !!panState, spacePanActive);
      return;
    }

    const finalPoint = currentViewModel.state.snapToGrid && interactionMode === "element"
      ? snapPointToGrid(world, renderer.estimateGridStep())
      : world;

    if (interactionMode === "streamline") {
      controller.addStreamlineSeed(finalPoint);
    } else if (interactionMode === "element") {
      controller.addElementAt(finalPoint);
    }
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
      const anchor = currentViewModel.state.snapToGrid
        ? snapPointToGrid(world, renderer.estimateGridStep())
        : world;
      controller.moveElement(dragState.elementId, anchor);
      return;
    }

    if (panState) {
      const previousWorld = renderer.clientToWorld(panState.originClient.x, panState.originClient.y);
      if (!previousWorld || !world) {
        return;
      }
      controller.panBy({
        x: previousWorld.x - world.x,
        y: previousWorld.y - world.y
      });
      panState = {
        originClient: { x: event.clientX, y: event.clientY }
      };
    }
  });

  flowCanvas.addEventListener("pointerup", (event) => {
    dragState = null;
    panState = null;
    if (flowCanvas.hasPointerCapture(event.pointerId)) {
      flowCanvas.releasePointerCapture(event.pointerId);
    }
    syncCanvasCursor(flowCanvas, currentViewModel.state.clickMode, false, false, spacePanActive);
  });

  flowCanvas.addEventListener("pointercancel", (event) => {
    dragState = null;
    panState = null;
    if (flowCanvas.hasPointerCapture(event.pointerId)) {
      flowCanvas.releasePointerCapture(event.pointerId);
    }
    syncCanvasCursor(flowCanvas, currentViewModel.state.clickMode, false, false, spacePanActive);
  });

  flowCanvas.addEventListener("pointerleave", () => {
    cursorPosition.textContent = "—";
    cursorVelocity.textContent = "—";
    cursorPotential.textContent = "—";
  });

  flowCanvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  flowCanvas.addEventListener(
    "wheel",
    (event) => {
      const world = renderer.clientToWorld(event.clientX, event.clientY);
      if (!world) {
        return;
      }
      event.preventDefault();
      const zoomFactor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
      controller.zoomAt(world, zoomFactor);
    },
    { passive: false }
  );

  stage.addEventListener("dblclick", () => {
    controller.resetView();
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
    modeElementButton: HTMLButtonElement;
    modeStreamlineButton: HTMLButtonElement;
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
  elements.magnitudeInput.value = `${viewModel.state.placement.magnitude}`;
  elements.angleField.classList.toggle("is-hidden", !hasAngleParameter(viewModel.state.placement.kind));
  elements.angleInput.value = `${viewModel.state.placement.angleDeg}`;
  elements.coreRadiusField.classList.toggle("is-hidden", !hasCoreRadiusParameter(viewModel.state.placement.kind));
  elements.coreRadiusInput.value = `${viewModel.state.placement.coreRadius}`;

  syncModeButtons(viewModel.state.clickMode, elements.modeElementButton, elements.modeStreamlineButton);

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
    elements.selectedMagnitudeInput.value = `${getPrimaryMagnitude(selectedElement)}`;
    elements.selectedAngleField.classList.toggle("is-hidden", !hasAngleParameter(selectedElement.kind));
    elements.selectedAngleInput.value = `${getElementAngleDeg(selectedElement)}`;
    elements.selectedCoreRadiusField.classList.toggle("is-hidden", !hasCoreRadiusParameter(selectedElement.kind));
    elements.selectedCoreRadiusInput.value = `${getElementCoreRadius(selectedElement)}`;
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

function syncModeButtons(
  clickMode: ClickMode,
  elementButton: HTMLButtonElement,
  streamlineButton: HTMLButtonElement
): void {
  elementButton.classList.toggle("is-active", clickMode === "element");
  streamlineButton.classList.toggle("is-active", clickMode === "streamline");
}

function resolveInteractionMode(mode: ClickMode, shiftKey: boolean, spacePanActive: boolean): InteractionMode {
  if (spacePanActive) {
    return "pan";
  }

  if (!shiftKey) {
    return mode;
  }

  switch (mode) {
    case "element":
      return "streamline";
    case "streamline":
      return "element";
    default:
      return assertNever(mode);
  }
}

function syncCanvasCursor(
  canvas: HTMLCanvasElement,
  clickMode: ClickMode,
  isDraggingElement: boolean,
  isPanning: boolean,
  spacePanActive: boolean
): void {
  if (isDraggingElement || isPanning) {
    canvas.style.cursor = "grabbing";
    return;
  }

  if (spacePanActive) {
    canvas.style.cursor = "grab";
    return;
  }

  canvas.style.cursor = "crosshair";
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element?.closest("input, textarea, select, button, [contenteditable='true']");
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}
