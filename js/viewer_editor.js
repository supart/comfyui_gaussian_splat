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
const deleteBtn = document.getElementById('deleteBtn');
const invertBtn = document.getElementById('invertBtn');
const clearSelBtn = document.getElementById('clearSelBtn');
const renderFrame = document.getElementById('renderFrame');
// 相机控制元素
const cameraPosDisplay = document.getElementById('cameraPosDisplay');
const cursorPosDisplay = document.getElementById('cursorPosDisplay');
const renderFrameLabel = document.getElementById('renderFrameLabel');
// 比例选择下拉菜单元素
const aspectBtn = document.getElementById('aspectBtn');
const aspectMenu = document.getElementById('aspectMenu');
const aspectOptions = document.querySelectorAll('.aspect-option');

let scene = null, camera = null, renderer = null, controls = null;
let currentSplat = null, originalScales = null, originalPositions = null, originalColors = null, originalRotations = null, originalOpacities = null;
let gaussianScaleCompensation = 1.0, currentScale = 1.0;
let nodeId = null, viewerParams = {};
let initialCameraData = null;
let currentOrbitTarget = null;  // 跟踪 OrbitControls 当前实际 orbit 中心，与 syncCameraToViewer 保持一致
let outputWidth = 1024, outputHeight = 576;  // 默认16:9
let originalOutputWidth = 1024, originalOutputHeight = 576;  // 原始输入尺寸
let backgroundColor = 'black';
let initialFocalLength = 22;  // 初始焦距值（mm）
let initialDepthRange = 10000;  // 初始深度范围
let currentAspectRatio = 'original';  // 当前比例
const TARGET_ORIGIN =
    window.location.origin && window.location.origin !== "null"
        ? window.location.origin
        : "*";

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
let orbitDistance = 1.65;
let orbitYaw = 0, orbitPitch = 0;
let cameraOffset = { x: 0, y: 0, z: 0 };

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

// ============== Camera Parameter Labels ==============
// 方位角映射 (Azimuth) - 顺时针方向
// 0° = front (正面), 90° = right (右侧), 180° = back (背面), 270° = left (左侧)
const AZIMUTH_LABELS = [
    { min: 0, max: 22.5, label: 'front view' },           // 正面
    { min: 337.5, max: 360, label: 'front view' },        // 正面
    { min: 22.5, max: 67.5, label: 'front right side view' },   // 右前侧
    { min: 67.5, max: 112.5, label: 'right side view' },        // 右侧
    { min: 112.5, max: 157.5, label: 'back right side view' },  // 右后侧
    { min: 157.5, max: 202.5, label: 'back view' },             // 背面
    { min: 202.5, max: 247.5, label: 'back left side view' },   // 左后侧
    { min: 247.5, max: 292.5, label: 'left side view' },        // 左侧
    { min: 292.5, max: 337.5, label: 'front left side view' }   // 左前侧
];

// 仰角映射 (Elevation)
// 正角度 =俯视（从上往下看），负角度 =仰视（从下往上看）
const ELEVATION_LABELS = [
    { min: -30, max: -15, label: 'low angle' },        // 仰视（从下往上看）
    { min: -15, max: 15, label: 'eye level' },         // 平视（眼睛高度）
    { min: 15, max: 45, label: 'high angle' },         // 俯视（略微向下）
    { min: 45, max: 75, label: 'very high angle' },    // 高角度俯视
    { min: 75, max: 91, label: "bird's-eye view" }     // 鸟瞰（从上往下看）
];

// 缩放/距离映射 (Zoom)
const ZOOM_LABELS = [
    { min: 0, max: 2, label: 'wide shot' },
    { min: 2, max: 4, label: 'medium-wide shot' },
    { min: 4, max: 6, label: 'medium shot' },
    { min: 6, max: 8, label: 'medium-close shot' },
    { min: 8, max: 10, label: 'close-up shot' }
];

// 相机参数状态
let cameraParams = {
    azimuth: 0,       // Y轴：方位角 0-360，超过360归零
    elevation: 0,     // X轴：仰角 -30 to 90
    distance: 5,      // 缩放距离，默认5
    targetCenter: { x: 0, y: 0, z: 0 }  // 目标中心点
};

// 历史镜头列表（当前会话内）
let cameraHistory = [];

// 虚拟姿态球 - 累积鼠标旋转角度
let virtualOrbitBall = {
    yaw: 0,           // 水平旋转角度（弧度），左负右正
    pitch: 0,         // 垂直旋转角度（弧度），上正下负
    lastMouseX: 0,
    lastMouseY: 0,
    isDragging: false,
    initialYaw: 0,    // 初始偏移（用于重置）
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
    
    // 取景框缩小到80%，两边显示更宽的范围
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
    
    /* 相机参数面板样式 */
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
    
    /* 折叠状态 */
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
        
        // 设置最小缩放距离，防止相机穿过目标点导致方位角跳变
        // minZoom控制相机到目标点的最小距离
        controls.minZoom = 0.2;
        controls.maxZoom = 30;
        controls.zoomSpeed = 1;  // 恢复默认缩放速度
        
        // 设置初始焦距（16mm转换为像素焦距）
        const sensorWidth = 36; // mm
        const canvasWidth = canvas.clientWidth || 512;
        const focalPx = (canvasWidth * initialFocalLength) / sensorWidth;
        camera.data.fx = focalPx;
        camera.data.fy = focalPx;
        // 同步更新滑块显示值
        focalLengthSlider.value = initialFocalLength;
        focalLengthValue.value = initialFocalLength;
        
        // 设置深度范围以显示任意距离的高斯
        camera.near = 0.01;
        camera.far = initialDepthRange;
        
        // 先设置目标点，再设置相机位置
        // 使用getSplatCenter获取距离取景框中心最近的高斯点作为中心
        const initialCenter = getSplatCenter();
        controls.setCameraTarget(new SPLAT.Vector3(initialCenter.x, initialCenter.y, initialCenter.z));
        
        // 设置初始相机位置，确保方位角为0度
        // DISTANCE_MIN=0.3, DISTANCE_MAX=3, zoom=5时distance=1.65
        const initialDistance = 3 - (5 / 10) * (3 - 0.3); // zoom=5时，distance=1.65
        camera.position.x = initialCenter.x;
        camera.position.y = initialCenter.y;
        camera.position.z = initialCenter.z - initialDistance;
        
        // 初始化相机参数状态
        cameraParams.azimuth = 0;
        cameraParams.elevation = 0;
        cameraParams.distance = 5; // 默认缩放为5
        cameraParams.targetCenter = initialCenter;

        const resize = () => {
            renderer.setSize(canvas.clientWidth, canvas.clientHeight);
            selectionCanvas.width = canvas.clientWidth;
            selectionCanvas.height = canvas.clientHeight;
            gizmoCanvas.width = canvas.clientWidth;
            gizmoCanvas.height = canvas.clientHeight;
            updateRenderFrame();
            // 重新计算焦距以匹配当前画布尺寸
            if (camera) {
                const sensorWidth = 36; // mm
                const canvasWidth = canvas.clientWidth || 512;
                const focalPx = (canvasWidth * initialFocalLength) / sensorWidth;
                camera.data.fx = focalPx;
                camera.data.fy = focalPx;
            }
        };
        window.addEventListener('resize', resize);
        resize();

        // 同步计数器（用于节流）
        let syncFrameCount = 0;
        let isFirstFrame = true;
        
        const frame = () => {
            // 第一帧时确保相机位置正确（OrbitControls可能在初始化时覆盖了位置）
            if (isFirstFrame) {
                isFirstFrame = false;
                // DISTANCE_MIN=0.3, DISTANCE_MAX=3, zoom=5时distance=1.65
                const initDist = 3 - (5 / 10) * (3 - 0.3); // zoom=5时，distance=1.65
                camera.position.x = 0;
                camera.position.y = 0;
                camera.position.z = -initDist;
                cameraParams.azimuth = 0;
                cameraParams.elevation = 0;
                cameraParams.distance = 5; // 默认缩放为5
            }
            
            if (customOrbitEnabled) updateCameraFromOrbit();
            else if (controls.enabled) controls.update();
            renderer.render(scene, camera);
            
            // 更新相机位置显示
            updateCameraPosDisplay();
            
            // 更新相机参数显示（方位角、仰角、缩放）
            updateCameraParamsDisplay();
            
            // 每5帧同步一次到3D控制面板（节流）
            syncFrameCount++;
            if (syncFrameCount >= 5) {
                syncFrameCount = 0;
                syncViewerToCameraPanel();
            }
            
            // Always draw gizmo when in transform mode with selection
            if ((currentTool === 'translate' || currentTool === 'rotate') && selectedIndices.size > 0) {
                updateGizmoScreenPosition();
                drawGizmo();
            }
            requestAnimationFrame(frame);
        };
        frame();

        setupToolbar();
        setupSelectionEvents();
        setupGizmoEvents();
        setupKeyboard();
        setupCustomOrbitControls();
        setupVirtualOrbitBall();
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
            // 右键拖动：平移视图，同时更新orbitTarget（中心点）
            const panSpeed = orbitDistance * 0.002;
            const panX = dx * panSpeed;
            const panY = dy * panSpeed;
            
            // 计算相机右方向和上方向
            // 右方向：垂直于视线，在XZ平面上
            const rightX = Math.cos(orbitYaw);
            const rightZ = Math.sin(orbitYaw);
            
            // 更新orbitTarget（中心点）和cameraOffset
            // 向右拖动（dx>0）→ 中心点向右移动 → 看到左边更多
            orbitTarget.x += rightX * panX;
            orbitTarget.z -= rightZ * panX;
            orbitTarget.y -= panY;  // 向下拖动→中心点上移→看到下方更多
        }
        customOrbitLastX = e.clientX; customOrbitLastY = e.clientY;
    }, true);
    
    window.addEventListener('mouseup', () => { customOrbitDragging = false; }, true);
    
    canvas.addEventListener('wheel', (e) => {
        if (!customOrbitEnabled || isDraggingGizmo) return;
        e.preventDefault(); e.stopPropagation();
        // 按住Shift时减速0.5倍
        const speedMultiplier = e.shiftKey ? 0.0005 : 0.001;
        orbitDistance += e.deltaY * orbitDistance * speedMultiplier;
        orbitDistance = Math.max(0.2, Math.min(100, orbitDistance));
    }, true);
    
    canvas.addEventListener('contextmenu', (e) => { if (customOrbitEnabled) e.preventDefault(); }, true);
}

/**
 * 设置虚拟姿态球 - 跟踪鼠标旋转角度
 * 左拖 = 负角度，右拖 = 正角度
 * 360度一循环
 */
function setupVirtualOrbitBall() {
    // 监听canvas上的鼠标事件来跟踪旋转
    canvas.addEventListener('mousedown', (e) => {
        // 只在orbit工具模式下跟踪
        if (currentTool !== 'orbit' || isDraggingGizmo) return;
        if (e.button !== 0) return; // 只跟踪左键
        
        virtualOrbitBall.isDragging = true;
        virtualOrbitBall.lastMouseX = e.clientX;
        virtualOrbitBall.lastMouseY = e.clientY;
    }, true);
    
    window.addEventListener('mousemove', (e) => {
        if (!virtualOrbitBall.isDragging) return;
        
        const dx = e.clientX - virtualOrbitBall.lastMouseX;
        const dy = e.clientY - virtualOrbitBall.lastMouseY;
        
        // 水平旋转：向左拖动 = 看到右边 = 角度增加
        // 灵敏度：与gsplat控制器一致(0.003弧度/像素 ≈ 0.17度/像素)
        const yawDelta = -dx * 0.003;  // 取负使向左为正
        virtualOrbitBall.yaw += yawDelta;
        
        // 垂直旋转：鼠标向下=俯视=正角度，鼠标向上=仰视=负角度
        // 不取反dy，向下拖动dy为正值，对应正角度（俯视/看到顶部）
        const pitchDelta = dy * 0.003;
        virtualOrbitBall.pitch += pitchDelta;
        
        // 限制仰角范围：-30度到90度
        const minPitch = -30 * (Math.PI / 180);
        const maxPitch = 90 * (Math.PI / 180);
        virtualOrbitBall.pitch = Math.max(minPitch, Math.min(maxPitch, virtualOrbitBall.pitch));
        
        virtualOrbitBall.lastMouseX = e.clientX;
        virtualOrbitBall.lastMouseY = e.clientY;
        
        // 立即同步到3D相机控制面板
        updateCameraParamsDisplay();
        syncViewerToCameraPanel();
    }, true);
    
    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            virtualOrbitBall.isDragging = false;
        }
    }, true);
    
    // 滚轮缩放 - 由gsplat OrbitControls处理
    // 不再同步zoom值到显示，zoom值只能通过手动输入控制
    // 取消鼠标滚轮对zoom的影响
}

/**
 * 重置虚拟姿态球角度
 */
function resetVirtualOrbitBall() {
    virtualOrbitBall.yaw = virtualOrbitBall.initialYaw;
    virtualOrbitBall.pitch = virtualOrbitBall.initialPitch;
    cameraParams.distance = 5;
}

function setupToolbar() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });
    deleteBtn.addEventListener('click', deleteSelected);
    invertBtn.addEventListener('click', invertSelection);
    clearSelBtn.addEventListener('click', clearSelection);
    resetBtn.addEventListener('click', resetCamera);
    
    // 滑条滚轮调整功能
    const setupSliderWheel = (slider, input, onChange, min, max, step) => {
        slider.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY > 0 ? -step : step;
            let newValue = parseFloat(slider.value) + delta;
            newValue = Math.max(min, Math.min(max, newValue));
            slider.value = newValue;
            if (input) input.value = newValue;
            if (onChange) onChange(newValue);
        }, { passive: false });
    };
    
    // 缩放控制事件
    scaleSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        scaleInput.value = value;
        updateGaussianScale(value);
    });
    scaleInput.addEventListener('change', (e) => {
        let value = parseFloat(e.target.value);
        value = Math.max(0.001, Math.min(4, value));
        scaleInput.value = value;
        scaleSlider.value = value;
        updateGaussianScale(value);
    });
    setupSliderWheel(scaleSlider, scaleInput, updateGaussianScale, 0.001, 4, 0.001);
    
    // 焦距控制事件
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
    
    // 深度范围控制事件
    depthRangeSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        // 最大值5表示显示全部（不裁切）
        if (value >= 5) {
            if (depthRangeValue) depthRangeValue.textContent = '全部';
            updateDepthRange(Infinity); // 不裁切
        } else {
            const depthValue = Math.pow(10, value);
            if (depthRangeValue) depthRangeValue.textContent = depthValue >= 1000 ? (depthValue / 1000).toFixed(1) + 'k' : depthValue.toFixed(0);
            updateDepthRange(depthValue);
        }
    });

    confirmBtn.addEventListener('click', handleConfirm);
    
    // 相机参数面板交互
    setupCameraParamsPanel();
    cancelBtn.addEventListener('click', handleCancel);

    // 比例选择下拉菜单
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

    // 点击其他地方关闭菜单
    document.addEventListener('click', () => {
        aspectMenu.classList.add('hidden');
        aspectMenu.classList.remove('show');
    });
}

// 比例映射表 - 只存储比例值
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
            // 基于原始尺寸，按新比例调整
            // 保持较大的维度不变，按比例计算另一个维度
            if (originalOutputWidth >= originalOutputHeight) {
                // 原始是横向的
                if (ratio >= 1) {
                    // 新比例也是横向，保持宽度，计算高度
                    outputWidth = originalOutputWidth;
                    outputHeight = Math.round(originalOutputWidth / ratio);
                } else {
                    // 新比例是竖向，保持宽度，计算高度
                    outputWidth = originalOutputWidth;
                    outputHeight = Math.round(originalOutputWidth / ratio);
                }
            } else {
                // 原始是竖向的
                if (ratio >= 1) {
                    // 新比例是横向，保持高度，计算宽度
                    outputHeight = originalOutputHeight;
                    outputWidth = Math.round(originalOutputHeight * ratio);
                } else {
                    // 新比例也是竖向，保持高度，计算宽度
                    outputHeight = originalOutputHeight;
                    outputWidth = Math.round(originalOutputHeight * ratio);
                }
            }
            if (aspectBtn) aspectBtn.textContent = aspect + ' ▼';
        }
    }
    console.log('[GaussianViewer] Output size:', outputWidth, 'x', outputHeight, 'ratio:', outputWidth/outputHeight);
    // 更新选中状态
    aspectOptions.forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.aspect === aspect);
    });
    updateRenderFrame();
}

function updateCameraPosDisplay() {
    // 显示相机角度参数而不是位置坐标
    // Y = 方位角（azimuth）0-360度，水平旋转
    // X = 仰角（elevation）-30到90度，俯仰角
    // Z = 缩放距离已取消显示，改为手动输入控制
    const params = calculateCameraParams();
    if (params && cameraPosDisplay) {
        const x = Math.round(params.elevation) + '°';   // 仰角（俯仰，X轴）
        const y = Math.round(params.azimuth) + '°';     // 方位角（水平，Y轴）
        // 只显示X和Y，取消Z的显示
        cameraPosDisplay.textContent = `X:${x} Y:${y}`;
    }
}

// ============== Camera Parameter Calculation ==============

/**
 * 计算相机参数（方位角、仰角、距离）
 * 从实际相机位置计算，使用统一的坐标转换模块
 */
function calculateCameraParams() {
    if (!camera || !controls) {
        return cameraParams;
    }
    
    // 优先使用 currentOrbitTarget（与 syncCameraToViewer 设置的 orbit 中心一致）
    // 若未设置则 fallback 到 initialCameraData.target
    const target = currentOrbitTarget
        ? { x: currentOrbitTarget.x, y: currentOrbitTarget.y, z: currentOrbitTarget.z }
        : (initialCameraData && initialCameraData.target)
            ? { x: initialCameraData.target.x, y: initialCameraData.target.y, z: initialCameraData.target.z }
            : { x: 0, y: 0, z: 0 };
    
    // 使用统一的坐标转换模块从GSplat相机位置提取球面坐标（含 zoom）
    const result = CT.GSplatAdapter.fromGSplatPosition(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        target
    );
    
    // 更新相机参数（包含 distance/zoom，保证手动滚轮后也能正确保存）
    cameraParams.azimuth = Math.round(result.azimuth);
    cameraParams.elevation = Math.round(result.elevation);
    cameraParams.distance = result.zoom;
    
    return cameraParams;
}

/**
 * 获取高斯点云的中心点
 * 优先返回距离取景框中心最近的高斯点
 */
function getSplatCenter() {
    if (!currentSplat?.data?.positions) {
        return { x: 0, y: 0, z: 0 };
    }
    
    const positions = currentSplat.data.positions;
    const count = positions.length / 3;
    if (count === 0) return { x: 0, y: 0, z: 0 };
    
    // 首先计算点云的几何中心作为参考
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
    
    // 查找距离取景框中心（屏幕中心）最近的高斯点
    // 取景框中心对应的是点云的前方中心位置
    // 我们使用点云的前表面中心作为目标
    let minZ = Infinity;
    let frontCenter = { x: boundsCenter.x, y: boundsCenter.y, z: boundsCenter.z };
    
    // 找到最前方（Z最小）的一组点，计算它们的平均位置
    const frontPoints = [];
    const zThreshold = 0.2; // 允许20%的Z范围作为"前方"
    
    // 先找到最小Z值
    for (let i = 0; i < count; i++) {
        const z = positions[i * 3 + 2];
        if (z < minZ) minZ = z;
    }
    
    // 收集前方点（Z值接近最小Z的点）
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
    
    // 如果有前方点，计算它们的中心
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
 * 获取场景半径（用于距离归一化）
 */
function getSceneRadius() {
    if (!currentSplat?.data?.positions) {
        return 5;  // 默认值
    }
    
    // 如果有bounds，使用bounds尺寸
    if (currentSplat.bounds) {
        const size = currentSplat.bounds.size();
        return Math.max(size.x, size.y, size.z) / 2;
    }
    
    // 否则计算点云的边界
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

/**
 * 根据角度获取方位角标签
 */
function getAzimuthLabel(angle) {
    for (const range of AZIMUTH_LABELS) {
        if (angle >= range.min && angle < range.max) {
            return range.label;
        }
    }
    return 'front view';  // 默认
}

/**
 * 根据角度获取仰角标签
 */
function getElevationLabel(angle) {
    for (const range of ELEVATION_LABELS) {
        if (angle >= range.min && angle < range.max) {
            return range.label;
        }
    }
    return 'eye level';  // 默认
}

/**
 * 根据距离获取缩放标签
 */
function getZoomLabel(distance) {
    for (const range of ZOOM_LABELS) {
        if (distance >= range.min && distance < range.max) {
            return range.label;
        }
    }
    return 'medium shot';  // 默认
}

/**
 * 生成相机描述文本
 * 格式: {方向标签}, {仰角标签}, {缩放标签} (horizontal: {水平角}, vertical: {垂直角}, zoom: {缩放值})
 */
function getSliderZoom() {
    const v = parseFloat(document.getElementById('zoomInput')?.value ?? document.getElementById('zoomSlider')?.value);
    return isNaN(v) ? (cameraParams.distance || 5) : v;
}

function generateCameraDescription() {
    const params = calculateCameraParams();
    if (!params) return '';
    
    const zoom = getSliderZoom();
    const azimuthLabel = getAzimuthLabel(params.azimuth);
    const elevationLabel = getElevationLabel(params.elevation);
    const zoomLabel = getZoomLabel(zoom);
    
    return `${azimuthLabel}, ${elevationLabel}, ${zoomLabel} (horizontal: ${Math.round(params.azimuth)}, vertical: ${Math.round(params.elevation)}, zoom: ${zoom.toFixed(1)})`;
}

/**
 * 更新相机参数显示
 */
function updateCameraParamsDisplay() {
    const params = calculateCameraParams();
    if (!params) return;
    
    const azimuthLabel = getAzimuthLabel(params.azimuth);
    const elevationLabel = getElevationLabel(params.elevation);
    const zoomLabel = getZoomLabel(params.distance);
    
    // 更新数值显示（整数）
    const azimuthValueEl = document.getElementById('azimuthValue');
    const elevationValueEl = document.getElementById('elevationValue');
    const zoomValueEl = document.getElementById('zoomValue');
    
    if (azimuthValueEl) azimuthValueEl.textContent = `${params.azimuth}°`;
    if (elevationValueEl) elevationValueEl.textContent = `${params.elevation}°`;
    if (zoomValueEl) zoomValueEl.textContent = params.distance;
    
    // 更新标签显示
    const azimuthLabelEl = document.getElementById('azimuthLabel');
    const elevationLabelEl = document.getElementById('elevationLabel');
    const zoomLabelEl = document.getElementById('zoomLabel');
    
    if (azimuthLabelEl) azimuthLabelEl.textContent = azimuthLabel;
    if (elevationLabelEl) elevationLabelEl.textContent = elevationLabel;
    if (zoomLabelEl) zoomLabelEl.textContent = zoomLabel;
    
    // 更新完整描述
    const descriptionEl = document.getElementById('cameraDescription');
    if (descriptionEl) {
        descriptionEl.value = generateCameraDescription();
    }
}

/**
 * 设置相机参数面板交互
 */
function setupCameraParamsPanel() {
    const panel = document.getElementById('cameraParamsPanel');
    const toggleBtn = document.getElementById('toggleCameraParams');
    const copyBtn = document.getElementById('copyCameraDesc');
    
    // 折叠/展开面板
    if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            toggleBtn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
        });
    }
    
    // 复制描述到剪贴板
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const descriptionEl = document.getElementById('cameraDescription');
            if (!descriptionEl) return;
            
            const text = descriptionEl.value;
            try {
                await navigator.clipboard.writeText(text);
                
                // 显示复制成功反馈
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
                
                // 降级方案：选中文本
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
    
    // 将鼠标位置转换为归一化设备坐标 (-1到1)
    const ndcX = (mouseX / canvasWidth) * 2 - 1;
    const ndcY = -((mouseY / canvasHeight) * 2 - 1);  // Y轴翻转
    
    // 使用相机投影矩阵逆变换获取世界坐标
    // 简化计算：假设在相机前方一定距离的平面上
    const fov = camera.data.fx;  // 焦距（像素）
    const distance = 5.0;  // 假设距离相机的深度
    
    // 计算相机坐标系中的位置
    const camX = ndcX * (canvasWidth / (2 * camera.data.fx)) * distance;
    const camY = ndcY * (canvasHeight / (2 * camera.data.fy)) * distance;
    const camZ = -distance;  // 相机朝向-Z方向
    
    // 转换到世界坐标系（简化版，不考虑旋转）
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
    
    const cursors = { orbit: 'grab', pan: 'move', rect: 'crosshair', lasso: 'crosshair', translate: 'default', rotate: 'default' };
    canvas.style.cursor = cursors[tool] || 'default';
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
        // 更新光标位置显示
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
        else if (e.key === 'Escape') { clearSelection(); setTool('orbit'); }
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

function drawGizmo() {
    clearGizmo();
    if (selectedIndices.size === 0) return;
    
    camera.update();
    const viewMatrix = camera.data.viewMatrix?.buffer;
    if (!viewMatrix) return;
    
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

function projectPoint(pos) {
    if (!camera || !renderer) return null;
    camera.update();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const fx = camera.data.fx, fy = camera.data.fy;
    const m = camera.data.viewMatrix?.buffer;
    if (!m) return null;
    const vx = m[0]*pos.x + m[4]*pos.y + m[8]*pos.z + m[12];
    const vy = m[1]*pos.x + m[5]*pos.y + m[9]*pos.z + m[13];
    const vz = m[2]*pos.x + m[6]*pos.y + m[10]*pos.z + m[14];
    if (vz <= 0.01) return null;
    return { x: (vx * fx / vz) + w/2, y: (vy * fy / vz) + h/2, depth: vz };
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
    let text = `点数: ${Math.floor(count)}`;
    if (sel > 0) text += ` | 选中: ${sel}`;
    text += ' | V:视角 R:矩形 L:套索 G:移动 T:旋转 DEL:删除';
    if (statusText) statusText.textContent = text;
    highlightSelection();
    
    // 同步到3D相机控制面板
    syncViewerToCameraPanel();
}

function highlightSelection() {
    if (!currentSplat?.data?.colors || !originalColors) return;
    const colors = currentSplat.data.colors, count = currentSplat.data.vertexCount;
    let changed = false;
    for (let i = 0; i < count; i++) {
        if (selectedIndices.has(i)) {
            // 半透明绿色覆盖，保留原色可见 (70%原色 + 30%绿色)
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

function updateCameraFromOrbit() {
    if (!customOrbitEnabled) return;
    // 与GSplat OrbitControls保持一致（逆时针方向）：
    // x = target.x - distance * sin(yaw) * cos(pitch)  // 逆时针取反
    // y = target.y - distance * sin(pitch)
    // z = target.z - distance * cos(yaw) * cos(pitch)
    const bx = orbitTarget.x - orbitDistance * Math.sin(orbitYaw) * Math.cos(orbitPitch);  // 逆时针取反
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
    // 重置比例到原始尺寸
    setAspectRatio('original');
    
    // 重置相机到初始位置（使用保存的initialCameraData）
    if (camera && controls && initialCameraData) {
        // 直接使用保存的初始相机数据，确保正确还原到加载时的位置
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
        // 从实际相机位置重新计算角度，避免硬编码 0/0/5 与初始外参位置不符
        const actualParams = calculateCameraParams();
        if (actualParams) {
            cameraParams.azimuth = actualParams.azimuth;
            cameraParams.elevation = actualParams.elevation;
            cameraParams.distance = actualParams.distance;
        }
    }
    
    // 重置高斯缩放滑块到默认值0.3
    const defaultGaussianScale = 0.3;
    if (scaleSlider) scaleSlider.value = defaultGaussianScale;
    if (scaleInput) scaleInput.value = defaultGaussianScale;
    updateGaussianScale(defaultGaussianScale);
    
    // 重置焦距滑块到初始值
    focalLengthSlider.value = initialFocalLength;
    focalLengthValue.value = initialFocalLength;
    // 重置深度范围滑块到初始值
    depthRangeSlider.value = 4;
    if (depthRangeValue) depthRangeValue.textContent = '10000';
    if (camera) {
        camera.near = 0.01;
        camera.far = initialDepthRange;
    }
    // 重置虚拟姿态球角度
    resetVirtualOrbitBall();
    
    // 从当前相机位置（已由 initialCameraData 恢复）同步到3D控制面板
    syncViewerToCameraPanel();
    
    // 更新右侧3D面板的缩放滑块和输入框（threeScene 在同一 iframe 窗口内）
    try {
        if (window.threeScene?.reset) {
            window.threeScene.reset(cameraParams.azimuth, cameraParams.elevation, cameraParams.distance);
        } else {
            const zoomSlider = document.getElementById('zoomSlider');
            const zoomInput = document.getElementById('zoomInput');
            if (zoomSlider) {
                zoomSlider.value = 5;
                zoomSlider.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (zoomInput) {
                zoomInput.value = 5;
                zoomInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    } catch (e) {
        console.warn('[GaussianViewer] Failed to update zoom controls:', e);
    }
    
    updateStatus();
}

// 清除历史镜头列表（供历史面板的重置按钮调用）
window.clearCameraHistory = function() {
    cameraHistory = [];
    renderCameraHistory();
    if (typeof nodeId !== 'undefined' && nodeId != null) {
        try {
            window.parent.postMessage({ type: 'RESET_CAMERA_CACHE', nodeId, timestamp: Date.now() }, TARGET_ORIGIN);
        } catch (e) {}
    }
};

function updateFocalLength(value) {
    if (camera) {
        // 将摄影焦距(mm)转换为像素焦距
        // 假设传感器宽度为36mm(35mm胶片标准)
        // 像素焦距 = 画布宽度 * 摄影焦距 / 传感器宽度
        const sensorWidth = 36; // mm
        const canvasWidth = canvas.clientWidth || 512;
        const focalPx = (canvasWidth * value) / sensorWidth;
        camera.data.fx = focalPx;
        camera.data.fy = focalPx;
    }
}

function updateDepthRange(value) {
    if (camera) {
        camera.far = value === Infinity ? 100000 : value;
    }
    // 根据深度范围过滤高斯点的透明度（透明度存储在colors的alpha通道）
    if (currentSplat && currentSplat.data && currentSplat.data.colors && originalColors) {
        const colors = currentSplat.data.colors;
        const positions = currentSplat.data.positions;
        const cameraPosition = camera?.position || { x: 0, y: 0, z: 0 };
        
        for (let i = 0; i < currentSplat.data.vertexCount; i++) {
            const posIdx = i * 3;
            const colorIdx = i * 4;
            if (positions && posIdx + 2 < positions.length && colorIdx + 3 < colors.length) {
                // Infinity表示显示全部，不裁切
                if (value === Infinity) {
                    colors[colorIdx + 3] = originalColors[colorIdx + 3]; // 恢复原始透明度
                } else {
                    const dx = positions[posIdx] - cameraPosition.x;
                    const dy = positions[posIdx + 1] - cameraPosition.y;
                    const dz = positions[posIdx + 2] - cameraPosition.z;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    
                    // 根据深度范围调整透明度（alpha通道是第4个字节）
                    if (dist > value) {
                        colors[colorIdx + 3] = 0; // 超出深度范围的高斯点设为透明
                    } else {
                        colors[colorIdx + 3] = originalColors[colorIdx + 3]; // 恢复原始透明度
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
    newScale = Math.max(0.001, Math.min(4, parseFloat(newScale) || 0.25));
    currentScale = newScale; scaleInput.value = newScale; scaleSlider.value = newScale;
    if (currentSplat?.data?.scales && originalScales) {
        const scales = currentSplat.data.scales;
        for (let i = 0; i < Math.min(scales.length, originalScales.length); i++) scales[i] = originalScales[i] * newScale;
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
        gaussianScaleCompensation = iw / cw;
        tz = Math.max(1, fy / ih * 2);
    }
    let tx = 0, ty = 0, oz = tz;
    if (splat?.bounds) { const c = splat.bounds.center(), s = splat.bounds.size(); tz = c.z; oz = (c.z - s.z/2) * 1.5; }
    cy = -cy;
    // 无外参时，初始位置对齐默认正视图（az=0,el=0,zoom=5），确保重置相机能还原到此位置
    if (!ext?.length) {
        const fp = CT.GSplatAdapter.toGSplatPosition(0, 0, 5, { x: tx, y: ty, z: oz });
        cx = fp.x; cy = fp.y; cz = fp.z;
    }
    initialCameraData = { position: {x:cx,y:cy,z:cz}, target: new SPLAT.Vector3(tx,ty,oz), fx: camera.data.fx, fy: camera.data.fy };
    camera.position.x = cx; camera.position.y = cy; camera.position.z = cz;
    controls.setCameraTarget(new SPLAT.Vector3(tx, ty, oz));
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
            // 初始化高斯缩放为默认值0.3
            const defaultScale = 0.3;
            scaleInput.value = defaultScale; currentScale = defaultScale; scaleSlider.value = defaultScale;
            // 应用默认缩放
            updateGaussianScale(defaultScale);
        }
        if (ext || intr) {
            setCameraFromExtrinsics(ext, intr, currentSplat);
            const _sd = controls.dampening; controls.dampening = 1; controls.update(); controls.dampening = _sd;
        } else {
            // 无外参无内参：相机放在方位角0度的默认位置（zoom=5）
            let targetZ = 0;
            if (currentSplat?.bounds) { targetZ = currentSplat.bounds.center().z; }
            const fp = CT.GSplatAdapter.toGSplatPosition(0, 0, 5, { x: 0, y: 0, z: targetZ });
            const defaultTarget = new SPLAT.Vector3(0, 0, targetZ);
            initialCameraData = { position: {x:fp.x, y:fp.y, z:fp.z}, target: defaultTarget, fx: camera.data?.fx, fy: camera.data?.fy };
            camera.position.x = fp.x; camera.position.y = fp.y; camera.position.z = fp.z;
            controls.setCameraTarget(defaultTarget);
            const savedDampening = controls.dampening;
            controls.dampening = 1;
            controls.update();
            controls.dampening = savedDampening;
        }

        // 重置或还原相机参数
        if (!cameraParams.hasCache) {
            cameraParams.azimuth = 0;
            cameraParams.elevation = 0;
            cameraParams.distance = 5;
            cameraParams.orbitCenter = null;
            syncViewerToCameraPanel();
        } else {
            try {
                syncCameraToViewer(
                    typeof cameraParams.azimuth === 'number' ? cameraParams.azimuth : 0,
                    typeof cameraParams.elevation === 'number' ? cameraParams.elevation : 0,
                    typeof cameraParams.distance === 'number' ? cameraParams.distance : 5,
                    cameraParams.orbitCenter || null
                );
            } catch (e) {
                console.warn('[GaussianViewer] syncCameraToViewer failed in loadPLYFromData:', e);
            }
        }
        
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
        try {
            if (customOrbitEnabled) updateCameraFromOrbit(); else controls.update();
            camera.update(); renderer.render(scene, camera);
            const gl = renderer.gl || renderer._gl;
            if (!gl) { resolve(canvas.toDataURL('image/png')); return; }
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

            // 计算红框区域 - 使用与updateRenderFrame相同的逻辑
            const cw = canvas.clientWidth, ch = canvas.clientHeight;
            const oa = outputWidth/outputHeight, ca = cw/ch;
            const scaleFactor = 0.8;  // 与红框显示一致

            // 计算红框在CSS像素中的尺寸
            let cssFrameW, cssFrameH;
            if (oa > ca) { cssFrameW = cw*scaleFactor; cssFrameH = cssFrameW/oa; }
            else { cssFrameH = ch*scaleFactor; cssFrameW = cssFrameH*oa; }

            // 将CSS像素转换为WebGL像素（考虑设备像素比）
            const dpr = window.devicePixelRatio || 1;
            const frameW = Math.round(cssFrameW * dpr);
            const frameH = Math.round(cssFrameH * dpr);
            const frameX = Math.round((gw - frameW) / 2);
            const frameY = Math.round((gh - frameH) / 2);

            console.log('[GaussianViewer] Screenshot crop:', frameX, frameY, frameW, frameH, 'output:', outputWidth, 'x', outputHeight);

            // 直接按红框区域裁切，无出血线
            const outputCanvas = document.createElement('canvas');
            outputCanvas.width = outputWidth;
            outputCanvas.height = outputHeight;
            const outputCtx = outputCanvas.getContext('2d');
            outputCtx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
            outputCtx.fillRect(0, 0, outputWidth, outputHeight);
            outputCtx.drawImage(fc, frameX, frameY, frameW, frameH, 0, 0, outputWidth, outputHeight);

            resolve(outputCanvas.toDataURL('image/png'));
        } catch (err) { console.error('[GaussianViewer] Screenshot error:', err); resolve(null); }
    });
}

async function handleConfirm() {
    confirmBtn.disabled = true; confirmBtn.textContent = '处理中...'; cancelBtn.disabled = true;
    console.log('[GaussianViewer] handleConfirm - output size:', outputWidth, 'x', outputHeight);
    const screenshot = await captureScreenshot();
    
    // 捕获3D相机控制面板截图
    let cameraPanelScreenshot = null;
    try {
        cameraPanelScreenshot = window.threeScene?.capture?.() || null;
    } catch (e) { console.warn('[GaussianViewer] 3D panel capture failed:', e); }
    
    // 获取相机参数
    const camParams = calculateCameraParams();
    const cameraDescription = generateCameraDescription();
    
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
            position: camera ? {x:camera.position.x, y:camera.position.y, z:camera.position.z} : {},
            scale: currentScale,
            azimuth: camParams?.azimuth || 0,
            elevation: camParams?.elevation || 0,
            distance: getSliderZoom(),
            description: cameraDescription,
            orbitCenter: getOrbitCenter()
        }
    }, TARGET_ORIGIN);
}

function handleCancel() {
    confirmBtn.disabled = true; cancelBtn.disabled = true; cancelBtn.textContent = '取消中...';
    window.parent.postMessage({ type: 'CANCEL_SELECTION', nodeId, timestamp: Date.now() }, TARGET_ORIGIN);
}

window.addEventListener('message', (event) => {
    if (!isTrustedParentMessage(event)) return;
    const { type, data, filename, extrinsics, intrinsics, node_id, params } = event.data || {};
    if (type === 'LOAD_MESH_DATA' && data) {
        nodeId = node_id; viewerParams = params || {};
        // 保存原始输入尺寸
        originalOutputWidth = params?.width || 1024;
        originalOutputHeight = params?.height || 576;
        // 默认使用原始尺寸
        setAspectRatio('original');
        backgroundColor = params?.background || 'black'; updateBackgroundColor();
        confirmBtn.disabled = false; confirmBtn.textContent = '✓确认';
        cancelBtn.disabled = false; cancelBtn.textContent = '✕取消';
        errorEl.classList.add('hidden'); selectedIndices.clear(); setTool('orbit');

        // 如果后端传入了上一次的 camera_state，优先用它初始化相机参数
        const cachedCameraState = params?.camera_state;
        if (cachedCameraState) {
            try {
                cameraParams.azimuth = typeof cachedCameraState.azimuth === 'number' ? cachedCameraState.azimuth : 0;
                cameraParams.elevation = typeof cachedCameraState.elevation === 'number' ? cachedCameraState.elevation : 0;
                cameraParams.distance = typeof cachedCameraState.distance === 'number' ? cachedCameraState.distance : 5;
                cameraParams.orbitCenter = cachedCameraState.orbitCenter || null;
                cameraParams.hasCache = true;
            } catch (e) {
                console.warn('[GaussianViewer] Failed to apply cached camera_state:', e);
                cameraParams.hasCache = false;
            }
        } else {
            cameraParams.azimuth = 0;
            cameraParams.elevation = 0;
            cameraParams.distance = 5;
            cameraParams.orbitCenter = null;
            cameraParams.hasCache = false;
        }

        // 初始化历史镜头列表
        const historyFromServer = Array.isArray(params?.camera_history) ? params.camera_history : [];
        cameraHistory = historyFromServer.slice(0, 10);
        renderCameraHistory();

        loadPLYFromData(data, filename || 'gaussian.ply', extrinsics, intrinsics);
    }
});

// ============== Bidirectional Sync with 3D Control Panel ==============

/**
 * 从相机位置和旋转推算 OrbitControls 的实际 orbit 中心（Q）
 * 用于在 handleConfirm 时保存真实的观察中心，以便下次精确复原
 * 无平移时与 currentOrbitTarget 完全一致；有平移时通过 camera.rotation 近似推算
 */
function getOrbitCenter() {
    if (!camera) return currentOrbitTarget;
    const refT = currentOrbitTarget
        || (initialCameraData && initialCameraData.target
            ? { x: initialCameraData.target.x, y: initialCameraData.target.y, z: initialCameraData.target.z }
            : null);
    if (!refT) return null;
    try {
        const euler = camera.rotation.toEuler();
        const j = euler.x, q = euler.y;
        // OrbitControls update: b = normalize(target - camera), j=asin(-b.y), q=atan2(b.x,b.z)
        const bx = Math.sin(q) * Math.cos(j);
        const by = -Math.sin(j);
        const bz = Math.cos(q) * Math.cos(j);
        // orbit 半径：用 camera 到 refT 的距离近似（无平移时精确相等）
        const dx = camera.position.x - refT.x;
        const dy = camera.position.y - refT.y;
        const dz = camera.position.z - refT.z;
        const radius = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (radius < 0.001) return { x: refT.x, y: refT.y, z: refT.z };
        return {
            x: camera.position.x + bx * radius,
            y: camera.position.y + by * radius,
            z: camera.position.z + bz * radius
        };
    } catch (e) {
        return { x: refT.x, y: refT.y, z: refT.z };
    }
}

/**
 * 从3D控制面板同步相机状态到 Gaussian Viewer
 * @param {number} azimuth - 方位角 (0-360)
 * @param {number} elevation - 仰角 (-30 to 90)
 * @param {number} zoom - 缩放距离 (0-10)
 * @param {object} [orbitCenter] - 可选：指定 orbit 中心点 {x,y,z}，不传则用 initialCameraData.target
 */
window.syncCameraToViewer = function(azimuth, elevation, zoom, orbitCenter) {
    if (!camera || !controls) return;
    
    // 使用传入的 orbitCenter（还原保存时的观察中心），否则用 initialCameraData.target
    const target = orbitCenter
        ? { x: orbitCenter.x, y: orbitCenter.y, z: orbitCenter.z }
        : (initialCameraData && initialCameraData.target)
            ? { x: initialCameraData.target.x, y: initialCameraData.target.y, z: initialCameraData.target.z }
            : { x: 0, y: 0, z: 0 };
    
    // 更新当前 orbit 中心跟踪（供 calculateCameraParams / getOrbitCenter 使用）
    currentOrbitTarget = { x: target.x, y: target.y, z: target.z };
    
    // 计算目标相机位置
    const position = CT.GSplatAdapter.toGSplatPosition(azimuth, elevation, zoom, target);
    
    // 设置相机位置
    camera.position.x = position.x;
    camera.position.y = position.y;
    camera.position.z = position.z;
    
    // 关键：将新相机位置同步进 OrbitControls 内部状态（I/d/a/Q）
    controls.setCameraTarget(new SPLAT.Vector3(target.x, target.y, target.z));
    
    // 临时禁用阻尼以立即到位，避免从旧位置插值导致闪回
    const savedDampening = controls.dampening;
    controls.dampening = 1;
    controls.update();
    controls.dampening = savedDampening;
    
    // 更新相机参数显示
    cameraParams.azimuth = azimuth;
    cameraParams.elevation = elevation;
    cameraParams.distance = zoom;
    
    updateCameraParamsDisplay();
    updateStatus();
    
    console.log('[GaussianViewer] Synced from 3D panel:', { azimuth, elevation, zoom, orbitCenter: target });
};

/**
 * 从 Gaussian Viewer 同步相机状态到3D控制面板
 */
function syncViewerToCameraPanel() {
    const params = calculateCameraParams();
    if (!params) return;
    
    // 更新3D控制面板（如果存在）
    if (window.threeScene && window.threeScene.updatePositions) {
        window.threeScene.updatePositions(params.azimuth, params.elevation, params.distance);
    }
    
    // 更新预览显示（只读）
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
    
    // 缩放距离不再自动更新，保持用户手动设置的值
    // zoomSlider和zoomInput的值由用户手动控制，不从这里同步
    
    // 更新显示
    updateCameraDisplay(params);
}

/**
 * 更新相机显示信息
 */
function updateCameraDisplay(params) {
    if (!params) return;
    
    // 更新信息面板
    const azimuthDisplay = document.getElementById('azimuthDisplay');
    const elevationDisplay = document.getElementById('elevationDisplay');
    
    if (azimuthDisplay) azimuthDisplay.textContent = Math.round(params.azimuth) + '°';
    if (elevationDisplay) elevationDisplay.textContent = Math.round(params.elevation) + '°';
    
    // 更新底部预览（只读）
    const azimuthPreview = document.getElementById('azimuthPreview');
    const elevationPreview = document.getElementById('elevationPreview');
    if (azimuthPreview) azimuthPreview.textContent = Math.round(params.azimuth) + '°';
    if (elevationPreview) elevationPreview.textContent = Math.round(params.elevation) + '°';
    
    // 更新标签
    const azimuthLabel = document.getElementById('azimuthLabelDisplay');
    const elevationLabel = document.getElementById('elevationLabelDisplay');
    
    if (azimuthLabel) azimuthLabel.textContent = getAzimuthLabel(params.azimuth);
    if (elevationLabel) elevationLabel.textContent = getElevationLabel(params.elevation);
    
    // 更新描述
    const descOutput = document.getElementById('cameraDescriptionOutput');
    if (descOutput) {
        descOutput.value = generateCameraDescription();
    }
}

// ============== Camera History (历史镜头) ==============

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

    cameraHistory.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';

        const main = document.createElement('div');
        main.className = 'history-item-main';

        const angles = document.createElement('div');
        angles.className = 'history-angles';
        const az = Math.round(entry.azimuth ?? 0);
        const el = Math.round(entry.elevation ?? 0);
        const dist = Math.round(entry.distance ?? 5);
        angles.textContent = `Y:${az}°  X:${el}°  Zoom:${dist}`;

        const desc = document.createElement('div');
        desc.className = 'history-desc';
        desc.textContent = entry.description || '';

        main.appendChild(angles);
        main.appendChild(desc);

        const btn = document.createElement('button');
        btn.className = 'history-restore-btn';
        btn.textContent = '还原';
        btn.addEventListener('click', () => {
            applyCameraHistoryEntry(entry);
        });

        item.appendChild(main);
        item.appendChild(btn);
        listEl.appendChild(item);
    });
}

function applyCameraHistoryEntry(entry) {
    const az = typeof entry.azimuth === 'number' ? entry.azimuth : 0;
    const el = typeof entry.elevation === 'number' ? entry.elevation : 0;
    const dist = typeof entry.distance === 'number' ? entry.distance : 5;

    // 更新内部相机参数状态
    cameraParams.azimuth = az;
    cameraParams.elevation = el;
    cameraParams.distance = dist;

    // 同步到 3D 面板和主视图
    updateCameraParamsDisplay();
    syncCameraToViewer(az, el, dist, entry.orbitCenter || null);
}

// 监听控制器变化 - 完全禁用同步，3D面板完全独立控制
// Gaussian Viewer的滚轮、拖动等操作不会影响3D相机控制面板
if (controls) {
    controls.addEventListener('change', () => {
        // 不再同步任何参数到3D面板
        // 3D相机控制面板完全独立控制方位角和仰角
    });
}

initViewer();
// 初始化后立即同步相机状态到3D控制面板
setTimeout(() => {
    syncViewerToCameraPanel();
}, 100);
console.log('[GaussianViewer] Editor ready with 3D sync');
