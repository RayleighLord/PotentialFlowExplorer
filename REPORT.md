# Potential Flow Explorer – build report

## 1. Analysis of the reference project

The uploaded `PhasePortraitVisualizer` project is a lightweight Vite + TypeScript application with a very reusable architecture.

The parts that matter most for the new project are:

- `src/ui/controller.ts`: central state container and view-model builder.
- `src/plot/*`: rendering, coordinate transforms, snapping, and plot-specific helpers.
- `src/solver/rk4.ts`: numerical trajectory integration for seeded curves.
- `src/math/*`: pure analytical / numerical math helpers kept separate from the UI.
- `src/styles/main.css`: single-file application styling.

That structure is a strong match for the new goal because potential-flow exploration still benefits from the same split:

- a small controller for interaction state,
- pure flow-element mathematics,
- a streamline solver for seeded paths,
- and a renderer dedicated to the visual layer.

## 2. What I kept from the reference structure

The new project intentionally preserves the same broad organization:

- `src/ui/controller.ts` manages app state and produces a view model.
- `src/model/*` contains analytical flow definitions, presets, and field analysis.
- `src/solver/streamline.ts` computes seeded streamlines.
- `src/render/*` handles viewport math, particle animation, and canvas rendering.
- `src/styles/main.css` owns the visual system.

## 3. What changed for the new project

The main differences are deliberate and tied to your specification:

- The renderer is now full-window **Canvas** rather than a bounded SVG plot.
- The theme is dark and the control panel floats over the stage instead of reserving page width.
- The ODE parser was removed because the flow field comes from **analytical elementary solutions**.
- Superposition is performed directly from elementary-flow formulas.
- Seeded **streamlines** were retained as an interaction because they are very useful for learning the geometry of the total flow.
- A lightweight **stagnation-point detector** was added.
- Preset examples include a wall image system, flow past a cylinder, a lifting cylinder, a Rankine oval, and other classical combinations.

## 4. Main source files in the new project

- `src/model/flowField.ts`
  - analytical velocity, potential, and streamfunction evaluation for uniform flow, sources/sinks, vortices, and doublets.
- `src/model/examples.ts`
  - preset example library.
- `src/model/analysis.ts`
  - sampled speed statistics and stagnation-point detection.
- `src/solver/streamline.ts`
  - RK4 streamline tracing in the normalized direction field.
- `src/render/renderer.ts`
  - full-window canvas renderer with grid, heatmap, guides, markers, streamlines, and particle animation.
- `src/render/particles.ts`
  - animated passive tracers.
- `src/ui/controller.ts`
  - interaction state, element placement, selection, dragging, zoom, pan, and preset loading.

## 5. Added interaction features

Besides your requested baseline, I also added:

- dragging placed singularities,
- right-click deletion of markers,
- wheel zoom,
- middle-mouse pan,
- optional seeded streamlines,
- optional stagnation-point display,
- obstacle masking for wall and cylinder examples.

## 6. Notes on mathematical modeling

The app uses the standard analytical superposition idea for 2D potential flow.
For stable visualization near singularities, the denominators are regularized by a small core radius.
This keeps the app smooth and interactive while preserving the classical far-field structure of the elementary solutions.

## 7. Expected usage

1. Open the app.
2. Pick a preset or choose an elementary flow.
3. Left-click to place the selected element, or switch click mode to seed a streamline.
4. Drag markers to explore superposition in real time.
5. Use the display toggles and the stagnation-point list to study the resulting flow.
