import { app } from "../../scripts/app.js";

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeAzimuth(value) {
    let angle = Number(value);
    angle = ((angle % 360) + 360) % 360;
    return angle;
}

function toRadians(deg) {
    return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
    return (rad * 180) / Math.PI;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function getAzimuthLabel(angle) {
    const a = normalizeAzimuth(angle);
    if (a <= 22.5 || a > 337.5) return "front view";
    if (a <= 67.5) return "front right side view";
    if (a <= 112.5) return "right side view";
    if (a <= 157.5) return "back right side view";
    if (a <= 202.5) return "back view";
    if (a <= 247.5) return "back left side view";
    if (a <= 292.5) return "left side view";
    return "front left side view";
}

function getElevationLabel(angle) {
    if (angle <= -15) return "low angle";
    if (angle <= 15) return "eye level";
    if (angle <= 45) return "high angle";
    if (angle <= 75) return "very high angle";
    return "bird's-eye view";
}

function getZoomLabel(zoom) {
    if (zoom <= 2) return "wide shot";
    if (zoom <= 4) return "medium-wide shot";
    if (zoom <= 6) return "medium shot";
    if (zoom <= 8) return "medium-close shot";
    return "close-up shot";
}

function formatPromptNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0.0";
    return n.toFixed(1);
}

function generatePromptDescription(azimuth, elevation, zoom) {
    const direction = getAzimuthLabel(azimuth);
    const elevationLabel = getElevationLabel(elevation);
    const shotType = getZoomLabel(zoom);
    return `${direction}, ${elevationLabel}, ${shotType} (horizontal: ${formatPromptNumber(azimuth)}, vertical: ${formatPromptNumber(elevation)}, zoom: ${formatPromptNumber(zoom)})`;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text).split(" ");
    let line = "";
    let lineCount = 0;

    for (let i = 0; i < words.length; i++) {
        const next = line ? `${line} ${words[i]}` : words[i];
        if (ctx.measureText(next).width > maxWidth && line) {
            ctx.fillText(line, x, y + lineCount * lineHeight);
            line = words[i];
            lineCount += 1;
            if (lineCount >= maxLines - 1) {
                const tail = `${line} ${words.slice(i + 1).join(" ")}`.trim();
                let clipped = tail;
                while (clipped.length > 0 && ctx.measureText(`${clipped}...`).width > maxWidth) {
                    clipped = clipped.slice(0, -1);
                }
                ctx.fillText(`${clipped}...`, x, y + lineCount * lineHeight);
                return;
            }
        } else {
            line = next;
        }
    }

    if (line) {
        ctx.fillText(line, x, y + lineCount * lineHeight);
    }
}

function drawCard(ctx, x, y, w, h, r, fill, stroke) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();
        ctx.stroke();
        return;
    }
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
}

function drawGlowOrb(ctx, x, y, radius, color, glow = 0.35) {
    const g = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius * 1.8);
    g.addColorStop(0, color);
    g.addColorStop(1, `rgba(0,0,0,${1 - glow})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.arc(x - radius * 0.25, y - radius * 0.35, radius * 0.34, 0, Math.PI * 2);
    ctx.fill();
}

function drawCameraCone(ctx, x, y, angle, size) {
    const tipX = x + Math.cos(angle) * size * 1.3;
    const tipY = y + Math.sin(angle) * size * 1.3;
    const baseX = x - Math.cos(angle) * size * 0.45;
    const baseY = y - Math.sin(angle) * size * 0.45;
    const px = -Math.sin(angle);
    const py = Math.cos(angle);

    ctx.fillStyle = "rgba(227, 64, 136, 0.92)";
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + px * size * 0.55, baseY + py * size * 0.55);
    ctx.lineTo(baseX - px * size * 0.55, baseY - py * size * 0.55);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255, 204, 0, 0.85)";
    ctx.beginPath();
    ctx.arc(x, y, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
}

function vec3Add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vec3Sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vec3Mul(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vec3Dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vec3Cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}

function vec3Norm(v) {
    const len = Math.hypot(v.x, v.y, v.z);
    if (len < 1e-6) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function screenPointToRay(state, localPos) {
    const proj = state?.projection;
    if (!proj || !Array.isArray(localPos) || localPos.length < 2) return null;
    const [x, y] = localPos;
    const nx = (x - proj.cx) / proj.focal;
    const ny = (proj.cy - y) / proj.focal;
    const dir = vec3Norm(
        vec3Add(
            vec3Add(vec3Mul(proj.right, nx), vec3Mul(proj.up, ny)),
            proj.forward
        )
    );
    return { origin: proj.camPos, dir };
}

function rayPlaneIntersection(ray, planeNormal, planePoint) {
    if (!ray) return null;
    const denom = vec3Dot(ray.dir, planeNormal);
    if (Math.abs(denom) < 1e-6) return null;
    const t = vec3Dot(vec3Sub(planePoint, ray.origin), planeNormal) / denom;
    if (!Number.isFinite(t) || t <= 0) return null;
    return vec3Add(ray.origin, vec3Mul(ray.dir, t));
}

function matchesNodeRegistration(nodeData, expectedNames) {
    const candidates = new Set([
        nodeData?.name,
        nodeData?.display_name,
        nodeData?.type,
    ]);
    return expectedNames.some((name) => candidates.has(name));
}

function findWidget(node, name) {
    return node.widgets?.find((w) => w && w.name === name) || null;
}

function getWidgetValue(node, name, fallback = 0) {
    const widget = findWidget(node, name);
    if (!widget) return fallback;
    const value = Number(widget.value);
    return Number.isFinite(value) ? value : fallback;
}

function setWidgetValue(node, name, value) {
    const widget = findWidget(node, name);
    if (!widget) return;
    widget.value = value;
    if (typeof widget.callback === "function") {
        widget.callback(value);
    }
}

function requestNodeRedraw(node) {
    node?.setDirtyCanvas?.(true, true);
    app?.graph?.setDirtyCanvas?.(true, true);
}

function getInlineRect(node) {
    const margin = 10;
    const titleHeight = (globalThis.LiteGraph?.NODE_TITLE_HEIGHT ?? 30) + 4;
    const defaultWidgetHeight = globalThis.LiteGraph?.NODE_WIDGET_HEIGHT ?? 20;
    const widgetSpacing = 4;

    let stackedWidgetsHeight = 0;
    let maxWidgetBottom = 0;
    if (Array.isArray(node.widgets)) {
        for (const widget of node.widgets) {
            if (!widget || widget.hidden) continue;
            const widgetSize = typeof widget.computeSize === "function" ? widget.computeSize(node.size?.[0] ?? 760) : null;
            const wh = Array.isArray(widgetSize) && Number.isFinite(widgetSize[1]) ? widgetSize[1] : defaultWidgetHeight;
            stackedWidgetsHeight += wh + widgetSpacing;

            if (Number.isFinite(widget.last_y)) {
                maxWidgetBottom = Math.max(maxWidgetBottom, widget.last_y + wh);
            }
        }
    }

    const topByCount = titleHeight + stackedWidgetsHeight + 12;
    const topByLastY = maxWidgetBottom > 0 ? maxWidgetBottom + 10 : 0;
    const top = Math.max(titleHeight + 10, topByCount, topByLastY);
    const w = Math.max(420, (node.size?.[0] ?? 760) - margin * 2);
    const h = Math.max(420, (node.size?.[1] ?? 760) - top - 10);
    return { x: margin, y: top, w, h };
}

function getPoseSnapshot(node) {
    return {
        azimuth: normalizeAzimuth(getWidgetValue(node, "azimuth", 0)),
        elevation: clamp(getWidgetValue(node, "elevation", 0), -30, 90),
        zoom: clamp(getWidgetValue(node, "zoom", 5), 0, 10),
    };
}

function writePoseSnapshot(node, nextPose) {
    const pose = {
        azimuth: Math.round(normalizeAzimuth(nextPose.azimuth)),
        elevation: Math.round(clamp(nextPose.elevation, -30, 90)),
        zoom: Math.round(clamp(nextPose.zoom, 0, 10) * 10) / 10,
    };
    setWidgetValue(node, "azimuth", pose.azimuth);
    setWidgetValue(node, "elevation", pose.elevation);
    setWidgetValue(node, "zoom", pose.zoom);
    requestNodeRedraw(node);
}

function drawInlineQwenPanel(node, ctx) {
    if (node.flags?.collapsed) return;

    const rect = getInlineRect(node);
    const pose = getPoseSnapshot(node);
    const directionLabel = getAzimuthLabel(pose.azimuth);
    const elevationLabel = getElevationLabel(pose.elevation);
    const zoomLabel = getZoomLabel(pose.zoom);
    const prompt = generatePromptDescription(pose.azimuth, pose.elevation, pose.zoom);

    const gap = 12;
    const headerH = 34;

    const tipsH = 18;
    const infoRectH = 64;
    let manualCardH = clamp(Math.round(rect.h * 0.22), 230, 280);
    let promptCardH = clamp(Math.round(rect.h * 0.13), 110, 160);
    let topCardH = rect.h - manualCardH - promptCardH - gap * 2;

    const minPreview = 220;
    const minTopCardH = headerH + 10 + tipsH + 4 + minPreview + 8 + infoRectH + 12;
    if (topCardH < minTopCardH) {
        let need = minTopCardH - topCardH;
        const manualCut = Math.min(need, Math.max(0, manualCardH - 200));
        manualCardH -= manualCut;
        need -= manualCut;
        if (need > 0) {
            const promptCut = Math.min(need, Math.max(0, promptCardH - 92));
            promptCardH -= promptCut;
        }
        topCardH = rect.h - manualCardH - promptCardH - gap * 2;
    }

    const topCard = { x: rect.x, y: rect.y, w: rect.w, h: topCardH };
    const manualCard = {
        x: rect.x,
        y: topCard.y + topCard.h + gap,
        w: rect.w,
        h: manualCardH,
    };
    const promptCard = {
        x: rect.x,
        y: manualCard.y + manualCard.h + gap,
        w: rect.w,
        h: promptCardH,
    };

    const topBody = {
        x: topCard.x + 10,
        y: topCard.y + headerH + 10,
        w: topCard.w - 20,
        h: topCard.h - headerH - 12,
    };
    const manualBody = {
        x: manualCard.x + 10,
        y: manualCard.y + headerH + 10,
        w: manualCard.w - 20,
        h: manualCard.h - headerH - 14,
    };
    const promptBody = {
        x: promptCard.x + 10,
        y: promptCard.y + headerH + 10,
        w: promptCard.w - 20,
        h: promptCard.h - headerH - 14,
    };

    const previewMaxByHeight = topBody.h - tipsH - infoRectH - 18;
    const previewSize = clamp(Math.min(topBody.w, previewMaxByHeight), 120, topBody.w);
    const preview = {
        x: topBody.x + (topBody.w - previewSize) * 0.5,
        y: topBody.y + tipsH + 4,
        w: previewSize,
        h: previewSize,
    };
    const infoRect = {
        x: topBody.x,
        y: preview.y + preview.h + 8,
        w: topBody.w,
        h: infoRectH,
    };

    const CENTER = { x: 0, y: 0.5, z: 0 };
    const AZIMUTH_RADIUS = 1.8;
    const ELEVATION_RADIUS = 1.4;
    const ELEV_ARC_X = -0.8;
    const visualDistance = 2.6 - (pose.zoom / 10) * 2.0;

    const azRad = toRadians(pose.azimuth);
    const elRad = toRadians(pose.elevation);

    const cameraWorld = {
        x: CENTER.x + visualDistance * Math.sin(azRad) * Math.cos(elRad),
        y: CENTER.y + visualDistance * Math.sin(elRad),
        z: CENTER.z + visualDistance * Math.cos(azRad) * Math.cos(elRad),
    };

    const azimuthHandleWorld = {
        x: AZIMUTH_RADIUS * Math.sin(azRad),
        y: 0.16,
        z: AZIMUTH_RADIUS * Math.cos(azRad),
    };

    const elevationHandleWorld = {
        x: ELEV_ARC_X,
        y: CENTER.y + ELEVATION_RADIUS * Math.sin(elRad),
        z: ELEVATION_RADIUS * Math.cos(elRad),
    };

    const distanceT = 0.15 + ((10 - pose.zoom) / 10) * 0.7;
    const distanceHandleWorld = {
        x: lerp(CENTER.x, cameraWorld.x, distanceT),
        y: lerp(CENTER.y, cameraWorld.y, distanceT),
        z: lerp(CENTER.z, cameraWorld.z, distanceT),
    };

    const camPos = { x: 4, y: 3.5, z: 4 };
    const camTarget = { x: 0, y: 0.3, z: 0 };

    const forward = vec3Norm(vec3Sub(camTarget, camPos));
    const right = vec3Norm(vec3Cross(forward, { x: 0, y: 1, z: 0 }));
    const up = vec3Cross(right, forward);

    const previewCx = preview.x + preview.w * 0.5;
    const previewCy = preview.y + preview.h * 0.5;
    const focal = (preview.w * 0.5) / Math.tan(toRadians(45) * 0.5);

    function project3D(p) {
        const view = vec3Sub(p, camPos);
        const xCam = vec3Dot(view, right);
        const yCam = vec3Dot(view, up);
        const zCam = vec3Dot(view, forward);
        if (zCam <= 0.05) return null;
        return {
            x: previewCx + (xCam / zCam) * focal,
            y: previewCy - (yCam / zCam) * focal,
            z: zCam,
        };
    }

    function drawSegment3D(a, b, color, width) {
        const pa = project3D(a);
        const pb = project3D(b);
        if (!pa || !pb) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
    }

    function drawPolyline3D(points, color, width, closed = false) {
        const projected = points.map(project3D).filter(Boolean);
        if (projected.length < 2) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(projected[0].x, projected[0].y);
        for (let i = 1; i < projected.length; i++) {
            ctx.lineTo(projected[i].x, projected[i].y);
        }
        if (closed) ctx.closePath();
        ctx.stroke();
    }

    ctx.save();
    ctx.lineWidth = 1;
    drawCard(ctx, rect.x, rect.y, rect.w, rect.h, 8, "#0b0d13", "#2f3443");

    drawCard(ctx, topCard.x, topCard.y, topCard.w, topCard.h, 8, "#1e1e2e", "#343a4a");
    const topHeaderGrad = ctx.createLinearGradient(topCard.x, topCard.y, topCard.x, topCard.y + headerH);
    topHeaderGrad.addColorStop(0, "#2a2a3e");
    topHeaderGrad.addColorStop(1, "#1e1e2e");
    ctx.fillStyle = topHeaderGrad;
    ctx.fillRect(topCard.x + 1, topCard.y + 1, topCard.w - 2, headerH);
    ctx.strokeStyle = "#3a3e55";
    ctx.beginPath();
    ctx.moveTo(topCard.x + 1, topCard.y + headerH + 1);
    ctx.lineTo(topCard.x + topCard.w - 1, topCard.y + headerH + 1);
    ctx.stroke();

    ctx.fillStyle = "#E93D82";
    ctx.font = "600 14px sans-serif";
    ctx.fillText("3D 相机控制", topCard.x + 12, topCard.y + 22);

    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#9aa7ca";
    ctx.fillText("拖拽手柄:", topBody.x + 4, topBody.y + 12);

    const tipY = topBody.y + 9;
    let tipX = topBody.x + 62;
    const tips = [
        { color: "#E93D82", label: "方位角" },
        { color: "#00FFD0", label: "仰角" },
        { color: "#FFB800", label: "距离" },
    ];
    for (const tip of tips) {
        ctx.fillStyle = tip.color;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#96a1bf";
        ctx.fillText(tip.label, tipX + 8, tipY + 4);
        tipX += 62;
    }

    const previewBg = ctx.createLinearGradient(preview.x, preview.y, preview.x, preview.y + preview.h);
    previewBg.addColorStop(0, "#02040c");
    previewBg.addColorStop(0.6, "#050a18");
    previewBg.addColorStop(1, "#04060f");
    drawCard(ctx, preview.x, preview.y, preview.w, preview.h, 8, previewBg, "#263145");

    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
        ctx.roundRect(preview.x, preview.y, preview.w, preview.h, 8);
    } else {
        ctx.rect(preview.x, preview.y, preview.w, preview.h);
    }
    ctx.clip();

    ctx.strokeStyle = "rgba(24, 34, 60, 0.75)";
    ctx.lineWidth = 1;
    for (let i = -10; i <= 10; i++) {
        const t = i / 4;
        drawSegment3D({ x: t, y: 0, z: -2.6 }, { x: t, y: 0, z: 2.6 }, "rgba(24, 34, 60, 0.75)", 1);
        drawSegment3D({ x: -2.6, y: 0, z: t }, { x: 2.6, y: 0, z: t }, "rgba(24, 34, 60, 0.75)", 1);
    }

    const planeCorners = [
        { x: CENTER.x - 0.6, y: CENTER.y + 0.6, z: CENTER.z },
        { x: CENTER.x + 0.6, y: CENTER.y + 0.6, z: CENTER.z },
        { x: CENTER.x + 0.6, y: CENTER.y - 0.6, z: CENTER.z },
        { x: CENTER.x - 0.6, y: CENTER.y - 0.6, z: CENTER.z },
    ];
    const pPlane = planeCorners.map(project3D);
    if (pPlane.every(Boolean)) {
        ctx.fillStyle = "rgba(120, 136, 175, 0.35)";
        ctx.strokeStyle = "#E93D82";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(pPlane[0].x, pPlane[0].y);
        for (let i = 1; i < pPlane.length; i++) ctx.lineTo(pPlane[i].x, pPlane[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        const pCenter = project3D(CENTER);
        if (pCenter) {
            ctx.fillStyle = "#ffcc3a";
            ctx.beginPath();
            ctx.arc(pCenter.x, pCenter.y, 2.1, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const ringPoints = [];
    for (let i = 0; i <= 80; i++) {
        const a = (Math.PI * 2 * i) / 80;
        ringPoints.push({
            x: CENTER.x + AZIMUTH_RADIUS * Math.sin(a),
            y: 0.02,
            z: CENTER.z + AZIMUTH_RADIUS * Math.cos(a),
        });
    }
    drawPolyline3D(ringPoints, "rgba(233, 61, 130, 0.95)", 4);

    const innerRing = [];
    for (let i = 0; i <= 64; i++) {
        const a = (Math.PI * 2 * i) / 64;
        innerRing.push({
            x: CENTER.x + 0.58 * Math.sin(a),
            y: 0.01,
            z: CENTER.z + 0.58 * Math.cos(a),
        });
    }
    drawPolyline3D(innerRing, "rgba(233, 61, 130, 0.58)", 2);

    const elevArcPoints = [];
    for (let i = 0; i <= 48; i++) {
        const a = toRadians(-30 + (120 * i) / 48);
        elevArcPoints.push({
            x: ELEV_ARC_X,
            y: CENTER.y + ELEVATION_RADIUS * Math.sin(a),
            z: ELEVATION_RADIUS * Math.cos(a),
        });
    }
    drawPolyline3D(elevArcPoints, "rgba(0, 255, 208, 0.9)", 3.2);

    drawSegment3D(CENTER, cameraWorld, "rgba(255, 184, 0, 0.95)", 2.8);

    const pCamera = project3D(cameraWorld);
    const pCenter = project3D(CENTER);
    if (pCamera && pCenter) {
        const dx = pCenter.x - pCamera.x;
        const dy = pCenter.y - pCamera.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const px = -uy;
        const py = ux;
        const size = clamp(52 / pCamera.z, 8, 16);

        const tip = { x: pCamera.x + ux * size * 1.3, y: pCamera.y + uy * size * 1.3 };
        const base = { x: pCamera.x - ux * size * 0.45, y: pCamera.y - uy * size * 0.45 };

        ctx.fillStyle = "rgba(227, 64, 136, 0.92)";
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(base.x + px * size * 0.55, base.y + py * size * 0.55);
        ctx.lineTo(base.x - px * size * 0.55, base.y - py * size * 0.55);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(255, 204, 0, 0.9)";
        ctx.beginPath();
        ctx.arc(pCamera.x, pCamera.y, size * 0.24, 0, Math.PI * 2);
        ctx.fill();
    }

    const pAz = project3D(azimuthHandleWorld) || { x: previewCx + preview.w * 0.25, y: previewCy, z: 4 };
    const pEl = project3D(elevationHandleWorld) || { x: previewCx - preview.w * 0.25, y: previewCy - preview.h * 0.2, z: 4 };
    const pDist = project3D(distanceHandleWorld) || { x: previewCx, y: previewCy, z: 4 };
    const pArcCenter = project3D({ x: ELEV_ARC_X, y: CENTER.y, z: 0 }) || { x: previewCx - preview.w * 0.2, y: previewCy, z: 4 };

    const azRadius = clamp(40 / pAz.z, 7, 11);
    const elRadius = clamp(40 / pEl.z, 7, 11);
    const distRadius = clamp(40 / pDist.z, 7, 11);

    drawGlowOrb(ctx, pAz.x, pAz.y, azRadius, "#E93D82", 0.45);
    drawGlowOrb(ctx, pEl.x, pEl.y, elRadius, "#00F3DB", 0.45);
    drawGlowOrb(ctx, pDist.x, pDist.y, distRadius, "#FFC21A", 0.5);

    if (pCenter) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(pCenter.x, pCenter.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    drawCard(ctx, infoRect.x, infoRect.y, infoRect.w, infoRect.h, 6, "#1a1a2a", "#333849");
    ctx.fillStyle = "#E93D82";
    ctx.font = "600 11px sans-serif";
    ctx.fillText("【相机姿态】", infoRect.x + 8, infoRect.y + 14);

    const infoRows = [
        {
            label: "Y轴(水平)",
            value: `${Math.round(pose.azimuth)}°`,
            tag: directionLabel,
            tagFill: "rgba(233, 61, 130, 0.30)",
            tagColor: "#E93D82",
        },
        {
            label: "X轴(垂直)",
            value: `${Math.round(pose.elevation)}°`,
            tag: elevationLabel,
            tagFill: "rgba(0, 255, 208, 0.25)",
            tagColor: "#00FFD0",
        },
        {
            label: "缩放距离",
            value: `${pose.zoom.toFixed(1)}`,
            tag: zoomLabel,
            tagFill: "rgba(255, 184, 0, 0.25)",
            tagColor: "#FFB800",
        },
    ];

    for (let i = 0; i < infoRows.length; i++) {
        const row = infoRows[i];
        const y = infoRect.y + 26 + i * 12.5;

        ctx.fillStyle = "#9aa1bc";
        ctx.font = "10px sans-serif";
        ctx.fillText(row.label, infoRect.x + 8, y);

        ctx.fillStyle = "#f2f5ff";
        ctx.font = "600 11px sans-serif";
        ctx.fillText(row.value, infoRect.x + 63, y);

        const tagX = infoRect.x + 106;
        const tagY = y - 9.5;
        const tagW = Math.min(infoRect.w - 114, Math.max(64, ctx.measureText(row.tag).width + 10));
        const tagH = 11.5;
        drawCard(ctx, tagX, tagY, tagW, tagH, 4, row.tagFill, "rgba(0,0,0,0)");
        ctx.fillStyle = row.tagColor;
        ctx.font = "9px sans-serif";
        ctx.fillText(row.tag, tagX + 5, y - 0.3);
    }

    drawCard(ctx, manualCard.x, manualCard.y, manualCard.w, manualCard.h, 8, "#1e1e2e", "#343a4a");
    const manualHeaderGrad = ctx.createLinearGradient(manualCard.x, manualCard.y, manualCard.x, manualCard.y + headerH);
    manualHeaderGrad.addColorStop(0, "#2a2a3e");
    manualHeaderGrad.addColorStop(1, "#1e1e2e");
    ctx.fillStyle = manualHeaderGrad;
    ctx.fillRect(manualCard.x + 1, manualCard.y + 1, manualCard.w - 2, headerH);
    ctx.strokeStyle = "#3a3e55";
    ctx.beginPath();
    ctx.moveTo(manualCard.x + 1, manualCard.y + headerH + 1);
    ctx.lineTo(manualCard.x + manualCard.w - 1, manualCard.y + headerH + 1);
    ctx.stroke();
    ctx.fillStyle = "#E93D82";
    ctx.font = "600 14px sans-serif";
    ctx.fillText("手动控制", manualCard.x + 12, manualCard.y + 22);

    const resetButton = {
        x: manualCard.x + manualCard.w - 98,
        y: manualCard.y + 7,
        w: 84,
        h: 20,
    };
    drawCard(ctx, resetButton.x, resetButton.y, resetButton.w, resetButton.h, 5, "#2d3549", "#4a5779");
    ctx.fillStyle = "#d8deef";
    ctx.font = "600 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("重置姿态", resetButton.x + resetButton.w * 0.5, resetButton.y + 14);
    ctx.textAlign = "left";

    const sliderDefs = [
        {
            key: "azimuth",
            label: "方位角（水平角度）",
            min: 0,
            max: 360,
            value: pose.azimuth,
            valueText: `${pose.azimuth.toFixed(0)}°`,
            ticks: [
                { v: 0, label: "0°" },
                { v: 90, label: "90°" },
                { v: 180, label: "180°" },
                { v: 270, label: "270°" },
                { v: 360, label: "360°" },
            ],
        },
        {
            key: "elevation",
            label: "仰角（垂直角度）",
            min: -30,
            max: 90,
            value: pose.elevation,
            valueText: `${pose.elevation.toFixed(0)}°`,
            ticks: [
                { v: -30, label: "-30°（低）" },
                { v: 0, label: "0°（平视）" },
                { v: 90, label: "90°（俯视）" },
            ],
        },
        {
            key: "zoom",
            label: "缩放（距离）",
            min: 0,
            max: 10,
            value: pose.zoom,
            valueText: pose.zoom.toFixed(1),
            ticks: [
                { v: 0, label: "0（广角）" },
                { v: 5, label: "5（中等）" },
                { v: 10, label: "10（近景）" },
            ],
        },
    ];

    const sliderX = manualBody.x + 2;
    const sliderW = manualBody.w - 4;
    const sliderStartY = manualBody.y + 2;
    const sliderBlockH = 56;
    const sliders = {};

    for (let i = 0; i < sliderDefs.length; i++) {
        const def = sliderDefs[i];
        const y = sliderStartY + i * sliderBlockH;
        const trackY = y + 30;

        ctx.fillStyle = "#9aa7ca";
        ctx.font = "12px sans-serif";
        ctx.fillText(def.label, sliderX, y + 1);

        const valueBoxW = 48;
        const valueBoxH = 20;
        const valueBoxX = sliderX + sliderW - valueBoxW;
        const valueBoxY = y - 11;
        drawCard(ctx, valueBoxX, valueBoxY, valueBoxW, valueBoxH, 5, "#0b0f1a", "#2d3549");
        ctx.fillStyle = "#E93D82";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(def.valueText, valueBoxX + valueBoxW * 0.5, valueBoxY + 14);
        ctx.textAlign = "left";

        ctx.strokeStyle = "#04070f";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(sliderX, trackY);
        ctx.lineTo(sliderX + sliderW, trackY);
        ctx.stroke();

        const progress = (def.value - def.min) / (def.max - def.min);
        const knobX = sliderX + sliderW * clamp(progress, 0, 1);
        ctx.fillStyle = "#E93D82";
        ctx.beginPath();
        ctx.arc(knobX, trackY, 8.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#646f8f";
        ctx.font = "10px sans-serif";
        for (const tick of def.ticks) {
            const t = (tick.v - def.min) / (def.max - def.min);
            const tx = sliderX + sliderW * t;
            ctx.textAlign = "center";
            ctx.fillText(tick.label, tx, trackY + 22);
        }
        ctx.textAlign = "left";

        sliders[def.key] = {
            min: def.min,
            max: def.max,
            trackX: sliderX,
            trackY,
            trackW: sliderW,
            knobX,
            knobY: trackY,
            knobR: 8.5,
            hitYPad: 12,
        };
    }

    drawCard(ctx, promptCard.x, promptCard.y, promptCard.w, promptCard.h, 8, "#1e1e2e", "#343a4a");
    const promptHeaderGrad = ctx.createLinearGradient(promptCard.x, promptCard.y, promptCard.x, promptCard.y + headerH);
    promptHeaderGrad.addColorStop(0, "#2a2a3e");
    promptHeaderGrad.addColorStop(1, "#1e1e2e");
    ctx.fillStyle = promptHeaderGrad;
    ctx.fillRect(promptCard.x + 1, promptCard.y + 1, promptCard.w - 2, headerH);
    ctx.strokeStyle = "#3a3e55";
    ctx.beginPath();
    ctx.moveTo(promptCard.x + 1, promptCard.y + headerH + 1);
    ctx.lineTo(promptCard.x + promptCard.w - 1, promptCard.y + headerH + 1);
    ctx.stroke();
    ctx.fillStyle = "#E93D82";
    ctx.font = "600 14px sans-serif";
    ctx.fillText("提示词预览", promptCard.x + 12, promptCard.y + 22);

    drawCard(ctx, promptBody.x, promptBody.y, promptBody.w, promptBody.h, 6, "#0a0a0f", "#333");
    ctx.fillStyle = "#00FFD0";
    ctx.font = "11px monospace";
    drawWrappedText(ctx, prompt, promptBody.x + 8, promptBody.y + 14, promptBody.w - 16, 14, 3);
    ctx.restore();

    const center2D = project3D(CENTER) || { x: previewCx, y: previewCy, z: 4 };
    const arcCenter2D = pArcCenter || { x: previewCx - preview.w * 0.2, y: previewCy, z: 4 };
    const handleHitRadius = Math.max(10, azRadius + 2);

    node._qwenPoseState = {
        preview,
        center: { x: center2D.x, y: center2D.y },
        centerWorld: { x: CENTER.x, y: CENTER.y, z: CENTER.z },
        elevationPlaneX: ELEV_ARC_X,
        azimuthHandle: { x: pAz.x, y: pAz.y, r: handleHitRadius },
        elevationArc: { x: arcCenter2D.x, y: arcCenter2D.y },
        elevationHandle: { x: pEl.x, y: pEl.y, r: handleHitRadius },
        distanceHandle: { x: pDist.x, y: pDist.y, r: handleHitRadius },
        camera: { x: pCamera?.x ?? pDist.x, y: pCamera?.y ?? pDist.y },
        projection: {
            camPos: { x: camPos.x, y: camPos.y, z: camPos.z },
            forward: { x: forward.x, y: forward.y, z: forward.z },
            right: { x: right.x, y: right.y, z: right.z },
            up: { x: up.x, y: up.y, z: up.z },
            focal,
            cx: previewCx,
            cy: previewCy,
        },
        sliders,
        resetButton,
    };
}

function hitTest(node, localPos) {
    const state = node._qwenPoseState;
    if (!state || !Array.isArray(localPos) || localPos.length < 2) return null;
    const [x, y] = localPos;

    if (
        state.resetButton &&
        x >= state.resetButton.x &&
        x <= state.resetButton.x + state.resetButton.w &&
        y >= state.resetButton.y &&
        y <= state.resetButton.y + state.resetButton.h
    ) {
        return "reset";
    }

    const azDx = x - state.azimuthHandle.x;
    const azDy = y - state.azimuthHandle.y;
    if (azDx * azDx + azDy * azDy <= state.azimuthHandle.r * state.azimuthHandle.r) return "azimuth";

    const elDx = x - state.elevationHandle.x;
    const elDy = y - state.elevationHandle.y;
    if (elDx * elDx + elDy * elDy <= state.elevationHandle.r * state.elevationHandle.r) return "elevation";

    const distDx = x - state.distanceHandle.x;
    const distDy = y - state.distanceHandle.y;
    if (distDx * distDx + distDy * distDy <= state.distanceHandle.r * state.distanceHandle.r) return "distance";

    if (state.sliders) {
        for (const [key, slider] of Object.entries(state.sliders)) {
            const knobDx = x - slider.knobX;
            const knobDy = y - slider.knobY;
            if (knobDx * knobDx + knobDy * knobDy <= (slider.knobR ?? 9) * (slider.knobR ?? 9)) {
                return `slider:${key}`;
            }
        }
        for (const [key, slider] of Object.entries(state.sliders)) {
            const yPad = slider.hitYPad ?? 12;
            if (
                x >= slider.trackX - 8 &&
                x <= slider.trackX + slider.trackW + 8 &&
                y >= slider.trackY - yPad &&
                y <= slider.trackY + yPad
            ) {
                return `slider:${key}`;
            }
        }
    }

    if (
        state.preview &&
        x >= state.preview.x &&
        x <= state.preview.x + state.preview.w &&
        y >= state.preview.y &&
        y <= state.preview.y + state.preview.h
    ) {
        return "preview";
    }
    return null;
}

function updateAzimuth(node, localPos) {
    const state = node._qwenPoseState;
    if (!state) return;

    let azimuth = null;
    const ray = screenPointToRay(state, localPos);
    const center = state.centerWorld || { x: 0, y: 0, z: 0 };
    const hit = rayPlaneIntersection(
        ray,
        { x: 0, y: 1, z: 0 },
        { x: center.x, y: 0, z: center.z }
    );
    if (hit) {
        const dx = hit.x - center.x;
        const dz = hit.z - center.z;
        if (Math.hypot(dx, dz) > 1e-4) {
            azimuth = normalizeAzimuth(toDegrees(Math.atan2(dx, dz)));
        }
    }

    if (azimuth === null && Array.isArray(localPos) && localPos.length >= 2) {
        const [x, y] = localPos;
        const dx = x - state.center.x;
        const dy = y - state.center.y;
        azimuth = normalizeAzimuth(toDegrees(Math.atan2(dx, -dy)));
    }
    if (azimuth === null) return;

    const pose = getPoseSnapshot(node);
    writePoseSnapshot(node, { ...pose, azimuth });
}

function updateElevation(node, localPos) {
    const state = node._qwenPoseState;
    if (!state) return;

    let elevation = null;
    const ray = screenPointToRay(state, localPos);
    const center = state.centerWorld || { x: 0, y: 0.5, z: 0 };
    const planeX = state.elevationPlaneX ?? -0.8;
    const hit = rayPlaneIntersection(
        ray,
        { x: 1, y: 0, z: 0 },
        { x: planeX, y: center.y, z: center.z }
    );
    if (hit) {
        const relY = hit.y - center.y;
        const relZ = hit.z - center.z;
        elevation = clamp(toDegrees(Math.atan2(relY, relZ)), -30, 90);
    }

    if (elevation === null && Array.isArray(localPos) && localPos.length >= 2) {
        const [x, y] = localPos;
        const dx = x - state.elevationArc.x;
        const dy = state.elevationArc.y - y;
        elevation = clamp(toDegrees(Math.atan2(dy, dx)), -30, 90);
    }
    if (elevation === null) return;

    const pose = getPoseSnapshot(node);
    writePoseSnapshot(node, { ...pose, elevation });
}

function beginDistanceDrag(node, localPos) {
    const state = node?._qwenPoseState;
    if (!state || !Array.isArray(localPos) || localPos.length < 2) return null;
    const center = state.center;
    const camera = state.camera;
    if (!center || !camera) return null;

    const axisX = camera.x - center.x;
    const axisY = camera.y - center.y;
    const axisLen = Math.hypot(axisX, axisY);
    if (axisLen < 1e-4) return null;

    const ux = axisX / axisLen;
    const uy = axisY / axisLen;

    const [x, y] = localPos;
    const startProj = (x - center.x) * ux + (y - center.y) * uy;
    const startZoom = getPoseSnapshot(node).zoom;

    // Use a minimum effective span so near-camera drags do not become too sensitive.
    const effectiveSpanPx = Math.max(axisLen * 0.7, 170);
    const zoomPerPx = 10 / effectiveSpanPx;

    const drag = {
        center: { x: center.x, y: center.y },
        ux,
        uy,
        startProj,
        startZoom,
        zoomPerPx,
        smoothZoom: startZoom,
    };
    node._qwenPoseDistanceDrag = drag;
    return drag;
}

function updateZoomByDistance(node, localPos) {
    let drag = node?._qwenPoseDistanceDrag;
    if (!drag) {
        drag = beginDistanceDrag(node, localPos);
    }
    if (!drag || !Array.isArray(localPos) || localPos.length < 2) return;

    const [x, y] = localPos;
    const proj = (x - drag.center.x) * drag.ux + (y - drag.center.y) * drag.uy;
    const delta = proj - drag.startProj;
    const targetZoom = clamp(drag.startZoom - delta * drag.zoomPerPx, 0, 10);

    // Mild damping reduces tiny direction flips from event noise near the near-camera end.
    drag.smoothZoom = drag.smoothZoom + (targetZoom - drag.smoothZoom) * 0.35;

    const pose = getPoseSnapshot(node);
    if (Math.abs(drag.smoothZoom - pose.zoom) < 0.01) return;
    writePoseSnapshot(node, { ...pose, zoom: drag.smoothZoom });
}

function updateSlider(node, key, localPos) {
    const state = node._qwenPoseState;
    if (!state?.sliders || !Array.isArray(localPos) || localPos.length < 2) return;
    const slider = state.sliders[key];
    if (!slider) return;
    const [x] = localPos;
    const t = clamp((x - slider.trackX) / slider.trackW, 0, 1);
    const value = slider.min + (slider.max - slider.min) * t;
    const pose = getPoseSnapshot(node);
    if (key === "azimuth") {
        writePoseSnapshot(node, { ...pose, azimuth: value });
        return;
    }
    if (key === "elevation") {
        writePoseSnapshot(node, { ...pose, elevation: value });
        return;
    }
    if (key === "zoom") {
        writePoseSnapshot(node, { ...pose, zoom: value });
    }
}

function resetPose(node) {
    writePoseSnapshot(node, { azimuth: 0, elevation: 0, zoom: 5 });
}

function setupQwenPanelNode(nodeType) {
    const ensureSize = (node) => {
        const minWidth = 700;
        const minHeight = 1220;
        const width = Math.max(node?.size?.[0] ?? minWidth, minWidth);
        const height = Math.max(node?.size?.[1] ?? minHeight, minHeight);
        if (!node.size || node.size[0] !== width || node.size[1] !== height) {
            node.size = [width, height];
        }
    };

    const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
        originalOnNodeCreated?.apply(this, arguments);
        this._qwenPoseDragMode = null;
        this._qwenPoseDistanceDrag = null;
        ensureSize(this);
    };

    const originalOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
        originalOnConfigure?.apply(this, arguments);
        this._qwenPoseDragMode = null;
        this._qwenPoseDistanceDrag = null;
        ensureSize(this);
    };

    const originalOnDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
        originalOnDrawForeground?.apply(this, arguments);
        ensureSize(this);
        drawInlineQwenPanel(this, ctx);
    };

    const originalOnMouseDown = nodeType.prototype.onMouseDown;
    nodeType.prototype.onMouseDown = function (e, localPos, graphCanvas) {
        const hit = hitTest(this, localPos);
        if (hit === "reset") {
            this._qwenPoseDragMode = null;
            this._qwenPoseDistanceDrag = null;
            resetPose(this);
            return true;
        }
        if (typeof hit === "string" && hit.startsWith("slider:")) {
            const key = hit.slice("slider:".length);
            this._qwenPoseDragMode = hit;
            this._qwenPoseDistanceDrag = null;
            updateSlider(this, key, localPos);
            return true;
        }
        if (hit === "azimuth") {
            this._qwenPoseDragMode = "azimuth";
            this._qwenPoseDistanceDrag = null;
            updateAzimuth(this, localPos);
            return true;
        }
        if (hit === "elevation") {
            this._qwenPoseDragMode = "elevation";
            this._qwenPoseDistanceDrag = null;
            updateElevation(this, localPos);
            return true;
        }
        if (hit === "distance") {
            this._qwenPoseDragMode = "distance";
            beginDistanceDrag(this, localPos);
            return true;
        }
        return originalOnMouseDown?.apply(this, arguments);
    };

    const originalOnMouseMove = nodeType.prototype.onMouseMove;
    nodeType.prototype.onMouseMove = function (e, localPos, graphCanvas) {
        if (this._qwenPoseDragMode && e && e.buttons === 0) {
            this._qwenPoseDragMode = null;
            this._qwenPoseDistanceDrag = null;
        }
        if (typeof this._qwenPoseDragMode === "string" && this._qwenPoseDragMode.startsWith("slider:")) {
            const key = this._qwenPoseDragMode.slice("slider:".length);
            updateSlider(this, key, localPos);
            return true;
        }
        if (this._qwenPoseDragMode === "azimuth") {
            updateAzimuth(this, localPos);
            return true;
        }
        if (this._qwenPoseDragMode === "elevation") {
            updateElevation(this, localPos);
            return true;
        }
        if (this._qwenPoseDragMode === "distance") {
            updateZoomByDistance(this, localPos);
            return true;
        }
        return originalOnMouseMove?.apply(this, arguments);
    };

    const originalOnMouseUp = nodeType.prototype.onMouseUp;
    nodeType.prototype.onMouseUp = function () {
        this._qwenPoseDragMode = null;
        this._qwenPoseDistanceDrag = null;
        return originalOnMouseUp?.apply(this, arguments);
    };

    const originalOnMouseWheel = nodeType.prototype.onMouseWheel;
    nodeType.prototype.onMouseWheel = function (e, localPos, graphCanvas) {
        const hit = hitTest(this, localPos);
        if (
            hit === "preview" ||
            hit === "azimuth" ||
            hit === "elevation" ||
            hit === "distance" ||
            hit === "slider:zoom"
        ) {
            // Match popup: consume wheel on 3D panel to prevent accidental zoom edits.
            return true;
        }
        return originalOnMouseWheel?.apply(this, arguments);
    };
}

app.registerExtension({
    name: "Comfy.CameraPoseQwenPanelInline",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (!matchesNodeRegistration(nodeData, ["CameraPoseQwenPanel", "Camera Pose Qwen Panel"])) {
            return;
        }
        console.log("[CameraPoseQwenPanel] Bind inline UI:", nodeData?.name, nodeData?.display_name);
        setupQwenPanelNode(nodeType);
    },
});


