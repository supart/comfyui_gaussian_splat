import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Auto-detect extension folder name
const EXTENSION_FOLDER = (() => {
    const url = import.meta.url;
    const match = url.match(/\/extensions\/([^/]+)\//);
    return match ? match[1] : "comfyui_gaussian_splat";
})();

console.log("[GaussianViewer] Extension folder:", EXTENSION_FOLDER);

// Global modal viewer - only one instance
let globalViewer = null;
let currentNodeId = null;
const TARGET_ORIGIN =
    window.location.origin && window.location.origin !== "null"
        ? window.location.origin
        : "*";

function isTrustedIframeMessage(event, expectedSource) {
    if (!event) return false;
    if (expectedSource && event.source !== expectedSource) return false;
    if (TARGET_ORIGIN === "*") {
        return event.origin === "null" || event.origin === "";
    }
    return event.origin === TARGET_ORIGIN;
}

function createGlobalViewer() {
    if (globalViewer) return globalViewer;

    // Create overlay
    const overlay = document.createElement("div");
    overlay.id = "gaussian-viewer-overlay";
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 99999;
    `;

    // Create modal container
    const modal = document.createElement("div");
    modal.style.cssText = `
        background: #1a1a1a;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        border: 1px solid #444;
        display: flex;
        flex-direction: column;
        max-width: 90vw;
        max-height: 90vh;
    `;

    // Create iframe
    const iframe = document.createElement("iframe");
    iframe.style.cssText = `
        border: none;
        background: #1a1a1a;
    `;
    iframe.src = `/extensions/${EXTENSION_FOLDER}/viewer_gaussian.html?v=` + Date.now();
    modal.appendChild(iframe);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    globalViewer = {
        overlay,
        modal,
        iframe,
        iframeLoaded: false,
        nodeId: null,
    };

    iframe.addEventListener('load', () => {
        globalViewer.iframeLoaded = true;
        console.log("[GaussianViewer] Global iframe loaded");
    });

    // Listen for messages from iframe
    window.addEventListener('message', (event) => {
        if (!isTrustedIframeMessage(event, globalViewer?.iframe?.contentWindow)) return;
        if (!event.data || !event.data.type) return;
        const {
            type,
            nodeId,
            cameraState,
            camera_state: cameraStateSnake,
            screenshot,
            cameraPanelScreenshot,
            outputWidth,
            outputHeight,
        } = event.data;
        const latestCameraState = cameraState || cameraStateSnake || null;

        if (type === 'CONFIRM_SELECTION' && globalViewer.nodeId) {
            handleGlobalConfirm(globalViewer.nodeId, latestCameraState, screenshot, cameraPanelScreenshot, outputWidth, outputHeight);
        }

        if (type === 'CANCEL_SELECTION' && globalViewer.nodeId) {
            handleGlobalCancel(globalViewer.nodeId, latestCameraState);
        }

        if (type === 'RESET_CAMERA_CACHE' && globalViewer.nodeId) {
            handleGlobalReset(globalViewer.nodeId);
        }

        if (type === 'ADD_CAMERA_HISTORY' && globalViewer.nodeId) {
            handleGlobalAddHistory(globalViewer.nodeId, latestCameraState);
        }
    });

    return globalViewer;
}

async function handleGlobalConfirm(nodeId, cameraState, screenshot, cameraPanelScreenshot, outputWidth, outputHeight) {
    console.log("[GaussianViewer] Global confirm for node:", nodeId, "output size:", outputWidth, "x", outputHeight);
    
    const node = app.graph.getNodeById(parseInt(nodeId));
    if (node && node.viewerParams && cameraState) {
        node.viewerParams.camera_state = cameraState;
    }
    if (node && node.viewerParams) {
        try {
            const response = await fetch("/gaussian_viewer/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    node_id: String(nodeId),
                    params: {
                        ...node.viewerParams,
                        camera_state: cameraState,
                        screenshot: screenshot,
                        camera_panel_screenshot: cameraPanelScreenshot,
                        output_width: outputWidth,
                        output_height: outputHeight,
                    },
                }),
            });
            const result = await response.json();
            console.log("[GaussianViewer] Confirm response:", result);
        } catch (e) {
            console.error("[GaussianViewer] Confirm error:", e);
        }
    }

    // Hide viewer
    hideGlobalViewer();
}

async function handleGlobalCancel(nodeId, cameraState = null) {
    console.log("[GaussianViewer] Global cancel for node:", nodeId);
    const node = app.graph.getNodeById(parseInt(nodeId));
    if (node && node.viewerParams && cameraState) {
        node.viewerParams.camera_state = cameraState;
    }
    
    if (cameraState) {
        try {
            await fetch("/gaussian_viewer/cache_camera_state", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    node_id: String(nodeId),
                    camera_state: cameraState,
                    params: {
                        ...(app.graph.getNodeById(parseInt(nodeId))?.viewerParams || {}),
                    },
                }),
            });
        } catch (e) {
            console.error("[GaussianViewer] Cache camera state on cancel error:", e);
        }
    }

    try {
        await fetch("/gaussian_viewer/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node_id: String(nodeId) }),
        });
        await api.interrupt();
    } catch (e) {
        console.error("[GaussianViewer] Cancel error:", e);
    }

    hideGlobalViewer();
}

async function handleGlobalReset(nodeId) {
    console.log("[GaussianViewer] Global reset for node:", nodeId);

    try {
        await fetch("/gaussian_viewer/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node_id: String(nodeId) }),
        });
    } catch (e) {
        console.error("[GaussianViewer] Reset error:", e);
    }

    // Also clear cached camera info on the node instance if any
    const node = app.graph.getNodeById(parseInt(nodeId));
    if (node && node.viewerParams) {
        delete node.viewerParams.camera_state;
        delete node.viewerParams.camera_history;
    }
}

async function handleGlobalAddHistory(nodeId, cameraState) {
    if (!cameraState) return;
    try {
        const response = await fetch("/gaussian_viewer/add_history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                node_id: String(nodeId),
                camera_state: cameraState,
            }),
        });
        const result = await response.json();
        console.log("[GaussianViewer] Add history response:", result);
    } catch (e) {
        console.error("[GaussianViewer] Add history error:", e);
    }
}

function hideGlobalViewer() {
    if (globalViewer) {
        globalViewer.overlay.style.display = "none";
        globalViewer.nodeId = null;
        //不重置iframe，保持加载状态以便下次快速显示
    }
    currentNodeId = null;
}

function showGlobalViewer(nodeId, data) {
    const viewer = createGlobalViewer();
    
    viewer.nodeId = nodeId;
    currentNodeId = nodeId;

    // 固定16:9比例的预览窗
    const aspect = 16 / 9;

    // 弹窗尺寸自动贴合浏览器尺寸
    const maxWidth = window.innerWidth * 0.95;
    const maxHeight = window.innerHeight * 0.85;
    const controlsHeight = 120; // 控制栏高度（两行）

    let canvasW, canvasH;
    // 固定16:9比例
    canvasW = maxWidth;
    canvasH = canvasW / aspect;
    if (canvasH > maxHeight - controlsHeight) {
        canvasH = maxHeight - controlsHeight;
        canvasW = canvasH * aspect;
    }

    canvasW = Math.max(420, Math.round(canvasW));
    canvasH = Math.round(canvasH);

    viewer.iframe.style.width = `${canvasW}px`;
    viewer.iframe.style.height = `${canvasH + controlsHeight}px`;
    viewer.modal.style.width = `${canvasW}px`;

    viewer.overlay.style.display = "flex";

    // Send data to iframe
    const sendData = () => {
        if (!viewer.iframe.contentWindow) {
            console.error("[GaussianViewer] Iframe contentWindow not available");
            return;
        }

        fetch('/gaussian_viewer/load_ply_raw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ply_path: data.ply_path, node_id: String(nodeId) })
        })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            console.log("[GaussianViewer] Loaded PLY, size:", arrayBuffer.byteLength);
            const backendCameraState = data.camera_state ?? null;
            const backendCameraHistory = Array.isArray(data.camera_history)
                ? data.camera_history
                : null;

            const fx = Math.max(data.width, data.height);
            const intrinsics = [
                [fx, 0, data.width / 2],
                [0, fx, data.height / 2],
                [0, 0, 1]
            ];

            viewer.iframe.contentWindow.postMessage({
                type: 'LOAD_MESH_DATA',
                data: arrayBuffer,
                filename: data.ply_path.split(/[/\\]/).pop(),
                extrinsics: null,
                intrinsics: intrinsics,
                node_id: String(nodeId),
                params: {
                    width: data.width,
                    height: data.height,
                    background: data.background,
                    point_size: data.point_size,
                    // Always trust backend startup state so input changes can fully reset.
                    camera_state: backendCameraState,
                    camera_history: backendCameraHistory,
                },
                timestamp: Date.now()
            }, TARGET_ORIGIN, [arrayBuffer]);
        })
        .catch(error => {
            console.error("[GaussianViewer] Error loading PLY:", error);
        });
    };

    if (viewer.iframeLoaded) {
        sendData();
    } else {
        // Wait for iframe to load
        const checkLoaded = setInterval(() => {
            if (viewer.iframeLoaded) {
                clearInterval(checkLoaded);
                sendData();
            }
        }, 100);
        // Timeout after 5 seconds
        setTimeout(() => clearInterval(checkLoaded), 5000);
    }
}

// Global event listener for show event
api.addEventListener("gaussian_viewer_show", (event) => {
    const data = event.detail;
    const nodeId = String(data.node_id);
    console.log("[GaussianViewer] Received show event for node:", nodeId);
    
    const node = app.graph.getNodeById(parseInt(nodeId));
    if (node) {
        node.viewerParams = {
            width: data.width,
            height: data.height,
            background: data.background,
            point_size: data.point_size,
            ply_path: data.ply_path,
            camera_state: data.camera_state ?? null,
            camera_history: Array.isArray(data.camera_history) ? data.camera_history : null,
        };
        showGlobalViewer(nodeId, data);
    }
});

app.registerExtension({
    name: "Comfy.GaussianViewerSelect",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "GaussianViewerSelect") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            this.viewerParams = {};
        };
    },
});
