/** Platform detection for R34 Pro — Android WebView vs mobile browser vs desktop extension. */

export const isAndroidApp = (): boolean =>
  typeof window !== 'undefined' && !!(window as any).R34ProAndroid;

export const isMobileViewport = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 900px)').matches || isAndroidApp();
};

export const isLandscape = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(orientation: landscape)').matches;
};

export const defaultGridSize = (): number => (isMobileViewport() ? 2 : 4);

export const effectiveGridColumns = (gridSize: number, mobile: boolean, landscape: boolean): number => {
  if (!mobile) return gridSize;
  if (landscape) return Math.min(gridSize, 5);
  return Math.min(gridSize, 3);
};
