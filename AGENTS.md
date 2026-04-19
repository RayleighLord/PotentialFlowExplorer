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

## Visual Preferences

- The canvas should be dark, but not pure black.
- Use blue and cyan accents for the animated flow.
- Keep the grid visible but subtle.
- Controls should feel like a floating instrument panel rather than a separate page column.
- Streamlines, stagnation points, and markers should stay readable over the background.
