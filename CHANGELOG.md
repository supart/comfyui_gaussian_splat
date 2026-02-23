# Changelog

All notable changes to this project are documented in this file.

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

