/**
 * Unified Coordinate Transform Module
 * 
 * This module provides a unified coordinate system for communication between:
 * - 3D Camera Control Panel (Three.js)
 * - Gaussian Splat Viewer (gsplat)
 * - Backend Python code
 * 
 * Coordinate System Convention:
 * ============================
 * - Azimuth (方位角): 0° = Front (Z+), 90° = Right (X+), 180° = Back (Z-), 270° = Left (X-)
 * - Elevation (仰角): Positive = Looking down (camera above), Negative = Looking up (camera below)
 * - Distance (距离): Distance from camera to target center
 * - Zoom (缩放): 0-10 scale, where 0 = far (wide shot), 10 = close (close-up)
 * 
 * XYZ Coordinate System:
 * - X axis: Right = positive
 * - Y axis: Up = positive
 * - Z axis: Front = positive (towards viewer)
 */

const CoordinateTransform = (function() {
    'use strict';

    // ==================== Constants ====================
    
    /**
     * Zoom to distance mapping constants
     * zoom 0 = far (distance 2), zoom 5 = mid/front (distance 1.15), zoom 10 = close (distance 0.3)
     */
    const DISTANCE_MIN = 0.3;   // zoom = 10
    const DISTANCE_MAX = 3;     // zoom = 0
    const ZOOM_MIN = 0;
    const ZOOM_MAX = 10;

    /**
     * Elevation angle limits
     */
    const ELEVATION_MIN = -30;  // degrees
    const ELEVATION_MAX = 90;   // degrees

    // ==================== Utility Functions ====================

    /**
     * Convert degrees to radians
     */
    function degToRad(degrees) {
        return degrees * Math.PI / 180;
    }

    /**
     * Convert radians to degrees
     */
    function radToDeg(radians) {
        return radians * 180 / Math.PI;
    }

    /**
     * Clamp a value between min and max
     */
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Normalize angle to 0-360 range
     */
    function normalizeAngle(angle) {
        angle = ((angle % 360) + 360) % 360;
        return angle;
    }

    // ==================== Core Transform Functions ====================

    /**
     * Convert spherical coordinates (azimuth, elevation, distance) to Cartesian (x, y, z)
     * 
     * This is the UNIFIED conversion function that should be used by both:
     * - 3D Camera Control Panel
     * - Gaussian Splat Viewer
     * 
     * @param {number} azimuth - Horizontal angle in degrees (0-360)
     * @param {number} elevation - Vertical angle in degrees (-30 to 90)
     * @param {number} distance - Distance from origin
     * @param {object} target - Target center point {x, y, z}, defaults to {0, 0, 0}
     * @returns {object} Cartesian coordinates {x, y, z}
     */
    function sphericalToCartesian(azimuth, elevation, distance, target = {x: 0, y: 0, z: 0}) {
        const azRad = degToRad(azimuth);
        const elRad = degToRad(elevation);
        
        // Unified formula:
        // - 0° azimuth = Z+ direction (front)
        // - 90° azimuth = X+ direction (right)
        // - Positive elevation = Y+ direction (up)
        const x = target.x + distance * Math.sin(azRad) * Math.cos(elRad);
        const y = target.y + distance * Math.sin(elRad);
        const z = target.z + distance * Math.cos(azRad) * Math.cos(elRad);
        
        return { x, y, z };
    }

    /**
     * Convert Cartesian coordinates (x, y, z) to spherical (azimuth, elevation, distance)
     * 
     * This is the inverse of sphericalToCartesian
     * 
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} z - Z coordinate
     * @param {object} target - Target center point {x, y, z}, defaults to {0, 0, 0}
     * @returns {object} Spherical coordinates {azimuth, elevation, distance}
     */
    function cartesianToSpherical(x, y, z, target = {x: 0, y: 0, z: 0}) {
        const dx = x - target.x;
        const dy = y - target.y;
        const dz = z - target.z;
        
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (distance < 0.0001) {
            return { azimuth: 0, elevation: 0, distance: 0 };
        }
        
        // Calculate azimuth (0° = Z+, 90° = X+)
        let azimuth = radToDeg(Math.atan2(dx, dz));
        azimuth = normalizeAngle(azimuth);
        
        // Calculate elevation
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);
        let elevation = radToDeg(Math.atan2(dy, horizontalDist));
        elevation = clamp(elevation, ELEVATION_MIN, ELEVATION_MAX);
        
        return { azimuth, elevation, distance };
    }

    /**
     * Convert zoom value to camera distance
     * 
     * @param {number} zoom - Zoom value (0-10)
     * @returns {number} Camera distance
     */
    function zoomToDistance(zoom) {
        zoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
        // Linear interpolation: zoom 0 -> distance 10, zoom 10 -> distance 2
        return DISTANCE_MAX - (zoom / ZOOM_MAX) * (DISTANCE_MAX - DISTANCE_MIN);
    }

    /**
     * Convert camera distance to zoom value
     * 
     * @param {number} distance - Camera distance
     * @returns {number} Zoom value (0-10)
     */
    function distanceToZoom(distance) {
        distance = clamp(distance, DISTANCE_MIN, DISTANCE_MAX);
        // Linear interpolation: distance 10 -> zoom 0, distance 2 -> zoom 10
        return ((DISTANCE_MAX - distance) / (DISTANCE_MAX - DISTANCE_MIN)) * ZOOM_MAX;
    }

    // ==================== Camera Label Functions ====================

    /**
     * Get direction label from azimuth angle
     * 
     * @param {number} angle - Azimuth angle in degrees
     * @returns {string} Direction label
     */
    function getAzimuthLabel(angle) {
        angle = normalizeAngle(angle);
        
        if (angle <= 22.5 || angle > 337.5) return 'front view';
        if (angle <= 67.5) return 'front right side view';
        if (angle <= 112.5) return 'right side view';
        if (angle <= 157.5) return 'back right side view';
        if (angle <= 202.5) return 'back view';
        if (angle <= 247.5) return 'back left side view';
        if (angle <= 292.5) return 'left side view';
        return 'front left side view';
    }

    /**
     * Get elevation label from elevation angle
     * 
     * @param {number} angle - Elevation angle in degrees
     * @returns {string} Elevation label
     */
    function getElevationLabel(angle) {
        if (angle <= -15) return 'low angle';
        if (angle <= 15) return 'eye level';
        if (angle <= 45) return 'high angle';
        if (angle <= 75) return 'very high angle';
        return "bird's-eye view";
    }

    /**
     * Get shot type label from zoom value
     * 
     * @param {number} zoom - Zoom value (0-10)
     * @returns {string} Shot type label
     */
    function getZoomLabel(zoom) {
        if (zoom <= 2) return 'wide shot';
        if (zoom <= 4) return 'medium-wide shot';
        if (zoom <= 6) return 'medium shot';
        if (zoom <= 8) return 'medium-close shot';
        return 'close-up shot';
    }

    /**
     * Generate complete camera description
     * 
     * @param {number} azimuth - Azimuth angle in degrees
     * @param {number} elevation - Elevation angle in degrees
     * @param {number} zoom - Zoom value (0-10)
     * @returns {string} Complete camera description
     */
    function generateCameraDescription(azimuth, elevation, zoom) {
        const direction = getAzimuthLabel(azimuth);
        const elevationLabel = getElevationLabel(elevation);
        const shotType = getZoomLabel(zoom);

        const zoomValue = Number(zoom);
        const zoomText = Number.isFinite(zoomValue) ? zoomValue.toFixed(1) : '0.0';
        return `${direction}, ${elevationLabel}, ${shotType} (horizontal: ${Math.round(azimuth)}, vertical: ${Math.round(elevation)}, zoom: ${zoomText})`;
    }

    // ==================== GSplat Adapter ====================

    /**
     * Adapter for GSplat viewer coordinate system
     * 
     * GSplat may use a different coordinate convention internally.
     * These functions handle the conversion between unified and GSplat coordinates.
     */
    const GSplatAdapter = {
        /**
         * Convert unified spherical to GSplat camera position
         * 
         * @param {number} azimuth - Unified azimuth (0-360)
         * @param {number} elevation - Unified elevation (-30 to 90)
         * @param {number} zoom - Unified zoom (0-10)
         * @param {object} target - Target center {x, y, z}
         * @returns {object} GSplat camera position {x, y, z}
         */
        toGSplatPosition(azimuth, elevation, zoom, target = {x: 0, y: 0, z: 0}) {
            const distance = zoomToDistance(zoom);
            // 与 GSplat OrbitControls update 公式完全对齐：
            // x = r.x + A * sin(I) * cos(d)
            // y = r.y - A * sin(d)
            // z = r.z - A * cos(I) * cos(d)
            // 其中 I=azimuth, d=elevation，不需要额外偏移
            const azRad = degToRad(azimuth);
            const elRad = degToRad(elevation);
            
            const x = target.x + distance * Math.sin(azRad) * Math.cos(elRad);
            const y = target.y - distance * Math.sin(elRad);
            const z = target.z - distance * Math.cos(azRad) * Math.cos(elRad);
            
            return { x, y, z };
        },

        /**
         * Convert GSplat camera position to unified spherical
         * 
         * @param {number} x - GSplat camera X
         * @param {number} y - GSplat camera Y
         * @param {number} z - GSplat camera Z
         * @param {object} target - Target center {x, y, z}
         * @returns {object} Unified spherical {azimuth, elevation, zoom}
         */
        fromGSplatPosition(x, y, z, target = {x: 0, y: 0, z: 0}) {
            const dx = x - target.x;
            const dy = y - target.y;
            const dz = z - target.z;
            
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (distance < 0.0001) {
                return { azimuth: 0, elevation: 0, zoom: 5 };
            }
            
            // GSplat OrbitControls坐标系：
            // - yaw=0° → 相机在-Z方向，yaw=180° → 相机在+Z方向
            // - 统一系统（逆时针）：0°=前方(Z+), 90°=左边(X-), 180°=后方(Z-), 270°=右边(X+)
            // - 使用-dx实现逆时针方向
            // - 需要加180°偏移来对齐GSplat坐标系
            let azimuth = radToDeg(Math.atan2(-dx, dz)) + 180;
            azimuth = normalizeAngle(azimuth);
            
            // Calculate elevation - 取反dy使鼠标向下为正角度（俯视/看到顶部）
            // GSplat坐标系中Y轴向下为正，相机在目标上方时dy为负
            // 取反后：相机在上方→正dy→正elevation（俯视）
            const horizontalDist = Math.sqrt(dx * dx + dz * dz);
            let elevation = radToDeg(Math.atan2(-dy, horizontalDist));
            elevation = clamp(elevation, ELEVATION_MIN, ELEVATION_MAX);
            
            // Convert distance to zoom - 默认值为5
            const zoom = distanceToZoom(distance);
            
            return { azimuth, elevation, zoom };
        }
    };

    // ==================== Three.js Adapter ====================

    /**
     * Adapter for Three.js 3D panel coordinate system
     * 
     * These functions handle the conversion between unified and Three.js coordinates.
     */
    const ThreeJSAdapter = {
        /**
         * Convert unified spherical to Three.js camera position
         * 
         * @param {number} azimuth - Unified azimuth (0-360)
         * @param {number} elevation - Unified elevation (-30 to 90)
         * @param {number} zoom - Unified zoom (0-10)
         * @param {object} target - Target center {x, y, z}
         * @returns {object} Three.js camera position {x, y, z}
         */
        toThreePosition(azimuth, elevation, zoom, target = {x: 0, y: 0.5, z: 0}) {
            const distance = 2.6 - (zoom / 10) * 2.0; // Visual distance for 3D panel
            const azRad = degToRad(azimuth);
            const elRad = degToRad(elevation);
            
            // azimuth=0°→Z+, 90°→X+右, 180°→Z-, 270°→X-左
            const x = target.x + distance * Math.sin(azRad) * Math.cos(elRad);
            const y = target.y + distance * Math.sin(elRad);
            const z = target.z + distance * Math.cos(azRad) * Math.cos(elRad);
            
            return { x, y, z };
        },

        /**
         * Convert Three.js camera position to unified spherical
         * 
         * @param {number} x - Three.js camera X
         * @param {number} y - Three.js camera Y
         * @param {number} z - Three.js camera Z
         * @param {object} target - Target center {x, y, z}
         * @returns {object} Unified spherical {azimuth, elevation, zoom}
         */
        fromThreePosition(x, y, z, target = {x: 0, y: 0.5, z: 0}) {
            const dx = x - target.x;
            const dy = y - target.y;
            const dz = z - target.z;
            
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (distance < 0.0001) {
                return { azimuth: 0, elevation: 0, zoom: 5 };
            }
            
            // Reverse the +sin formula
            let azimuth = radToDeg(Math.atan2(dx, dz));
            azimuth = normalizeAngle(azimuth);
            
            // Calculate elevation
            const horizontalDist = Math.sqrt(dx * dx + dz * dz);
            let elevation = radToDeg(Math.atan2(dy, horizontalDist));
            elevation = clamp(elevation, ELEVATION_MIN, ELEVATION_MAX);
            
            // Convert visual distance to zoom
            const zoom = ((2.6 - distance) / 2.0) * 10;
            
            return { azimuth, elevation, zoom };
        }
    };

    // ==================== Public API ====================

    return {
        // Constants
        DISTANCE_MIN,
        DISTANCE_MAX,
        ZOOM_MIN,
        ZOOM_MAX,
        ELEVATION_MIN,
        ELEVATION_MAX,

        // Utility functions
        degToRad,
        radToDeg,
        clamp,
        normalizeAngle,

        // Core transform functions
        sphericalToCartesian,
        cartesianToSpherical,
        zoomToDistance,
        distanceToZoom,

        // Camera label functions
        getAzimuthLabel,
        getElevationLabel,
        getZoomLabel,
        generateCameraDescription,

        // Adapters
        GSplatAdapter,
        ThreeJSAdapter
    };

})();

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoordinateTransform;
}
if (typeof window !== 'undefined') {
    window.CoordinateTransform = CoordinateTransform;
}
