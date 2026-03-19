# Changelog

All notable changes to this project are documented in this file.

## [0.4.0] - 2026-03-20

### Changed

- Bumped plugin version metadata to `0.4.0`.
- Restored cached camera pose on reopen/cancel flow so viewer state now matches the documented behavior.
- Improved camera history so saved shots keep zoom, aspect ratio, and can be restored more reliably.
- Added per-shot delete action in the history panel for faster cleanup during iteration.
- Separated manual `Zoom` output from mouse-wheel camera zoom so prompt values and real viewport distance no longer fight each other.
- Refined orbit-center picking and rotation behavior to reduce drift, remove pivot-jump on left-click, and keep the chosen center stable while dragging.
- Aligned startup and reset camera initialization to avoid the first-scroll white-screen jump after opening the viewer.
- Adjusted preview output generation to keep the 3D camera preview centered with a square crop.
- Reduced unnecessary UI / preview panel refresh frequency to improve browser responsiveness during interaction.

## [0.3.0] - 2026-03-02

### Added

- Added backend endpoint `POST /gaussian_viewer/add_history` for explicit camera history insertion.
- Added backend endpoint `POST /gaussian_viewer/cache_camera_state` to persist pose on cancel flow.
- Added manual `Add to history` action in viewer history panel.
- Added roll (`-90` to `90`) controls and display in viewer UI.
- Added orbit center numeric controls and pick/apply/clear actions in viewer UI.

### Changed

- Updated camera state normalization to include `roll`, safer numeric parsing, and sequence handling.
- Refined camera history dedupe and capped history management logic.
- Updated frontend message handling to accept both `cameraState` and `camera_state`.
- Improved state fallback behavior when reopening viewer from cached node params.

## [0.2.0] - 2026-02-23

### Added

- Added `Camera Pose Qwen Panel` with inline 3D pose controls.
- Added unified node export module: `your_node.py`.
- Added repository metadata files: `README.md`, `LICENSE`, `.gitignore`.
- Added reset button in manual control header for pose defaults.

### Changed

- Refined panel layout into modular cards:
  - `3D camera control`
  - `manual control`
  - `prompt preview`
- Improved 3D interaction stability:
  - azimuth/elevation dragging uses projection-aware mapping
  - distance handle zoom drag smoothed to reduce jitter near camera
- Simplified `Camera Pose Qwen Panel` node outputs to:
  - `description`
  - `azimuth`
  - `elevation`
  - `zoom`

### Removed

- Removed unused legacy nodes:
  - `Camera Preset Selector`
  - `Camera Description Generator`
  - `Camera Pose Ball`
  - `Camera Pose Prompt Ball`
- Removed corresponding legacy frontend files and backend registrations.
