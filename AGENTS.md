# Voxalike+OrdaxEd — Project Guide

## Purpose

**Voxalike+OrdaxEd** is an unofficial client-side mod for the
[Voxalike](https://voxalike.com) browser dubbing game. It runs on top of the
original website, uses the original game servers, and extends browser UI,
recording, and audio processing.

It is a fork of Voxalike+ 1.3.0. Never send audio or user data to third-party
services. The sole exception is one user-triggered GitHub API request from the
popup to check for updates.

## Stack and Constraints

- Vanilla JavaScript; no npm packages, package manager, or transpilation.
- Chrome/Chromium uses Manifest V3; Firefox uses a generated manifest.
- Scripts run in the `MAIN` world at `document_start` on
  `https://voxalike.com/*` and `https://www.voxalike.com/*`.
- The mod relies on Voxalike internal DOM, React/Fiber data, and network
  requests. Game-site updates can break individual features.
- Audio stays local and uses Web Audio API, AudioWorklet,
  OfflineAudioContext, Typed Arrays, and WebAssembly.
- Maintain Chromium 111+ and Firefox 128+ compatibility.

## Layout

```text
src/
  vxp-main/                  Main module source fragments
    bootstrap.js              Global VXP, utilities, settings, themes, event bus
    brand-logo.js             ROSE × ORDAX logo as a data URI (source: src/vxp-brand-logo.png)
    audio-dsp.js              DSP, track rendering, EQ, dynamics, classic denoise
    game-audio.js             Game hooks, microphone, Web Audio, capture, player
    track-editor.js           Segment model and canvas track editor
    ui-controls.js            CSS, reusable controls, meters, toasts
    recording-queue.js        Native recording, IndexedDB queue, auto-submit
    main-panel.js             Mod panel on the game page
    fx-studio.js              Advanced FX studio: EQ, compressor, limiter
    recording-studio.js       Studio window and advance-line recording
    player-stats-api.js       Lobby player stats and public module API
  vxp-bg.js                   Custom site backgrounds (IndexedDB)
  vxp-fx.js                   Offline voice-effector module
  vxp-room.js                 Offline automatic dereverberation
  vxp-denoise.src.js          Neural-denoise template
  models/                     GTCRN and RNNoise WASM models
extension/
  manifest.json               Chrome MV3 manifest and content-script order
  popup.html, popup.js        Version, manual update check, extension reload
  icons/                      Extension icons
scripts/
  build-main.js               Concatenates src/vxp-main fragments
  embed-models.js             Embeds WASM models as base64 in vxp-denoise.js
  make-firefox-manifest.js    Creates Firefox manifest
  make-userscript.js          Creates userscript from manifest script order
build.sh                      Builds Chrome ZIP, Firefox XPI, and userscript
dist/                         Generated release artifacts
extension-build/              Generated unpacked Chrome extension
```

## Execution Order

`extension/manifest.json` loads scripts in this order:

```text
vxp-main.js → vxp-bg.js → vxp-fx.js → vxp-denoise.js → vxp-room.js
```

`vxp-main.js` is generated from `src/vxp-main/`. The explicit `files` array in
`scripts/build-main.js` defines fragment order and is a build contract.
Fragments share one scope after concatenation; they are not ES modules. Do not
reorder them without checking dependencies.

`bootstrap.js` creates `window.__VXP__`. The last main fragment exposes
`VXP.api` and `VXP.registerModule`. External modules register through this API;
if loaded early, they queue in `window.__VXP_PLUGINS__`.

## Key Systems

### Track Model and Editing

A take contains source samples, sample rate, placement, and segments. Editing
is non-destructive: segments reference the source buffer. Rendering happens
before playback and upload.

Features include offset/alignment, cutting, multi-select, dragging, deletion,
undo, punch recording, and loop playback.

### Audio Processing

The base track chain includes gain, pitch, speed, low-cut, classic denoise,
space, EQ, compressor, de-esser, and limiter. External modules add voice FX,
neural denoise, and room-echo removal.

Heavy processing runs offline on the main thread. Avoid redundant renders,
unnecessary `Float32Array` allocation, and bypass existing render/spectrum
caches only when necessary.

### Neural Denoise

`vxp-denoise.src.js` is a template. `scripts/embed-models.js` replaces
`@@MODEL:<name>@@` markers with base64 WASM data to create build-only
`vxp-denoise.js`. Never commit or manually edit embedded model data.

GTCRN and RNNoise operate at 48 kHz; the module resamples input and compensates
for each model's fixed latency.

### Microphone and Recording

The mod hooks/augments game Web Audio and microphone acquisition. Do not enable
browser AGC, noise suppression, or echo cancellation without a deliberate
change and manual testing.

The advance-recording queue is persistent IndexedDB data. Do not change its
schema or keys without a migration path for existing recordings.

### Backgrounds

`vxp-bg.js` stores images locally in IndexedDB database `vxp-bg`, generates
previews, and uses object URLs. Revoke every newly created object URL with
`URL.revokeObjectURL` following the existing pattern.

## Storage

| Storage | Purpose |
|---|---|
| `localStorage['vxp:settings:v1']` | Main-module settings |
| `localStorage['vxp-bg:v1']` | Background settings |
| `localStorage['vxp-fx:v1']` | Voice-effector settings |
| IndexedDB `vxp-bg` | Original background images and previews |
| Recording-queue IndexedDB | Saved advance-recorded lines |

Keep storage keys backward compatible. Add safe migrations and defaults when
changing a saved structure.

## Build and Validation

A full build requires Node.js and `zip`:

```bash
./build.sh
```

The script:

1. Checks for `zip` before clearing prior artifacts.
2. Runs `node --check` on source modules.
3. Concatenates `src/vxp-main/` into `build/<target>/vxp-main.js`.
4. Embeds WASM into `vxp-denoise.js`.
5. Creates Chrome and Firefox builds.
6. Generates a userscript from `content_scripts` order.
7. Packages reproducible ZIP/XPI archives and refreshes `extension-build/`.

For a focused main-module check:

```bash
node scripts/build-main.js build-main-check.js
node --check build-main-check.js
```

Delete `build-main-check.js` after checking. For standalone modules, run
`node --check <file>`.

## Change Rules

- Edit `src/`, `extension/`, and `scripts/` only. Do not manually edit `dist/`,
  `build/`, `extension-build/`, or generated `vxp-denoise.js`.
- When adding an external module, add it to `content_scripts[0].js` in
  `extension/manifest.json` and copy it in `build.sh`. Firefox and userscript
  generation derive their order from the manifest.
- Keep `vxp-main.js` before modules that use `VXP.api`.
- Avoid third-party dependencies; the project intentionally uses standard
  Node.js build scripts only.
- Never send audio, settings, or personal data to external services.
- Use existing `tr(ru, en)` for all new user-facing strings.
- Manually test Voxalike integration on the live site; DOM/Fiber/network hooks
  have no automated coverage.
- Do not alter game requests, line-upload formats, or queue keys without
  understanding network-compatibility consequences.

## Documentation

- `README.md`: user-facing features and installation.
- `DEV.md`: short developer build/structure guide.
- `CHANGELOG.md`: release history and notes.
- This file: technical map and working rules for contributors and coding agents.
