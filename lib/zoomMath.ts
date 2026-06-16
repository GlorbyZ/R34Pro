/** Pure math for pinch / pan / wheel zoom on contained media. */

import { MAX_ZOOM_SCALE, MIN_ZOOM_SCALE } from './constants';

export interface Vec2 {
  x: number;
  y: number;
}

export const DEFAULT_ZOOM_SCALE = 1;
export const ZOOM_SNAP_BAND = 0.08;
export const ZOOM_SNAP_THRESHOLD = 1.04;
export const DOUBLE_TAP_ZOOM_SCALE = 2.5;
export const DOUBLE_TAP_DELAY_MS = 280;
export const DOUBLE_TAP_SLOP_PX = 28;

export function isDefaultZoom(scale: number): boolean {
  return Math.abs(scale - DEFAULT_ZOOM_SCALE) <= ZOOM_SNAP_BAND;
}

export function canPanZoom(scale: number): boolean {
  return !isDefaultZoom(scale);
}

export function clampScale(scale: number, maxScale: number = MAX_ZOOM_SCALE): number {
  return Math.min(maxScale, Math.max(MIN_ZOOM_SCALE, scale));
}

export function touchDistance(touches: TouchList): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

export function touchCentroid(touches: TouchList): Vec2 {
  if (touches.length < 2) {
    return { x: touches[0].clientX, y: touches[0].clientY };
  }
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

/**
 * Keep a screen point fixed while changing scale.
 * Transform origin is the center of the container; position is pre-scale translate in px.
 */
export function zoomAtContainerPoint(
  currentScale: number,
  currentPos: Vec2,
  targetScale: number,
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  maxScale: number = MAX_ZOOM_SCALE
): { scale: number; position: Vec2 } {
  const scale = clampScale(targetScale, maxScale);
  if (isDefaultZoom(scale)) {
    return { scale: DEFAULT_ZOOM_SCALE, position: { x: 0, y: 0 } };
  }

  const cx = containerRect.left + containerRect.width / 2;
  const cy = containerRect.top + containerRect.height / 2;
  const focalX = clientX - cx;
  const focalY = clientY - cy;
  const ratio = scale / currentScale;

  return {
    scale,
    position: {
      x: currentPos.x - focalX * (ratio - 1),
      y: currentPos.y - focalY * (ratio - 1),
    },
  };
}

/** Clamp pan so zoomed media stays within sensible bounds (in or out). */
export function clampPanToBounds(
  position: Vec2,
  scale: number,
  containerRect: DOMRect,
  mediaRect: DOMRect | null
): Vec2 {
  if (!mediaRect || isDefaultZoom(scale)) {
    return { x: 0, y: 0 };
  }

  const baseW = mediaRect.width / scale;
  const baseH = mediaRect.height / scale;
  const scaledW = baseW * scale;
  const scaledH = baseH * scale;

  const overflowX = (scaledW - containerRect.width) / 2;
  const overflowY = (scaledH - containerRect.height) / 2;
  const rubberX = containerRect.width * 0.1;
  const rubberY = containerRect.height * 0.1;

  if (overflowX <= 0 && overflowY <= 0) {
    const slackX = Math.max(0, -overflowX);
    const slackY = Math.max(0, -overflowY);
    return {
      x: slackX > 0 ? Math.min(slackX + rubberX, Math.max(-slackX - rubberX, position.x)) : 0,
      y: slackY > 0 ? Math.min(slackY + rubberY, Math.max(-slackY - rubberY, position.y)) : 0,
    };
  }

  return {
    x:
      overflowX > 0
        ? Math.min(overflowX + rubberX, Math.max(-overflowX - rubberX, position.x))
        : 0,
    y:
      overflowY > 0
        ? Math.min(overflowY + rubberY, Math.max(-overflowY - rubberY, position.y))
        : 0,
  };
}

export function snapZoom(scale: number): { scale: number; position: Vec2 } {
  if (isDefaultZoom(scale)) {
    return { scale: DEFAULT_ZOOM_SCALE, position: { x: 0, y: 0 } };
  }
  return { scale, position: { x: 0, y: 0 } };
}
