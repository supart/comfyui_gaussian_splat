"""
Standalone camera pose node with inline Qwen-style control panel.
"""

from .camera_labels import (
    generate_camera_description,
    normalize_azimuth,
)


def _clamp(value, low, high):
    return max(low, min(high, float(value)))


class CameraPoseQwenPanel:
    """
    Inline camera pose node with:
    - 3D camera control panel
    - manual slider panel
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "azimuth": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 360.0, "step": 1.0}),
                "elevation": ("FLOAT", {"default": 0.0, "min": -30.0, "max": 90.0, "step": 1.0}),
                "zoom": ("FLOAT", {"default": 5.0, "min": 0.0, "max": 10.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ("STRING", "FLOAT", "FLOAT", "FLOAT")
    RETURN_NAMES = ("description", "azimuth", "elevation", "zoom")
    FUNCTION = "generate"
    CATEGORY = "3D/Camera"
    OUTPUT_NODE = False
    DESCRIPTION = "Qwen风格相机姿态控制：3D小球 + 手动滑条，直接输出提示词。"

    def generate(self, azimuth, elevation, zoom):
        azimuth = round(normalize_azimuth(azimuth), 1)
        elevation = round(_clamp(elevation, -30.0, 90.0), 1)
        zoom = round(_clamp(zoom, 0.0, 10.0), 1)

        # Keep wording and structure aligned with current gaussian_splat prompt format.
        description = generate_camera_description(
            f"{azimuth:.1f}",
            f"{elevation:.1f}",
            f"{zoom:.1f}",
        )

        return (
            description,
            azimuth,
            elevation,
            zoom,
        )


NODE_CLASS_MAPPINGS = {
    "CameraPoseQwenPanel": CameraPoseQwenPanel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CameraPoseQwenPanel": "Camera Pose Qwen Panel",
}
