# ADR-001: Motion Engine v3 composition architecture

- Status: Accepted
- Application release: 1.3.5
- Date: 2026-08-24

## Decision

TV Menu 2 uses a renderer-agnostic scene architecture for animation:

```text
Renderer → Adapter → Scene Graph → independent SceneProgram compilers
         → Scene Composer → Scene Runtime → Timeline → Driver
```

The Scene Graph stores opaque render targets and semantic depth/layer metadata. Behavior compilers do not call renderer APIs. Every animation track declares explicit `transform`, `opacity` and/or `appearance` claims. Scene Composer rejects duplicate ownership of the same channel on the same scene node before playback starts.

The current DOM/SVG implementation uses `WaapiMotionDriver`. CSS/Web Animations serialization is isolated inside that driver. Future Pixi/Three/WebGPU implementations must consume the same canonical scene/program contracts instead of adding renderer-specific logic to Scene Graph, Composer or Timeline.

`entity` is a reserved independent layer. Live Entity behavior must be added through its own adapter/compiler/program and must not inherit menu behavior implicitly.

## Consequences

- The canonical readable menu remains independent from animation runtime.
- Menu motion and atmosphere can evolve independently while sharing one master timeline.
- Conflicting transform writers become deterministic runtime errors instead of visual jitter.
- A future GPU or Live Entity layer can be added without rewriting the SVG menu renderer.
- No FPS limits, asset budgets, device tiers or automatic quality degradation are introduced by this decision.
