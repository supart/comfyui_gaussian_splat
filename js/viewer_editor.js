// Xiong Gaussian Viewer Editor with 3D Gizmo
// Smooth gizmo interaction - preview transform visually, apply on release

// Import unified coordinate transform module
// Note: coordinate-transform.js must be loaded before this file
const CT = window.CoordinateTransform;

const SPLAT = window.GSPLAT;

const canvas = document.getElementById('canvas');
const selectionCanvas = document.getElementById('selectionCanvas');
const gizmoCanvas = document.getElementById('gizmoCanvas');
const selCtx = selectionCanvas.getContext('2d');
const gizmoCtx = gizmoCanvas.getContext('2d');
const errorEl = document.getElementById('error');
const statusText = document.getElementById('statusText');
const confirmBtn = document.getElementById('confirmBtn');
const cancelBtn = document.getElementById('cancelBtn');
const resetBtn = document.getElementById('resetCamera');
const scaleSlider = document.getElementById('gaussianScaleSlider');
const scaleInput = document.getElementById('gaussianScaleValue');
const focalLengthSlider = document.getElementById('focalLengthSlider');
const focalLengthValue = document.getElementById('focalLengthValue');
const depthRangeSlider = document.getElementById('depthRangeSlider');
const depthRangeValue = document.getElementById('depthRangeValue');
const rollSlider = document.getElementById('rollSlider');
const rollInput = document.getElementById('rollInput');
const orbitCenterXInput = document.getElementById('orbitCenterX');
const orbitCenterYInput = document.getElementById('orbitCenterY');
const orbitCenterZInput = document.getElementById('orbitCenterZ');
const useCurrentOrbitCenterBtn = document.getElementById('useCurrentOrbitCenter');
const applyOrbitCenterBtn = document.getElementById('applyOrbitCenter');
const clearOrbitCenterBtn = document.getElementById('clearOrbitCenter');
const pickOrbitCenterBtn = document.getElementById('pickOrbitCenter');
const deleteBtn = document.getElementById('deleteBtn');
const invertBtn = document.getElementById('invertBtn');
const clearSelBtn = document.getElementById('clearSelBtn');
const renderFrame = document.getElementById('renderFrame');
// 鐩告満鎺у埗鍏冪礌
const cameraPosDisplay = document.getElementById('cameraPosDisplay');
const cursorPosDisplay = document.getElementById('cursorPosDisplay');
const renderFrameLabel = document.getElementById('renderFrameLabel');
// 姣斾緥閫夋嫨涓嬫媺鑿滃崟鍏冪礌
const aspectBtn = document.getElementById('aspectBtn');
const aspectMenu = document.getElementById('aspectMenu');
const aspectOptions = document.querySelectorAll('.aspect-option');

let scene = null, camera = null, renderer = null, controls = null;
let currentSplat = null, originalScales = null, originalPositions = null, originalColors = null, originalRotations = null, originalOpacities = null;
let gaussianScaleCompensation = 1.0, currentScale = 0.3;
let nodeId = null, viewerParams = {};
let initialCameraData = null;
let currentOrbitTarget = null;  // 璺熻釜 OrbitControls 褰撳墠瀹為檯 orbit 涓績锛屼笌 syncCameraToViewer 淇濇寔涓€鑷?
let outputWidth = 1024, outputHeight = 576;  // 榛樿16:9
let originalOutputWidth = 1024, originalOutputHeight = 576;  // 鍘熷杈撳叆灏哄
let backgroundColor = 'black';
let initialFocalLength = 22;  // 鍒濆鐒﹁窛鍊硷紙mm锛?
let initialDepthRange = 10000;  // 鍒濆娣卞害鑼冨洿
const CAMERA_FAR_ALL = 1e9;
let currentAspectRatio = 'original';  // 褰撳墠姣斾緥
const TARGET_ORIGIN =
    window.location.origin && window.location.origin !== "null"
        ? window.location.origin
        : "*";

initialFocalLength = 16;

// Editor state
let currentTool = 'orbit';
let selectedIndices = new Set();
let isSelecting = false;
let selectionStart = { x: 0, y: 0 };
let lassoPoints = [];

// Gizmo state
let gizmoCenter = { x: 0, y: 0, z: 0 }; // World position (center of selected points)
let gizmoScreenPos = { x: 0, y: 0 };
let activeAxis = null;
let hoverAxis = null;
let isDraggingGizmo = false;
let dragStartPos = { x: 0, y: 0 };
let dragCurrentPos = { x: 0, y: 0 };

// Preview transform (visual only during drag)
let previewTranslation = { x: 0, y: 0, z: 0 };
let previewRotationAngle = 0;

// Transform base data
let transformBasePositions = null;
let transformBaseRotations = null;

// Custom orbit state
let customOrbitEnabled = false;
let customOrbitDragging = false;
let customOrbitLastX = 0, customOrbitLastY = 0;
let customOrbitButton = 0;
let orbitTarget = { x: 0, y: 0, z: 0 };
let orbitDistance = 5;
let orbitYaw = 0, orbitPitch = 0;
let cameraOffset = { x: 0, y: 0, z: 0 };
let pickedOrbitDragActive = false;
let pickedOrbitDragMoved = false;
let pickedOrbitPivot = null;
let pickedOrbitLastX = 0;
let pickedOrbitLastY = 0;
let pickedOrbitViewDistance = 5;
let pickedOrbitControlsWasEnabled = false;
let controlsRightPanDragging = false;
let controlsRightPanSyncFrames = 0;
let controlsRightPanStartCameraPos = null;
let controlsRightPanStartCenter = null;
let controlsRightPanNeedsFinalize = false;
let centerPickMode = false;
let orbitCenterFeedback = null;
const DEFAULT_INIT_CAMERA_DISTANCE = 6.0;
const MIN_INIT_CAMERA_DISTANCE = 0.75;
const INITIAL_CAMERA_DISTANCE_MARGIN = 1.08;
const DEFAULT_GAUSSIAN_SCALE = 0.3;
const DEFAULT_CAMERA_DISTANCE = 5;
const MIN_CONTINUOUS_ZOOM_DISTANCE = 1e-6;
const ORBIT_CENTER_FEEDBACK_DURATION_MS = 1000;
const CAMERA_UI_UPDATE_INTERVAL_MS = 80;
const CAMERA_PANEL_SYNC_INTERVAL_MS = 120;

// Gizmo visual settings
const GIZMO_SIZE = 100;
const AXIS_COLORS = { x: '#ff4444', y: '#44ff44', z: '#4444ff', view: 'rgba(255,255,255,0.6)' };
const AXIS_COLORS_BRIGHT = { x: '#ff8888', y: '#88ff88', z: '#8888ff', view: '#ffffff' };

function isTrustedParentMessage(event) {
    if (!event || event.source !== window.parent) return false;
    if (TARGET_ORIGIN === "*") {
        return event.origin === "null" || event.origin === "";
    }
    return event.origin === TARGET_ORIGIN;
}

function formatSignatureNumber(value, digits = 3) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : '0';
}

function getCenterSignature(center) {
    if (!center) return 'null';
    return [
        formatSignatureNumber(center.x),
        formatSignatureNumber(center.y),
        formatSignatureNumber(center.z),
    ].join(',');
}

function getCameraDisplaySignature(params) {
    if (!params) return 'null';
    const orbitCenter = getOrbitCenter() || getActiveOrbitCenter();
    return [
        Math.round(Number(params.azimuth) || 0),
        Math.round(Number(params.elevation) || 0),
        formatSignatureNumber(params.distance, 2),
        Math.round(Number(params.roll) || 0),
        getCenterSignature(orbitCenter),
    ].join('|');
}

// ============== Camera Parameter Labels ==============
// 鏂逛綅瑙掓槧灏?(Azimuth) - 椤烘椂閽堟柟鍚?
// 0° = front (姝ｉ潰), 90° = right (鍙充晶), 180° = back (鑳岄潰), 270° = left (宸︿晶)
const AZIMUTH_LABELS = [
    { min: 0, max: 22.5, label: 'front view' },           // 姝ｉ潰
    { min: 337.5, max: 360, label: 'front view' },        // 姝ｉ潰
    { min: 22.5, max: 67.5, label: 'front right side view' },   // 鍙冲墠渚?
    { min: 67.5, max: 112.5, label: 'right side view' },        // 鍙充晶
    { min: 112.5, max: 157.5, label: 'back right side view' },  // 鍙冲悗渚?
    { min: 157.5, max: 202.5, label: 'back view' },             // 鑳岄潰
    { min: 202.5, max: 247.5, label: 'back left side view' },   // 宸﹀悗渚?
    { min: 247.5, max: 292.5, label: 'left side view' },        // 宸︿晶
    { min: 292.5, max: 337.5, label: 'front left side view' }   // 宸﹀墠渚?
];

// 浠拌鏄犲皠 (Elevation)
// 姝ｈ搴?=淇锛堜粠涓婂線涓嬬湅锛夛紝璐熻搴?=浠拌锛堜粠涓嬪線涓婄湅锛?
const ELEVATION_LABELS = [
    { min: -30, max: -15, label: 'low angle' },        // 浠拌锛堜粠涓嬪線涓婄湅锛?
    { min: -15, max: 15, label: 'eye level' },         // 骞宠锛堢溂鐫涢珮搴︼級
    { min: 15, max: 45, label: 'high angle' },         // 淇锛堢暐寰悜涓嬶級
    { min: 45, max: 75, label: 'very high angle' },    // 楂樿搴︿刊瑙?
    { min: 75, max: 91, label: "bird's-eye view" }     // 楦熺灠锛堜粠涓婂線涓嬬湅锛?
];

// 缂╂斁/璺濈鏄犲皠 (Zoom)
const ZOOM_LABELS = [
    { min: 0, max: 2, label: 'wide shot' },
    { min: 2, max: 4, label: 'medium-wide shot' },
    { min: 4, max: 6, label: 'medium shot' },
    { min: 6, max: 8, label: 'medium-close shot' },
    { min: 8, max: 10, label: 'close-up shot' }
];

// Camera parameter state
let cameraParams = {
    azimuth: 0,
    elevation: 0,
    distance: 5,
    roll: 0,
    targetCenter: { x: 0, y: 0, z: 0 },
    orbitCenter: null,
    customOrbitCenter: null,
    hasCache: false,
};
let lastCameraPositionForParams = null;
let lastCameraUiSignature = '';
let lastCameraUiUpdateAt = 0;
let lastCameraPanelSignature = '';
let lastCameraPanelSyncAt = 0;

function forceRefreshCameraUi(params = null) {
    const resolvedParams = params || calculateCameraParams();
    if (!resolvedParams) return;
    updateCameraPosDisplay(resolvedParams);
    updateCameraParamsDisplay(resolvedParams);
    lastCameraUiSignature = getCameraDisplaySignature(resolvedParams);
    lastCameraUiUpdateAt = performance.now();
}

function maybeRefreshCameraUi(params = null, now = performance.now()) {
    const resolvedParams = params || calculateCameraParams();
    if (!resolvedParams) return;
    const signature = getCameraDisplaySignature(resolvedParams);
    if (signature === lastCameraUiSignature) return;
    if ((now - lastCameraUiUpdateAt) < CAMERA_UI_UPDATE_INTERVAL_MS) return;
    updateCameraPosDisplay(resolvedParams);
    updateCameraParamsDisplay(resolvedParams);
    lastCameraUiSignature = signature;
    lastCameraUiUpdateAt = now;
}

function forceSyncViewerCameraPanel(params = null) {
    const resolvedParams = params || calculateCameraParams();
    if (!resolvedParams) return;
    syncViewerToCameraPanel(resolvedParams);
    lastCameraPanelSignature = getCameraDisplaySignature(resolvedParams);
    lastCameraPanelSyncAt = performance.now();
}

function maybeSyncViewerCameraPanel(params = null, now = performance.now()) {
    const resolvedParams = params || calculateCameraParams();
    if (!resolvedParams) return;
    const signature = getCameraDisplaySignature(resolvedParams);
    if (signature === lastCameraPanelSignature) return;
    if ((now - lastCameraPanelSyncAt) < CAMERA_PANEL_SYNC_INTERVAL_MS) return;
    syncViewerToCameraPanel(resolvedParams);
    lastCameraPanelSignature = signature;
    lastCameraPanelSyncAt = now;
}

// Camera history list (current session)
let cameraHistory = [];
let pendingStartupHistoryEntry = null;
const HISTORY_MAX_ITEMS = 10;
const AUTO_ORBIT_CENTER_SAMPLE_LIMIT = 30000;
const AUTO_ROTATE_ORBIT_CENTER_SAMPLE_LIMIT = 12000;
const AUTO_ROTATE_ORBIT_CENTER_MAX_DISTANCE_PX = 24;
const ORBIT_CONTROLS_PAN_SPEED = 14.4;
const CUSTOM_ORBIT_PAN_DISTANCE_FACTOR = 0.016;

// 铏氭嫙濮挎€佺悆 - 绱Н榧犳爣鏃嬭浆瑙掑害
let virtualOrbitBall = {
    yaw: 0,           // 姘村钩鏃嬭浆瑙掑害锛堝姬搴︼級锛屽乏璐熷彸姝?
    pitch: 0,         // 鍨傜洿鏃嬭浆瑙掑害锛堝姬搴︼級锛屼笂姝ｄ笅璐?
    lastMouseX: 0,
    lastMouseY: 0,
    isDragging: false,
    initialYaw: 0,    // 鍒濆鍋忕Щ锛堢敤浜庨噸缃級
    initialPitch: 0
};


// ============== Initialization ==============

function getBackgroundRGB() {
    switch (backgroundColor) {
        case 'white': return { r: 255, g: 255, b: 255 };
        case 'gray': return { r: 128, g: 128, b: 128 };
        default: return { r: 0, g: 0, b: 0 };
    }
}

function updateBackgroundColor() {
    const bg = getBackgroundRGB();
    canvas.style.backgroundColor = `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
    document.body.style.backgroundColor = `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
}

function updateRenderFrame() {
    if (!renderFrame) return;
    const canvasW = canvas.clientWidth, canvasH = canvas.clientHeight;
    if (outputWidth <= 0 || outputHeight <= 0 || canvasW <= 0 || canvasH <= 0) {
        renderFrame.style.display = 'none';
        return;
    }
    const outputAspect = outputWidth / outputHeight;
    const canvasAspect = canvasW / canvasH;
    
    // 鍙栨櫙妗嗙缉灏忓埌80%锛屼袱杈规樉绀烘洿瀹界殑鑼冨洿
    const scaleFactor = 0.8;
    let frameW, frameH, frameX, frameY;
    
    if (outputAspect > canvasAspect) {
        frameW = canvasW * scaleFactor;
        frameH = frameW / outputAspect;
        frameX = (canvasW - frameW) / 2;
        frameY = (canvasH - frameH) / 2;
    } else {
        frameH = canvasH * scaleFactor;
        frameW = frameH * outputAspect;
        frameX = (canvasW - frameW) / 2;
        frameY = (canvasH - frameH) / 2;
    }
    
    renderFrame.style.display = 'block';
    renderFrame.style.left = frameX + 'px';
    renderFrame.style.top = frameY + 'px';
    renderFrame.style.width = frameW + 'px';
    renderFrame.style.height = frameH + 'px';
    if (renderFrameLabel) renderFrameLabel.textContent = `输出: ${outputWidth}×${outputHeight}`;
}

function setCameraClipRange(nearVal, farVal) {
    if (!camera) return;
    const near = Number(nearVal);
    const far = Number(farVal);
    if (Number.isFinite(near)) {
        camera.near = near;
        if (camera.data) camera.data.near = near;
    }
    if (Number.isFinite(far)) {
        camera.far = far;
        if (camera.data) camera.data.far = far;
    }
    if (typeof camera.update === 'function') {
        camera.update();
    }
    drawOrbitCenterFeedback();
}

function cloneCenter(center) {
    if (!center) return null;
    const x = Number(center.x);
    const y = Number(center.y);
    const z = Number(center.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x, y, z };
}

function getFiniteCameraNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function getCachedCameraOrbitCenter(cameraState) {
    return cloneCenter(cameraState?.orbitCenter) || cloneCenter(cameraState?.target);
}

function rememberCurrentCameraPositionForParams() {
    if (!camera) {
        lastCameraPositionForParams = null;
        return;
    }

    lastCameraPositionForParams = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
    };
}

function getCenterDistance(a, b) {
    const ca = cloneCenter(a);
    const cb = cloneCenter(b);
    if (!ca || !cb) return NaN;
    const dx = ca.x - cb.x;
    const dy = ca.y - cb.y;
    const dz = ca.z - cb.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getCameraViewForwardVector() {
    if (!camera?.rotation) return null;
    const forward = camera.rotation.apply(new SPLAT.Vector3(0, 0, 1));
    const length = Math.sqrt(
        forward.x * forward.x +
        forward.y * forward.y +
        forward.z * forward.z
    );
    if (!Number.isFinite(length) || length < 1e-8) return null;
    return new SPLAT.Vector3(forward.x / length, forward.y / length, forward.z / length);
}

function getCurrentViewTarget(referenceDistance = null) {
    if (!camera) return null;
    const forward = getCameraViewForwardVector();
    if (!forward) return null;
    const fallbackDistance = getCenterDistance(
        { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        cloneCenter(cameraParams.targetCenter)
            || cloneCenter(currentOrbitTarget)
            || cloneCenter(cameraParams.orbitCenter)
            || getDefaultOrbitCenter()
    );
    const targetDistance = Number.isFinite(Number(referenceDistance)) && Number(referenceDistance) > 1e-4
        ? Number(referenceDistance)
        : (Number.isFinite(fallbackDistance) && fallbackDistance > 1e-4
            ? fallbackDistance
            : Math.max(0.001, Number(cameraParams.distance) || DEFAULT_CAMERA_DISTANCE));
    const next = {
        x: camera.position.x + forward.x * targetDistance,
        y: camera.position.y + forward.y * targetDistance,
        z: camera.position.z + forward.z * targetDistance,
    };
    return next;
}

function syncControlsStateToCurrentView(referenceDistance = null) {
    if (!controls) return null;
    const next = getCurrentViewTarget(referenceDistance);
    if (!next) return null;
    cameraParams.targetCenter = cloneCenter(next);
    controls.setCameraTarget(new SPLAT.Vector3(next.x, next.y, next.z));
    const savedDampening = controls.dampening;
    controls.dampening = 1;
    controls.update();
    controls.dampening = savedDampening;
    return next;
}

function syncOrbitTargetToCurrentView(referenceDistance = null, updateInputs = false) {
    const next = syncControlsStateToCurrentView(referenceDistance);
    if (!next) return null;
    currentOrbitTarget = cloneCenter(next);
    cameraParams.orbitCenter = cloneCenter(next);
    cameraParams.customOrbitCenter = null;
    if (updateInputs) {
        updateOrbitCenterInputs(next);
    }
    return next;
}

function resetCachedCameraParams() {
    cameraParams.azimuth = 0;
    cameraParams.elevation = 0;
    cameraParams.distance = DEFAULT_CAMERA_DISTANCE;
    cameraParams.roll = 0;
    cameraParams.targetCenter = { x: 0, y: 0, z: 0 };
    cameraParams.orbitCenter = null;
    cameraParams.customOrbitCenter = null;
    cameraParams.hasCache = false;
}

function applyCachedCameraState(cameraState) {
    if (!cameraState || typeof cameraState !== 'object') {
        resetCachedCameraParams();
        return false;
    }

    applyAspectState(cameraState.aspectRatio, cameraState.outputWidth, cameraState.outputHeight);

    const orbitCenter = getCachedCameraOrbitCenter(cameraState);
    cameraParams.azimuth = getFiniteCameraNumber(cameraState.azimuth, 0);
    cameraParams.elevation = getFiniteCameraNumber(cameraState.elevation, 0);
    cameraParams.distance = getFiniteCameraNumber(cameraState.distance, DEFAULT_CAMERA_DISTANCE);
    cameraParams.roll = getFiniteCameraNumber(cameraState.roll, 0);
    cameraParams.targetCenter = cloneCenter(orbitCenter) || { x: 0, y: 0, z: 0 };
    cameraParams.orbitCenter = cloneCenter(orbitCenter);
    cameraParams.customOrbitCenter = cloneCenter(orbitCenter);
    cameraParams.hasCache = true;
    return true;
}

function getConfiguredOrbitCenter() {
    return cloneCenter(cameraParams.customOrbitCenter) || cloneCenter(cameraParams.orbitCenter);
}

function getDefaultOrbitCenter() {
    if (currentOrbitTarget) return cloneCenter(currentOrbitTarget);
    if (initialCameraData?.target) {
        return {
            x: Number(initialCameraData.target.x) || 0,
            y: Number(initialCameraData.target.y) || 0,
            z: Number(initialCameraData.target.z) || 0,
        };
    }
    return { x: 0, y: 0, z: 0 };
}

function getPickedOrbitCenter() {
    return pickedOrbitDragActive ? cloneCenter(pickedOrbitPivot) : null;
}

function getActiveOrbitCenter() {
    return getPickedOrbitCenter() || getConfiguredOrbitCenter() || getDefaultOrbitCenter();
}

function updateOrbitCenterInputs(center = null) {
    const c = cloneCenter(center) || getActiveOrbitCenter();
    if (!c) return;
    const setIfIdle = (el, value) => {
        if (!el) return;
        if (document.activeElement === el) return;
        el.value = Number(value).toFixed(3);
    };
    setIfIdle(orbitCenterXInput, c.x);
    setIfIdle(orbitCenterYInput, c.y);
    setIfIdle(orbitCenterZInput, c.z);
}

function showOrbitCenterFeedback(center) {
    const markerCenter = cloneCenter(center);
    if (!markerCenter) return;
    orbitCenterFeedback = {
        center: markerCenter,
        expiresAt: performance.now() + ORBIT_CENTER_FEEDBACK_DURATION_MS,
    };
}

function hasActiveOrbitCenterFeedback(now = performance.now()) {
    if (!orbitCenterFeedback) return false;
    if (now >= orbitCenterFeedback.expiresAt) {
        orbitCenterFeedback = null;
        return false;
    }
    return true;
}

function readOrbitCenterInputs() {
    if (!orbitCenterXInput || !orbitCenterYInput || !orbitCenterZInput) return null;
    const x = Number(orbitCenterXInput.value);
    const y = Number(orbitCenterYInput.value);
    const z = Number(orbitCenterZInput.value);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x, y, z };
}

function applyOrbitCenter(nextCenter, options = {}) {
    if (!camera || !controls) return;
    const next = cloneCenter(nextCenter);
    if (!next) return;
    const { persistAsCustom = true, keepAngles = true, showFeedback = false } = options;
    const previousTarget = cloneCenter(cameraParams.targetCenter)
        || cloneCenter(currentOrbitTarget)
        || cloneCenter(cameraParams.orbitCenter)
        || getDefaultOrbitCenter();
    const paramsBefore = calculateCameraParams();

    if (persistAsCustom) {
        cameraParams.customOrbitCenter = cloneCenter(next);
    }
    cameraParams.orbitCenter = cloneCenter(next);
    cameraParams.targetCenter = cloneCenter(next);
    currentOrbitTarget = cloneCenter(next);

    controls.setCameraTarget(new SPLAT.Vector3(next.x, next.y, next.z));

    if (keepAngles && paramsBefore) {
        // Recenter by translating camera with the same delta as target movement.
        // This keeps composition stable and makes picked point move to screen center.
        if (previousTarget) {
            camera.position.x += (next.x - previousTarget.x);
            camera.position.y += (next.y - previousTarget.y);
            camera.position.z += (next.z - previousTarget.z);
        } else {
            const pos = CT.GSplatAdapter.toGSplatPosition(
                paramsBefore.azimuth,
                paramsBefore.elevation,
                paramsBefore.distance,
                next
            );
            camera.position.x = pos.x;
            camera.position.y = pos.y;
            camera.position.z = pos.z;
        }
        lastCameraPositionForParams = null;
    }

    const savedDampening = controls.dampening;
    controls.dampening = 1;
    controls.update();
    controls.dampening = savedDampening;
    updateOrbitCenterInputs(next);
    if (showFeedback) {
        showOrbitCenterFeedback(next);
    }
}

function updateMainCanvasCursor() {
    if (!canvas) return;
    if (centerPickMode) {
        canvas.style.cursor = 'crosshair';
        return;
    }
    const cursors = { orbit: 'grab', pan: 'move', rect: 'crosshair', lasso: 'crosshair', translate: 'default', rotate: 'default' };
    canvas.style.cursor = cursors[currentTool] || 'default';
}

function setCenterPickMode(enabled) {
    centerPickMode = !!enabled;
    if (pickOrbitCenterBtn) {
        pickOrbitCenterBtn.style.background = centerPickMode ? '#4CAF50' : '';
        pickOrbitCenterBtn.title = centerPickMode
            ? 'Pick mode: click a gaussian point to set center (ESC or right click to cancel)'
            : 'Pick center: click this, then click a gaussian point';
    }
    updateMainCanvasCursor();
}

function beginControlsRightPanTracking() {
    // Flush residual orbit inertia before right-pan starts.
    // Without this, camera may still be rotating from prior left-drag,
    // and center tracking can be polluted by non-pan movement.
    if (controls) {
        const savedDampening = controls.dampening;
        controls.dampening = 1;
        controls.update();
        controls.dampening = savedDampening;
    }
    controlsRightPanStartCameraPos = camera
        ? { x: camera.position.x, y: camera.position.y, z: camera.position.z }
        : null;
    controlsRightPanStartCenter = cloneCenter(cameraParams.targetCenter)
        || cloneCenter(currentOrbitTarget)
        || cloneCenter(cameraParams.orbitCenter)
        || getDefaultOrbitCenter();
    controlsRightPanNeedsFinalize = true;
    controlsRightPanDragging = true;
    controlsRightPanSyncFrames = 0;
}

function beginPickedOrbitDrag(pivot, clientX, clientY) {
    if (!camera || !controls) return false;
    const nextPivot = cloneCenter(pivot);
    if (!nextPivot) return false;

    const savedDampening = controls.dampening;
    controls.dampening = 1;
    controls.update();
    controls.dampening = savedDampening;

    const cameraPos = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
    };
    const baseViewDistance = getCenterDistance(
        cameraPos,
        cloneCenter(cameraParams.targetCenter)
            || cloneCenter(currentOrbitTarget)
            || cloneCenter(cameraParams.orbitCenter)
            || getDefaultOrbitCenter()
    );
    const pivotDistance = getCenterDistance(cameraPos, nextPivot);

    pickedOrbitDragActive = true;
    pickedOrbitDragMoved = false;
    pickedOrbitPivot = nextPivot;
    pickedOrbitLastX = clientX;
    pickedOrbitLastY = clientY;
    pickedOrbitViewDistance = Number.isFinite(baseViewDistance) && baseViewDistance > 1e-4
        ? baseViewDistance
        : (Number.isFinite(pivotDistance) && pivotDistance > 1e-4
            ? pivotDistance
            : DEFAULT_CAMERA_DISTANCE);
    currentOrbitTarget = cloneCenter(nextPivot);
    cameraParams.orbitCenter = cloneCenter(nextPivot);
    cameraParams.customOrbitCenter = cloneCenter(nextPivot);
    updateOrbitCenterInputs(nextPivot);
    pickedOrbitControlsWasEnabled = !!controls.enabled;
    controls.enabled = false;
    showOrbitCenterFeedback(nextPivot);
    if (canvas) {
        canvas.style.cursor = 'grabbing';
    }
    return true;
}

function applyWorldRotationAroundPivot(rotationQuat, pivot) {
    if (!camera || !rotationQuat) return;
    const center = cloneCenter(pivot);
    if (!center) return;
    const offset = new SPLAT.Vector3(
        camera.position.x - center.x,
        camera.position.y - center.y,
        camera.position.z - center.z
    );
    const rotatedOffset = rotationQuat.apply(offset);
    camera.position.x = center.x + rotatedOffset.x;
    camera.position.y = center.y + rotatedOffset.y;
    camera.position.z = center.z + rotatedOffset.z;
    camera.rotation = rotationQuat.multiply(camera.rotation).normalize();
}

function rotateCameraAroundPickedPivot(pivot, dx, dy) {
    if (!camera || !pivot) return false;
    const speed = (controls?.orbitSpeed || 1) * 0.003;
    const yawDelta = -dx * speed;
    const pitchDelta = dy * speed;
    if (Math.abs(yawDelta) < 1e-8 && Math.abs(pitchDelta) < 1e-8) {
        return false;
    }

    if (Math.abs(yawDelta) >= 1e-8) {
        const upAxis = camera.rotation.apply(new SPLAT.Vector3(0, 1, 0)).normalize();
        const yawQuat = SPLAT.Quaternion.FromAxisAngle(upAxis, yawDelta).normalize();
        applyWorldRotationAroundPivot(yawQuat, pivot);
    }

    if (Math.abs(pitchDelta) >= 1e-8) {
        const rightAxis = camera.rotation.apply(new SPLAT.Vector3(1, 0, 0)).normalize();
        const pitchQuat = SPLAT.Quaternion.FromAxisAngle(rightAxis, pitchDelta).normalize();
        applyWorldRotationAroundPivot(pitchQuat, pivot);
    }

    camera.update();
    lastCameraPositionForParams = null;
    currentOrbitTarget = cloneCenter(pivot);
    cameraParams.orbitCenter = cloneCenter(pivot);
    cameraParams.customOrbitCenter = cloneCenter(pivot);
    syncControlsStateToCurrentView(pickedOrbitViewDistance);
    return true;
}

function updatePickedOrbitDrag(clientX, clientY) {
    if (!pickedOrbitDragActive || !pickedOrbitPivot) return false;
    const dx = clientX - pickedOrbitLastX;
    const dy = clientY - pickedOrbitLastY;
    pickedOrbitLastX = clientX;
    pickedOrbitLastY = clientY;

    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
        return false;
    }

    const rotated = rotateCameraAroundPickedPivot(pickedOrbitPivot, dx, dy);
    if (!rotated) return false;

    pickedOrbitDragMoved = true;
    return true;
}

function endPickedOrbitDrag() {
    if (!pickedOrbitDragActive) return;
    const committedPivot = cloneCenter(pickedOrbitPivot);
    pickedOrbitDragActive = false;
    pickedOrbitDragMoved = false;
    pickedOrbitPivot = null;

    if (controls) {
        if (committedPivot) {
            currentOrbitTarget = cloneCenter(committedPivot);
            cameraParams.orbitCenter = cloneCenter(committedPivot);
            cameraParams.customOrbitCenter = cloneCenter(committedPivot);
            updateOrbitCenterInputs(committedPivot);
            syncControlsStateToCurrentView(pickedOrbitViewDistance);
        }
        controls.enabled = pickedOrbitControlsWasEnabled;
    }

    pickedOrbitLastX = 0;
    pickedOrbitLastY = 0;
    pickedOrbitViewDistance = DEFAULT_CAMERA_DISTANCE;
    pickedOrbitControlsWasEnabled = false;
    updateMainCanvasCursor();
    if (committedPivot) {
        const params = calculateCameraParams();
        forceRefreshCameraUi(params);
        forceSyncViewerCameraPanel(params);
    }
}

function endControlsRightPanTracking() {
    controlsRightPanDragging = false;
    controlsRightPanSyncFrames = 6;
}

function updateOrbitCenterFromPanDelta(prevCameraPos) {
    if (!prevCameraPos || !camera) return;
    const dx = camera.position.x - prevCameraPos.x;
    const dy = camera.position.y - prevCameraPos.y;
    const dz = camera.position.z - prevCameraPos.z;
    if (Math.abs(dx) < 1e-8 && Math.abs(dy) < 1e-8 && Math.abs(dz) < 1e-8) return;

    const base = cloneCenter(currentOrbitTarget)
        || cloneCenter(cameraParams.orbitCenter)
        || getDefaultOrbitCenter();
    const next = {
        x: base.x + dx,
        y: base.y + dy,
        z: base.z + dz,
    };

    currentOrbitTarget = cloneCenter(next);
    cameraParams.targetCenter = cloneCenter(next);
    cameraParams.orbitCenter = cloneCenter(next);
    cameraParams.customOrbitCenter = cloneCenter(next);
    updateOrbitCenterInputs(next);
}

function finalizeControlsRightPanCenter() {
    if (!controlsRightPanNeedsFinalize || !camera) return;
    const startPos = controlsRightPanStartCameraPos;
    const startCenter = controlsRightPanStartCenter;
    controlsRightPanNeedsFinalize = false;
    controlsRightPanStartCameraPos = null;
    controlsRightPanStartCenter = null;
    if (!startPos || !startCenter) return;

    const dx = camera.position.x - startPos.x;
    const dy = camera.position.y - startPos.y;
    const dz = camera.position.z - startPos.z;
    if (Math.abs(dx) < 1e-7 && Math.abs(dy) < 1e-7 && Math.abs(dz) < 1e-7) return;

    // Recenter to nearest gaussian around screen center after each right-pan operation.
    if (recenterOrbitCenterToScreenCenterNearest({ keepAngles: false, persistAsCustom: false })) {
        return;
    }

    const next = {
        x: startCenter.x + dx,
        y: startCenter.y + dy,
        z: startCenter.z + dz,
    };
    currentOrbitTarget = cloneCenter(next);
    cameraParams.targetCenter = cloneCenter(next);
    cameraParams.orbitCenter = cloneCenter(next);
    cameraParams.customOrbitCenter = null;
    updateOrbitCenterInputs(next);
}

function getRollTargetForRender() {
    if (!camera) return getActiveOrbitCenter();
    const panning = controlsRightPanDragging || controlsRightPanSyncFrames > 0 || controlsRightPanNeedsFinalize;
    if (
        panning &&
        controlsRightPanStartCameraPos &&
        controlsRightPanStartCenter
    ) {
        return {
            x: controlsRightPanStartCenter.x + (camera.position.x - controlsRightPanStartCameraPos.x),
            y: controlsRightPanStartCenter.y + (camera.position.y - controlsRightPanStartCameraPos.y),
            z: controlsRightPanStartCenter.z + (camera.position.z - controlsRightPanStartCameraPos.z),
        };
    }
    // Prefer the current view target so picking a new orbit center does not immediately
    // reframe the image before the user actually drags to rotate.
    return cloneCenter(cameraParams.targetCenter) || getActiveOrbitCenter();
}

function findNearestVisiblePointAtScreen(screenX, screenY, maxDistPx = 18, maxSamples = null) {
    if (!currentSplat?.data?.positions || !camera) return null;
    const projectionContext = createProjectionContext();
    if (!projectionContext) return null;
    const positions = currentSplat.data.positions;
    const count = currentSplat.data.vertexCount || (positions.length / 3);
    const sampleTarget = Number.isFinite(Number(maxSamples)) ? Math.max(1, Math.floor(Number(maxSamples))) : null;
    const stride = sampleTarget ? Math.max(1, Math.ceil(count / sampleTarget)) : 1;
    let best = null;
    let bestDist2 = maxDistPx * maxDistPx;

    for (let i = 0; i < count; i += stride) {
        const px = positions[i * 3];
        const py = positions[i * 3 + 1];
        const pz = positions[i * 3 + 2];
        const projected = projectPointWithContext(px, py, pz, projectionContext);
        if (!projected) continue;
        const dx = projected.x - screenX;
        const dy = projected.y - screenY;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > bestDist2) continue;
        bestDist2 = dist2;
        best = { x: px, y: py, z: pz, index: i };
    }

    return best;
}

function findNearestVisiblePointToScreenCenter(maxSamples = AUTO_ORBIT_CENTER_SAMPLE_LIMIT) {
    if (!canvas) return null;
    const centerX = (canvas.clientWidth || canvas.width || 0) * 0.5;
    const centerY = (canvas.clientHeight || canvas.height || 0) * 0.5;
    return findNearestVisiblePointAtScreen(centerX, centerY, Number.POSITIVE_INFINITY, maxSamples);
}

function recenterOrbitCenterToScreenCenterNearest(options = {}) {
    const {
        keepAngles = false,
        persistAsCustom = false,
        maxSamples = AUTO_ORBIT_CENTER_SAMPLE_LIMIT,
        showFeedback = false,
    } = options;
    const picked = findNearestVisiblePointToScreenCenter(maxSamples);
    if (!picked) return false;
    if (!persistAsCustom) cameraParams.customOrbitCenter = null;
    applyOrbitCenter(
        { x: picked.x, y: picked.y, z: picked.z },
        { persistAsCustom, keepAngles, showFeedback }
    );
    return true;
}

function setupOrbitCenterInteraction() {
    canvas.addEventListener('mousedown', (e) => {
        if (centerPickMode) {
            if (e.button === 2) {
                e.preventDefault();
                e.stopPropagation();
                setCenterPickMode(false);
                updateStatus();
            }
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const picked = findNearestVisiblePointAtScreen(
                x,
                y,
                Number.POSITIVE_INFINITY,
                AUTO_ORBIT_CENTER_SAMPLE_LIMIT
            );
            if (!picked) {
                updateStatus();
                if (statusText) statusText.textContent += ' | no point near cursor';
                return;
            }
            applyOrbitCenter(
                { x: picked.x, y: picked.y, z: picked.z },
                { persistAsCustom: true, keepAngles: true, showFeedback: true }
            );
            setCenterPickMode(false);
            updateStatus();
            return;
        }

        if (
            e.button === 0 &&
            !customOrbitEnabled &&
            controls?.enabled &&
            !isDraggingGizmo &&
            !isSelecting &&
            currentTool === 'orbit'
        ) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const picked = findNearestVisiblePointAtScreen(
                x,
                y,
                AUTO_ROTATE_ORBIT_CENTER_MAX_DISTANCE_PX,
                AUTO_ROTATE_ORBIT_CENTER_SAMPLE_LIMIT
            );
            if (picked) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
                beginPickedOrbitDrag(
                    { x: picked.x, y: picked.y, z: picked.z },
                    e.clientX,
                    e.clientY
                );
                return;
            }
        }

        if (
            e.button === 2 &&
            !customOrbitEnabled &&
            controls?.enabled &&
            !isDraggingGizmo &&
            !isSelecting &&
            (currentTool === 'orbit' || currentTool === 'pan')
        ) {
            beginControlsRightPanTracking();
        }
    }, true);

    window.addEventListener('mousemove', (e) => {
        if (!pickedOrbitDragActive || isDraggingGizmo || !camera) return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        updatePickedOrbitDrag(e.clientX, e.clientY);
    }, true);

    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) endPickedOrbitDrag();
        if (e.button === 2) endControlsRightPanTracking();
    }, true);

    window.addEventListener('blur', () => {
        endPickedOrbitDrag();
        endControlsRightPanTracking();
    });
}

const style = document.createElement('style');
style.textContent = `
    #statusBar { display: flex; justify-content: center; background: #252525; padding: 4px 8px; border-top: 1px solid #333; color: #888; font-size: 10px; }
    #controlsBar { display: flex; flex-direction: column; align-items: center; gap: 4px; background: #2a2a2a; padding: 6px 8px; border-top: 1px solid #333; min-width: 420px; }
    .controls-row { display: flex; justify-content: center; align-items: center; gap: 8px; flex-wrap: wrap; }
    #controlsBar button { border: none; color: #fff; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; }
    .btn-reset { background: #555; } .btn-cancel { background: #d32f2f; } .btn-confirm { background: #4CAF50; font-weight: bold; }
    .scale-control { display: flex; align-items: center; gap: 4px; }
    .scale-control span { color: #888; font-size: 10px; }
    .scale-control input[type="range"] { width: 60px; background: #333; cursor: pointer; }
    .scale-control input[type="number"] { width: 45px; background: #333; border: 1px solid #555; color: #fff; font-size: 10px; padding: 4px; border-radius: 3px; }
    .focal-control { display: flex; align-items: center; gap: 4px; }
    .focal-control span { color: #888; font-size: 10px; }
    .focal-control input[type="range"] { width: 80px; background: #333; cursor: pointer; }
    .focal-control input[type="number"] { width: 50px; background: #333; border: 1px solid #555; color: #fff; font-size: 10px; padding: 4px; border-radius: 3px; }
    .depth-control { display: flex; align-items: center; gap: 4px; }
    .depth-control span { color: #888; font-size: 10px; }
    .depth-control input[type="range"] { width: 60px; background: #333; cursor: pointer; }
    #depthRangeValue { color: #888; font-size: 10px; min-width: 40px; text-align: right; }
    .tool-btn, .action-btn { background: #444; border: none; color: #fff; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .tool-btn:hover, .action-btn:hover { background: #555; }
    .tool-btn.active { background: #4CAF50; }
    .info-panel { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); padding: 6px 10px; border-radius: 4px; color: #aaa; font-size: 10px; z-index: 50; }
    .info-panel.hidden { display: none; }
    .camera-control { display: flex; align-items: center; gap: 4px; }
    .camera-control span { color: #888; font-size: 10px; }
    #cameraPosDisplay { color: #6cc; font-size: 10px; min-width: 100px; }
    .cursor-control { display: flex; align-items: center; gap: 4px; }
    .cursor-control span { color: #888; font-size: 10px; }
    #cursorPosDisplay { color: #c6c; font-size: 10px; min-width: 100px; }
    #toggleCameraPanel { background: #555; border: none; color: #fff; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 12px; }
    .camera-panel { position: absolute; top: 50px; right: 10px; background: rgba(40,40,40,0.95); border: 1px solid #555; border-radius: 6px; z-index: 100; min-width: 280px; }
    .camera-panel.hidden { display: none; }
    .camera-panel-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #555; color: #fff; font-size: 12px; }
    .camera-panel-header button { background: none; border: none; color: #888; cursor: pointer; font-size: 14px; }
    .camera-panel-header button:hover { color: #fff; }
    .camera-panel-content { padding: 10px 12px; }
    .camera-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
    .camera-row:last-child { margin-bottom: 0; }
    .camera-row label { color: #aaa; font-size: 10px; min-width: 100px; }
    .camera-row input[type="range"] { width: 80px; background: #333; cursor: pointer; }
    .camera-row input[type="number"] { width: 50px; background: #333; border: 1px solid #555; color: #fff; font-size: 10px; padding: 3px; border-radius: 3px; }
    .camera-row span { color: #888; font-size: 10px; }
    
    /* 鐩告満鍙傛暟闈㈡澘鏍峰紡 */
    .camera-params-panel {
        position: absolute;
        bottom: 10px;
        left: 10px;
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid #555;
        border-radius: 8px;
        z-index: 100;
        min-width: 320px;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    .camera-params-panel.hidden { display: none; }
    .camera-params-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid #555;
        background: rgba(60, 60, 60, 0.5);
        border-radius: 8px 8px 0 0;
    }
    .camera-params-header h3 {
        color: #fff;
        font-size: 12px;
        margin: 0;
        font-weight: 600;
    }
    .camera-params-header .toggle-btn {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        font-size: 16px;
        padding: 2px 6px;
        border-radius: 4px;
    }
    .camera-params-header .toggle-btn:hover {
        color: #fff;
        background: rgba(255,255,255,0.1);
    }
    .camera-params-body {
        padding: 10px 12px;
    }
    .camera-params-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
        padding: 4px 0;
    }
    .camera-params-row:last-child { margin-bottom: 0; }
    .param-label {
        color: #aaa;
        font-size: 11px;
        min-width: 70px;
    }
    .param-value {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .param-number {
        color: #6cc;
        font-size: 12px;
        font-weight: bold;
        min-width: 40px;
        text-align: right;
    }
    .param-tag {
        background: #4CAF50;
        color: #fff;
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 10px;
        white-space: nowrap;
    }
    .param-tag.azimuth { background: #2196F3; }
    .param-tag.elevation { background: #FF9800; }
    .param-tag.zoom { background: #9C27B0; }
    
    .camera-description-section {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #444;
    }
    .camera-description-section label {
        display: block;
        color: #aaa;
        font-size: 10px;
        margin-bottom: 6px;
    }
    .camera-description-input {
        width: 100%;
        background: #222;
        border: 1px solid #555;
        color: #fff;
        font-size: 11px;
        padding: 8px 10px;
        border-radius: 4px;
        resize: none;
        font-family: 'Consolas', 'Monaco', monospace;
        line-height: 1.4;
    }
    .camera-description-input:focus {
        outline: none;
        border-color: #4CAF50;
    }
    .copy-btn {
        margin-top: 8px;
        background: #4CAF50;
        border: none;
        color: #fff;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        width: 100%;
        transition: background 0.2s;
    }
    .copy-btn:hover { background: #45a049; }
    .copy-btn:active { background: #3d8b40; }
    .copy-btn.copied {
        background: #2196F3;
    }
    
    /* 鎶樺彔鐘舵€?*/
    .camera-params-panel.collapsed .camera-params-body {
        display: none;
    }
    .camera-params-panel.collapsed {
        min-width: auto;
    }
`;
document.head.appendChild(style);

function initViewer() {
    try {
        scene = new SPLAT.Scene();
        camera = new SPLAT.Camera();
        renderer = new SPLAT.WebGLRenderer(canvas);
        controls = new SPLAT.OrbitControls(camera, canvas);
        
        // 璁剧疆鏈€灏忕缉鏀捐窛绂伙紝闃叉鐩告満绌胯繃鐩爣鐐瑰鑷存柟浣嶈璺冲彉
        // minZoom鎺у埗鐩告満鍒扮洰鏍囩偣鐨勬渶灏忚窛绂?
        controls.minZoom = MIN_CONTINUOUS_ZOOM_DISTANCE;
        // Remove practical zoom-out cap to avoid being stuck after picking a custom orbit center.
        controls.maxZoom = 1000000;
        controls.zoomSpeed = 1;  // 鎭㈠榛樿缂╂斁閫熷害
        controls.orbitSpeed = 1.8; // 鎻愰珮宸﹂敭鏃嬭浆閫熷害锛堥伩鍏嶈繃蹇け鎺э級
        controls.panSpeed = ORBIT_CONTROLS_PAN_SPEED;
        controls.dampening = 0.12; // 涓?OrbitControls 榛樿涓€鑷达紝淇濇寔绋冲畾
        
        // 璁剧疆鍒濆鐒﹁窛锛?6mm杞崲涓哄儚绱犵劍璺濓級
        controls.panSpeed = ORBIT_CONTROLS_PAN_SPEED;
        applyFocalLengthToCamera(initialFocalLength);
        // 鍚屾鏇存柊婊戝潡鏄剧ず鍊?
        focalLengthSlider.value = initialFocalLength;
        focalLengthValue.value = initialFocalLength;
        
        // 璁剧疆娣卞害鑼冨洿浠ユ樉绀轰换鎰忚窛绂荤殑楂樻柉
        setCameraClipRange(0.01, CAMERA_FAR_ALL);
        
        // 鍏堣缃洰鏍囩偣锛屽啀璁剧疆鐩告満浣嶇疆
        // 浣跨敤getSplatCenter鑾峰彇璺濈鍙栨櫙妗嗕腑蹇冩渶杩戠殑楂樻柉鐐逛綔涓轰腑蹇?
        const initialCenter = getSplatCenter();
        controls.setCameraTarget(new SPLAT.Vector3(initialCenter.x, initialCenter.y, initialCenter.z));
        currentOrbitTarget = cloneCenter(initialCenter);
        cameraParams.orbitCenter = cloneCenter(initialCenter);
        cameraParams.customOrbitCenter = null;
        updateOrbitCenterInputs(initialCenter);
        
        // 璁剧疆鍒濆鐩告満浣嶇疆锛岀‘淇濇柟浣嶈涓?搴?
        const initialDistance = getRecommendedInitialCameraDistance();
        camera.position.x = initialCenter.x;
        camera.position.y = initialCenter.y;
        camera.position.z = initialCenter.z - initialDistance;
        
        // 鍒濆鍖栫浉鏈哄弬鏁扮姸鎬?
        cameraParams.azimuth = 0;
        cameraParams.elevation = 0;
        cameraParams.distance = DEFAULT_CAMERA_DISTANCE; // 榛樿缂╂斁涓?
        cameraParams.targetCenter = initialCenter;

        const resize = () => {
            renderer.setSize(canvas.clientWidth, canvas.clientHeight);
            selectionCanvas.width = canvas.clientWidth;
            selectionCanvas.height = canvas.clientHeight;
            gizmoCanvas.width = canvas.clientWidth;
            gizmoCanvas.height = canvas.clientHeight;
            updateRenderFrame();
            // 閲嶆柊璁＄畻鐒﹁窛浠ュ尮閰嶅綋鍓嶇敾甯冨昂瀵?
            if (camera) {
                applyFocalLengthToCamera(getCurrentFocalLengthValue(initialFocalLength));
            }
        };
        window.addEventListener('resize', resize);
        resize();

        // 鍚屾璁℃暟鍣紙鐢ㄤ簬鑺傛祦锛?
        let isFirstFrame = false;
        
        const frame = () => {
            // 绗竴甯ф椂纭繚鐩告満浣嶇疆姝ｇ‘锛圤rbitControls鍙兘鍦ㄥ垵濮嬪寲鏃惰鐩栦簡浣嶇疆锛?
            if (isFirstFrame) {
                isFirstFrame = false;
                const initDist = getRecommendedInitialCameraDistance();
                camera.position.x = 0;
                camera.position.y = 0;
                camera.position.z = -initDist;
                cameraParams.azimuth = 0;
                cameraParams.elevation = 0;
                cameraParams.distance = DEFAULT_CAMERA_DISTANCE; // 榛樿缂╂斁涓?
            }
            
            if (customOrbitEnabled) updateCameraFromOrbit();
            else if (controls.enabled) {
                const shouldSyncPanCenter = controlsRightPanDragging || controlsRightPanSyncFrames > 0;
                controls.update();
                if (!controlsRightPanDragging && controlsRightPanSyncFrames > 0) {
                    controlsRightPanSyncFrames -= 1;
                }
                if (shouldSyncPanCenter && !controlsRightPanDragging && controlsRightPanSyncFrames === 0) {
                    finalizeControlsRightPanCenter();
                }
            }
            const rawRotationForRender = camera?.rotation
                ? new SPLAT.Quaternion(camera.rotation.x, camera.rotation.y, camera.rotation.z, camera.rotation.w)
                : null;
            applyRollToCamera(customOrbitEnabled ? orbitTarget : getRollTargetForRender());
            renderer.render(scene, camera);
            if (rawRotationForRender) {
                camera.rotation = rawRotationForRender;
                camera.update();
            }
            
            // 鏇存柊鐩告満浣嶇疆鏄剧ず
            const params = calculateCameraParams();
            const frameNow = performance.now();
            maybeRefreshCameraUi(params, frameNow);
            
            // 鏇存柊鐩告満鍙傛暟鏄剧ず锛堟柟浣嶈銆佷话瑙掋€佺缉鏀撅級
            
            // 姣?甯у悓姝ヤ竴娆″埌3D鎺у埗闈㈡澘锛堣妭娴侊級
            maybeSyncViewerCameraPanel(params, frameNow);
            
            const shouldDrawTransformGizmo = (currentTool === 'translate' || currentTool === 'rotate') && selectedIndices.size > 0;
            const shouldDrawOverlay = shouldDrawTransformGizmo || hasActiveOrbitCenterFeedback();
            if (shouldDrawTransformGizmo) {
                updateGizmoScreenPosition();
            }
            if (shouldDrawOverlay) {
                drawGizmo();
            } else {
                clearGizmo();
            }
            requestAnimationFrame(frame);
        };
        frame();

        setupToolbar();
        setupSelectionEvents();
        setupGizmoEvents();
        setupKeyboard();
        setupCustomOrbitControls();
        setupOrbitCenterInteraction();
        setupVirtualOrbitBall();
        updateMainCanvasCursor();
        console.log('[GaussianViewer] Initialized');
    } catch (err) {
        console.error('[GaussianViewer] Init error:', err);
        errorEl.textContent = 'Failed to initialize: ' + err.message;
        errorEl.classList.remove('hidden');
    }
}


// ============== Controls Setup ==============

function setupCustomOrbitControls() {
    canvas.addEventListener('mousedown', (e) => {
        if (!customOrbitEnabled || isDraggingGizmo) return;
        e.preventDefault(); e.stopPropagation();
        customOrbitDragging = true;
        customOrbitLastX = e.clientX; customOrbitLastY = e.clientY;
        customOrbitButton = e.button;
    }, true);
    
    window.addEventListener('mousemove', (e) => {
        if (!customOrbitEnabled || !customOrbitDragging || isDraggingGizmo) return;
        const dx = e.clientX - customOrbitLastX, dy = e.clientY - customOrbitLastY;
        if (customOrbitButton === 0) {
            orbitYaw -= dx * 0.005; orbitPitch += dy * 0.005;
            orbitPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, orbitPitch));
        } else if (customOrbitButton === 2) {
            // 鍙抽敭鎷栧姩锛氬钩绉昏鍥撅紝鍚屾椂鏇存柊orbitTarget锛堜腑蹇冪偣锛?
            const panSpeed = orbitDistance * CUSTOM_ORBIT_PAN_DISTANCE_FACTOR;
            const panX = dx * panSpeed;
            const panY = dy * panSpeed;
            
            // 璁＄畻鐩告満鍙虫柟鍚戝拰涓婃柟鍚?
            // 鍙虫柟鍚戯細鍨傜洿浜庤绾匡紝鍦╔Z骞抽潰涓?
            const rightX = Math.cos(orbitYaw);
            const rightZ = Math.sin(orbitYaw);
            
            // 鏇存柊orbitTarget锛堜腑蹇冪偣锛夊拰cameraOffset
            // 鍚戝彸鎷栧姩锛坉x>0锛夆啋 涓績鐐瑰悜鍙崇Щ鍔?鈫?鐪嬪埌宸﹁竟鏇村
            orbitTarget.x += rightX * panX;
            orbitTarget.z -= rightZ * panX;
            orbitTarget.y -= panY;  // 鍚戜笅鎷栧姩鈫掍腑蹇冪偣涓婄Щ鈫掔湅鍒颁笅鏂规洿澶?
        }
        customOrbitLastX = e.clientX; customOrbitLastY = e.clientY;
    }, true);
    
    window.addEventListener('mouseup', () => { customOrbitDragging = false; }, true);
    
    canvas.addEventListener('wheel', (e) => {
        if (!customOrbitEnabled || isDraggingGizmo) return;
        e.preventDefault(); e.stopPropagation();
        // 鎸変綇Shift鏃跺噺閫?.5鍊?
        const speedMultiplier = e.shiftKey ? 0.0005 : 0.001;
        orbitDistance += e.deltaY * orbitDistance * speedMultiplier;
        orbitDistance = Math.max(MIN_CONTINUOUS_ZOOM_DISTANCE, orbitDistance);
    }, true);
    
    canvas.addEventListener('contextmenu', (e) => { if (customOrbitEnabled) e.preventDefault(); }, true);
}

/**
 * 璁剧疆铏氭嫙濮挎€佺悆 - 璺熻釜榧犳爣鏃嬭浆瑙掑害
 * 宸︽嫋 = 璐熻搴︼紝鍙虫嫋 = 姝ｈ搴?
 * 360搴︿竴寰幆
 */
function setupVirtualOrbitBall() {
    // 鐩戝惉canvas涓婄殑榧犳爣浜嬩欢鏉ヨ窡韪棆杞?
    canvas.addEventListener('mousedown', (e) => {
        // 鍙湪orbit宸ュ叿妯″紡涓嬭窡韪?
        if (currentTool !== 'orbit' || isDraggingGizmo) return;
        if (e.button !== 0) return; // 鍙窡韪乏閿?
        
        virtualOrbitBall.isDragging = true;
        virtualOrbitBall.lastMouseX = e.clientX;
        virtualOrbitBall.lastMouseY = e.clientY;
    }, true);
    
    window.addEventListener('mousemove', (e) => {
        if (!virtualOrbitBall.isDragging) return;
        
        const dx = e.clientX - virtualOrbitBall.lastMouseX;
        const dy = e.clientY - virtualOrbitBall.lastMouseY;
        
        // 姘村钩鏃嬭浆锛氬悜宸︽嫋鍔?= 鐪嬪埌鍙宠竟 = 瑙掑害澧炲姞
        // 鐏垫晱搴︼細涓巊splat鎺у埗鍣ㄤ竴鑷?0.003寮у害/鍍忕礌 鈮?0.17搴?鍍忕礌)
        const yawDelta = -dx * 0.003;  // 鍙栬礋浣垮悜宸︿负姝?
        virtualOrbitBall.yaw += yawDelta;
        
        // 鍨傜洿鏃嬭浆锛氶紶鏍囧悜涓?淇=姝ｈ搴︼紝榧犳爣鍚戜笂=浠拌=璐熻搴?
        // 涓嶅彇鍙峝y锛屽悜涓嬫嫋鍔╠y涓烘鍊硷紝瀵瑰簲姝ｈ搴︼紙淇/鐪嬪埌椤堕儴锛?
        const pitchDelta = dy * 0.003;
        virtualOrbitBall.pitch += pitchDelta;
        
        // 闄愬埗浠拌鑼冨洿锛?30搴﹀埌90搴?
        const minPitch = -30 * (Math.PI / 180);
        const maxPitch = 90 * (Math.PI / 180);
        virtualOrbitBall.pitch = Math.max(minPitch, Math.min(maxPitch, virtualOrbitBall.pitch));
        
        virtualOrbitBall.lastMouseX = e.clientX;
        virtualOrbitBall.lastMouseY = e.clientY;
        
        // 绔嬪嵆鍚屾鍒?D鐩告満鎺у埗闈㈡澘
    }, true);
    
    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            virtualOrbitBall.isDragging = false;
            const params = calculateCameraParams();
            forceRefreshCameraUi(params);
            forceSyncViewerCameraPanel(params);
        }
    }, true);
    
    // 婊氳疆缂╂斁 - 鐢眊splat OrbitControls澶勭悊
    // 涓嶅啀鍚屾zoom鍊煎埌鏄剧ず锛寊oom鍊煎彧鑳介€氳繃鎵嬪姩杈撳叆鎺у埗
    // 鍙栨秷榧犳爣婊氳疆瀵箊oom鐨勫奖鍝?
}

/**
 * 閲嶇疆铏氭嫙濮挎€佺悆瑙掑害
 */
function resetVirtualOrbitBall() {
    virtualOrbitBall.yaw = virtualOrbitBall.initialYaw;
    virtualOrbitBall.pitch = virtualOrbitBall.initialPitch;
    cameraParams.distance = DEFAULT_CAMERA_DISTANCE;
}

function setupToolbar() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });
    deleteBtn.addEventListener('click', deleteSelected);
    invertBtn.addEventListener('click', invertSelection);
    clearSelBtn.addEventListener('click', clearSelection);
    resetBtn.addEventListener('click', resetCamera);
    
    // 婊戞潯婊氳疆璋冩暣鍔熻兘
    const setupSliderWheel = (slider, input, onChange, min, max, step) => {
        slider.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY > 0 ? -step : step;
            let newValue = parseFloat(slider.value) + delta;
            newValue = Math.round(newValue / step) * step;
            newValue = Math.max(min, Math.min(max, newValue));
            if (step < 1) {
                const decimals = (step.toString().split('.')[1] || '').length;
                newValue = Number(newValue.toFixed(decimals));
            }
            slider.value = newValue;
            if (input) input.value = newValue;
            if (onChange) onChange(newValue);
        }, { passive: false });
    };
    
    // 缂╂斁鎺у埗浜嬩欢
    scaleSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        updateGaussianScale(value);
    });
    scaleInput.addEventListener('change', (e) => {
        let value = parseFloat(e.target.value);
        value = Math.max(0.1, Math.min(4, value));
        updateGaussianScale(value);
    });
    setupSliderWheel(scaleSlider, scaleInput, updateGaussianScale, 0.1, 4, 0.1);
    
    // 鐒﹁窛鎺у埗浜嬩欢
    focalLengthSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        focalLengthValue.value = value;
        updateFocalLength(value);
    });
    focalLengthValue.addEventListener('change', (e) => {
        let value = parseFloat(e.target.value);
        value = Math.max(12, Math.min(150, value));
        focalLengthValue.value = value;
        focalLengthSlider.value = value;
        updateFocalLength(value);
    });
    setupSliderWheel(focalLengthSlider, focalLengthValue, updateFocalLength, 12, 150, 1);
    
    // 姘村钩鏍℃鎺у埗浜嬩欢
    if (rollSlider && rollInput) {
        const setRollValue = (rawValue) => {
            let value = parseInt(rawValue, 10);
            if (!Number.isFinite(value)) value = 0;
            value = Math.max(-90, Math.min(90, value));
            cameraParams.roll = value;
            rollInput.value = value;
            rollSlider.value = value;
        };
        rollSlider.addEventListener('input', (e) => {
            setRollValue(e.target.value);
        });
        rollInput.addEventListener('change', (e) => {
            setRollValue(e.target.value);
        });
        setupSliderWheel(rollSlider, rollInput, setRollValue, -90, 90, 1);
    }
    
    // 娣卞害鑼冨洿鎺у埗浜嬩欢
    if (useCurrentOrbitCenterBtn) {
        useCurrentOrbitCenterBtn.addEventListener('click', () => {
            const center = getOrbitCenter() || getActiveOrbitCenter();
            updateOrbitCenterInputs(center);
            setCenterPickMode(false);
        });
    }

    if (applyOrbitCenterBtn) {
        applyOrbitCenterBtn.addEventListener('click', () => {
            const center = readOrbitCenterInputs();
            if (!center) return;
            applyOrbitCenter(center, { persistAsCustom: true, keepAngles: true });
            setCenterPickMode(false);
            updateStatus();
        });
    }

    if (clearOrbitCenterBtn) {
        clearOrbitCenterBtn.addEventListener('click', () => {
            cameraParams.customOrbitCenter = null;
            cameraParams.orbitCenter = getOrbitCenter() || getDefaultOrbitCenter();
            updateOrbitCenterInputs(cameraParams.orbitCenter);
            setCenterPickMode(false);
            updateStatus();
        });
    }

    if (pickOrbitCenterBtn) {
        pickOrbitCenterBtn.addEventListener('click', () => {
            setCenterPickMode(!centerPickMode);
            updateStatus();
        });
    }

    const applyDepthRangeValue = (rawValue) => {
        const parsed = parseFloat(rawValue);
        const fallback = parseFloat(depthRangeSlider.value);
        const value = Math.max(0.01, Math.min(5, Number.isFinite(parsed) ? parsed : (Number.isFinite(fallback) ? fallback : 5)));
        depthRangeSlider.value = value;
        if (value >= 5) {
            if (depthRangeValue) depthRangeValue.textContent = '全部';
            updateDepthRange(Infinity);
        } else {
            const depthValue = Math.pow(10, value);
            if (depthRangeValue) depthRangeValue.textContent = depthValue >= 1000 ? (depthValue / 1000).toFixed(1) + 'k' : depthValue.toFixed(0);
            updateDepthRange(depthValue);
        }
    };
    depthRangeSlider.addEventListener('input', (e) => {
        applyDepthRangeValue(e.target.value);
    });
    setupSliderWheel(depthRangeSlider, null, applyDepthRangeValue, 0.01, 5, 0.01);
    // 默认按“全部”显示高斯点，不改变相机姿态/位置。
    applyDepthRangeValue(depthRangeSlider.value);


    confirmBtn.addEventListener('click', handleConfirm);
    
    // 鐩告満鍙傛暟闈㈡澘浜や簰
    setupCameraParamsPanel();
    cancelBtn.addEventListener('click', handleCancel);

    // 姣斾緥閫夋嫨涓嬫媺鑿滃崟
    aspectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        aspectMenu.classList.toggle('show');
        aspectMenu.classList.toggle('hidden');
    });

    aspectOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            const aspect = e.target.dataset.aspect;
            setAspectRatio(aspect);
            aspectMenu.classList.add('hidden');
            aspectMenu.classList.remove('show');
        });
    });

    // 鐐瑰嚮鍏朵粬鍦版柟鍏抽棴鑿滃崟
    document.addEventListener('click', () => {
        aspectMenu.classList.add('hidden');
        aspectMenu.classList.remove('show');
    });
}

// 姣斾緥鏄犲皠琛?- 鍙瓨鍌ㄦ瘮渚嬪€?
const aspectRatios = {
    '21:9': 21/9,
    '16:9': 16/9,
    '3:2': 3/2,
    '4:3': 4/3,
    '1:1': 1,
    '3:4': 3/4,
    '2:3': 2/3,
    '9:16': 9/16
};

function setAspectRatio(aspect) {
    currentAspectRatio = aspect;
    console.log('[GaussianViewer] setAspectRatio:', aspect);
    if (aspect === 'original') {
        outputWidth = originalOutputWidth;
        outputHeight = originalOutputHeight;
        if (aspectBtn) aspectBtn.textContent = '原始 ▼';
    } else {
        const ratio = aspectRatios[aspect];
        if (ratio) {
            // 鍩轰簬鍘熷灏哄锛屾寜鏂版瘮渚嬭皟鏁?
            // 淇濇寔杈冨ぇ鐨勭淮搴︿笉鍙橈紝鎸夋瘮渚嬭绠楀彟涓€涓淮搴?
            if (originalOutputWidth >= originalOutputHeight) {
                // 鍘熷鏄í鍚戠殑
                if (ratio >= 1) {
                    // 鏂版瘮渚嬩篃鏄í鍚戯紝淇濇寔瀹藉害锛岃绠楅珮搴?
                    outputWidth = originalOutputWidth;
                    outputHeight = Math.round(originalOutputWidth / ratio);
                } else {
                    // 鏂版瘮渚嬫槸绔栧悜锛屼繚鎸佸搴︼紝璁＄畻楂樺害
                    outputWidth = originalOutputWidth;
                    outputHeight = Math.round(originalOutputWidth / ratio);
                }
            } else {
                // 鍘熷鏄珫鍚戠殑
                if (ratio >= 1) {
                    // 鏂版瘮渚嬫槸妯悜锛屼繚鎸侀珮搴︼紝璁＄畻瀹藉害
                    outputHeight = originalOutputHeight;
                    outputWidth = Math.round(originalOutputHeight * ratio);
                } else {
                    // 鏂版瘮渚嬩篃鏄珫鍚戯紝淇濇寔楂樺害锛岃绠楀搴?
                    outputHeight = originalOutputHeight;
                    outputWidth = Math.round(originalOutputHeight * ratio);
                }
            }
            if (aspectBtn) aspectBtn.textContent = aspect + ' ▼';
        }
    }
    console.log('[GaussianViewer] Output size:', outputWidth, 'x', outputHeight, 'ratio:', outputWidth/outputHeight);
    // 鏇存柊閫変腑鐘舵€?
    aspectOptions.forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.aspect === aspect);
    });
    updateRenderFrame();
}

function isKnownAspectRatio(aspect) {
    return typeof aspect === 'string' && (
        aspect === 'original'
        || Object.prototype.hasOwnProperty.call(aspectRatios, aspect)
    );
}

function applyAspectState(aspect, width, height) {
    if (isKnownAspectRatio(aspect)) {
        setAspectRatio(aspect);
        return true;
    }

    const nextWidth = Number(width);
    const nextHeight = Number(height);
    if (!Number.isFinite(nextWidth) || nextWidth <= 0 || !Number.isFinite(nextHeight) || nextHeight <= 0) {
        return false;
    }

    currentAspectRatio = 'custom';
    outputWidth = Math.round(nextWidth);
    outputHeight = Math.round(nextHeight);
    if (aspectBtn) aspectBtn.textContent = `${outputWidth}x${outputHeight} ▼`;
    aspectOptions.forEach((opt) => {
        opt.classList.remove('selected');
    });
    updateRenderFrame();
    return true;
}

function updateCameraPosDisplay(params = null) {
    // 鏄剧ず鐩告満瑙掑害鍙傛暟鑰屼笉鏄綅缃潗鏍?
    // Y = 鏂逛綅瑙掞紙azimuth锛?-360搴︼紝姘村钩鏃嬭浆
    // X = 浠拌锛坋levation锛?30鍒?0搴︼紝淇话瑙?
    // Z = 缂╂斁璺濈宸插彇娑堟樉绀猴紝鏀逛负鎵嬪姩杈撳叆鎺у埗
    params = params || calculateCameraParams();
    if (params && cameraPosDisplay) {
        const x = Math.round(params.elevation) + '°';   // 浠拌锛堜刊浠帮紝X杞达級
        const y = Math.round(params.azimuth) + '°';     // 鏂逛綅瑙掞紙姘村钩锛孻杞达級
        // 鍙樉绀篨鍜孻锛屽彇娑圸鐨勬樉绀?
        cameraPosDisplay.textContent = `X:${x} Y:${y}`;
    }
}

// ============== Camera Parameter Calculation ==============

/**
 * 璁＄畻鐩告満鍙傛暟锛堟柟浣嶈銆佷话瑙掋€佽窛绂伙級
 * azimuth/elevation 浠呯敱 position 鍐冲畾锛宺oll 浠呯敱 rotation 鍐冲畾锛屼簰涓嶅奖鍝?
 */
function calculateCameraParams() {
    if (!camera || !controls) {
        return cameraParams;
    }
    
    const target = getActiveOrbitCenter();
    
    const px = camera.position.x, py = camera.position.y, pz = camera.position.z;
    const posChanged = !lastCameraPositionForParams || 
        Math.abs(px - lastCameraPositionForParams.x) > 1e-6 ||
        Math.abs(py - lastCameraPositionForParams.y) > 1e-6 ||
        Math.abs(pz - lastCameraPositionForParams.z) > 1e-6;
    
    if (posChanged) {
        lastCameraPositionForParams = { x: px, y: py, z: pz };
        const result = CT.GSplatAdapter.fromGSplatPosition(px, py, pz, target);
        cameraParams.azimuth = Math.round(result.azimuth);
        cameraParams.elevation = Math.round(result.elevation);
    }

    // Keep roll as an explicit user-controlled value.
    // Deriving roll from camera Euler angles causes instability near high pitch/yaw
    // and can feed back into applyRollToCamera(), producing uncontrolled rolling.
    return cameraParams;
}

/**
 * 鑾峰彇楂樻柉鐐逛簯鐨勪腑蹇冪偣
 * 浼樺厛杩斿洖璺濈鍙栨櫙妗嗕腑蹇冩渶杩戠殑楂樻柉鐐?
 */
function getSplatCenter() {
    if (!currentSplat?.data?.positions) {
        return { x: 0, y: 0, z: 0 };
    }
    
    const positions = currentSplat.data.positions;
    const count = positions.length / 3;
    if (count === 0) return { x: 0, y: 0, z: 0 };
    
    // 棣栧厛璁＄畻鐐逛簯鐨勫嚑浣曚腑蹇冧綔涓哄弬鑰?
    let boundsCenter = { x: 0, y: 0, z: 0 };
    if (currentSplat.bounds) {
        boundsCenter = currentSplat.bounds.center();
    } else {
        for (let i = 0; i < count; i++) {
            boundsCenter.x += positions[i * 3];
            boundsCenter.y += positions[i * 3 + 1];
            boundsCenter.z += positions[i * 3 + 2];
        }
        boundsCenter.x /= count;
        boundsCenter.y /= count;
        boundsCenter.z /= count;
    }
    
    // 鏌ユ壘璺濈鍙栨櫙妗嗕腑蹇冿紙灞忓箷涓績锛夋渶杩戠殑楂樻柉鐐?
    // 鍙栨櫙妗嗕腑蹇冨搴旂殑鏄偣浜戠殑鍓嶆柟涓績浣嶇疆
    // 鎴戜滑浣跨敤鐐逛簯鐨勫墠琛ㄩ潰涓績浣滀负鐩爣
    let minZ = Infinity;
    let frontCenter = { x: boundsCenter.x, y: boundsCenter.y, z: boundsCenter.z };
    
    // 鎵惧埌鏈€鍓嶆柟锛圸鏈€灏忥級鐨勪竴缁勭偣锛岃绠楀畠浠殑骞冲潎浣嶇疆
    const frontPoints = [];
    const zThreshold = 0.2; // 允许 20% 的 Z 范围作为“前方”
    
    // 鍏堟壘鍒版渶灏廧鍊?
    for (let i = 0; i < count; i++) {
        const z = positions[i * 3 + 2];
        if (z < minZ) minZ = z;
    }
    
    // 鏀堕泦鍓嶆柟鐐癸紙Z鍊兼帴杩戞渶灏廧鐨勭偣锛?
    const zRange = currentSplat.bounds ? currentSplat.bounds.size().z * zThreshold : 1.0;
    for (let i = 0; i < count; i++) {
        const z = positions[i * 3 + 2];
        if (z <= minZ + zRange) {
            frontPoints.push({
                x: positions[i * 3],
                y: positions[i * 3 + 1],
                z: z
            });
        }
    }
    
    // 濡傛灉鏈夊墠鏂圭偣锛岃绠楀畠浠殑涓績
    if (frontPoints.length > 0) {
        let sumX = 0, sumY = 0, sumZ = 0;
        for (const p of frontPoints) {
            sumX += p.x;
            sumY += p.y;
            sumZ += p.z;
        }
        frontCenter = {
            x: sumX / frontPoints.length,
            y: sumY / frontPoints.length,
            z: sumZ / frontPoints.length
        };
        return frontCenter;
    }
    
    return boundsCenter;
}

/**
 * 鑾峰彇鍦烘櫙鍗婂緞锛堢敤浜庤窛绂诲綊涓€鍖栵級
 */
function getSceneBoundsSize() {
    if (currentSplat?.bounds) {
        const size = currentSplat.bounds.size();
        return {
            x: Math.abs(Number(size.x) || 0),
            y: Math.abs(Number(size.y) || 0),
            z: Math.abs(Number(size.z) || 0),
        };
    }

    if (!currentSplat?.data?.positions) {
        return null;
    }

    const positions = currentSplat.data.positions;
    const count = positions.length / 3;
    if (count === 0) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < count; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }

    return {
        x: maxX - minX,
        y: maxY - minY,
        z: maxZ - minZ,
    };
}

function getSceneRadius() {
    if (!currentSplat?.data?.positions) {
        return 5;  // 榛樿鍊?
    }
    
    // 濡傛灉鏈塨ounds锛屼娇鐢╞ounds灏哄
    if (currentSplat.bounds) {
        const size = currentSplat.bounds.size();
        return Math.max(size.x, size.y, size.z) / 2;
    }
    
    // 鍚﹀垯璁＄畻鐐逛簯鐨勮竟鐣?
    const positions = currentSplat.data.positions;
    const count = positions.length / 3;
    if (count === 0) return 5;
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < count; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    
    return Math.max(sizeX, sizeY, sizeZ) / 2 || 5;
}

function getRecommendedInitialCameraDistance() {
    const size = getSceneBoundsSize();
    if (!size) {
        return DEFAULT_INIT_CAMERA_DISTANCE;
    }

    const viewportWidth = Math.max(canvas?.clientWidth || originalOutputWidth || 512, 1);
    const viewportHeight = Math.max(canvas?.clientHeight || originalOutputHeight || 512, 1);
    const fx = Number(camera?.data?.fx);
    const fy = Number(camera?.data?.fy);
    const halfX = Math.max(size.x, 0) * 0.5;
    const halfY = Math.max(size.y, 0) * 0.5;
    const halfZ = Math.max(size.z, 0) * 0.5;

    let fitDistance = 0;
    if (Number.isFinite(fx) && fx > 1e-6) {
        fitDistance = Math.max(fitDistance, (halfX * fx) / Math.max(viewportWidth * 0.5, 1));
    }
    if (Number.isFinite(fy) && fy > 1e-6) {
        fitDistance = Math.max(fitDistance, (halfY * fy) / Math.max(viewportHeight * 0.5, 1));
    }

    const sceneRadius = Number(getSceneRadius());
    if (Number.isFinite(sceneRadius) && sceneRadius > 0) {
        fitDistance = Math.max(fitDistance, sceneRadius * 1.15);
    }

    fitDistance = (fitDistance + halfZ) * INITIAL_CAMERA_DISTANCE_MARGIN;
    if (!Number.isFinite(fitDistance) || fitDistance <= 0) {
        return DEFAULT_INIT_CAMERA_DISTANCE;
    }

    return Math.max(MIN_INIT_CAMERA_DISTANCE, fitDistance);
}

function getSceneBoundsCenter() {
    if (currentSplat?.bounds) {
        const c = currentSplat.bounds.center();
        return { x: Number(c.x) || 0, y: Number(c.y) || 0, z: Number(c.z) || 0 };
    }
    if (!currentSplat?.data?.positions) {
        return { x: 0, y: 0, z: 0 };
    }
    const positions = currentSplat.data.positions;
    const count = Math.floor(positions.length / 3);
    if (count <= 0) {
        return { x: 0, y: 0, z: 0 };
    }
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < count; i++) {
        sx += positions[i * 3];
        sy += positions[i * 3 + 1];
        sz += positions[i * 3 + 2];
    }
    return { x: sx / count, y: sy / count, z: sz / count };
}

function computeDefaultOrbitCenter(cameraPos, baseTarget) {
    const cam = cloneCenter(cameraPos);
    const target = cloneCenter(baseTarget);
    if (!cam || !target) return target || cam || { x: 0, y: 0, z: 0 };

    const vx = target.x - cam.x;
    const vy = target.y - cam.y;
    const vz = target.z - cam.z;
    const baseDist = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (!(baseDist > 1e-6)) return target;

    const inv = 1.0 / baseDist;
    const dirX = vx * inv;
    const dirY = vy * inv;
    const dirZ = vz * inv;

    let desiredDist = baseDist;
    const sceneCenter = getSceneBoundsCenter();
    if (sceneCenter) {
        const toCenterX = sceneCenter.x - cam.x;
        const toCenterY = sceneCenter.y - cam.y;
        const toCenterZ = sceneCenter.z - cam.z;
        const projectedDepth = toCenterX * dirX + toCenterY * dirY + toCenterZ * dirZ;
        if (Number.isFinite(projectedDepth) && projectedDepth > desiredDist) {
            desiredDist = projectedDepth;
        }
    }

    const sceneRadius = Number(getSceneRadius());
    if (Number.isFinite(sceneRadius) && sceneRadius > 0) {
        desiredDist = Math.max(desiredDist, sceneRadius * 1.8);
    }

    if (desiredDist <= baseDist + 1e-6) return target;
    // Pull back 50% from the expanded orbit distance to keep rotation feel closer.
    desiredDist = baseDist + (desiredDist - baseDist) * 0.5;
    return {
        x: cam.x + dirX * desiredDist,
        y: cam.y + dirY * desiredDist,
        z: cam.z + dirZ * desiredDist,
    };
}

/**
 * 鏍规嵁瑙掑害鑾峰彇鏂逛綅瑙掓爣绛?
 */
function getAzimuthLabel(angle) {
    for (const range of AZIMUTH_LABELS) {
        if (angle >= range.min && angle < range.max) {
            return range.label;
        }
    }
    return 'front view';  // 榛樿
}

/**
 * 鏍规嵁瑙掑害鑾峰彇浠拌鏍囩
 */
function getElevationLabel(angle) {
    for (const range of ELEVATION_LABELS) {
        if (angle >= range.min && angle < range.max) {
            return range.label;
        }
    }
    return 'eye level';  // 榛樿
}

/**
 * 鏍规嵁璺濈鑾峰彇缂╂斁鏍囩
 */
function getZoomLabel(distance) {
    for (const range of ZOOM_LABELS) {
        if (distance >= range.min && distance < range.max) {
            return range.label;
        }
    }
    return 'medium shot';  // 榛樿
}

/**
 * 鐢熸垚鐩告満鎻忚堪鏂囨湰
 * 鏍煎紡: {鏂瑰悜鏍囩}, {浠拌鏍囩}, {缂╂斁鏍囩} (horizontal: {姘村钩瑙拀, vertical: {鍨傜洿瑙拀, zoom: {缂╂斁鍊紏)
 */
function getSliderZoom() {
    const v = parseFloat(document.getElementById('zoomInput')?.value ?? document.getElementById('zoomSlider')?.value);
    return isNaN(v) ? (cameraParams.distance || DEFAULT_CAMERA_DISTANCE) : v;
}

function getCurrentFocalLengthValue(fallback = initialFocalLength) {
    const rawValue = parseFloat(focalLengthValue?.value ?? focalLengthSlider?.value);
    return Number.isFinite(rawValue) ? rawValue : fallback;
}

function applyFocalLengthToCamera(value, options = {}) {
    if (!camera) return;
    const nextValue = Number.isFinite(Number(value)) ? Number(value) : getCurrentFocalLengthValue();
    const sensorWidth = 36;
    const canvasWidth = canvas.clientWidth || 512;
    const focalPx = (canvasWidth * nextValue) / sensorWidth;
    camera.data.fx = focalPx;
    camera.data.fy = focalPx;
    if (typeof camera.update === 'function') {
        camera.update();
    }
    if (options.updateInitialCameraData && initialCameraData) {
        initialCameraData.fx = focalPx;
        initialCameraData.fy = focalPx;
    }
}

function generateCameraDescription(params = null) {
    params = params || calculateCameraParams();
    if (!params) return '';
    
    const zoom = getSliderZoom();
    const azimuthLabel = getAzimuthLabel(params.azimuth);
    const elevationLabel = getElevationLabel(params.elevation);
    const zoomLabel = getZoomLabel(zoom);
    
    return `${azimuthLabel}, ${elevationLabel}, ${zoomLabel} (horizontal: ${Math.round(params.azimuth)}, vertical: ${Math.round(params.elevation)}, zoom: ${zoom.toFixed(1)})`;
}

/**
 * 鏇存柊鐩告満鍙傛暟鏄剧ず
 */
function updateCameraParamsDisplay(params = null) {
    params = params || calculateCameraParams();
    if (!params) return;
    
    const azimuthLabel = getAzimuthLabel(params.azimuth);
    const elevationLabel = getElevationLabel(params.elevation);
    const zoomLabel = getZoomLabel(params.distance);
    
    // 鏇存柊鏁板€兼樉绀猴紙鏁存暟锛?
    const azimuthValueEl = document.getElementById('azimuthValue');
    const elevationValueEl = document.getElementById('elevationValue');
    const zoomValueEl = document.getElementById('zoomValue');
    
    if (azimuthValueEl) azimuthValueEl.textContent = `${params.azimuth}°`;
    if (elevationValueEl) elevationValueEl.textContent = `${params.elevation}°`;
    if (zoomValueEl) zoomValueEl.textContent = params.distance;
    
    // 鏇存柊鏍囩鏄剧ず
    const azimuthLabelEl = document.getElementById('azimuthLabel');
    const elevationLabelEl = document.getElementById('elevationLabel');
    const zoomLabelEl = document.getElementById('zoomLabel');
    
    if (azimuthLabelEl) azimuthLabelEl.textContent = azimuthLabel;
    if (elevationLabelEl) elevationLabelEl.textContent = elevationLabel;
    if (zoomLabelEl) zoomLabelEl.textContent = zoomLabel;
    
    // 鏇存柊瀹屾暣鎻忚堪
    const descriptionEl = document.getElementById('cameraDescription');
    if (descriptionEl) {
        descriptionEl.value = generateCameraDescription(params);
    }
}

/**
 * 璁剧疆鐩告満鍙傛暟闈㈡澘浜や簰
 */
function setupCameraParamsPanel() {
    const panel = document.getElementById('cameraParamsPanel');
    const toggleBtn = document.getElementById('toggleCameraParams');
    const copyBtn = document.getElementById('copyCameraDesc');
    
    // 鎶樺彔/灞曞紑闈㈡澘
    if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            toggleBtn.textContent = panel.classList.contains('collapsed') ? '+' : '-';
        });
    }
    
    // 澶嶅埗鎻忚堪鍒板壀璐存澘
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const descriptionEl = document.getElementById('cameraDescription');
            if (!descriptionEl) return;
            
            const text = descriptionEl.value;
            try {
                await navigator.clipboard.writeText(text);
                
                // 鏄剧ず澶嶅埗鎴愬姛鍙嶉
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✓ 已复制!';
                copyBtn.classList.add('copied');
                
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.classList.remove('copied');
                }, 1500);
                
                console.log('[GaussianViewer] Camera description copied:', text);
            } catch (err) {
                console.error('[GaussianViewer] Failed to copy:', err);
                
                // 闄嶇骇鏂规锛氶€変腑鏂囨湰
                descriptionEl.select();
                document.execCommand('copy');
                
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✓ 已复制!';
                copyBtn.classList.add('copied');
                
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.classList.remove('copied');
                }, 1500);
            }
        });
    }
}

function updateCursorPosition(e) {
    if (!camera || !canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;
    
    // 灏嗛紶鏍囦綅缃浆鎹负褰掍竴鍖栬澶囧潗鏍?(-1鍒?)
    const ndcX = (mouseX / canvasWidth) * 2 - 1;
    const ndcY = -((mouseY / canvasHeight) * 2 - 1);  // Y杞寸炕杞?
    
    // 浣跨敤鐩告満鎶曞奖鐭╅樀閫嗗彉鎹㈣幏鍙栦笘鐣屽潗鏍?
    // 绠€鍖栬绠楋細鍋囪鍦ㄧ浉鏈哄墠鏂逛竴瀹氳窛绂荤殑骞抽潰涓?
    const fov = camera.data.fx;  // 鐒﹁窛锛堝儚绱狅級
    const distance = 5.0;  // 鍋囪璺濈鐩告満鐨勬繁搴?
    
    // 璁＄畻鐩告満鍧愭爣绯讳腑鐨勪綅缃?
    const camX = ndcX * (canvasWidth / (2 * camera.data.fx)) * distance;
    const camY = ndcY * (canvasHeight / (2 * camera.data.fy)) * distance;
    const camZ = -distance;  // 鐩告満鏈濆悜-Z鏂瑰悜
    
    // 杞崲鍒颁笘鐣屽潗鏍囩郴锛堢畝鍖栫増锛屼笉鑰冭檻鏃嬭浆锛?
    const worldX = camX + camera.position.x;
    const worldY = camY + camera.position.y;
    const worldZ = camZ + camera.position.z;
    
    if (cursorPosDisplay) {
        cursorPosDisplay.textContent = `X:${worldX.toFixed(1)} Y:${worldY.toFixed(1)} Z:${worldZ.toFixed(1)}`;
    }
}

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    
    const isSelectionTool = (tool === 'rect' || tool === 'lasso');
    const isGizmoTool = (tool === 'translate' || tool === 'rotate');
    
    if (!customOrbitEnabled) controls.enabled = !isSelectionTool && !isGizmoTool;
    selectionCanvas.style.pointerEvents = isSelectionTool ? 'auto' : 'none';
    
    if (!isGizmoTool) clearGizmo();
    if (centerPickMode && tool !== 'orbit' && tool !== 'pan') {
        setCenterPickMode(false);
    }
    
    updateMainCanvasCursor();
}

function setupSelectionEvents() {
    selectionCanvas.addEventListener('mousedown', (e) => {
        if (currentTool !== 'rect' && currentTool !== 'lasso') return;
        e.preventDefault(); e.stopPropagation();
        const rect = selectionCanvas.getBoundingClientRect();
        isSelecting = true;
        selectionStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        lassoPoints = [{ ...selectionStart }];
    });

    selectionCanvas.addEventListener('mousemove', (e) => {
        // 鏇存柊鍏夋爣浣嶇疆鏄剧ず
        updateCursorPosition(e);
        
        if (!isSelecting) return;
        const rect = selectionCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        selCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
        selCtx.strokeStyle = '#00ff00'; selCtx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        selCtx.lineWidth = 2; selCtx.setLineDash([5, 5]);
        if (currentTool === 'rect') {
            selCtx.strokeRect(selectionStart.x, selectionStart.y, x - selectionStart.x, y - selectionStart.y);
            selCtx.fillRect(selectionStart.x, selectionStart.y, x - selectionStart.x, y - selectionStart.y);
        } else {
            lassoPoints.push({ x, y });
            selCtx.beginPath(); selCtx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
            lassoPoints.forEach(p => selCtx.lineTo(p.x, p.y));
            selCtx.closePath(); selCtx.stroke(); selCtx.fill();
        }
    });

    selectionCanvas.addEventListener('mouseup', (e) => {
        if (!isSelecting) return;
        isSelecting = false;
        const rect = selectionCanvas.getBoundingClientRect();
        const endX = e.clientX - rect.left, endY = e.clientY - rect.top;
        if (currentTool === 'rect') selectPointsInRect(selectionStart.x, selectionStart.y, endX, endY, e.shiftKey);
        else selectPointsInLasso(lassoPoints, e.shiftKey);
        selCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
        lassoPoints = [];
    });

    selectionCanvas.addEventListener('mouseleave', () => {
        if (isSelecting) { isSelecting = false; selCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height); lassoPoints = []; }
    });
}

function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
        else if (e.key === 'Escape') {
            if (centerPickMode) {
                setCenterPickMode(false);
                updateStatus();
                return;
            }
            clearSelection();
            setTool('orbit');
        }
        else if (e.key === 'i' || e.key === 'I') invertSelection();
        else if (e.key === 'v' || e.key === 'V') setTool('orbit');
        else if (e.key === 'r' || e.key === 'R') setTool('rect');
        else if (e.key === 'l' || e.key === 'L') setTool('lasso');
        else if (e.key === 'g' || e.key === 'G') setTool('translate');
        else if (e.key === 't' || e.key === 'T') setTool('rotate');
    });
}


// ============== Gizmo Drawing ==============

function updateGizmoCenter() {
    if (selectedIndices.size === 0 || !currentSplat?.data) return;
    const positions = currentSplat.data.positions;
    let cx = 0, cy = 0, cz = 0;
    for (const idx of selectedIndices) {
        cx += positions[idx * 3]; cy += positions[idx * 3 + 1]; cz += positions[idx * 3 + 2];
    }
    gizmoCenter.x = cx / selectedIndices.size;
    gizmoCenter.y = cy / selectedIndices.size;
    gizmoCenter.z = cz / selectedIndices.size;
}

function updateGizmoScreenPosition() {
    updateGizmoCenter();
    
    // Apply preview translation for smooth visual feedback
    const worldPos = {
        x: gizmoCenter.x + previewTranslation.x,
        y: gizmoCenter.y + previewTranslation.y,
        z: gizmoCenter.z + previewTranslation.z
    };
    
    const screen = projectPoint(worldPos);
    if (screen) {
        gizmoScreenPos.x = screen.x;
        gizmoScreenPos.y = screen.y;
    }
}

function clearGizmo() {
    gizmoCtx.clearRect(0, 0, gizmoCanvas.width, gizmoCanvas.height);
}

function drawOrbitCenterFeedback(now = performance.now()) {
    if (!hasActiveOrbitCenterFeedback(now)) return;
    const screen = projectPoint(orbitCenterFeedback.center);
    if (!screen) return;

    const remaining = Math.max(0, orbitCenterFeedback.expiresAt - now);
    const t = remaining / ORBIT_CENTER_FEEDBACK_DURATION_MS;
    const alpha = 0.25 + t * 0.75;
    const radius = 8 + (1 - t) * 6;
    const crossRadius = radius + 5;

    gizmoCtx.save();
    gizmoCtx.globalAlpha = alpha;
    gizmoCtx.strokeStyle = '#ff3b30';
    gizmoCtx.fillStyle = '#ff3b30';
    gizmoCtx.lineWidth = 2.5;
    gizmoCtx.shadowColor = 'rgba(255, 59, 48, 0.55)';
    gizmoCtx.shadowBlur = 10;

    gizmoCtx.beginPath();
    gizmoCtx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    gizmoCtx.stroke();

    gizmoCtx.beginPath();
    gizmoCtx.arc(screen.x, screen.y, 3.5, 0, Math.PI * 2);
    gizmoCtx.fill();

    gizmoCtx.beginPath();
    gizmoCtx.moveTo(screen.x - crossRadius, screen.y);
    gizmoCtx.lineTo(screen.x + crossRadius, screen.y);
    gizmoCtx.moveTo(screen.x, screen.y - crossRadius);
    gizmoCtx.lineTo(screen.x, screen.y + crossRadius);
    gizmoCtx.stroke();

    gizmoCtx.restore();
}

function drawGizmo() {
    clearGizmo();
    if (selectedIndices.size > 0) {
        camera.update();
        const viewMatrix = camera.data.viewMatrix?.buffer;
        if (!viewMatrix) {
            drawOrbitCenterFeedback();
            return;
        }
        const cx = gizmoScreenPos.x, cy = gizmoScreenPos.y;

        if (currentTool === 'translate') drawTranslateGizmo(cx, cy, viewMatrix);
        else if (currentTool === 'rotate') drawRotateGizmo(cx, cy, viewMatrix);

        // Show transform info during drag
        if (isDraggingGizmo) {
        gizmoCtx.fillStyle = '#fff';
        gizmoCtx.font = 'bold 14px sans-serif';
        gizmoCtx.textAlign = 'center';
        gizmoCtx.shadowColor = '#000';
        gizmoCtx.shadowBlur = 4;
        
        let axisName = activeAxis?.toUpperCase() || '';
        if (activeAxis === 'view') axisName = '视角';
        
        if (currentTool === 'translate') {
            const dist = Math.sqrt(previewTranslation.x**2 + previewTranslation.y**2 + previewTranslation.z**2);
            gizmoCtx.fillText(`${axisName} 移动: ${dist.toFixed(3)}`, cx, cy - GIZMO_SIZE - 25);
        } else {
            gizmoCtx.fillText(`${axisName} 旋转: ${previewRotationAngle.toFixed(1)}°`, cx, cy - GIZMO_SIZE - 25);
        }
            gizmoCtx.shadowBlur = 0;
        }
    }
    drawOrbitCenterFeedback();
}

function getScreenAxes(viewMatrix, length) {
    const axes = {};
    const vecs = { x: [1,0,0], y: [0,1,0], z: [0,0,1] };
    for (const [name, v] of Object.entries(vecs)) {
        const vx = viewMatrix[0]*v[0] + viewMatrix[4]*v[1] + viewMatrix[8]*v[2];
        const vy = viewMatrix[1]*v[0] + viewMatrix[5]*v[1] + viewMatrix[9]*v[2];
        axes[name] = { x: vx * length, y: -vy * length };
    }
    return axes;
}

function drawTranslateGizmo(cx, cy, viewMatrix) {
    const axes = getScreenAxes(viewMatrix, GIZMO_SIZE);
    
    // Draw axis lines and arrows
    for (const axis of ['x', 'y', 'z']) {
        const ax = axes[axis];
        const isActive = activeAxis === axis || hoverAxis === axis;
        const color = isActive ? AXIS_COLORS_BRIGHT[axis] : AXIS_COLORS[axis];
        
        // Line
        gizmoCtx.strokeStyle = color;
        gizmoCtx.lineWidth = isActive ? 4 : 2;
        gizmoCtx.beginPath();
        gizmoCtx.moveTo(cx, cy);
        gizmoCtx.lineTo(cx + ax.x, cy + ax.y);
        gizmoCtx.stroke();
        
        // Arrow head
        const len = Math.sqrt(ax.x**2 + ax.y**2);
        if (len > 10) {
            const nx = ax.x/len, ny = ax.y/len;
            const arrowSize = isActive ? 14 : 10;
            gizmoCtx.fillStyle = color;
            gizmoCtx.beginPath();
            gizmoCtx.moveTo(cx + ax.x, cy + ax.y);
            gizmoCtx.lineTo(cx + ax.x - nx*arrowSize - ny*arrowSize*0.4, cy + ax.y - ny*arrowSize + nx*arrowSize*0.4);
            gizmoCtx.lineTo(cx + ax.x - nx*arrowSize + ny*arrowSize*0.4, cy + ax.y - ny*arrowSize - nx*arrowSize*0.4);
            gizmoCtx.closePath();
            gizmoCtx.fill();
        }
    }
    
    // Draw plane squares
    const planeSize = 0.25;
    const planes = [
        { name: 'xy', a: 'x', b: 'y', color: 'rgba(255,255,0,0.4)' },
        { name: 'xz', a: 'x', b: 'z', color: 'rgba(255,0,255,0.4)' },
        { name: 'yz', a: 'y', b: 'z', color: 'rgba(0,255,255,0.4)' }
    ];
    for (const p of planes) {
        const ax = axes[p.a], bx = axes[p.b];
        const isActive = activeAxis === p.name || hoverAxis === p.name;
        gizmoCtx.fillStyle = isActive ? p.color.replace('0.4', '0.7') : p.color;
        gizmoCtx.beginPath();
        gizmoCtx.moveTo(cx + ax.x*planeSize, cy + ax.y*planeSize);
        gizmoCtx.lineTo(cx + ax.x*planeSize + bx.x*planeSize, cy + ax.y*planeSize + bx.y*planeSize);
        gizmoCtx.lineTo(cx + bx.x*planeSize, cy + bx.y*planeSize);
        gizmoCtx.lineTo(cx, cy);
        gizmoCtx.closePath();
        gizmoCtx.fill();
    }
    
    // Center sphere
    gizmoCtx.fillStyle = '#ffffff';
    gizmoCtx.beginPath();
    gizmoCtx.arc(cx, cy, 6, 0, Math.PI * 2);
    gizmoCtx.fill();
}

function drawRotateGizmo(cx, cy, viewMatrix) {
    const radius = GIZMO_SIZE;
    
    // Draw rotation rings
    for (const axis of ['x', 'y', 'z']) {
        const isActive = activeAxis === axis;
        const isHover = hoverAxis === axis;
        const color = (isActive || isHover) ? AXIS_COLORS_BRIGHT[axis] : AXIS_COLORS[axis];
        
        // Draw the ring with preview arc if this axis is being dragged
        if (isActive && isDraggingGizmo && Math.abs(previewRotationAngle) > 0.5) {
            drawRotationRingWithPreview(cx, cy, radius, axis, viewMatrix, color);
        } else {
            drawRotationRing(cx, cy, radius, axis, viewMatrix, color, isActive || isHover);
        }
    }
    
    // Outer view ring
    const isViewActive = activeAxis === 'view';
    const isViewHover = hoverAxis === 'view';
    const viewHighlight = isViewActive || isViewHover;
    gizmoCtx.strokeStyle = viewHighlight ? '#ffffff' : 'rgba(255,255,255,0.4)';
    gizmoCtx.lineWidth = viewHighlight ? 4 : 2;
    gizmoCtx.beginPath();
    gizmoCtx.arc(cx, cy, radius * 1.15, 0, Math.PI * 2);
    gizmoCtx.stroke();
    
    // Draw view rotation preview
    if (isViewActive && isDraggingGizmo && Math.abs(previewRotationAngle) > 0.5) {
        drawViewRotationPreview(cx, cy, radius * 1.15);
    }
    
    // Center
    gizmoCtx.fillStyle = '#ffff00';
    gizmoCtx.beginPath();
    gizmoCtx.arc(cx, cy, 5, 0, Math.PI * 2);
    gizmoCtx.fill();
}

function drawRotationRingWithPreview(cx, cy, radius, axis, viewMatrix, color) {
    const segments = 64;
    const angleRad = previewRotationAngle * Math.PI / 180;
    
    // First draw the full ring (dimmed)
    gizmoCtx.strokeStyle = color;
    gizmoCtx.lineWidth = 2;
    gizmoCtx.globalAlpha = 0.3;
    
    for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * Math.PI * 2;
        const a2 = ((i + 1) / segments) * Math.PI * 2;
        
        let p1, p2;
        if (axis === 'x') {
            p1 = { x: 0, y: Math.cos(a1), z: Math.sin(a1) };
            p2 = { x: 0, y: Math.cos(a2), z: Math.sin(a2) };
        } else if (axis === 'y') {
            p1 = { x: Math.cos(a1), y: 0, z: Math.sin(a1) };
            p2 = { x: Math.cos(a2), y: 0, z: Math.sin(a2) };
        } else {
            p1 = { x: Math.cos(a1), y: Math.sin(a1), z: 0 };
            p2 = { x: Math.cos(a2), y: Math.sin(a2), z: 0 };
        }
        
        const s1x = viewMatrix[0]*p1.x + viewMatrix[4]*p1.y + viewMatrix[8]*p1.z;
        const s1y = viewMatrix[1]*p1.x + viewMatrix[5]*p1.y + viewMatrix[9]*p1.z;
        const s2x = viewMatrix[0]*p2.x + viewMatrix[4]*p2.y + viewMatrix[8]*p2.z;
        const s2y = viewMatrix[1]*p2.x + viewMatrix[5]*p2.y + viewMatrix[9]*p2.z;
        
        gizmoCtx.beginPath();
        gizmoCtx.moveTo(cx + s1x * radius, cy - s1y * radius);
        gizmoCtx.lineTo(cx + s2x * radius, cy - s2y * radius);
        gizmoCtx.stroke();
    }
    
    gizmoCtx.globalAlpha = 1.0;
    
    // Now draw the highlighted arc portion showing the rotation
    // The arc goes from angle 0 to angleRad on the rotation plane
    const arcSegments = Math.max(8, Math.abs(Math.round(previewRotationAngle / 5)));
    const startA = 0;
    const endA = angleRad;
    
    // Draw filled arc on the ring
    gizmoCtx.fillStyle = color.replace('#', 'rgba(').replace(/(..)(..)(..)/, 
        (m, r, g, b) => `${parseInt(r,16)}, ${parseInt(g,16)}, ${parseInt(b,16)}, 0.4)`);
    
    // Build arc path
    const arcPoints = [];
    for (let i = 0; i <= arcSegments; i++) {
        const t = i / arcSegments;
        const a = startA + (endA - startA) * t;
        
        let p;
        if (axis === 'x') p = { x: 0, y: Math.cos(a), z: Math.sin(a) };
        else if (axis === 'y') p = { x: Math.cos(a), y: 0, z: Math.sin(a) };
        else p = { x: Math.cos(a), y: Math.sin(a), z: 0 };
        
        const sx = viewMatrix[0]*p.x + viewMatrix[4]*p.y + viewMatrix[8]*p.z;
        const sy = viewMatrix[1]*p.x + viewMatrix[5]*p.y + viewMatrix[9]*p.z;
        arcPoints.push({ x: cx + sx * radius, y: cy - sy * radius });
    }
    
    // Draw filled sector
    if (arcPoints.length > 1) {
        gizmoCtx.beginPath();
        gizmoCtx.moveTo(cx, cy);
        arcPoints.forEach((p, i) => {
            if (i === 0) gizmoCtx.lineTo(p.x, p.y);
            else gizmoCtx.lineTo(p.x, p.y);
        });
        gizmoCtx.closePath();
        gizmoCtx.fill();
        
        // Draw arc outline
        gizmoCtx.strokeStyle = color;
        gizmoCtx.lineWidth = 4;
        gizmoCtx.beginPath();
        arcPoints.forEach((p, i) => {
            if (i === 0) gizmoCtx.moveTo(p.x, p.y);
            else gizmoCtx.lineTo(p.x, p.y);
        });
        gizmoCtx.stroke();
        
        // Draw radial lines
        gizmoCtx.lineWidth = 2;
        gizmoCtx.beginPath();
        gizmoCtx.moveTo(cx, cy);
        gizmoCtx.lineTo(arcPoints[0].x, arcPoints[0].y);
        gizmoCtx.moveTo(cx, cy);
        gizmoCtx.lineTo(arcPoints[arcPoints.length - 1].x, arcPoints[arcPoints.length - 1].y);
        gizmoCtx.stroke();
    }
}

function drawViewRotationPreview(cx, cy, radius) {
    const startAngle = Math.atan2(dragStartPos.y - cy, dragStartPos.x - cx);
    const angleRad = previewRotationAngle * Math.PI / 180;
    const endAngle = startAngle + angleRad;
    
    // Draw filled arc
    gizmoCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    gizmoCtx.beginPath();
    gizmoCtx.moveTo(cx, cy);
    gizmoCtx.arc(cx, cy, radius * 0.85, startAngle, endAngle, angleRad < 0);
    gizmoCtx.closePath();
    gizmoCtx.fill();
    
    // Draw arc outline
    gizmoCtx.strokeStyle = '#ffffff';
    gizmoCtx.lineWidth = 3;
    gizmoCtx.beginPath();
    gizmoCtx.arc(cx, cy, radius * 0.85, startAngle, endAngle, angleRad < 0);
    gizmoCtx.stroke();
    
    // Draw radial lines
    gizmoCtx.lineWidth = 2;
    gizmoCtx.beginPath();
    gizmoCtx.moveTo(cx, cy);
    gizmoCtx.lineTo(cx + Math.cos(startAngle) * radius * 0.85, cy + Math.sin(startAngle) * radius * 0.85);
    gizmoCtx.moveTo(cx, cy);
    gizmoCtx.lineTo(cx + Math.cos(endAngle) * radius * 0.85, cy + Math.sin(endAngle) * radius * 0.85);
    gizmoCtx.stroke();
}

function drawRotationRing(cx, cy, radius, axis, viewMatrix, color, isActive) {
    const segments = 64;
    gizmoCtx.strokeStyle = color;
    gizmoCtx.lineWidth = isActive ? 4 : 2;
    
    for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * Math.PI * 2;
        const a2 = ((i + 1) / segments) * Math.PI * 2;
        
        let p1, p2;
        if (axis === 'x') {
            p1 = { x: 0, y: Math.cos(a1), z: Math.sin(a1) };
            p2 = { x: 0, y: Math.cos(a2), z: Math.sin(a2) };
        } else if (axis === 'y') {
            p1 = { x: Math.cos(a1), y: 0, z: Math.sin(a1) };
            p2 = { x: Math.cos(a2), y: 0, z: Math.sin(a2) };
        } else {
            p1 = { x: Math.cos(a1), y: Math.sin(a1), z: 0 };
            p2 = { x: Math.cos(a2), y: Math.sin(a2), z: 0 };
        }
        
        // Transform to screen
        const s1x = viewMatrix[0]*p1.x + viewMatrix[4]*p1.y + viewMatrix[8]*p1.z;
        const s1y = viewMatrix[1]*p1.x + viewMatrix[5]*p1.y + viewMatrix[9]*p1.z;
        const s1z = viewMatrix[2]*p1.x + viewMatrix[6]*p1.y + viewMatrix[10]*p1.z;
        const s2z = viewMatrix[2]*p2.x + viewMatrix[6]*p2.y + viewMatrix[10]*p2.z;
        const s2x = viewMatrix[0]*p2.x + viewMatrix[4]*p2.y + viewMatrix[8]*p2.z;
        const s2y = viewMatrix[1]*p2.x + viewMatrix[5]*p2.y + viewMatrix[9]*p2.z;
        
        // Depth-based alpha
        const avgZ = (s1z + s2z) / 2;
        gizmoCtx.globalAlpha = avgZ > 0 ? 1.0 : 0.25;
        
        gizmoCtx.beginPath();
        gizmoCtx.moveTo(cx + s1x * radius, cy - s1y * radius);
        gizmoCtx.lineTo(cx + s2x * radius, cy - s2y * radius);
        gizmoCtx.stroke();
    }
    gizmoCtx.globalAlpha = 1.0;
}


// ============== Gizmo Interaction ==============

function setupGizmoEvents() {
    // Use document level events for reliable capture
    document.addEventListener('mousedown', onGizmoMouseDown, true);
    document.addEventListener('mousemove', onGizmoMouseMove, true);
    document.addEventListener('mouseup', onGizmoMouseUp, true);
}

function onGizmoMouseDown(e) {
    if (currentTool !== 'translate' && currentTool !== 'rotate') return;
    if (selectedIndices.size === 0) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;
    
    const hitAxis = getGizmoHitAxis(x, y);
    if (!hitAxis) return;
    
    activeAxis = hitAxis;
    isDraggingGizmo = true;
    dragStartPos = { x, y };
    dragCurrentPos = { x, y };
    previewTranslation = { x: 0, y: 0, z: 0 };
    previewRotationAngle = 0;
    
    // Store base data
    if (currentSplat?.data) {
        transformBasePositions = new Float32Array(currentSplat.data.positions);
        transformBaseRotations = new Float32Array(currentSplat.data.rotations);
    }
    
    if (controls) controls.enabled = false;
    canvas.style.cursor = 'grabbing';
    
    e.preventDefault();
    e.stopPropagation();
}

function onGizmoMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    
    if (!isDraggingGizmo) {
        // Hover detection
        if ((currentTool === 'translate' || currentTool === 'rotate') && selectedIndices.size > 0) {
            const newHover = getGizmoHitAxis(x, y);
            if (newHover !== hoverAxis) {
                hoverAxis = newHover;
                canvas.style.cursor = hoverAxis ? 'pointer' : 'default';
            }
        }
        return;
    }
    
    // Update current position for preview drawing
    dragCurrentPos = { x, y };
    const dx = x - dragStartPos.x, dy = y - dragStartPos.y;
    
    if (currentTool === 'translate') {
        calculatePreviewTranslation(dx, dy);
    } else {
        calculatePreviewRotation(x, y);
    }
    
    e.preventDefault();
    e.stopPropagation();
}

function onGizmoMouseUp(e) {
    if (!isDraggingGizmo) return;
    
    // Apply the transform to actual data
    if (currentTool === 'translate' && (previewTranslation.x !== 0 || previewTranslation.y !== 0 || previewTranslation.z !== 0)) {
        applyTranslation();
    } else if (currentTool === 'rotate' && Math.abs(previewRotationAngle) > 0.1) {
        applyRotation();
    }
    
    // Reset state
    isDraggingGizmo = false;
    activeAxis = null;
    hoverAxis = null;
    previewTranslation = { x: 0, y: 0, z: 0 };
    previewRotationAngle = 0;
    transformBasePositions = null;
    transformBaseRotations = null;
    
    if (controls && !customOrbitEnabled) {
        controls.enabled = (currentTool !== 'translate' && currentTool !== 'rotate');
    }
    canvas.style.cursor = 'default';
}

function getGizmoHitAxis(x, y) {
    updateGizmoScreenPosition();
    const cx = gizmoScreenPos.x, cy = gizmoScreenPos.y;
    const dist = Math.sqrt((x - cx)**2 + (y - cy)**2);
    
    if (currentTool === 'translate') {
        const viewMatrix = camera.data.viewMatrix?.buffer;
        if (!viewMatrix) return null;
        const axes = getScreenAxes(viewMatrix, GIZMO_SIZE);
        const threshold = 18;
        
        // Check axes
        for (const axis of ['x', 'y', 'z']) {
            const ax = axes[axis];
            if (distToSegment(x, y, cx, cy, cx + ax.x, cy + ax.y) < threshold) return axis;
        }
        
        // Check planes
        const ps = GIZMO_SIZE * 0.25;
        for (const plane of ['xy', 'xz', 'yz']) {
            const a = axes[plane[0]], b = axes[plane[1]];
            if (pointInQuad(x - cx, y - cy, 0, 0, a.x*ps, a.y*ps, a.x*ps+b.x*ps, a.y*ps+b.y*ps, b.x*ps, b.y*ps)) {
                return plane;
            }
        }
    } else if (currentTool === 'rotate') {
        const radius = GIZMO_SIZE;
        const threshold = 18;
        
        // View ring
        if (Math.abs(dist - radius * 1.15) < threshold) return 'view';
        
        // Axis rings
        const viewMatrix = camera.data.viewMatrix?.buffer;
        if (viewMatrix) {
            for (const axis of ['x', 'y', 'z']) {
                if (getDistToRing(x, y, cx, cy, radius, axis, viewMatrix) < threshold) return axis;
            }
        }
    }
    return null;
}

function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx*dx + dy*dy;
    if (len2 < 1) return Math.sqrt((px-x1)**2 + (py-y1)**2);
    const t = Math.max(0, Math.min(1, ((px-x1)*dx + (py-y1)*dy) / len2));
    return Math.sqrt((px - (x1 + t*dx))**2 + (py - (y1 + t*dy))**2);
}

function pointInQuad(px, py, x1, y1, x2, y2, x3, y3, x4, y4) {
    // Simple bounding box check
    const minX = Math.min(x1, x2, x3, x4) - 5, maxX = Math.max(x1, x2, x3, x4) + 5;
    const minY = Math.min(y1, y2, y3, y4) - 5, maxY = Math.max(y1, y2, y3, y4) + 5;
    return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

function getDistToRing(mx, my, cx, cy, radius, axis, viewMatrix) {
    let minDist = Infinity;
    for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        let p;
        if (axis === 'x') p = { x: 0, y: Math.cos(a), z: Math.sin(a) };
        else if (axis === 'y') p = { x: Math.cos(a), y: 0, z: Math.sin(a) };
        else p = { x: Math.cos(a), y: Math.sin(a), z: 0 };
        
        const sx = viewMatrix[0]*p.x + viewMatrix[4]*p.y + viewMatrix[8]*p.z;
        const sy = viewMatrix[1]*p.x + viewMatrix[5]*p.y + viewMatrix[9]*p.z;
        const dist = Math.sqrt((mx - (cx + sx*radius))**2 + (my - (cy - sy*radius))**2);
        if (dist < minDist) minDist = dist;
    }
    return minDist;
}


// ============== Transform Calculation & Application ==============

function calculatePreviewTranslation(dx, dy) {
    camera.update();
    const viewMatrix = camera.data.viewMatrix?.buffer;
    if (!viewMatrix) return;
    
    const axes = getScreenAxes(viewMatrix, 1);
    const scale = 0.01; // World units per pixel
    
    previewTranslation = { x: 0, y: 0, z: 0 };
    
    // Note: dy is negated because screen Y is inverted
    if (activeAxis === 'x' || activeAxis === 'xy' || activeAxis === 'xz') {
        const ax = axes.x, len = Math.sqrt(ax.x**2 + ax.y**2);
        if (len > 0.01) previewTranslation.x = (dx * ax.x - dy * ax.y) / len * scale;
    }
    if (activeAxis === 'y' || activeAxis === 'xy' || activeAxis === 'yz') {
        const ax = axes.y, len = Math.sqrt(ax.x**2 + ax.y**2);
        if (len > 0.01) previewTranslation.y = (dx * ax.x - dy * ax.y) / len * scale;
    }
    if (activeAxis === 'z' || activeAxis === 'xz' || activeAxis === 'yz') {
        const ax = axes.z, len = Math.sqrt(ax.x**2 + ax.y**2);
        if (len > 0.01) previewTranslation.z = (dx * ax.x - dy * ax.y) / len * scale;
    }
}

function calculatePreviewRotation(x, y) {
    const cx = gizmoScreenPos.x, cy = gizmoScreenPos.y;
    
    if (activeAxis === 'view') {
        // For view rotation, use simple screen-space angle
        const startAngle = Math.atan2(dragStartPos.y - cy, dragStartPos.x - cx);
        const currentAngle = Math.atan2(y - cy, x - cx);
        let angle = (currentAngle - startAngle) * 180 / Math.PI;
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        previewRotationAngle = angle;
    } else {
        // For axis rotation, calculate based on movement along the ring
        // Use the perpendicular direction to the axis for rotation
        camera.update();
        const viewMatrix = camera.data.viewMatrix?.buffer;
        if (!viewMatrix) return;
        
        // Get the axis direction in screen space
        let axisDir;
        if (activeAxis === 'x') axisDir = { x: 1, y: 0, z: 0 };
        else if (activeAxis === 'y') axisDir = { x: 0, y: 1, z: 0 };
        else axisDir = { x: 0, y: 0, z: 1 };
        
        // Transform axis to screen space
        const screenAxisX = viewMatrix[0]*axisDir.x + viewMatrix[4]*axisDir.y + viewMatrix[8]*axisDir.z;
        const screenAxisY = -(viewMatrix[1]*axisDir.x + viewMatrix[5]*axisDir.y + viewMatrix[9]*axisDir.z);
        
        // Calculate rotation based on circular motion around gizmo center
        const startAngle = Math.atan2(dragStartPos.y - cy, dragStartPos.x - cx);
        const currentAngle = Math.atan2(y - cy, x - cx);
        let angle = (currentAngle - startAngle) * 180 / Math.PI;
        
        // Determine rotation direction based on axis orientation
        // If axis is pointing towards camera, invert the rotation
        const axisZ = viewMatrix[2]*axisDir.x + viewMatrix[6]*axisDir.y + viewMatrix[10]*axisDir.z;
        if (axisZ < 0) angle = -angle;
        
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        previewRotationAngle = angle;
    }
}

function applyTranslation() {
    if (!currentSplat?.data || !transformBasePositions) return;
    
    const positions = currentSplat.data.positions;
    const tx = previewTranslation.x, ty = previewTranslation.y, tz = previewTranslation.z;
    
    for (const idx of selectedIndices) {
        positions[idx * 3] = transformBasePositions[idx * 3] + tx;
        positions[idx * 3 + 1] = transformBasePositions[idx * 3 + 1] + ty;
        positions[idx * 3 + 2] = transformBasePositions[idx * 3 + 2] + tz;
    }
    
    // Update GPU
    currentSplat.data.changed = true;
    scene.removeObject(currentSplat);
    scene.addObject(currentSplat);
    
    // Update originals
    originalPositions = new Float32Array(positions);
    console.log('[Gizmo] Applied translation:', tx.toFixed(4), ty.toFixed(4), tz.toFixed(4));
}

function applyRotation() {
    if (!currentSplat?.data || !transformBasePositions || !transformBaseRotations) return;
    
    const angleRad = previewRotationAngle * Math.PI / 180;
    let rx = 0, ry = 0, rz = 0;
    
    if (activeAxis === 'x') rx = angleRad;
    else if (activeAxis === 'y') ry = angleRad;
    else if (activeAxis === 'z') rz = angleRad;
    else if (activeAxis === 'view') {
        camera.update();
        const vm = camera.data.viewMatrix?.buffer;
        if (vm) { rx = -vm[2] * angleRad; ry = -vm[6] * angleRad; rz = -vm[10] * angleRad; }
    }
    
    const q = SPLAT.Quaternion.FromEuler(new SPLAT.Vector3(rx, ry, rz));
    const rm = createRotationMatrix(q);
    
    const positions = currentSplat.data.positions;
    const rotations = currentSplat.data.rotations;
    const px = gizmoCenter.x, py = gizmoCenter.y, pz = gizmoCenter.z;
    
    for (const idx of selectedIndices) {
        // Rotate position around center
        const dx = transformBasePositions[idx*3] - px;
        const dy = transformBasePositions[idx*3+1] - py;
        const dz = transformBasePositions[idx*3+2] - pz;
        
        positions[idx*3] = rm[0]*dx + rm[1]*dy + rm[2]*dz + px;
        positions[idx*3+1] = rm[3]*dx + rm[4]*dy + rm[5]*dz + py;
        positions[idx*3+2] = rm[6]*dx + rm[7]*dy + rm[8]*dz + pz;
        
        // Rotate gaussian orientation
        const qw = transformBaseRotations[idx*4];
        const qx = transformBaseRotations[idx*4+1];
        const qy = transformBaseRotations[idx*4+2];
        const qz = transformBaseRotations[idx*4+3];
        const oldQ = new SPLAT.Quaternion(qx, qy, qz, qw);
        const newQ = q.multiply(oldQ);
        rotations[idx*4] = newQ.w;
        rotations[idx*4+1] = newQ.x;
        rotations[idx*4+2] = newQ.y;
        rotations[idx*4+3] = newQ.z;
    }
    
    // Update GPU
    currentSplat.data.changed = true;
    scene.removeObject(currentSplat);
    scene.addObject(currentSplat);
    
    // Update originals
    originalPositions = new Float32Array(positions);
    originalRotations = new Float32Array(rotations);
    console.log('[Gizmo] Applied rotation:', previewRotationAngle.toFixed(1), '° around', activeAxis);
}

function createRotationMatrix(q) {
    const x = q.x, y = q.y, z = q.z, w = q.w;
    const x2 = x+x, y2 = y+y, z2 = z+z;
    const xx = x*x2, xy = x*y2, xz = x*z2;
    const yy = y*y2, yz = y*z2, zz = z*z2;
    const wx = w*x2, wy = w*y2, wz = w*z2;
    return [1-(yy+zz), xy-wz, xz+wy, xy+wz, 1-(xx+zz), yz-wx, xz-wy, yz+wx, 1-(xx+yy)];
}


// ============== Selection & Point Operations ==============

function createProjectionContext() {
    if (!camera || !canvas) return null;
    camera.update();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const fx = Number(camera.data?.fx);
    const fy = Number(camera.data?.fy);
    const m = camera.data.viewMatrix?.buffer;
    if (!m || !Number.isFinite(fx) || !Number.isFinite(fy) || w <= 0 || h <= 0) return null;
    return { w, h, fx, fy, m };
}

function projectPointWithContext(x, y, z, projectionContext) {
    if (!projectionContext) return null;
    const { w, h, fx, fy, m } = projectionContext;
    const vx = m[0]*x + m[4]*y + m[8]*z + m[12];
    const vy = m[1]*x + m[5]*y + m[9]*z + m[13];
    const vz = m[2]*x + m[6]*y + m[10]*z + m[14];
    if (vz <= 0.01) return null;
    return { x: (vx * fx / vz) + w/2, y: (vy * fy / vz) + h/2, depth: vz };
}

function projectPoint(pos, projectionContext = null) {
    if (!pos) return null;
    const context = projectionContext || createProjectionContext();
    if (!context) return null;
    return projectPointWithContext(pos.x, pos.y, pos.z, context);
}

function selectPointsInRect(x1, y1, x2, y2, add) {
    if (!currentSplat?.data?.positions) return;
    camera.update();
    const minX = Math.min(x1,x2), maxX = Math.max(x1,x2), minY = Math.min(y1,y2), maxY = Math.max(y1,y2);
    if (!add) selectedIndices.clear();
    const pos = currentSplat.data.positions, count = pos.length / 3;
    for (let i = 0; i < count; i++) {
        const s = projectPoint({ x: pos[i*3], y: pos[i*3+1], z: pos[i*3+2] });
        if (s && s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY) selectedIndices.add(i);
    }
    updateStatus();
}

function selectPointsInLasso(points, add) {
    if (!currentSplat?.data?.positions || points.length < 3) return;
    camera.update();
    if (!add) selectedIndices.clear();
    const pos = currentSplat.data.positions, count = pos.length / 3;
    for (let i = 0; i < count; i++) {
        const s = projectPoint({ x: pos[i*3], y: pos[i*3+1], z: pos[i*3+2] });
        if (s && isPointInPolygon(s.x, s.y, points)) selectedIndices.add(i);
    }
    updateStatus();
}

function isPointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

function deleteSelected() {
    if (!currentSplat?.data || selectedIndices.size === 0) return;
    const data = currentSplat.data, oldCount = data.vertexCount, newCount = oldCount - selectedIndices.size;
    if (newCount <= 0) return;

    const newPos = new Float32Array(newCount * 3);
    const newScales = new Float32Array(newCount * 3);
    const newRots = new Float32Array(newCount * 4);
    const newColors = new Uint8Array(newCount * 4);

    let ni = 0;
    for (let i = 0; i < oldCount; i++) {
        if (selectedIndices.has(i)) continue;
        newPos[ni*3] = data.positions[i*3]; newPos[ni*3+1] = data.positions[i*3+1]; newPos[ni*3+2] = data.positions[i*3+2];
        newScales[ni*3] = data.scales[i*3]; newScales[ni*3+1] = data.scales[i*3+1]; newScales[ni*3+2] = data.scales[i*3+2];
        newRots[ni*4] = data.rotations[i*4]; newRots[ni*4+1] = data.rotations[i*4+1]; newRots[ni*4+2] = data.rotations[i*4+2]; newRots[ni*4+3] = data.rotations[i*4+3];
        newColors[ni*4] = data.colors[i*4]; newColors[ni*4+1] = data.colors[i*4+1]; newColors[ni*4+2] = data.colors[i*4+2]; newColors[ni*4+3] = data.colors[i*4+3];
        ni++;
    }

    const newSplat = new SPLAT.Splat(new SPLAT.SplatData(newCount, newPos, newRots, newScales, newColors));
    newSplat.position = currentSplat.position; newSplat.rotation = currentSplat.rotation; newSplat.scale = currentSplat.scale;
    scene.removeObject(currentSplat); scene.addObject(newSplat); currentSplat = newSplat;
    originalScales = new Float32Array(newScales); originalPositions = new Float32Array(newPos);
    originalColors = new Uint8Array(newColors); originalRotations = new Float32Array(newRots);
    selectedIndices.clear(); updateStatus();
}

function invertSelection() {
    if (!currentSplat?.data) return;
    const count = currentSplat.data.positions.length / 3;
    const newSel = new Set();
    for (let i = 0; i < count; i++) if (!selectedIndices.has(i)) newSel.add(i);
    selectedIndices = newSel; updateStatus();
}

function clearSelection() {
    selectedIndices.clear(); clearGizmo(); updateStatus();
}

function updateStatus() {
    const count = currentSplat?.data?.positions?.length / 3 || 0;
    const sel = selectedIndices.size;
    let text = `总点数: ${Math.floor(count)}`;
    if (sel > 0) text += ` | 已选中: ${sel}`;
    text += ' | V:视角 R:矩形 L:套索 G:移动 T:旋转 DEL:删除';

    if (centerPickMode) text += ' | Pick center: click a gaussian point';
    if (statusText) statusText.textContent = text;
    highlightSelection();
    
    // 鍚屾鍒?D鐩告満鎺у埗闈㈡澘
    syncViewerToCameraPanel();
}

function highlightSelection() {
    if (!currentSplat?.data?.colors || !originalColors) return;
    const colors = currentSplat.data.colors, count = currentSplat.data.vertexCount;
    let changed = false;
    for (let i = 0; i < count; i++) {
        if (selectedIndices.has(i)) {
            // 鍗婇€忔槑缁胯壊瑕嗙洊锛屼繚鐣欏師鑹插彲瑙?(70%鍘熻壊 + 30%缁胯壊)
            const origR = originalColors[i*4];
            const origG = originalColors[i*4+1];
            const origB = originalColors[i*4+2];
            const origA = originalColors[i*4+3];
            const newR = Math.round(origR * 0.7 + 50 * 0.3);
            const newG = Math.round(origG * 0.7 + 255 * 0.3);
            const newB = Math.round(origB * 0.7 + 50 * 0.3);
            if (colors[i*4] !== newR || colors[i*4+1] !== newG || colors[i*4+2] !== newB) {
                colors[i*4] = newR; colors[i*4+1] = newG; colors[i*4+2] = newB; colors[i*4+3] = origA; changed = true;
            }
        } else {
            if (colors[i*4] !== originalColors[i*4] || colors[i*4+1] !== originalColors[i*4+1] || colors[i*4+2] !== originalColors[i*4+2]) {
                colors[i*4] = originalColors[i*4]; colors[i*4+1] = originalColors[i*4+1]; colors[i*4+2] = originalColors[i*4+2]; colors[i*4+3] = originalColors[i*4+3]; changed = true;
            }
        }
    }
    if (changed) { currentSplat.data.changed = true; scene.removeObject(currentSplat); scene.addObject(currentSplat); }
}


// ============== Camera & Scale ==============

/**
 * 浠ョ敾闈腑蹇冧负杞村簲鐢ㄦ按骞虫牎姝ｏ紙roll锛?
 * 鏍规嵁褰撳墠 X/Y 瑙掑害纭畾鐨勮鍥惧钩闈紝缁曡绾胯酱锛堢浉鏈衡啋鐩爣锛夋棆杞紝闈炲浐瀹氭柟鍚?
 * @param {object} [overrideTarget] - 鍙€夛紝鎸囧畾瑙傚療涓績 {x,y,z}锛屽 orbitTarget
 */
function applyRollToCamera(overrideTarget) {
    if (!camera) return;
    const target = cloneCenter(overrideTarget) || getActiveOrbitCenter();
    if (!target) return;
    const dx = target.x - camera.position.x;
    const dy = target.y - camera.position.y;
    const dz = target.z - camera.position.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.001) return;

    // Build a stable base orientation from current camera position and target center.
    // This avoids frame-by-frame roll accumulation that causes uncontrolled spinning.
    const baseQuat = SPLAT.Quaternion.FromEuler(
        new SPLAT.Vector3(
            Math.asin(-dy / len),
            Math.atan2(dx / len, dz / len),
            0
        )
    );

    const rollDeg = Math.max(-90, Math.min(90, Number(cameraParams.roll) || 0));
    if (Math.abs(rollDeg) < 0.01) {
        camera.rotation = baseQuat;
        return;
    }

    const axis = new SPLAT.Vector3(dx / len, dy / len, dz / len);
    const rollQuat = SPLAT.Quaternion.FromAxisAngle(axis, CT.degToRad(rollDeg));
    camera.rotation = rollQuat.multiply(baseQuat);
}

function updateCameraFromOrbit() {
    if (!customOrbitEnabled) return;
    // 涓嶨Splat OrbitControls淇濇寔涓€鑷达紙閫嗘椂閽堟柟鍚戯級锛?
    // x = target.x - distance * sin(yaw) * cos(pitch)  // 閫嗘椂閽堝彇鍙?
    // y = target.y - distance * sin(pitch)
    // z = target.z - distance * cos(yaw) * cos(pitch)
    const bx = orbitTarget.x - orbitDistance * Math.sin(orbitYaw) * Math.cos(orbitPitch);  // 閫嗘椂閽堝彇鍙?
    const by = orbitTarget.y - orbitDistance * Math.sin(orbitPitch);
    const bz = orbitTarget.z - orbitDistance * Math.cos(orbitYaw) * Math.cos(orbitPitch);
    camera.position.x = bx; camera.position.y = by; camera.position.z = bz;
    const lx = orbitTarget.x - camera.position.x;
    const ly = orbitTarget.y - camera.position.y;
    const lz = orbitTarget.z - camera.position.z;
    const len = Math.sqrt(lx*lx + ly*ly + lz*lz);
    if (len > 0.001) {
        camera.rotation = SPLAT.Quaternion.FromEuler(new SPLAT.Vector3(Math.asin(-ly/len), Math.atan2(lx/len, lz/len), 0));
    }
    camera.update();
}

function resetCamera() {
    customOrbitEnabled = false; controls.enabled = true;
    endControlsRightPanTracking();
    controlsRightPanNeedsFinalize = false;
    controlsRightPanStartCameraPos = null;
    controlsRightPanStartCenter = null;
    setCenterPickMode(false);
    // 閲嶇疆姣斾緥鍒板師濮嬪昂瀵?
    setAspectRatio('original');
    
    // 閲嶇疆鐩告満鍒板垵濮嬩綅缃紙浣跨敤淇濆瓨鐨刬nitialCameraData锛?
    if (camera && controls && initialCameraData) {
        // 鐩存帴浣跨敤淇濆瓨鐨勫垵濮嬬浉鏈烘暟鎹紝纭繚姝ｇ‘杩樺師鍒板姞杞芥椂鐨勪綅缃?
        camera.position.x = initialCameraData.position.x;
        camera.position.y = initialCameraData.position.y;
        camera.position.z = initialCameraData.position.z;
        if (initialCameraData.fx) camera.data.fx = initialCameraData.fx;
        if (initialCameraData.fy) camera.data.fy = initialCameraData.fy;
        if (initialCameraData.target) {
            controls.setCameraTarget(initialCameraData.target);
            currentOrbitTarget = { x: initialCameraData.target.x, y: initialCameraData.target.y, z: initialCameraData.target.z };
        }
        const savedDampening = controls.dampening;
        controls.dampening = 1;
        controls.update();
        controls.dampening = savedDampening;
        
        cameraParams.targetCenter = {
            x: initialCameraData.target.x,
            y: initialCameraData.target.y,
            z: initialCameraData.target.z
        };
        // 浠庡疄闄呯浉鏈轰綅缃噸鏂拌绠楄搴︼紝閬垮厤纭紪鐮?0/0/5 涓庡垵濮嬪鍙備綅缃笉绗?
        const actualParams = calculateCameraParams();
        if (actualParams) {
            cameraParams.azimuth = actualParams.azimuth;
            cameraParams.elevation = actualParams.elevation;
        }
        cameraParams.distance = DEFAULT_CAMERA_DISTANCE;
        cameraParams.roll = 0;
        cameraParams.customOrbitCenter = null;
        cameraParams.orbitCenter = cloneCenter(currentOrbitTarget) || getDefaultOrbitCenter();
        updateOrbitCenterInputs(cameraParams.orbitCenter);
    }
    if (rollSlider) rollSlider.value = 0;
    if (rollInput) rollInput.value = 0;
    rememberCurrentCameraPositionForParams();
    
    // 閲嶇疆楂樻柉缂╂斁婊戝潡鍒伴粯璁ゅ€?.3
    const defaultGaussianScale = DEFAULT_GAUSSIAN_SCALE;
    if (scaleSlider) scaleSlider.value = defaultGaussianScale;
    if (scaleInput) scaleInput.value = defaultGaussianScale;
    updateGaussianScale(defaultGaussianScale);
    
    // 閲嶇疆鐒﹁窛婊戝潡鍒板垵濮嬪€?
    focalLengthSlider.value = initialFocalLength;
    focalLengthValue.value = initialFocalLength;
    updateFocalLength(initialFocalLength);
    // 閲嶇疆娣卞害鑼冨洿婊戝潡鍒板垵濮嬪€?
    depthRangeSlider.value = 5;
    if (depthRangeValue) depthRangeValue.textContent = '全部';
    updateDepthRange(Infinity);
    // 閲嶇疆铏氭嫙濮挎€佺悆瑙掑害
    resetVirtualOrbitBall();
    
    // 浠庡綋鍓嶇浉鏈轰綅缃紙宸茬敱 initialCameraData 鎭㈠锛夊悓姝ュ埌3D鎺у埗闈㈡澘
    syncViewerToCameraPanel();
    
    // 鏇存柊鍙充晶3D闈㈡澘鐨勭缉鏀炬粦鍧楀拰杈撳叆妗嗭紙threeScene 鍦ㄥ悓涓€ iframe 绐楀彛鍐咃級
        try {
            if (window.threeScene?.reset) {
                window.threeScene.reset(cameraParams.azimuth, cameraParams.elevation, cameraParams.distance, cameraParams.roll || 0);
        } else {
            const zoomSlider = document.getElementById('zoomSlider');
            const zoomInput = document.getElementById('zoomInput');
            if (zoomSlider) {
                zoomSlider.value = DEFAULT_CAMERA_DISTANCE;
                zoomSlider.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (zoomInput) {
                zoomInput.value = DEFAULT_CAMERA_DISTANCE;
                zoomInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    } catch (e) {
        console.warn('[GaussianViewer] Failed to update zoom controls:', e);
    }
    
    updateStatus();
}

// 娓呴櫎鍘嗗彶闀滃ご鍒楄〃锛堜緵鍘嗗彶闈㈡澘鐨勯噸缃寜閽皟鐢級
window.clearCameraHistory = function() {
    cameraHistory = [];
    renderCameraHistory();
    if (typeof nodeId !== 'undefined' && nodeId != null) {
        try {
            window.parent.postMessage({ type: 'RESET_CAMERA_CACHE', nodeId, timestamp: Date.now() }, TARGET_ORIGIN);
        } catch (e) {}
    }
};

function areSameHistoryPose(a, b) {
    if (!a || !b) return false;
    const epsilon = 1e-4;
    return Math.abs((Number(a.azimuth) || 0) - (Number(b.azimuth) || 0)) < epsilon
        && Math.abs((Number(a.elevation) || 0) - (Number(b.elevation) || 0)) < epsilon
        && Math.abs((Number(a.distance) || 0) - (Number(b.distance) || 0)) < epsilon
        && Math.abs((Number(a.roll) || 0) - (Number(b.roll) || 0)) < epsilon
        && Math.abs((Number(a.scale) || DEFAULT_GAUSSIAN_SCALE) - (Number(b.scale) || DEFAULT_GAUSSIAN_SCALE)) < epsilon
        && String(a.aspectRatio || 'original') === String(b.aspectRatio || 'original');
}

function computeCameraPoseFromView(targetCenter) {
    if (!camera || !targetCenter) return null;
    try {
        const pose = CT.GSplatAdapter.fromGSplatPosition(
            camera.position.x,
            camera.position.y,
            camera.position.z,
            targetCenter
        );
        if (!pose) return null;
        const azimuth = Number(pose.azimuth);
        const elevation = Number(pose.elevation);
        const distance = Number(pose.zoom);
        if (!Number.isFinite(azimuth) || !Number.isFinite(elevation) || !Number.isFinite(distance)) {
            return null;
        }
        return { azimuth, elevation, distance };
    } catch (e) {
        console.warn('[GaussianViewer] Failed to compute camera pose from view:', e);
        return null;
    }
}

function getCurrentCameraSnapshot() {
    const orbitCenter = cloneCenter(getOrbitCenter()) || cloneCenter(getActiveOrbitCenter()) || { x: 0, y: 0, z: 0 };
    const pose = computeCameraPoseFromView(orbitCenter);
    const fallback = calculateCameraParams();
    const azimuth = Number.isFinite(pose?.azimuth) ? pose.azimuth : Number(fallback?.azimuth || 0);
    const elevation = Number.isFinite(pose?.elevation) ? pose.elevation : Number(fallback?.elevation || 0);
    const distance = getSliderZoom();
    const roll = Number(cameraParams?.roll);
    const safeRoll = Number.isFinite(roll) ? roll : 0;
    const safeDistance = Number.isFinite(distance) ? distance : DEFAULT_CAMERA_DISTANCE;

    return {
        position: camera ? { x: camera.position.x, y: camera.position.y, z: camera.position.z } : null,
        azimuth,
        elevation,
        distance: safeDistance,
        roll: safeRoll,
        scale: Number.isFinite(Number(currentScale)) ? Number(currentScale) : DEFAULT_GAUSSIAN_SCALE,
        aspectRatio: typeof currentAspectRatio === 'string' && currentAspectRatio.trim() ? currentAspectRatio : 'original',
        outputWidth: Number.isFinite(Number(outputWidth)) ? Math.round(Number(outputWidth)) : originalOutputWidth,
        outputHeight: Number.isFinite(Number(outputHeight)) ? Math.round(Number(outputHeight)) : originalOutputHeight,
        description: CT.generateCameraDescription(Math.round(azimuth), Math.round(elevation), safeDistance),
        orbitCenter: cloneCenter(orbitCenter),
        target: cloneCenter(orbitCenter),
    };
}

function getNextHistorySeq() {
    let maxSeq = 0;
    let hasExplicitSeq = false;
    for (const entry of cameraHistory) {
        const seq = Number(entry?.seq);
        if (!Number.isFinite(seq) || seq <= 0) continue;
        hasExplicitSeq = true;
        if (seq > maxSeq) maxSeq = seq;
    }
    if (!hasExplicitSeq) {
        return cameraHistory.length + 1;
    }
    return Math.floor(maxSeq) + 1;
}

function resequenceCameraHistory(entries) {
    if (!Array.isArray(entries)) return [];

    const normalized = entries
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({ ...entry }));

    let nextSeq = 1;
    for (let index = normalized.length - 1; index >= 0; index -= 1) {
        normalized[index].seq = nextSeq;
        nextSeq += 1;
    }
    return normalized;
}

function buildCurrentCameraHistoryEntry() {
    return {
        ...getCurrentCameraSnapshot(),
        seq: getNextHistorySeq(),
        timestamp: Date.now() / 1000,
    };
}

function prependCameraHistoryEntry(entry) {
    if (!entry) return false;
    if (cameraHistory.length > 0 && areSameHistoryPose(cameraHistory[0], entry)) {
        return false;
    }
    cameraHistory.unshift(entry);
    if (cameraHistory.length > HISTORY_MAX_ITEMS) {
        cameraHistory = cameraHistory.slice(0, HISTORY_MAX_ITEMS);
    }
    renderCameraHistory();
    return true;
}

window.addCurrentCameraToHistory = function() {
    const entry = buildCurrentCameraHistoryEntry();
    const added = prependCameraHistoryEntry(entry);
    if (!added) return;
    if (typeof nodeId !== 'undefined' && nodeId != null) {
        try {
            window.parent.postMessage({
                type: 'ADD_CAMERA_HISTORY',
                nodeId,
                timestamp: Date.now(),
                cameraState: entry,
            }, TARGET_ORIGIN);
        } catch (e) {
            console.warn('[GaussianViewer] Failed to post ADD_CAMERA_HISTORY:', e);
        }
    }
};

window.deleteCameraHistoryEntry = async function(entry) {
    const seqRaw = Number(entry?.seq);
    const seq = Number.isFinite(seqRaw) && seqRaw > 0 ? Math.floor(seqRaw) : null;
    const nextHistory = seq === null
        ? cameraHistory.filter((item) => item !== entry)
        : cameraHistory.filter((item) => Math.floor(Number(item?.seq)) !== seq);

    if (nextHistory.length === cameraHistory.length) {
        return;
    }

    const previousHistory = cameraHistory.map((item) => ({ ...item }));
    cameraHistory = resequenceCameraHistory(nextHistory);
    renderCameraHistory();

    if (seq === null || typeof nodeId === 'undefined' || nodeId == null) {
        return;
    }

    try {
        const response = await fetch('/gaussian_viewer/delete_history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                node_id: String(nodeId),
                seq,
            }),
        });
        const result = await response.json();
        if (!response.ok || result?.success === false) {
            throw new Error(result?.error || `HTTP ${response.status}`);
        }

        if (Array.isArray(result.history)) {
            cameraHistory = resequenceCameraHistory(result.history.slice(0, HISTORY_MAX_ITEMS));
            renderCameraHistory();
        }
    } catch (e) {
        console.warn('[GaussianViewer] Failed to delete history entry:', e);
        cameraHistory = previousHistory;
        renderCameraHistory();
    }
};

function updateFocalLength(value) {
    applyFocalLengthToCamera(value);
        // 灏嗘憚褰辩劍璺?mm)杞崲涓哄儚绱犵劍璺?
        // 鍋囪浼犳劅鍣ㄥ搴︿负36mm(35mm鑳剁墖鏍囧噯)
        // 鍍忕礌鐒﹁窛 = 鐢诲竷瀹藉害 * 鎽勫奖鐒﹁窛 / 浼犳劅鍣ㄥ搴?
}

function updateDepthRange(value) {
    setCameraClipRange(0.01, value === Infinity ? CAMERA_FAR_ALL : value);
    // 鏍规嵁娣卞害鑼冨洿杩囨护楂樻柉鐐圭殑閫忔槑搴︼紙閫忔槑搴﹀瓨鍌ㄥ湪colors鐨刟lpha閫氶亾锛?
    if (currentSplat && currentSplat.data && currentSplat.data.colors && originalColors) {
        const colors = currentSplat.data.colors;
        const positions = currentSplat.data.positions;
        const cameraPosition = camera?.position || { x: 0, y: 0, z: 0 };
        
        for (let i = 0; i < currentSplat.data.vertexCount; i++) {
            const posIdx = i * 3;
            const colorIdx = i * 4;
            if (positions && posIdx + 2 < positions.length && colorIdx + 3 < colors.length) {
                // Infinity琛ㄧず鏄剧ず鍏ㄩ儴锛屼笉瑁佸垏
                if (value === Infinity) {
                    colors[colorIdx + 3] = originalColors[colorIdx + 3]; // 鎭㈠鍘熷閫忔槑搴?
                } else {
                    const dx = positions[posIdx] - cameraPosition.x;
                    const dy = positions[posIdx + 1] - cameraPosition.y;
                    const dz = positions[posIdx + 2] - cameraPosition.z;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    
                    // 鏍规嵁娣卞害鑼冨洿璋冩暣閫忔槑搴︼紙alpha閫氶亾鏄4涓瓧鑺傦級
                    if (dist > value) {
                        colors[colorIdx + 3] = 0; // 瓒呭嚭娣卞害鑼冨洿鐨勯珮鏂偣璁句负閫忔槑
                    } else {
                        colors[colorIdx + 3] = originalColors[colorIdx + 3]; // 鎭㈠鍘熷閫忔槑搴?
                    }
                }
            }
        }
        currentSplat.data.changed = true;
        scene.removeObject(currentSplat);
        scene.addObject(currentSplat);
    }
}

function updateGaussianScale(newScale) {
    let value = parseFloat(newScale);
    if (!Number.isFinite(value)) value = currentScale || 1.0;
    value = Math.max(0.1, Math.min(4, value));
    value = Number(value.toFixed(1));
    currentScale = value;
    if (scaleInput) scaleInput.value = value.toFixed(1);
    if (scaleSlider) scaleSlider.value = value.toFixed(1);
    if (currentSplat?.data?.scales && originalScales) {
        const scales = currentSplat.data.scales;
        for (let i = 0; i < Math.min(scales.length, originalScales.length); i++) scales[i] = originalScales[i] * value;
        currentSplat.data.changed = true; scene.removeObject(currentSplat); scene.addObject(currentSplat);
    }
}

function setCameraFromExtrinsics(ext, intr, splat) {
    if (!camera || !controls) return;
    let cx = 0, cy = 0, cz = 0;
    if (ext?.length === 4) {
        const R = [[ext[0][0],ext[0][1],ext[0][2]], [ext[1][0],ext[1][1],ext[1][2]], [ext[2][0],ext[2][1],ext[2][2]]];
        const t = [ext[0][3], ext[1][3], ext[2][3]];
        cx = -(R[0][0]*t[0] + R[1][0]*t[1] + R[2][0]*t[2]);
        cy = -(R[0][1]*t[0] + R[1][1]*t[1] + R[2][1]*t[2]);
        cz = -(R[0][2]*t[0] + R[1][2]*t[1] + R[2][2]*t[2]);
    }
    let tz = 2;
    if (intr?.length >= 2) {
        const fx = intr[0][0], fy = intr[1][1], icx = intr[0][2], icy = intr[1][2];
        const iw = icx * 2, ih = icy * 2, cw = canvas.clientWidth || 512;
        camera.data.fx = fx * cw / iw;
        camera.data.fy = fx * cw / iw;
        gaussianScaleCompensation = iw / cw;
        tz = Math.max(1, fy / ih * 2);
    }
    let tx = 0, ty = 0, oz = tz;
    if (splat?.bounds) { const c = splat.bounds.center(), s = splat.bounds.size(); tz = c.z; oz = (c.z - s.z/2) * 1.5; }
    cy = -cy;
    // 鏃犲鍙傛椂锛屽垵濮嬩綅缃榻愰粯璁ゆ瑙嗗浘锛坅z=0,el=0,zoom=5锛夛紝纭繚閲嶇疆鐩告満鑳借繕鍘熷埌姝や綅缃?
    initialCameraData = {
        position: { x: cx, y: cy, z: cz },
        target: new SPLAT.Vector3(tx, ty, oz),
        fx: camera.data.fx,
        fy: camera.data.fy
    };
    applyFocalLengthToCamera(getCurrentFocalLengthValue(initialFocalLength), { updateInitialCameraData: true });
    camera.position.x = cx; camera.position.y = cy; camera.position.z = cz;
    controls.setCameraTarget(new SPLAT.Vector3(tx, ty, oz));
    currentOrbitTarget = { x: tx, y: ty, z: oz };
    cameraParams.targetCenter = cloneCenter(currentOrbitTarget);
    if (!cameraParams.customOrbitCenter) {
        cameraParams.orbitCenter = cloneCenter(currentOrbitTarget);
    }
    updateOrbitCenterInputs(currentOrbitTarget);
}


// ============== Load & Save ==============

async function loadPLYFromData(arrayBuffer, filename, ext, intr) {
    try {
        while (scene.objects?.length > 0) scene.removeObject(scene.objects[0]);
        currentSplat = null; selectedIndices.clear();
        gaussianScaleCompensation = 1.0;
        if (intr?.length >= 2) gaussianScaleCompensation = intr[0][2] * 2 / (canvas.clientWidth || 512);
        
        const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        await SPLAT.PLYLoader.LoadAsync(url, scene);
        URL.revokeObjectURL(url);

        if (scene.objects?.length > 0) {
            currentSplat = scene.objects[scene.objects.length - 1];
            if (currentSplat.data) {
                if (currentSplat.data.positions) originalPositions = new Float32Array(currentSplat.data.positions);
                if (currentSplat.data.colors) originalColors = new Uint8Array(currentSplat.data.colors);
                if (currentSplat.data.rotations) originalRotations = new Float32Array(currentSplat.data.rotations);
                if (currentSplat.data.scales) {
                    originalScales = new Float32Array(currentSplat.data.scales.length);
                    for (let i = 0; i < currentSplat.data.scales.length; i++) {
                        originalScales[i] = currentSplat.data.scales[i] * gaussianScaleCompensation;
                        currentSplat.data.scales[i] = originalScales[i];
                    }
                    currentSplat.data.changed = true;
                }
            }
            // 鍒濆鍖栭珮鏂缉鏀句负榛樿鍊?.3
            const defaultScale = DEFAULT_GAUSSIAN_SCALE;
            scaleInput.value = defaultScale; currentScale = defaultScale; scaleSlider.value = defaultScale;
            // 搴旂敤榛樿缂╂斁
            updateGaussianScale(defaultScale);
        }
        if (ext || intr) {
            setCameraFromExtrinsics(ext, intr, currentSplat);
            const _sd = controls.dampening; controls.dampening = 1; controls.update(); controls.dampening = _sd;
        } else {
            // 鏃犲鍙傛棤鍐呭弬锛氱浉鏈烘斁鍦ㄦ柟浣嶈0搴︾殑榛樿浣嶇疆锛坺oom=5锛?
            let targetZ = 0;
            if (currentSplat?.bounds) { targetZ = currentSplat.bounds.center().z; }
            const fp = { x: 0, y: 0, z: targetZ - getRecommendedInitialCameraDistance() };
            const baseTarget = { x: 0, y: 0, z: targetZ };
            const defaultOrbitCenter = computeDefaultOrbitCenter(fp, baseTarget);
            const defaultTarget = new SPLAT.Vector3(defaultOrbitCenter.x, defaultOrbitCenter.y, defaultOrbitCenter.z);
            initialCameraData = { position: {x:fp.x, y:fp.y, z:fp.z}, target: defaultTarget, fx: camera.data?.fx, fy: camera.data?.fy };
            camera.position.x = fp.x; camera.position.y = fp.y; camera.position.z = fp.z;
            controls.setCameraTarget(defaultTarget);
            currentOrbitTarget = cloneCenter(defaultOrbitCenter);
            cameraParams.targetCenter = cloneCenter(currentOrbitTarget);
            if (!cameraParams.customOrbitCenter) {
                cameraParams.orbitCenter = cloneCenter(currentOrbitTarget);
            }
            updateOrbitCenterInputs(currentOrbitTarget);
            const savedDampening = controls.dampening;
            controls.dampening = 1;
            controls.update();
            controls.dampening = savedDampening;
        }

        // 閲嶇疆鎴栬繕鍘熺浉鏈哄弬鏁?
        if (!cameraParams.hasCache) {
            cameraParams.azimuth = 0;
            cameraParams.elevation = 0;
            cameraParams.distance = DEFAULT_CAMERA_DISTANCE;
            cameraParams.roll = 0;
            cameraParams.customOrbitCenter = null;
            cameraParams.targetCenter = cloneCenter(currentOrbitTarget) || getDefaultOrbitCenter();
            cameraParams.orbitCenter = cloneCenter(currentOrbitTarget) || getDefaultOrbitCenter();
            updateOrbitCenterInputs(cameraParams.orbitCenter);
            rememberCurrentCameraPositionForParams();
            syncViewerToCameraPanel();
        } else {
            try {
                if (pendingStartupHistoryEntry) {
                    applyCameraHistoryEntry(pendingStartupHistoryEntry);
                } else {
                    syncCameraToViewer(
                        typeof cameraParams.azimuth === 'number' ? cameraParams.azimuth : 0,
                        typeof cameraParams.elevation === 'number' ? cameraParams.elevation : 0,
                        typeof cameraParams.distance === 'number' ? cameraParams.distance : DEFAULT_CAMERA_DISTANCE,
                        cameraParams.customOrbitCenter || cameraParams.orbitCenter || null,
                        typeof cameraParams.roll === 'number' ? cameraParams.roll : 0
                    );
                }
            } catch (e) {
                console.warn('[GaussianViewer] Startup camera restore failed in loadPLYFromData:', e);
            }
        }
        pendingStartupHistoryEntry = null;

        // Each run starts with full visibility to avoid stale depth clipping from prior sessions.
        if (depthRangeSlider) depthRangeSlider.value = 5;
        if (depthRangeValue) depthRangeValue.textContent = '全部';
        updateDepthRange(Infinity);
        
        document.getElementById('infoPanel').classList.remove('hidden');
        document.getElementById('infoContent').innerHTML = `<span style="color:#6cc;">已加载</span><br><span style="color:#888;">${filename}</span>`;
        updateStatus();
        window.parent.postMessage({ type: 'MESH_LOADED', timestamp: Date.now() }, TARGET_ORIGIN);
    } catch (err) {
        console.error('[GaussianViewer] Load error:', err);
        errorEl.textContent = 'Failed to load: ' + err.message;
        errorEl.classList.remove('hidden');
        window.parent.postMessage({ type: 'MESH_ERROR', error: err.message, timestamp: Date.now() }, TARGET_ORIGIN);
    }
}

function captureScreenshot() {
    return new Promise((resolve) => {
        if (!renderer) { resolve(null); return; }
        let rawRotationForCapture = null;
        try {
            if (customOrbitEnabled) updateCameraFromOrbit();
            else {
                controls.update();
            }
            rawRotationForCapture = camera?.rotation
                ? new SPLAT.Quaternion(camera.rotation.x, camera.rotation.y, camera.rotation.z, camera.rotation.w)
                : null;
            applyRollToCamera(customOrbitEnabled ? orbitTarget : getRollTargetForRender());
            camera.update();
            renderer.render(scene, camera);
            const gl = renderer.gl || renderer._gl;
            if (!gl) {
                resolve(canvas.toDataURL('image/png'));
                return;
            }
            const gw = gl.drawingBufferWidth, gh = gl.drawingBufferHeight;
            const pixels = new Uint8Array(gw * gh * 4);
            gl.readPixels(0, 0, gw, gh, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const bg = getBackgroundRGB();
            const fc = document.createElement('canvas'); fc.width = gw; fc.height = gh;
            const fctx = fc.getContext('2d'), fid = fctx.createImageData(gw, gh);
            for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
                const si = ((gh-1-y)*gw+x)*4, di = (y*gw+x)*4, a = pixels[si+3]/255;
                fid.data[di] = Math.round(pixels[si]*a + bg.r*(1-a));
                fid.data[di+1] = Math.round(pixels[si+1]*a + bg.g*(1-a));
                fid.data[di+2] = Math.round(pixels[si+2]*a + bg.b*(1-a));
                fid.data[di+3] = 255;
            }
            fctx.putImageData(fid, 0, 0);

            // 璁＄畻绾㈡鍖哄煙 - 浣跨敤涓巙pdateRenderFrame鐩稿悓鐨勯€昏緫
            const cw = canvas.clientWidth, ch = canvas.clientHeight;
            const oa = outputWidth/outputHeight, ca = cw/ch;
            const scaleFactor = 0.8;  // 涓庣孩妗嗘樉绀轰竴鑷?

            // 璁＄畻绾㈡鍦–SS鍍忕礌涓殑灏哄
            let cssFrameW, cssFrameH;
            if (oa > ca) { cssFrameW = cw*scaleFactor; cssFrameH = cssFrameW/oa; }
            else { cssFrameH = ch*scaleFactor; cssFrameW = cssFrameH*oa; }

            // 灏咰SS鍍忕礌杞崲涓篧ebGL鍍忕礌锛堣€冭檻璁惧鍍忕礌姣旓級
            const dpr = window.devicePixelRatio || 1;
            const frameW = Math.round(cssFrameW * dpr);
            const frameH = Math.round(cssFrameH * dpr);
            const frameX = Math.round((gw - frameW) / 2);
            const frameY = Math.round((gh - frameH) / 2);

            console.log('[GaussianViewer] Screenshot crop:', frameX, frameY, frameW, frameH, 'output:', outputWidth, 'x', outputHeight);

            // 鐩存帴鎸夌孩妗嗗尯鍩熻鍒囷紝鏃犲嚭琛€绾?
            const outputCanvas = document.createElement('canvas');
            outputCanvas.width = outputWidth;
            outputCanvas.height = outputHeight;
            const outputCtx = outputCanvas.getContext('2d');
            outputCtx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
            outputCtx.fillRect(0, 0, outputWidth, outputHeight);
            outputCtx.drawImage(fc, frameX, frameY, frameW, frameH, 0, 0, outputWidth, outputHeight);
            resolve(outputCanvas.toDataURL('image/png'));
        } catch (err) {
            console.error('[GaussianViewer] Screenshot error:', err);
            resolve(null);
        } finally {
            if (rawRotationForCapture) {
                camera.rotation = rawRotationForCapture;
                camera.update();
            }
        }
    });
}

async function handleConfirm() {
    confirmBtn.disabled = true; confirmBtn.textContent = '处理中...'; cancelBtn.disabled = true;
    console.log('[GaussianViewer] handleConfirm - output size:', outputWidth, 'x', outputHeight);
    const screenshot = await captureScreenshot();
    
    // 鎹曡幏3D鐩告満鎺у埗闈㈡澘鎴浘
    let cameraPanelScreenshot = null;
    try {
        cameraPanelScreenshot = window.threeScene?.capture?.() || null;
    } catch (e) { console.warn('[GaussianViewer] 3D panel capture failed:', e); }
    
    const latestCameraSnapshot = getCurrentCameraSnapshot();
    window.parent.postMessage({
        type: 'CONFIRM_SELECTION',
        nodeId,
        screenshot,
        cameraPanelScreenshot,
        outputWidth,
        outputHeight,
        params: viewerParams,
        timestamp: Date.now(),
        cameraState: {
            ...latestCameraSnapshot,
            scale: currentScale,
        }
    }, TARGET_ORIGIN);
}

function handleCancel() {
    confirmBtn.disabled = true; cancelBtn.disabled = true; cancelBtn.textContent = '取消中...';
    const latestCameraSnapshot = getCurrentCameraSnapshot();
    window.parent.postMessage({
        type: 'CANCEL_SELECTION',
        nodeId,
        timestamp: Date.now(),
        cameraState: latestCameraSnapshot,
    }, TARGET_ORIGIN);
}

window.addEventListener('message', (event) => {
    if (!isTrustedParentMessage(event)) return;
    const { type, data, filename, extrinsics, intrinsics, node_id, params } = event.data || {};
    if (type === 'LOAD_MESH_DATA' && data) {
        nodeId = node_id; viewerParams = params || {};
        // 淇濆瓨鍘熷杈撳叆灏哄
        originalOutputWidth = params?.width || 1024;
        originalOutputHeight = params?.height || 576;
        // 榛樿浣跨敤鍘熷灏哄
        setAspectRatio('original');
        backgroundColor = params?.background || 'black'; updateBackgroundColor();
        confirmBtn.disabled = false; confirmBtn.textContent = '✓确认';
        cancelBtn.disabled = false; cancelBtn.textContent = '✕取消';
        errorEl.classList.add('hidden'); selectedIndices.clear(); setTool('orbit');

        // 濡傛灉鍚庣浼犲叆浜嗕笂涓€娆＄殑 camera_state锛屼紭鍏堢敤瀹冨垵濮嬪寲鐩告満鍙傛暟
        const historyFromServer = Array.isArray(params?.camera_history) ? params.camera_history : [];
        cameraHistory = resequenceCameraHistory(historyFromServer.slice(0, HISTORY_MAX_ITEMS));
        renderCameraHistory();
        pendingStartupHistoryEntry = cameraHistory.length > 0
            ? { ...cameraHistory[0] }
            : null;

        if (pendingStartupHistoryEntry) {
            try {
                applyCachedCameraState(pendingStartupHistoryEntry);
            } catch (e) {
                console.warn('[GaussianViewer] Failed to apply startup history entry:', e);
                pendingStartupHistoryEntry = null;
                resetCachedCameraParams();
            }
        } else {
            resetCachedCameraParams();
        }
        lastCameraPositionForParams = null;
        updateOrbitCenterInputs(cameraParams.customOrbitCenter || cameraParams.orbitCenter || currentOrbitTarget);

        loadPLYFromData(data, filename || 'gaussian.ply', extrinsics, intrinsics);
    }
});

// ============== Bidirectional Sync with 3D Control Panel ==============

/**
 * 浠庣浉鏈轰綅缃拰鏃嬭浆鎺ㄧ畻 OrbitControls 鐨勫疄闄?orbit 涓績锛圦锛?
 * 鐢ㄤ簬鍦?handleConfirm 鏃朵繚瀛樼湡瀹炵殑瑙傚療涓績锛屼互渚夸笅娆＄簿纭鍘?
 * 鏃犲钩绉绘椂涓?currentOrbitTarget 瀹屽叏涓€鑷达紱鏈夊钩绉绘椂閫氳繃 camera.rotation 杩戜技鎺ㄧ畻
 */
function getOrbitCenter() {
    const picked = getPickedOrbitCenter();
    if (picked) return picked;
    const custom = cloneCenter(cameraParams.customOrbitCenter);
    if (custom) return custom;

    // Keep orbit center tracking independent from camera Euler decomposition.
    // Roll around the view axis can flip Euler X/Y near high azimuth and cause center drift.
    return cloneCenter(currentOrbitTarget)
        || cloneCenter(cameraParams.orbitCenter)
        || getDefaultOrbitCenter();
}

/**
 * 浠?D鎺у埗闈㈡澘鍚屾鐩告満鐘舵€佸埌 Gaussian Viewer
 * @param {number} azimuth - 鏂逛綅瑙?(0-360)
 * @param {number} elevation - 浠拌 (-30 to 90)
 * @param {number} zoom - 缂╂斁璺濈 (0-10)
 * @param {object} [orbitCenter] - 鍙€夛細鎸囧畾 orbit 涓績鐐?{x,y,z}锛屼笉浼犲垯鐢?initialCameraData.target
 * @param {number} [roll] - 姘村钩鏍℃ (-90 to 90)
 */
window.syncCameraToViewer = function(azimuth, elevation, zoom, orbitCenter, roll) {
    if (!camera || !controls) return;
    
    const rollVal = typeof roll === 'number' ? roll : (cameraParams.roll || 0);
    cameraParams.roll = Math.max(-90, Math.min(90, rollVal));
    
    // 浣跨敤浼犲叆鐨?orbitCenter锛堣繕鍘熶繚瀛樻椂鐨勮瀵熶腑蹇冿級锛屽惁鍒欑敤 initialCameraData.target
    const explicitTarget = cloneCenter(orbitCenter);
    if (explicitTarget) {
        cameraParams.customOrbitCenter = cloneCenter(explicitTarget);
        cameraParams.orbitCenter = cloneCenter(explicitTarget);
    }

    const target = explicitTarget
        || getConfiguredOrbitCenter()
        || cloneCenter(currentOrbitTarget)
        || ((initialCameraData && initialCameraData.target)
            ? { x: initialCameraData.target.x, y: initialCameraData.target.y, z: initialCameraData.target.z }
            : { x: 0, y: 0, z: 0 });
    
    // 鏇存柊褰撳墠 orbit 涓績璺熻釜锛堜緵 calculateCameraParams / getOrbitCenter 浣跨敤锛?
    currentOrbitTarget = { x: target.x, y: target.y, z: target.z };
    cameraParams.targetCenter = cloneCenter(currentOrbitTarget);
    cameraParams.orbitCenter = cloneCenter(currentOrbitTarget);
    updateOrbitCenterInputs(currentOrbitTarget);
    
    // 璁＄畻鐩爣鐩告満浣嶇疆
    const position = CT.GSplatAdapter.toGSplatPosition(azimuth, elevation, zoom, target);
    
    camera.position.x = position.x;
    camera.position.y = position.y;
    camera.position.z = position.z;
    lastCameraPositionForParams = null;
    
    // 鍏抽敭锛氬皢鏂扮浉鏈轰綅缃悓姝ヨ繘 OrbitControls 鍐呴儴鐘舵€侊紙I/d/a/Q锛?
    controls.setCameraTarget(new SPLAT.Vector3(target.x, target.y, target.z));
    
    // 涓存椂绂佺敤闃诲凹浠ョ珛鍗冲埌浣嶏紝閬垮厤浠庢棫浣嶇疆鎻掑€煎鑷撮棯鍥?
    const savedDampening = controls.dampening;
    controls.dampening = 1;
    controls.update();
    controls.dampening = savedDampening;
    
    
    // 鏇存柊鐩告満鍙傛暟鏄剧ず
    cameraParams.azimuth = azimuth;
    cameraParams.elevation = elevation;
    cameraParams.distance = zoom;
    
    forceRefreshCameraUi();
    updateStatus();
    
    console.log('[GaussianViewer] Synced from 3D panel:', { azimuth, elevation, zoom, roll: cameraParams.roll, orbitCenter: target });
};

/**
 * 浠?Gaussian Viewer 鍚屾鐩告満鐘舵€佸埌3D鎺у埗闈㈡澘
 */
function syncViewerToCameraPanel(params = null) {
    params = params || calculateCameraParams();
    if (!params) return;
    
    const isPanningCenter = controlsRightPanDragging || controlsRightPanSyncFrames > 0;
    // 鏇存柊3D鎺у埗闈㈡澘锛堝鏋滃瓨鍦級
    // 鍙抽敭骞崇Щ涓績鏃朵笉鎺ㄩ€佽搴︼紝閬垮厤3D闈㈡澘鍦ㄨ儗闈㈤檮杩戞姈鍔?涔辫浆
    if (!isPanningCenter && window.threeScene && window.threeScene.updatePositions) {
        window.threeScene.updatePositions(params.azimuth, params.elevation, params.distance, params.roll);
    }
    
    // 鏇存柊棰勮鏄剧ず锛堝彧璇伙級
    const azimuthPreview = document.getElementById('azimuthPreview');
    const elevationPreview = document.getElementById('elevationPreview');
    const zoomSlider = document.getElementById('zoomSlider');
    const zoomInput = document.getElementById('zoomInput');
    
    if (azimuthPreview) {
        azimuthPreview.textContent = Math.round(params.azimuth) + '°';
    }
    
    if (elevationPreview) {
        elevationPreview.textContent = Math.round(params.elevation) + '°';
    }
    const rollPreview = document.getElementById('rollPreview');
    if (rollPreview) rollPreview.textContent = Math.round(params.roll || 0) + '°';
    if (rollSlider) rollSlider.value = Math.round(params.roll || 0);
    if (rollInput) rollInput.value = Math.round(params.roll || 0);
    
    // 缂╂斁璺濈涓嶅啀鑷姩鏇存柊锛屼繚鎸佺敤鎴锋墜鍔ㄨ缃殑鍊?
    // zoomSlider鍜寊oomInput鐨勫€肩敱鐢ㄦ埛鎵嬪姩鎺у埗锛屼笉浠庤繖閲屽悓姝?
    
    // 鏇存柊鏄剧ず
    updateOrbitCenterInputs(getOrbitCenter() || getActiveOrbitCenter());
    updateCameraDisplay(params);
    lastCameraPanelSignature = getCameraDisplaySignature(params);
    lastCameraPanelSyncAt = performance.now();
}

/**
 * 鏇存柊鐩告満鏄剧ず淇℃伅
 */
function updateCameraDisplay(params) {
    if (!params) return;
    
    // 鏇存柊淇℃伅闈㈡澘
    const azimuthDisplay = document.getElementById('azimuthDisplay');
    const elevationDisplay = document.getElementById('elevationDisplay');
    
    if (azimuthDisplay) azimuthDisplay.textContent = Math.round(params.azimuth) + '°';
    if (elevationDisplay) elevationDisplay.textContent = Math.round(params.elevation) + '°';
    const rollDisplay = document.getElementById('rollDisplay');
    if (rollDisplay) rollDisplay.textContent = Math.round(params.roll || 0) + '°';
    
    // 鏇存柊搴曢儴棰勮锛堝彧璇伙級
    const azimuthPreview = document.getElementById('azimuthPreview');
    const elevationPreview = document.getElementById('elevationPreview');
    const rollPreview = document.getElementById('rollPreview');
    if (azimuthPreview) azimuthPreview.textContent = Math.round(params.azimuth) + '°';
    if (elevationPreview) elevationPreview.textContent = Math.round(params.elevation) + '°';
    if (rollPreview) rollPreview.textContent = Math.round(params.roll || 0) + '°';
    
    // 鏇存柊鏍囩
    const azimuthLabel = document.getElementById('azimuthLabelDisplay');
    const elevationLabel = document.getElementById('elevationLabelDisplay');
    
    if (azimuthLabel) azimuthLabel.textContent = getAzimuthLabel(params.azimuth);
    if (elevationLabel) elevationLabel.textContent = getElevationLabel(params.elevation);
    
    // 鏇存柊鎻忚堪
    const descOutput = document.getElementById('cameraDescriptionOutput');
    if (descOutput) {
        descOutput.value = generateCameraDescription(params);
    }
}

// ============== Camera History (鍘嗗彶闀滃ご) ==============

function renderCameraHistory() {
    const listEl = document.getElementById('cameraHistoryList');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!cameraHistory || cameraHistory.length === 0) {
        const empty = document.createElement('div');
        empty.style.color = '#555';
        empty.style.fontSize = '10px';
        empty.textContent = '暂无历史记录';
        listEl.appendChild(empty);
        return;
    }

    const orderedHistory = [...cameraHistory].sort((a, b) => {
        const aSeq = Number(a?.seq);
        const bSeq = Number(b?.seq);
        const aHasSeq = Number.isFinite(aSeq) && aSeq > 0;
        const bHasSeq = Number.isFinite(bSeq) && bSeq > 0;
        if (aHasSeq && bHasSeq) return aSeq - bSeq;
        if (aHasSeq) return 1;
        if (bHasSeq) return -1;
        return 0;
    });

    orderedHistory.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';

        const main = document.createElement('div');
        main.className = 'history-item-main';

        const angles = document.createElement('div');
        angles.className = 'history-angles';
        const az = Math.round(entry.azimuth ?? 0);
        const el = Math.round(entry.elevation ?? 0);
        const dist = Math.round(entry.distance ?? 5);
        const seqRaw = Number(entry.seq);
        const seq = Number.isFinite(seqRaw) && seqRaw > 0
            ? Math.floor(seqRaw)
            : (index + 1);
        angles.textContent = `#${seq}  Y:${az}°  X:${el}°  Zoom:${dist}`;

        const desc = document.createElement('div');
        desc.className = 'history-desc';
        const aspectLabel = isKnownAspectRatio(entry?.aspectRatio)
            ? entry.aspectRatio
            : (
                Number.isFinite(Number(entry?.outputWidth)) && Number.isFinite(Number(entry?.outputHeight))
                    ? `${Math.round(Number(entry.outputWidth))}x${Math.round(Number(entry.outputHeight))}`
                    : ''
            );
        const descriptionText = entry.description || '';
        desc.textContent = aspectLabel
            ? (descriptionText ? `${descriptionText} | Ratio:${aspectLabel}` : `Ratio:${aspectLabel}`)
            : descriptionText;

        main.appendChild(angles);
        main.appendChild(desc);

        const actions = document.createElement('div');
        actions.className = 'history-item-actions';

        const btn = document.createElement('button');
        btn.className = 'history-restore-btn';
        btn.textContent = '还原';
        btn.addEventListener('click', () => {
            applyCameraHistoryEntry(entry);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'history-delete-btn';
        deleteBtn.textContent = 'Del';
        deleteBtn.title = 'Delete this history shot';
        deleteBtn.addEventListener('click', () => {
            window.deleteCameraHistoryEntry(entry);
        });

        actions.appendChild(btn);
        actions.appendChild(deleteBtn);

        item.appendChild(main);
        item.appendChild(actions);
        listEl.appendChild(item);
    });
}

function applyCameraHistoryEntry(entry) {
    const azRaw = Number(entry?.azimuth);
    const elRaw = Number(entry?.elevation);
    const distRaw = Number(entry?.distance);
    const rollRaw = Number(entry?.roll);
    let az = Number.isFinite(azRaw) ? azRaw : 0;
    let el = Number.isFinite(elRaw) ? elRaw : 0;
    let dist = Number.isFinite(distRaw) ? distRaw : 5;
    const roll = Number.isFinite(rollRaw) ? rollRaw : 0;
    const scaleRaw = Number(entry?.scale);
    const scale = Number.isFinite(scaleRaw) ? scaleRaw : DEFAULT_GAUSSIAN_SCALE;
    const historyAspectRatio = typeof entry?.aspectRatio === 'string' ? entry.aspectRatio : null;
    const historyOutputWidth = Number(entry?.outputWidth);
    const historyOutputHeight = Number(entry?.outputHeight);

    const target = cloneCenter(entry?.orbitCenter)
        || cloneCenter(entry?.target)
        || cloneCenter(getOrbitCenter())
        || getDefaultOrbitCenter();
    const position = cloneCenter(entry?.position);
    applyAspectState(historyAspectRatio, historyOutputWidth, historyOutputHeight);

    // Ensure OrbitControls path is active.
    customOrbitEnabled = false;
    if (controls) controls.enabled = true;

    // Prefer exact camera position restore when available.
    if (camera && controls && target && position) {
        cameraParams.roll = roll;
        cameraParams.customOrbitCenter = cloneCenter(target);
        cameraParams.targetCenter = cloneCenter(target);
        cameraParams.orbitCenter = cloneCenter(target);
        currentOrbitTarget = cloneCenter(target);
        updateOrbitCenterInputs(target);

        camera.position.x = position.x;
        camera.position.y = position.y;
        camera.position.z = position.z;
        lastCameraPositionForParams = null;

        controls.setCameraTarget(new SPLAT.Vector3(target.x, target.y, target.z));
        const savedDampening = controls.dampening;
        controls.dampening = 1;
        controls.update();
        controls.dampening = savedDampening;

        applyRollToCamera(target);
        camera.update();

        const recalculated = calculateCameraParams();
        cameraParams.azimuth = Number.isFinite(recalculated?.azimuth) ? recalculated.azimuth : az;
        cameraParams.elevation = Number.isFinite(recalculated?.elevation) ? recalculated.elevation : el;
        cameraParams.distance = dist;
        cameraParams.roll = roll;
        updateGaussianScale(scale);

        syncViewerToCameraPanel();
        updateStatus();
        return;
    }

    // If precise position exists, derive exact spherical params from it.
    if (target && position) {
        try {
            const precise = CT.GSplatAdapter.fromGSplatPosition(position.x, position.y, position.z, target);
            if (precise) {
                const pAz = Number(precise.azimuth);
                const pEl = Number(precise.elevation);
                if (Number.isFinite(pAz)) az = pAz;
                if (Number.isFinite(pEl)) el = pEl;
            }
        } catch (e) {
            console.warn('[GaussianViewer] Failed to derive precise restore pose:', e);
        }
    }

    cameraParams.azimuth = az;
    cameraParams.elevation = el;
    cameraParams.distance = dist;
    cameraParams.roll = roll;
    syncCameraToViewer(az, el, dist, target || null, roll);
    updateGaussianScale(scale);

    const zoomSlider = document.getElementById('zoomSlider');
    const zoomInput = document.getElementById('zoomInput');
    if (zoomSlider) zoomSlider.value = String(cameraParams.distance);
    if (zoomInput) zoomInput.value = Number(cameraParams.distance).toFixed(1);
}

// 鐩戝惉鎺у埗鍣ㄥ彉鍖?- 瀹屽叏绂佺敤鍚屾锛?D闈㈡澘瀹屽叏鐙珛鎺у埗
// Gaussian Viewer鐨勬粴杞€佹嫋鍔ㄧ瓑鎿嶄綔涓嶄細褰卞搷3D鐩告満鎺у埗闈㈡澘
if (controls) {
    controls.addEventListener('change', () => {
        // 涓嶅啀鍚屾浠讳綍鍙傛暟鍒?D闈㈡澘
        // 3D鐩告満鎺у埗闈㈡澘瀹屽叏鐙珛鎺у埗鏂逛綅瑙掑拰浠拌
    });
}

initViewer();
// 鍒濆鍖栧悗绔嬪嵆鍚屾鐩告満鐘舵€佸埌3D鎺у埗闈㈡澘
setTimeout(() => {
    syncViewerToCameraPanel();
}, 100);
console.log('[GaussianViewer] Editor ready with 3D sync');

