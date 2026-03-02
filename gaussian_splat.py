"""
ComfyUI Gaussian Splat Plugin
Integrated with QwenMultiAngle camera description features
"""

import numpy as np
import torch
from plyfile import PlyData
from PIL import Image
from io import BytesIO
import base64
from server import PromptServer
from aiohttp import web
import time
import os
from .camera_labels import (
    generate_camera_description,
)

# Global state for viewer communication
PENDING_SELECTIONS = {}
WAITING_NODES = {}
CANCELLED_NODES = set()

# Cache last camera state & history
# Keys:
#   "node:{node_id}"    -> last camera_state dict
#   "ply:{ply_path}"    -> last camera_state dict
#   "history:{node_id}" -> list[dict] of camera_state snapshots (recent first)
CAMERA_STATE_CACHE = {}
MAX_PLY_FILE_SIZE_BYTES = 512 * 1024 * 1024  # 512MB hard cap for in-memory transfer
MAX_CAMERA_HISTORY_ITEMS = 10


def _to_float(value, default):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value, default=None):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_camera_snapshot(camera_state):
    if not isinstance(camera_state, dict):
        return None

    azimuth = _to_float(camera_state.get("azimuth"), 0.0)
    elevation = _to_float(camera_state.get("elevation"), 0.0)
    distance = _to_float(camera_state.get("distance"), 5.0)
    roll = _to_float(camera_state.get("roll"), 0.0)
    seq = _to_int(camera_state.get("seq"), None)

    description = camera_state.get("description") or generate_camera_description(
        azimuth, elevation, distance
    )
    position = camera_state.get("position")
    target = camera_state.get("target")
    orbit_center = camera_state.get("orbitCenter")

    snapshot = {
        "azimuth": azimuth,
        "elevation": elevation,
        "distance": distance,
        "roll": roll,
        "description": description,
        "timestamp": time.time(),
        "position": position,
        "target": target,
        "orbitCenter": orbit_center,
    }
    if seq is not None and seq > 0:
        snapshot["seq"] = seq
    return snapshot


def _is_same_pose(a, b):
    if not isinstance(a, dict) or not isinstance(b, dict):
        return False
    epsilon = 1e-4
    return (
        abs(_to_float(a.get("azimuth"), 0.0) - _to_float(b.get("azimuth"), 0.0)) < epsilon
        and abs(_to_float(a.get("elevation"), 0.0) - _to_float(b.get("elevation"), 0.0)) < epsilon
        and abs(_to_float(a.get("distance"), 5.0) - _to_float(b.get("distance"), 5.0)) < epsilon
        and abs(_to_float(a.get("roll"), 0.0) - _to_float(b.get("roll"), 0.0)) < epsilon
    )


def _cache_last_camera_state(str_key, snapshot, params):
    if snapshot is None:
        return
    CAMERA_STATE_CACHE[f"node:{str_key}"] = snapshot
    ply_path = params.get("ply_path") or params.get("filename")
    if ply_path:
        CAMERA_STATE_CACHE[f"ply:{ply_path}"] = snapshot


def _append_camera_history(str_key, snapshot):
    if snapshot is None:
        return []
    history_key = f"history:{str_key}"
    history = CAMERA_STATE_CACHE.get(history_key, [])
    if not isinstance(history, list):
        history = []

    if history and _is_same_pose(history[0], snapshot):
        return history

    max_seq = 0
    for item in history:
        seq = _to_int(item.get("seq"), 0)
        if seq > max_seq:
            max_seq = seq
    next_seq = max_seq + 1 if max_seq > 0 else len(history) + 1
    snapshot = dict(snapshot)
    snapshot["seq"] = next_seq

    history.insert(0, snapshot)
    if len(history) > MAX_CAMERA_HISTORY_ITEMS:
        history = history[:MAX_CAMERA_HISTORY_ITEMS]
    CAMERA_STATE_CACHE[history_key] = history
    return history


def _safe_realpath(path):
    return os.path.realpath(os.path.abspath(os.path.expanduser(path)))


def _path_is_under(path, root):
    try:
        return os.path.commonpath([path, root]) == root
    except ValueError:
        return False


def _get_allowed_ply_roots():
    """
    Resolve trusted roots for raw PLY loading.
    Priority:
    1) Active WAITING_NODES mapping (strictest request-scoped match).
    2) ComfyUI input/output/temp directories (if available).
    3) Current working directory as a fallback.
    """
    roots = {_safe_realpath(os.getcwd())}

    try:
        import folder_paths  # type: ignore

        for getter_name in ("get_input_directory", "get_output_directory", "get_temp_directory"):
            getter = getattr(folder_paths, getter_name, None)
            if callable(getter):
                directory = getter()
                if directory:
                    roots.add(_safe_realpath(directory))
    except Exception as exc:
        print(f"[GaussianViewer] folder_paths unavailable, using cwd fallback only: {exc}")

    return [root for root in roots if os.path.isdir(root)]


def _is_requested_waiting_path(resolved_path, node_id=None):
    if node_id is not None:
        waiting = WAITING_NODES.get(str(node_id))
        if waiting and waiting.get("ply_path"):
            return _safe_realpath(waiting.get("ply_path")) == resolved_path

    for waiting in WAITING_NODES.values():
        waiting_path = waiting.get("ply_path")
        if waiting_path and _safe_realpath(waiting_path) == resolved_path:
            return True
    return False


def _validate_requested_ply_path(raw_ply_path, node_id=None):
    if not isinstance(raw_ply_path, str) or not raw_ply_path.strip():
        return None, 400, "Invalid ply_path"

    if "\x00" in raw_ply_path:
        return None, 400, "Invalid ply_path"

    resolved_path = _safe_realpath(raw_ply_path)

    if not resolved_path.lower().endswith(".ply"):
        return None, 400, "Only .ply files are supported"

    allowed_by_waiting_state = _is_requested_waiting_path(resolved_path, node_id=node_id)
    if not allowed_by_waiting_state:
        allowed_roots = _get_allowed_ply_roots()
        if not any(_path_is_under(resolved_path, root) for root in allowed_roots):
            return None, 403, "Requested PLY path is outside allowed directories"

    if not os.path.isfile(resolved_path):
        return None, 404, "PLY file not found"

    file_size = os.path.getsize(resolved_path)
    if file_size > MAX_PLY_FILE_SIZE_BYTES:
        return None, 413, "PLY file too large"

    return resolved_path, 200, None


# ===== Node Classes =====

class GaussianViewerSelect:
    """
    Interactive Gaussian Splat Viewer with camera parameter extraction.
    
    This node loads a PLY file and displays it in an interactive viewer.
    Users can rotate, zoom, and select camera angles. The selected view
    is captured and returned as an image along with camera parameters.
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ply_path": ("STRING", {"forceInput": True}),
                "width": ("INT", {"default": 1024, "min": 64, "max": 4096, "step": 8}),
                "height": ("INT", {"default": 576, "min": 64, "max": 4096, "step": 8}),
                "mode": (["Always Pause", "Pass Through"], {"default": "Always Pause"}),
                "background": (["black", "white", "gray"], {"default": "black"}),
                "point_size": ("FLOAT", {"default": 1.5, "min": 0.1, "max": 10.0, "step": 0.1}),
            },
            "optional": {
                "extrinsics": ("EXTRINSICS",),
                "intrinsics": ("INTRINSICS",),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "prompt": "PROMPT"},
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "INT", "INT", "FLOAT", "FLOAT", "FLOAT", "STRING")
    RETURN_NAMES = ("image", "camera_panel", "width", "height", "azimuth", "elevation", "zoom", "camera_description")
    FUNCTION = "run"
    CATEGORY = "3D/Gaussian"
    OUTPUT_NODE = True
    DESCRIPTION = "Interactive Gaussian Splat viewer with camera parameter extraction"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def load_ply(self, ply_path):
        """Load PLY file and extract Gaussian splat data"""
        plydata = PlyData.read(ply_path)
        vertex = plydata['vertex']
        props = [p.name for p in vertex.properties]

        xyz = np.stack([vertex['x'], vertex['y'], vertex['z']], axis=1).astype(np.float32)

        if 'f_dc_0' in props:
            C0 = 0.28209479177387814
            colors = np.stack([vertex['f_dc_0'], vertex['f_dc_1'], vertex['f_dc_2']], axis=1) * C0 + 0.5
            colors = np.clip(colors, 0, 1).astype(np.float32)
        elif 'red' in props:
            colors = np.stack([vertex['red'], vertex['green'], vertex['blue']], axis=1).astype(np.float32) / 255.0
        else:
            colors = np.ones((len(xyz), 3), dtype=np.float32)

        opacity = 1.0 / (1.0 + np.exp(-np.array(vertex['opacity']))) if 'opacity' in props else np.ones(len(xyz), dtype=np.float32)

        if 'scale_0' in props:
            scales = np.stack([
                np.exp(np.array(vertex['scale_0'])),
                np.exp(np.array(vertex['scale_1'])),
                np.exp(np.array(vertex['scale_2']))
            ], axis=1).astype(np.float32)
        else:
            scales = np.ones((len(xyz), 3), dtype=np.float32) * 0.01

        if 'rot_0' in props:
            rotations = np.stack([
                vertex['rot_0'], vertex['rot_1'], vertex['rot_2'], vertex['rot_3']
            ], axis=1).astype(np.float32)
            rotations = rotations / (np.linalg.norm(rotations, axis=1, keepdims=True) + 1e-8)
        else:
            rotations = np.zeros((len(xyz), 4), dtype=np.float32)
            rotations[:, 0] = 1.0

        return xyz, colors, opacity, scales, rotations

    def get_default_camera_params(self):
        """Return default camera parameters"""
        default_azimuth = 0.0
        default_elevation = 0.0
        default_distance = 5.0
        return {
            'azimuth': default_azimuth,
            'elevation': default_elevation,
            'distance': default_distance,
            'description': generate_camera_description(
                default_azimuth, default_elevation, default_distance
            ),
        }

    def extract_camera_params(self, result):
        """Extract camera parameters from frontend result"""
        camera_state = result.get('camera_state', {})
        azimuth = float(camera_state.get('azimuth', 0.0))
        elevation = float(camera_state.get('elevation', 0.0))
        distance = float(camera_state.get('distance', 5.0))
        
        # Generate description using QwenMultiAngle functions
        description = generate_camera_description(azimuth, elevation, distance)
        
        params = {
            'azimuth': azimuth,
            'elevation': elevation,
            'distance': distance,
            'description': description
        }
        print(f"[GaussianViewer] Camera params: azimuth={params['azimuth']:.1f}, elevation={params['elevation']:.1f}, distance={params['distance']:.1f}")
        print(f"[GaussianViewer] Camera description: {params['description']}")
        return params

    def extrinsics_to_rotation(self, extrinsics):
        """Convert extrinsics matrix to rotation angles"""
        if extrinsics is None:
            return 0, 0, 0

        if hasattr(extrinsics, 'numpy'):
            ext = extrinsics.cpu().numpy()
        else:
            ext = np.array(extrinsics)

        if ext.ndim == 3:
            ext = ext[0]

        R = ext[:3, :3]

        sy = np.sqrt(R[0, 0] ** 2 + R[1, 0] ** 2)
        singular = sy < 1e-6

        if not singular:
            rx = np.arctan2(R[2, 1], R[2, 2])
            ry = np.arctan2(-R[2, 0], sy)
            rz = np.arctan2(R[1, 0], R[0, 0])
        else:
            rx = np.arctan2(-R[1, 2], R[1, 1])
            ry = np.arctan2(-R[2, 0], sy)
            rz = 0

        return np.degrees(rx), np.degrees(ry), np.degrees(rz)

    def screenshot_to_image(self, screenshot_b64, background):
        """Convert base64 screenshot to numpy image array"""
        try:
            if ',' in screenshot_b64:
                screenshot_b64 = screenshot_b64.split(',')[1]
            
            img_data = base64.b64decode(screenshot_b64)
            img = Image.open(BytesIO(img_data))
            
            print(f"[GaussianViewer] Screenshot original size: {img.size}")
            
            if img.mode == 'RGBA':
                bg_colors = {"black": (0, 0, 0), "white": (255, 255, 255), "gray": (128, 128, 128)}
                bg_color = bg_colors.get(background, (0, 0, 0))
                bg = Image.new('RGB', img.size, bg_color)
                bg.paste(img, mask=img.split()[3])
                img = bg
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            img_np = np.array(img).astype(np.float32) / 255.0
            return img_np
            
        except Exception as e:
            print(f"[GaussianViewer] Error converting screenshot: {e}")
            return None

    def render_fallback(self, width, height, background):
        """Create a fallback image"""
        bg = {"black": 0.0, "white": 1.0, "gray": 0.5}.get(background, 0.0)
        return np.full((height, width, 3), bg, dtype=np.float32)

    def make_fallback_panel(self):
        """Create a 512x512 black fallback for camera_panel"""
        return torch.zeros((1, 512, 512, 3), dtype=torch.float32)

    def get_camera_panel_tensor(self, result):
        """Convert camera_panel_screenshot to image tensor"""
        cp = result.get('camera_panel_screenshot')
        if cp:
            np_img = self.screenshot_to_image(cp, 'black')
            if np_img is not None:
                return torch.from_numpy(np_img).unsqueeze(0)
        return self.make_fallback_panel()

    def run(self, ply_path, width, height, mode, background, point_size,
            extrinsics=None, intrinsics=None, unique_id=None, prompt=None):
        width = int(width) if width and width != "" else 512
        height = int(height) if height and height != "" else 512
        point_size = float(point_size) if point_size and point_size != "" else 1.5

        node_id = str(unique_id) if unique_id else None

        init_rx, init_ry, init_rz = self.extrinsics_to_rotation(extrinsics)

        print(f"[GaussianViewer] Running node_id={node_id}, mode={mode}")

        # Check for pending selection
        if node_id and node_id in PENDING_SELECTIONS:
            result = PENDING_SELECTIONS.pop(node_id)
            if node_id in WAITING_NODES:
                del WAITING_NODES[node_id]

            print(f"[GaussianViewer] Found pending selection: {list(result.keys())}")
            
            cam_params = self.extract_camera_params(result)
            camera_panel = self.get_camera_panel_tensor(result)

            screenshot = result.get('screenshot')
            output_width = result.get('output_width') or width
            output_height = result.get('output_height') or height
            print(f"[GaussianViewer] Output size from frontend: {output_width} x {output_height}")
            if screenshot:
                image_np = self.screenshot_to_image(screenshot, background)
                if image_np is not None:
                    print(f"[GaussianViewer] Using screenshot from viewer, final size: {image_np.shape}")
                    return (torch.from_numpy(image_np).unsqueeze(0), camera_panel, output_width, output_height,
                            cam_params['azimuth'], cam_params['elevation'], cam_params['distance'], cam_params['description'])

            print(f"[GaussianViewer] No valid screenshot, using fallback")
            image_np = self.render_fallback(output_width, output_height, background)
            return (torch.from_numpy(image_np).unsqueeze(0), camera_panel, output_width, output_height,
                    cam_params['azimuth'], cam_params['elevation'], cam_params['distance'], cam_params['description'])

        # Pass through mode
        if mode == "Pass Through":
            image_np = self.render_fallback(width, height, background)
            default_params = self.get_default_camera_params()
            return (torch.from_numpy(image_np).unsqueeze(0), self.make_fallback_panel(), width, height,
                    default_params['azimuth'], default_params['elevation'], default_params['distance'], default_params['description'])

        # Always Pause mode
        print(f"[GaussianViewer] Sending show event for node_id={node_id}")

        if node_id in CANCELLED_NODES:
            CANCELLED_NODES.discard(node_id)

        # Look up cached camera state, prefer node-specific, fall back to ply_path
        cached_camera_state = None
        cache_key_node = f"node:{node_id}" if node_id else None
        cache_key_ply = f"ply:{ply_path}" if ply_path else None
        if cache_key_node and cache_key_node in CAMERA_STATE_CACHE:
            cached_camera_state = CAMERA_STATE_CACHE[cache_key_node]
        elif cache_key_ply and cache_key_ply in CAMERA_STATE_CACHE:
            cached_camera_state = CAMERA_STATE_CACHE[cache_key_ply]

        WAITING_NODES[node_id] = {
            "ply_path": ply_path,
            "width": width,
            "height": height,
            "background": background,
            "point_size": point_size,
            "cached_camera_state": cached_camera_state,
        }

        event_payload = {
            "node_id": node_id,
            "width": width,
            "height": height,
            "ply_path": ply_path,
            "background": background,
            "point_size": point_size,
            "init_rotate_x": init_rx,
            "init_rotate_y": init_ry,
            "init_rotate_z": init_rz,
        }

        if cached_camera_state is not None:
            event_payload["camera_state"] = cached_camera_state

        # Attach history (if any) so the front-end can render "历史镜头" 面板
        history_key = f"history:{node_id}" if node_id else None
        if history_key and history_key in CAMERA_STATE_CACHE:
            event_payload["camera_history"] = CAMERA_STATE_CACHE[history_key]

        PromptServer.instance.send_sync("gaussian_viewer_show", event_payload)

        print(f"[GaussianViewer] Waiting for user confirmation...")
        timeout = 600
        start_time = time.time()

        while node_id not in PENDING_SELECTIONS:
            if node_id in CANCELLED_NODES:
                print(f"[GaussianViewer] Execution cancelled by user")
                CANCELLED_NODES.discard(node_id)
                if node_id in WAITING_NODES:
                    del WAITING_NODES[node_id]
                raise InterruptedError("User cancelled execution")

            time.sleep(0.1)
            if time.time() - start_time > timeout:
                print(f"[GaussianViewer] Timeout waiting for user input")
                image_np = self.render_fallback(width, height, background)
                default_params = self.get_default_camera_params()
                return (torch.from_numpy(image_np).unsqueeze(0), self.make_fallback_panel(), width, height,
                        default_params['azimuth'], default_params['elevation'], default_params['distance'], default_params['description'])

        result = PENDING_SELECTIONS.pop(node_id)
        if node_id in WAITING_NODES:
            del WAITING_NODES[node_id]

        print(f"[GaussianViewer] User confirmed")
        
        cam_params = self.extract_camera_params(result)
        camera_panel = self.get_camera_panel_tensor(result)

        screenshot = result.get('screenshot')
        output_width = result.get('output_width') or width
        output_height = result.get('output_height') or height
        print(f"[GaussianViewer] Output size from frontend: {output_width} x {output_height}")
        if screenshot:
            image_np = self.screenshot_to_image(screenshot, background)
            if image_np is not None:
                print(f"[GaussianViewer] Using screenshot from viewer, final size: {image_np.shape}")
                return (torch.from_numpy(image_np).unsqueeze(0), camera_panel, output_width, output_height,
                        cam_params['azimuth'], cam_params['elevation'], cam_params['distance'], cam_params['description'])

        print(f"[GaussianViewer] No valid screenshot, using fallback")
        image_np = self.render_fallback(output_width, output_height, background)
        return (torch.from_numpy(image_np).unsqueeze(0), camera_panel, output_width, output_height,
                cam_params['azimuth'], cam_params['elevation'], cam_params['distance'], cam_params['description'])


# ===== API Routes =====

@PromptServer.instance.routes.post("/gaussian_viewer/confirm")
async def gaussian_confirm(request):
    """Handle viewer confirmation from frontend"""
    data = await request.json()
    node_id = data.get("node_id")
    params = data.get("params", {})

    print(f"[GaussianViewer] Confirm received for node: {node_id}")
    
    screenshot = params.get('screenshot')
    if screenshot:
        print(f"[GaussianViewer] Screenshot received, length: {len(screenshot)}")
        if screenshot.startswith('data:'):
            print(f"[GaussianViewer] Screenshot format: data URL")
        else:
            print(f"[GaussianViewer] Screenshot format: raw base64")
    else:
        print(f"[GaussianViewer] WARNING: No screenshot in params!")
        print(f"[GaussianViewer] Params keys: {list(params.keys())}")

    str_key = str(node_id)
    PENDING_SELECTIONS[str_key] = params

    # Cache latest camera_state for next open; history is now managed explicitly
    # by /gaussian_viewer/add_history.
    camera_state = params.get("camera_state")
    snapshot = _normalize_camera_snapshot(camera_state)
    _cache_last_camera_state(str_key, snapshot, params)

    return web.json_response({"success": True})


@PromptServer.instance.routes.post("/gaussian_viewer/add_history")
async def gaussian_add_history(request):
    """Append one camera snapshot to per-node history (manual action only)."""
    data = await request.json()
    node_id = data.get("node_id")
    str_key = str(node_id)

    snapshot = _normalize_camera_snapshot(data.get("camera_state"))
    if snapshot is None:
        return web.json_response({"success": False, "error": "Invalid camera_state"}, status=400)

    history = _append_camera_history(str_key, snapshot)
    return web.json_response({"success": True, "history_count": len(history)})


@PromptServer.instance.routes.post("/gaussian_viewer/cache_camera_state")
async def gaussian_cache_camera_state(request):
    """Cache latest camera state without confirming selection."""
    data = await request.json()
    node_id = data.get("node_id")
    str_key = str(node_id)

    snapshot = _normalize_camera_snapshot(data.get("camera_state"))
    params = data.get("params")
    if not isinstance(params, dict):
        params = {}
    if not params and str_key in WAITING_NODES:
        waiting = WAITING_NODES.get(str_key, {})
        if isinstance(waiting, dict):
            params = waiting

    _cache_last_camera_state(str_key, snapshot, params)
    return web.json_response({"success": True, "cached": snapshot is not None})


@PromptServer.instance.routes.post("/gaussian_viewer/load_ply_raw")
async def gaussian_load_ply_raw(request):
    """Load PLY file and return raw binary data for gsplat.js"""
    try:
        data = await request.json()
        ply_path = data.get("ply_path")
        node_id = data.get("node_id")
        safe_ply_path, status_code, error_message = _validate_requested_ply_path(
            ply_path, node_id=node_id
        )
        if error_message is not None:
            return web.Response(status=status_code, text=error_message)

        with open(safe_ply_path, 'rb') as f:
            ply_data = f.read()

        return web.Response(
            body=ply_data,
            content_type='application/octet-stream',
            headers={'Content-Length': str(len(ply_data))}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.Response(status=500, text=str(e))


@PromptServer.instance.routes.post("/gaussian_viewer/cancel")
async def gaussian_cancel(request):
    """Handle viewer cancellation from frontend"""
    data = await request.json()
    node_id = data.get("node_id")
    str_key = str(node_id)

    print(f"[GaussianViewer] Cancel requested for node: {str_key}")

    CANCELLED_NODES.add(str_key)

    if str_key in WAITING_NODES:
        del WAITING_NODES[str_key]
    if str_key in PENDING_SELECTIONS:
        del PENDING_SELECTIONS[str_key]

    return web.json_response({"success": True})


@PromptServer.instance.routes.post("/gaussian_viewer/reset")
async def gaussian_reset(request):
    """Clear cached camera state and history for a node (used by Reset Camera button)."""
    data = await request.json()
    node_id = data.get("node_id")
    str_key = str(node_id)

    print(f"[GaussianViewer] Reset requested for node: {str_key}")

    node_key = f"node:{str_key}"
    history_key = f"history:{str_key}"

    # Remove node-specific cache
    CAMERA_STATE_CACHE.pop(node_key, None)
    CAMERA_STATE_CACHE.pop(history_key, None)

    # Optionally also clear ply-based cache if we can resolve ply_path from WAITING_NODES
    waiting = WAITING_NODES.get(str_key)
    if waiting:
        ply_path = waiting.get("ply_path")
        if ply_path:
            CAMERA_STATE_CACHE.pop(f"ply:{ply_path}", None)

    return web.json_response({"success": True})


# ===== Node Registration =====

NODE_CLASS_MAPPINGS = {
    "GaussianViewerSelect": GaussianViewerSelect,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GaussianViewerSelect": "Gaussian Viewer Select",
}
