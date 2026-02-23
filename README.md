# comfyui_gaussian_splat

ComfyUI custom nodes for Gaussian viewer interaction and camera pose prompt control.

## Version

- Current version: `0.2.0`

## Directory Structure

```text
comfyui_gaussian_splat/
├── __init__.py
├── your_node.py
├── requirements.txt
├── README.md
├── CHANGELOG.md
├── LICENSE
├── camera_pose_qwen_panel.py
├── gaussian_splat.py
├── camera_labels.py
└── js/
    ├── camera_pose_qwen_panel.js
    ├── gaussian_viewer.js
    ├── viewer_gaussian.html
    ├── viewer_editor.js
    ├── coordinate-transform.js
    └── gsplat-bundle.js
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

## Development Notes

- Frontend assets are loaded from `WEB_DIRECTORY = "./js"`.
- `your_node.py` is the unified export file used by `__init__.py`.
- Old/unused nodes have been removed from this branch.

