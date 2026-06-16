import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { MAX_ZOOM_SCALE, MIN_PINCH_DISTANCE } from '../lib/constants';
import {
  clampPanToBounds,
  clampScale,
  canPanZoom,
  DEFAULT_ZOOM_SCALE,
  DOUBLE_TAP_DELAY_MS,
  DOUBLE_TAP_SLOP_PX,
  DOUBLE_TAP_ZOOM_SCALE,
  isDefaultZoom,
  snapZoom,
  touchCentroid,
  touchDistance,
  type Vec2,
  zoomAtContainerPoint,
} from '../lib/zoomMath';

export type ZoomGestureMode = 'none' | 'pan' | 'pinch' | 'swipe';

export interface MediaZoomGestureOptions {
  enabled: boolean;
  getContainer: () => HTMLElement | null;
  getMediaElement: () => HTMLElement | null;
  scaleRef: RefObject<number>;
  positionRef: RefObject<Vec2>;
  setScale: (value: number) => void;
  setPosition: (value: Vec2) => void;
  setIsDragging: (value: boolean) => void;
  isChromeTarget: (target: EventTarget | null) => boolean;
  onPinchActivity?: () => void;
  onSwipePrev: () => void;
  onSwipeNext: () => void;
  onSingleTap: () => void;
  onSwipeDownClose?: () => void;
  canSwipeNavigate: () => boolean;
  canSwipeDownClose: () => boolean;
}

export function useMediaZoomGestures(options: MediaZoomGestureOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const attachGestureLayer = useCallback((element: HTMLElement | null) => {
    if (!element) return () => {};

    let startX = 0;
    let startY = 0;
    let gesture: ZoomGestureMode = 'none';
    let pinchReady = false;
    let pinchStartDistance = 0;
    let pinchStartScale = 1;
    let pinchStartPosition: Vec2 = { x: 0, y: 0 };
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let singleTapTimer: ReturnType<typeof setTimeout> | null = null;

    const clearSingleTapTimer = () => {
      if (singleTapTimer) {
        clearTimeout(singleTapTimer);
        singleTapTimer = null;
      }
    };

    const applyZoom = (scale: number, position: Vec2) => {
      const opts = optionsRef.current;
      const container = opts.getContainer();
      const media = opts.getMediaElement();
      const containerRect = container?.getBoundingClientRect();
      const mediaRect = media?.getBoundingClientRect() ?? null;
      const clamped =
        containerRect && canPanZoom(scale)
          ? clampPanToBounds(position, scale, containerRect, mediaRect)
          : position;
      opts.setScale(scale);
      opts.setPosition(clamped);
    };

    const onTouchStart = (event: TouchEvent) => {
      const opts = optionsRef.current;
      if (!opts.enabled || opts.isChromeTarget(event.target)) return;
      clearSingleTapTimer();

      if (event.touches.length === 2) {
        gesture = 'pinch';
        pinchStartDistance = touchDistance(event.touches);
        pinchReady = pinchStartDistance >= MIN_PINCH_DISTANCE;
        pinchStartScale = opts.scaleRef.current ?? 1;
        pinchStartPosition = { ...(opts.positionRef.current ?? { x: 0, y: 0 }) };
        opts.onPinchActivity?.();
        return;
      }

      if (event.touches.length === 1) {
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        const currentScale = opts.scaleRef.current ?? 1;
        if (canPanZoom(currentScale)) {
          gesture = 'pan';
          const pos = opts.positionRef.current ?? { x: 0, y: 0 };
          opts.setIsDragging(true);
          (element as any).__panOffset = {
            x: startX - pos.x,
            y: startY - pos.y,
          };
        } else {
          gesture = 'none';
        }
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      const opts = optionsRef.current;
      if (!opts.enabled) return;

      if (gesture === 'pinch' && event.touches.length === 2) {
        event.preventDefault();
        const distance = touchDistance(event.touches);
        if (!pinchReady) {
          if (distance < MIN_PINCH_DISTANCE) return;
          pinchReady = true;
          pinchStartDistance = distance;
          return;
        }
        if (pinchStartDistance <= 0) {
          pinchStartDistance = distance;
          return;
        }

        const container = opts.getContainer();
        const containerRect = container?.getBoundingClientRect();
        if (!containerRect) return;

        const centroid = touchCentroid(event.touches);
        const nextScale = clampScale(
          pinchStartScale * (distance / pinchStartDistance),
          MAX_ZOOM_SCALE
        );
        const { scale, position } = zoomAtContainerPoint(
          pinchStartScale,
          pinchStartPosition,
          nextScale,
          centroid.x,
          centroid.y,
          containerRect,
          MAX_ZOOM_SCALE
        );
        applyZoom(scale, position);
        return;
      }

      if (gesture === 'pan' && event.touches.length === 1) {
        const currentScale = opts.scaleRef.current ?? 1;
        if (!canPanZoom(currentScale)) return;
        event.preventDefault();
        const offset = (element as any).__panOffset as Vec2 | undefined;
        if (!offset) return;
        applyZoom(currentScale, {
          x: event.touches[0].clientX - offset.x,
          y: event.touches[0].clientY - offset.y,
        });
        return;
      }

      if (event.touches.length === 1 && isDefaultZoom(opts.scaleRef.current ?? 1) && gesture !== 'pinch') {
        const dx = event.touches[0].clientX - startX;
        const dy = event.touches[0].clientY - startY;
        if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.15) {
          gesture = 'swipe';
          event.preventDefault();
        }
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      const opts = optionsRef.current;
      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const travel = Math.hypot(deltaX, deltaY);

      if (gesture === 'pinch' || gesture === 'pan') {
        gesture = 'none';
        opts.setIsDragging(false);
        const snapped = snapZoom(opts.scaleRef.current ?? 1);
        if (isDefaultZoom(snapped.scale)) {
          opts.setScale(DEFAULT_ZOOM_SCALE);
          opts.setPosition({ x: 0, y: 0 });
        } else {
          const container = opts.getContainer();
          const media = opts.getMediaElement();
          const containerRect = container?.getBoundingClientRect();
          const mediaRect = media?.getBoundingClientRect() ?? null;
          const pos = opts.positionRef.current ?? { x: 0, y: 0 };
          if (containerRect) {
            opts.setPosition(clampPanToBounds(pos, snapped.scale, containerRect, mediaRect));
          }
        }
        return;
      }

      if (!isDefaultZoom(opts.scaleRef.current ?? 1)) {
        gesture = 'none';
        return;
      }

      if (opts.canSwipeDownClose() && deltaY > 90 && deltaY > Math.abs(deltaX) * 1.3) {
        opts.onSwipeDownClose?.();
        gesture = 'none';
        return;
      }

      if (
        opts.canSwipeNavigate() &&
        (gesture === 'swipe' || (Math.abs(deltaX) >= 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15))
      ) {
        if (deltaX > 0) opts.onSwipePrev();
        else opts.onSwipeNext();
        gesture = 'none';
        return;
      }

      if (travel < 16) {
        const now = Date.now();
        const isDoubleTap =
          now - lastTapTime < DOUBLE_TAP_DELAY_MS &&
          Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY) < DOUBLE_TAP_SLOP_PX;

        if (isDoubleTap) {
          clearSingleTapTimer();
          lastTapTime = 0;
          const container = opts.getContainer();
          const containerRect = container?.getBoundingClientRect();
          const currentScale = opts.scaleRef.current ?? 1;
          if (!containerRect) return;

          if (!isDefaultZoom(currentScale)) {
            opts.setScale(DEFAULT_ZOOM_SCALE);
            opts.setPosition({ x: 0, y: 0 });
          } else {
            const { scale, position } = zoomAtContainerPoint(
              DEFAULT_ZOOM_SCALE,
              { x: 0, y: 0 },
              DOUBLE_TAP_ZOOM_SCALE,
              touch.clientX,
              touch.clientY,
              containerRect,
              MAX_ZOOM_SCALE
            );
            applyZoom(scale, position);
          }
          gesture = 'none';
          return;
        }

        lastTapTime = now;
        lastTapX = touch.clientX;
        lastTapY = touch.clientY;
        clearSingleTapTimer();
        singleTapTimer = setTimeout(() => {
          singleTapTimer = null;
          opts.onSingleTap();
        }, DOUBLE_TAP_DELAY_MS);
      }

      gesture = 'none';
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd, { passive: true });
    element.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      clearSingleTapTimer();
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  return { attachGestureLayer };
}

export function useMediaWheelZoom(options: {
  enabled: boolean;
  getContainer: () => HTMLElement | null;
  getMediaElement: () => HTMLElement | null;
  scaleRef: RefObject<number>;
  positionRef: RefObject<Vec2>;
  setScale: (value: number) => void;
  setPosition: (value: Vec2) => void;
  resetDeps?: unknown[];
}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const container = options.getContainer();
    if (!container || !options.enabled) return;

    const handleWheel = (event: WheelEvent) => {
      const opts = optionsRef.current;
      event.preventDefault();
      const currentScale = opts.scaleRef.current ?? 1;
      const currentPos = opts.positionRef.current ?? { x: 0, y: 0 };
      const delta = -event.deltaY * 0.0018;
      const targetScale = clampScale(currentScale * (1 + delta), MAX_ZOOM_SCALE);
      if (Math.abs(targetScale - currentScale) < 0.001) return;

      const containerRect = container.getBoundingClientRect();
      const { scale, position } = zoomAtContainerPoint(
        currentScale,
        currentPos,
        targetScale,
        event.clientX,
        event.clientY,
        containerRect,
        MAX_ZOOM_SCALE
      );
      const mediaRect = opts.getMediaElement()?.getBoundingClientRect() ?? null;
      opts.setScale(scale);
      opts.setPosition(
        canPanZoom(scale) && mediaRect
          ? clampPanToBounds(position, scale, containerRect, mediaRect)
          : { x: 0, y: 0 }
      );
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [options.enabled, ...(options.resetDeps ?? [])]);
}
