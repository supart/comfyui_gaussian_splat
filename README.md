# comfyui_gaussian_splat

ComfyUI custom nodes for Gaussian viewer interaction and camera pose prompt control.

## Version

- Current version: `0.4.0`

## 0.4.0 Highlights

- Camera history now keeps more of the real shot state, including zoom and aspect ratio.
- History panel supports deleting a single saved shot directly in the viewer.
- Reopen / cancel flow restores the last cached camera pose more reliably.
- Orbit-center interaction was refined so left-click pivot picking feels steadier during rotation.
- Manual `Zoom` output is now separated from mouse-wheel camera zoom, so prompt values stay predictable.
- Startup and reset camera behavior were aligned to avoid first-scroll white-screen jumps.

## Features

- `Gaussian Viewer Select` node for interactive 3D Gaussian scene control.
- `Camera Pose Qwen Panel` node for camera prompt and pose parameters.
- Camera history panel with explicit `Add to history` and `Reset` actions.
- Roll correction (`roll`) and custom orbit center controls.
- Camera state cache on cancel/reopen to keep pose continuity.

## Directory Structure

```text
comfyui_gaussian_splat/
|-- __init__.py
|-- your_node.py
|-- requirements.txt
|-- README.md
|-- CHANGELOG.md
|-- LICENSE
|-- camera_pose_qwen_panel.py
|-- gaussian_splat.py
|-- camera_labels.py
`-- js/
    |-- camera_pose_qwen_panel.js
    |-- gaussian_viewer.js
    |-- viewer_gaussian.html
    |-- viewer_editor.js
    |-- coordinate-transform.js
    `-- gsplat-bundle.js
```

## Available Nodes

- `Gaussian Viewer Select`
- `Camera Pose Qwen Panel`

## Install

1. Copy this folder into `ComfyUI/custom_nodes/`.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Restart ComfyUI.

## Upgrade Notes

1. Pull the latest plugin code into your existing `custom_nodes/comfyui_gaussian_splat`.
2. Restart ComfyUI and reload the browser page.
3. If frontend behavior looks stale, clear browser cache once and reload.

## Development Notes

- Frontend assets are loaded from `WEB_DIRECTORY = "./js"`.
- `your_node.py` is the unified export file used by `__init__.py`.
