import React, { useRef } from 'react';
import { BoutiqueSelect } from '../ui/BoutiqueSelect';

const stopLightboxChromeEvent = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

const LightboxChromeButton = ({
  onClick,
  title,
  className,
  children,
  disabled,
}: {
  onClick: () => void;
  title: string;
  className: string;
  children: React.ReactNode;
  disabled?: boolean;
}) => {
  const actionLockRef = useRef(false);

  const runAction = (event: React.SyntheticEvent) => {
    event.preventDefault();
    stopLightboxChromeEvent(event);
    if (disabled || actionLockRef.current) return;
    actionLockRef.current = true;
    onClick();
    window.setTimeout(() => {
      actionLockRef.current = false;
    }, 320);
  };

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onPointerDown={stopLightboxChromeEvent}
      onTouchStart={stopLightboxChromeEvent}
      onTouchEnd={runAction}
      onClick={runAction}
      className={`lightbox-chrome-btn ${className}`}
    >
      {children}
    </button>
  );
};

export const LightboxChromeLayer = ({
  closeLightbox,
  onDownload,
  isAndroidApp,
  lightboxUiVisible,
  resetLightboxUiTimer,
  isMobile,
  isPlaying,
  slideTick,
  slideMaxTicks,
  slideshowInterval,
  setSlideshowInterval,
  navigateToPost,
  loading,
  setIsPlaying,
}: {
  closeLightbox: () => void;
  onDownload: () => void;
  isAndroidApp: boolean;
  lightboxUiVisible: boolean;
  resetLightboxUiTimer: () => void;
  isMobile: boolean;
  isPlaying: boolean;
  slideTick: number;
  slideMaxTicks: number;
  slideshowInterval: number;
  setSlideshowInterval: (value: number) => void;
  navigateToPost: (direction: 'prev' | 'next') => void;
  loading: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
}) => (
  <div
    className="lightbox-chrome-root fixed inset-0 z-[100000010] pointer-events-none"
    onClick={(event) => event.stopPropagation()}
  >
    <div
      className={`lightbox-chrome-top lightbox-top-actions pointer-events-auto absolute top-0 right-0 flex gap-2 p-3 transition-opacity duration-300 ${isAndroidApp && !lightboxUiVisible ? 'opacity-70' : 'opacity-100'}`}
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
    >
      <LightboxChromeButton
        onClick={onDownload}
        title="Download"
        className="bg-black/75 hover:bg-theme-primary border border-white/15 hover:border-theme-bright text-white hover:text-black rounded-full backdrop-blur-3xl transition-all shadow-2xl group glow-theme cursor-pointer active:scale-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-y-0.5 transition-transform"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      </LightboxChromeButton>
      <LightboxChromeButton
        onClick={closeLightbox}
        title="Close Lightbox"
        className="rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur-md transition-all border border-white/15 hover:scale-105 active:scale-95 shadow-xl"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </LightboxChromeButton>
    </div>

    <div
      className={`lightbox-chrome-bottom lightbox-mobile-controls pointer-events-auto absolute inset-x-3 flex flex-col items-stretch gap-3 transition-all duration-300 overflow-visible ${isAndroidApp && !lightboxUiVisible ? 'lightbox-ui-hidden opacity-0 pointer-events-none' : 'opacity-100'} ${isMobile ? 'translate-y-0' : 'opacity-0 translate-y-4 group-hover/lightbox:opacity-100 group-hover/lightbox:translate-y-0'}`}
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      onClick={(event) => {
        event.stopPropagation();
        if (isAndroidApp) resetLightboxUiTimer();
      }}
    >
      {isPlaying && (
        <div className="lightbox-progress-track">
          <div className="lightbox-progress-fill" style={{ width: `${(slideTick / slideMaxTicks) * 100}%` }} />
        </div>
      )}
      <div className={`lightbox-slideshow-panel glass-panel bg-black/70 px-4 py-3 rounded-2xl flex items-center justify-center gap-4 shadow-[0_0_30px_rgba(0,0,0,0.8)] border border-white/10 flex-wrap overflow-visible ${isPlaying || (isAndroidApp && !lightboxUiVisible) ? '' : 'animate-in fade-in slide-in-from-bottom-5 duration-500'}`}>
        <BoutiqueSelect
          value={slideshowInterval}
          onChange={setSlideshowInterval}
          options={[2, 3, 5, 8, 10]}
          title="Slideshow Interval"
          dropUp
        />
        <div className="w-px h-8 bg-white/10 hidden sm:block" />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            (event.currentTarget as HTMLElement).blur();
            navigateToPost('prev');
          }}
          disabled={loading}
          title="Previous Post"
          className="lightbox-control-btn text-white transition-all p-2 rounded-full cursor-pointer min-w-[44px] min-h-[44px]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" /></svg>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setIsPlaying((playing) => !playing);
          }}
          title={isPlaying ? 'Pause Slideshow' : 'Start Slideshow'}
          className={`lightbox-play-btn min-w-[44px] min-h-[44px] ${!isPlaying ? 'opacity-80' : ''}`}
        >
          {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          )}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            (event.currentTarget as HTMLElement).blur();
            navigateToPost('next');
          }}
          disabled={loading}
          title="Next Post"
          className="lightbox-control-btn text-white transition-all p-2 rounded-full cursor-pointer min-w-[44px] min-h-[44px]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
        </button>
      </div>
    </div>
  </div>
);
