"""
Shared camera label/description helpers for gaussian_splat nodes.
"""


def normalize_azimuth(angle):
    """Normalize azimuth angle to [0, 360)."""
    return ((float(angle) % 360.0) + 360.0) % 360.0


def get_azimuth_label(angle):
    """Get direction label from horizontal angle (0-360)."""
    angle = normalize_azimuth(angle)
    if angle <= 22.5 or angle > 337.5:
        return "front view"
    if angle <= 67.5:
        return "front right side view"
    if angle <= 112.5:
        return "right side view"
    if angle <= 157.5:
        return "back right side view"
    if angle <= 202.5:
        return "back view"
    if angle <= 247.5:
        return "back left side view"
    if angle <= 292.5:
        return "left side view"
    return "front left side view"


def get_elevation_label(angle):
    """Get elevation label from vertical angle (-30 to 90)."""
    angle = float(angle)
    if angle <= -15:
        return "low angle"
    if angle <= 15:
        return "eye level"
    if angle <= 45:
        return "high angle"
    if angle <= 75:
        return "very high angle"
    return "bird's-eye view"


def get_zoom_label(zoom):
    """Get shot type label from zoom/distance value (0-10)."""
    zoom = float(zoom)
    if zoom <= 2:
        return "wide shot"
    if zoom <= 4:
        return "medium-wide shot"
    if zoom <= 6:
        return "medium shot"
    if zoom <= 8:
        return "medium-close shot"
    return "close-up shot"


def generate_camera_description(horizontal_angle, vertical_angle, zoom):
    """Generate a complete camera description string."""
    direction = get_azimuth_label(horizontal_angle)
    elevation = get_elevation_label(vertical_angle)
    shot_type = get_zoom_label(zoom)
    horizontal_text = str(int(round(float(horizontal_angle))))
    vertical_text = str(int(round(float(vertical_angle))))
    zoom_text = f"{float(zoom):.1f}"
    return (
        f"{direction}, {elevation}, {shot_type} "
        f"(horizontal: {horizontal_text}, vertical: {vertical_text}, zoom: {zoom_text})"
    )
