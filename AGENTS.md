# AGENTS.md

## Project Purpose

This project is an interactive website for exploring classical planar potential-flow solutions relevant to incompressible and irrotational aerodynamics.

The product goals are:

- Use a full-window dark canvas as the main stage.
- Support analytical superposition of elementary flows.
- Allow click placement of sources, sinks, vortices, doublets, and uniform flows.
- Show the resulting flow with lightweight animation and optional seeded streamlines.
- Include instructive preset examples such as a wall image system, flow past a cylinder, a lifting cylinder, and a Rankine oval.
- Keep the implementation modular, static-site friendly, and easy to extend.

## Engineering Preferences

- Keep a clean split between state/controller logic, analytical flow math, streamline integration, and canvas rendering.
- Preserve static-site compatibility with Vite.
- Favor straightforward analytical formulas over heavy numerical work.
- Keep the UI pleasant, compact, and readable on top of the canvas.
- Preserve equal x:y scaling so the geometry of the flow is not distorted.
- Prefer additions that improve interactivity or teaching value without making the controls noisy.

## Interaction Decisions

- The app should open on an empty grid by default, with no example loaded automatically.
- Mouse wheel zoom should stay centered on the cursor.
- Panning should use middle-mouse drag or `Space` + drag.
- Right-clicking on an element should delete the element under the cursor.
- Camera motion should be bounded to the exploration region defined by the initial view center and the maximum zoomed-out window.
- Placing a new element should not automatically select it.
- Clicking a selected element again should deselect it if the user is not dragging.
- Reset-view behavior should only trigger from double-clicking empty canvas, not from double-clicking an element.

## Streamline Decisions

- Streamlines should look smooth rather than obviously piecewise-linear; favor enough integration resolution and gentle simplification.
- Auto-generated streamlines should keep a roughly consistent on-screen density across zoom levels.
- Manual streamline seeds should remain fixed in world coordinates when panning and zooming.
- Examples are allowed to use explicit preset streamline seeds when that produces a better teaching layout than generic auto-seeding.
- The cylinder-style examples should use the same upstream cross-stream seeding idea as uniform flow.
- Source and sink seeding should emphasize even circumferential spacing.
- Uniform-flow seeding should emphasize even cross-stream spacing.
- Doublet and vortex seeding should emphasize even radial spacing.
- Streamlines should extend close to element cores before terminating; avoid large artificial gaps near singularities.
- Stagnation-aware seeding is desirable so both streamline branches around visible stagnation points are likely to appear.
- No stagnation points should be shown when there are no visible flow elements.

## Marker Decisions

- Element markers should be fully opaque.
- Marker size should scale in world units so the identifiers appear larger on screen when zooming in.
- Selection should be shown with a thicker white stroke only; selecting an element should not make the marker itself larger.
- Source markers should use a light red fill with a relatively prominent `+` glyph.
- Sink markers should use a darker blue fill with a relatively prominent `−` glyph.

## Default Experience

- The default particle density should start at the maximum slider value.

## Visual Preferences

- The canvas should be dark, but not pure black.
- Use blue and cyan accents for the animated flow.
- Keep the grid visible but subtle.
- Controls should feel like a floating instrument panel rather than a separate page column.
- Streamlines, stagnation points, and markers should stay readable over the background.
