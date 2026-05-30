import React, { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import '../assets/main.css';
import {
  RULE34_ORIGIN,
  buildPostViewUrl,
  parseRule34Page,
  toAbsoluteRule34Url,
  type PageData,
} from '../lib/parseRule34Page';
import {
  accountHomeUrl,
  accountLoginUrl,
  accountRegisterUrl,
  addFavorite,
  fetchAccountSession,
  favoritesViewUrl,
  loginRule34,
  removeFavorite,
  type AccountSession,
} from '../lib/rule34Profile';



/**
 * REFRAMER CORE ARCHITECTURE
 * 
 * 1. Physical Key Relay: This extension prioritizes 1:1 behavioral parity with Rule34.
 *    Instead of complex SPA logic, it uses standard window.location.href reloads.
 * 2. State Persistence: UI states (Slideshow, Lightbox, Grid) are stored in sessionStorage
 *    to survive reloads and maintain seamless user experience.
 * 3. Atomic Parsing: The site is parsed once per load into a PageData object.
 */
const VIDEO_SLIDESHOW_RATIO = 0.65;
const MAX_ZOOM_SCALE = 4;
const MIN_PINCH_DISTANCE = 32;

const isLoadingShellVisible = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('r34pro-loading');

const pauseAllPageMedia = () => {
  (window as any).__r34proPauseAllMedia?.();
  document.querySelectorAll('video, audio').forEach((element) => {
    const media = element as HTMLMediaElement;
    try {
      media.pause();
      media.muted = true;
      media.autoplay = false;
      media.removeAttribute('autoplay');
    } catch {
      /* ignore per-element failures */
    }
  });
};

const useAppUiReady = () => {
  const [uiReady, setUiReady] = useState(() => !isLoadingShellVisible());

  useEffect(() => {
    const sync = () => {
      if (!isLoadingShellVisible()) setUiReady(true);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return uiReady;
};

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

const LightboxChromeLayer = ({
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
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-y-0.5 transition-transform"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      </LightboxChromeButton>
      <LightboxChromeButton
        onClick={closeLightbox}
        title="Close Lightbox"
        className="rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur-md transition-all border border-white/15 hover:scale-105 active:scale-95 shadow-xl"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
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
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
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
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
        </button>
      </div>
    </div>
  </div>
);

const PostVideoPlayer = forwardRef(function PostVideoPlayer(
  {
    poster,
    src,
    className,
    style,
    showControls,
    muted,
    onTap,
  }: {
    poster?: string;
    src: string;
    className?: string;
    style?: React.CSSProperties;
    showControls?: boolean;
    muted?: boolean;
    onTap?: () => void;
  },
  ref: React.Ref<HTMLVideoElement>
) {
  const [buffering, setBuffering] = useState(false);
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const innerRef = useRef<HTMLVideoElement>(null);
  const uiReady = useAppUiReady();

  const setVideoRef = useCallback(
    (element: HTMLVideoElement | null) => {
      innerRef.current = element;
      if (typeof ref === 'function') ref(element);
      else if (ref) (ref as React.MutableRefObject<HTMLVideoElement | null>).current = element;
    },
    [ref]
  );

  const clearBufferTimer = useCallback(() => {
    if (bufferTimer.current) {
      clearTimeout(bufferTimer.current);
      bufferTimer.current = null;
    }
  }, []);

  const markBuffering = useCallback(() => {
    clearBufferTimer();
    bufferTimer.current = setTimeout(() => setBuffering(true), 280);
  }, [clearBufferTimer]);

  const markReady = useCallback(() => {
    clearBufferTimer();
    setBuffering(false);
  }, [clearBufferTimer]);

  useEffect(() => () => clearBufferTimer(), [clearBufferTimer]);

  useEffect(() => {
    const video = innerRef.current;
    if (!video) return;

    if (!uiReady) {
      video.pause();
      return;
    }

    void video.play().catch(() => {});

    return () => {
      video.pause();
    };
  }, [uiReady, src]);

  useEffect(() => () => {
    innerRef.current?.pause();
  }, []);

  return (
    <div className="relative flex items-center justify-center max-w-full max-h-full">
      <video
        ref={setVideoRef}
        src={src}
        poster={poster}
        controls={showControls}
        muted={muted}
        loop
        playsInline
        preload={uiReady ? 'auto' : 'metadata'}
        onWaiting={markBuffering}
        onPlaying={markReady}
        onCanPlay={markReady}
        onLoadedData={markReady}
        onClick={(e) => {
          e.stopPropagation();
          onTap?.();
        }}
        className={className}
        style={style}
      />
      {buffering && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/75 border border-white/10 pointer-events-none backdrop-blur-sm">
          <div className="w-3 h-3 border-2 border-theme-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">Loading</span>
        </div>
      )}
    </div>
  );
});

const BoutiqueSelect = ({ value, onChange, options, title, dropUp }: {
  value: number, 
  onChange: (v: number) => void, 
  options: number[],
  title?: string
  dropUp?: boolean
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const selectOption = (opt: number) => {
    onChange(opt);
    setIsOpen(false);
  };

  return (
    <div className="boutique-select relative z-[100000012]" ref={containerRef} onClick={(e) => e.stopPropagation()}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="boutique-select-trigger bg-black/40 border border-white/10 text-[10px] font-bold text-white px-3 py-2 rounded-lg flex items-center gap-3 hover:border-theme-primary/50 transition-all cursor-pointer min-w-[65px] min-h-[44px] justify-between shadow-inner touch-manipulation"
        title={title}
      >
        <span>{value}s</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
      </button>
      
      {isOpen && (
        <div
          className={`boutique-select-menu absolute left-0 w-full min-w-[72px] glass-panel overflow-hidden z-[100000013] animate-in fade-in duration-200 shadow-2xl border border-white/10 pointer-events-auto touch-manipulation ${
            dropUp ? 'bottom-full mb-2 slide-in-from-bottom-2' : 'top-full mt-2 slide-in-from-top-2'
          }`}
        >
          <div className="flex flex-col p-1 bg-zinc-950/90 backdrop-blur-xl">
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => selectOption(opt)}
                onTouchEnd={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  selectOption(opt);
                }}
                className={`boutique-select-option w-full px-3 py-2.5 text-[10px] font-bold text-left rounded-md transition-all cursor-pointer min-h-[44px] touch-manipulation ${value === opt ? 'bg-theme-primary text-black' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}
              >
                {opt}s
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const App = ({ initialData }: { initialData: PageData }) => {
  const [data, setData] = useState<PageData>(initialData);
  const [loading, setLoading] = useState(false);
  
  // Read initial state from URL parameters (State Tagging)
  const currentParams = new URL(window.location.href).searchParams;
  
  // Persist Lightbox state across reloads via &r34_lb=1
  const [lightboxOpen, setLightboxOpen] = useState(currentParams.get('r34_lb') === '1');

  // Slideshow State (Persisted via &r34_ss=1)
  const [isPlaying, setIsPlaying] = useState(currentParams.get('r34_ss') === '1');

  // Persist Slideshow Interval via &r34_si=X
  const [slideshowInterval, setSlideshowInterval] = useState<number>(() => {
    return Number(currentParams.get('r34_si')) || 5;
  });
  const [slideTick, setSlideTick] = useState(0);
  const [slideMaxTicks, setSlideMaxTicks] = useState(() => (Number(currentParams.get('r34_si')) || 5) * 10);
  const [rateLimited, setRateLimited] = useState(false);
  
  // Bulk Download State (Persist &r34_bc=X)
  const [bulkCount, setBulkCount] = useState<number>(() => {
    return Number(currentParams.get('r34_bc')) || 10;
  });
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const cancelBulkRef = useRef(false);

  // Walkthrough State
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  
  // Gallery Settings (Persisted via &r34_gs=X)
  const [gridSize, setGridSize] = useState<number>(() => {
    const fromUrl = Number(currentParams.get('r34_gs'));
    if (fromUrl) return fromUrl;
    const mobile =
      typeof window !== 'undefined' &&
      (window.matchMedia('(max-width: 900px)').matches || !!(window as any).R34ProAndroid);
    return mobile ? 2 : 4;
  });

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 900px)').matches || !!(window as any).R34ProAndroid;
  });
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(orientation: landscape)').matches;
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const android = !!(window as any).R34ProAndroid;
    if (android) return false;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    return !mobile;
  });

  const isAndroidApp = typeof window !== 'undefined' && !!(window as any).R34ProAndroid;
  const uiReady = useAppUiReady();
  const showSearchLanding =
    isAndroidApp &&
    initialData.type === 'list' &&
    initialData.listKind === 'search' &&
    initialData.searchTags === 'all' &&
    currentParams.get('r34_browse') !== '1';
  const [accountSession, setAccountSession] = useState<AccountSession>(() => {
    if (initialData.type === 'account') {
      return {
        isLoggedIn: initialData.isLoggedIn,
        userId: initialData.userId,
        favoritesUrl: initialData.userId ? favoritesViewUrl(initialData.userId) : undefined,
        profileUrl: initialData.links.find((l) => l.href.includes('profile'))?.href,
        mailUrl: initialData.links.find((l) => l.href.includes('gmail'))?.href,
        logoutUrl: initialData.links.find((l) => /code=01|logout/i.test(l.href))?.href,
      };
    }
    if (initialData.type === 'list' && initialData.listKind === 'favorites' && initialData.favoritesUserId) {
      return {
        isLoggedIn: true,
        userId: initialData.favoritesUserId,
        favoritesUrl: favoritesViewUrl(initialData.favoritesUserId),
      };
    }
    return { isLoggedIn: false };
  });
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [lightboxUiVisible, setLightboxUiVisible] = useState(
    () => new URL(window.location.href).searchParams.get('r34_ui') !== '0'
  );
  const lightboxUiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Zoom/Pan State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const postImageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const postViewContainerRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const postGestureRef = useRef<HTMLDivElement>(null);
  const lightboxGestureRef = useRef<HTMLDivElement>(null);
  const touchGestureRef = useRef<'none' | 'pan' | 'pinch' | 'swipe'>('none');
  const swipeHandledRef = useRef(false);
  const scaleRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  const lightboxOpenRef = useRef(lightboxOpen);
  const lightboxHistoryPushedRef = useRef(false);
  const openLightboxRef = useRef<() => void>(() => {});
  const closeLightboxRef = useRef<() => void>(() => {});
  const navigateToPostRef = useRef<(direction: 'prev' | 'next') => void>(() => {});
  const resetLightboxUiTimerRef = useRef<() => void>(() => {});
  const toggleAndroidLightboxUiRef = useRef<() => void>(() => {});
  const isAndroidAppRef = useRef(isAndroidApp);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoMuted, setVideoMuted] = useState(true);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchValue, setSearchValue] = useState(
    initialData.searchTags === 'all' ? '' : initialData.searchTags
  );
  
  // Use Refs for stable listeners (avoids "hoops" of re-binding)
  const dataRef = useRef<PageData>(data);
  const loadingRef = useRef<boolean>(loading);
  const suggestionTimeout = useRef<NodeJS.Timeout>(null);
  
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { lightboxOpenRef.current = lightboxOpen; }, [lightboxOpen]);
  useEffect(() => { isAndroidAppRef.current = isAndroidApp; }, [isAndroidApp]);

  const openLightbox = useCallback(() => {
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    lightboxHistoryPushedRef.current = false;
    setLightboxOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has('r34_lb') || url.searchParams.has('r34_ui')) {
      url.searchParams.delete('r34_lb');
      url.searchParams.delete('r34_ui');
      history.replaceState({ r34Lightbox: false }, '', url.toString());
    }
  }, []);

  useEffect(() => { openLightboxRef.current = openLightbox; }, [openLightbox]);
  useEffect(() => { closeLightboxRef.current = closeLightbox; }, [closeLightbox]);

  useEffect(() => {
    (window as any).__r34proHandleBack = () => {
      if (!lightboxOpenRef.current) return false;
      closeLightboxRef.current();
      return true;
    };
    return () => {
      delete (window as any).__r34proHandleBack;
    };
  }, []);

  useEffect(() => {
    (window as any).__r34proDismissLoadingShell?.();
  }, []);

  useEffect(() => {
    if (!uiReady) {
      videoRef.current?.pause();
    }
  }, [uiReady]);

  useEffect(() => {
    document.querySelectorAll('body > *:not(#reframer-root):not(.void-navigator-root) video, body > *:not(#reframer-root):not(.void-navigator-root) audio').forEach((element) => {
      try {
        (element as HTMLMediaElement).pause();
      } catch {
        /* ignore */
      }
    });
  }, [postId]);

  useEffect(() => {
    return () => {
      videoRef.current?.pause();
      pauseAllPageMedia();
    };
  }, []);

  const refreshAccountSession = useCallback(async () => {
    const session = await fetchAccountSession();
    setAccountSession(session);
    chrome.storage.local.set({ r34proSession: session }).catch(() => {});
    return session;
  }, []);

  useEffect(() => {
    if (initialData.type === 'account') return;
    chrome.storage.local.get('r34proSession').then((stored) => {
      if (stored.r34proSession?.isLoggedIn) {
        setAccountSession(stored.r34proSession as AccountSession);
      }
    });
    const refreshTimer = window.setTimeout(() => {
      refreshAccountSession();
    }, 3000);
    return () => window.clearTimeout(refreshTimer);
  }, [initialData.type, refreshAccountSession]);

  const showProfileNotice = useCallback((message: string) => {
    setProfileNotice(message);
    window.setTimeout(() => setProfileNotice(null), 3200);
  }, []);

  const handleLoginSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    const result = await loginRule34(loginUser, loginPass);
    setLoginLoading(false);
    if (!result.ok) {
      setLoginError(result.error ?? 'Login failed.');
      return;
    }
    const session = await refreshAccountSession();
    showProfileNotice(session.isLoggedIn ? 'Logged in successfully.' : 'Login submitted.');
    if (session.isLoggedIn) {
      window.location.href = accountHomeUrl();
    }
  }, [loginUser, loginPass, refreshAccountSession, showProfileNotice]);

  const handleToggleFavorite = useCallback(async (postId: string) => {
    if (!accountSession.isLoggedIn) {
      window.location.href = accountLoginUrl();
      return;
    }
    setFavoriteBusy(true);
    const ok = await addFavorite(postId);
    setFavoriteBusy(false);
    if (ok) {
      showProfileNotice('Added to favorites.');
      (window as any).addFav?.(postId);
    } else {
      showProfileNotice('Could not add favorite. Try logging in again.');
    }
  }, [accountSession.isLoggedIn, showProfileNotice]);

  const handleRemoveFavorite = useCallback(async (postId: string) => {
    setFavoriteBusy(true);
    const ok = await removeFavorite(postId);
    setFavoriteBusy(false);
    if (!ok) {
      showProfileNotice('Could not remove favorite.');
      return;
    }
    setData((prev) => {
      if (prev.type !== 'list' || prev.listKind !== 'favorites') return prev;
      return { ...prev, items: prev.items.filter((item) => item.id !== postId) };
    });
    showProfileNotice('Removed from favorites.');
  }, [showProfileNotice]);

  const startLightboxUiAutoHide = useCallback(() => {
    if (!isAndroidApp) return;
    if (lightboxUiTimer.current) clearTimeout(lightboxUiTimer.current);
    lightboxUiTimer.current = setTimeout(() => {
      setLightboxUiVisible(false);
    }, 4000);
  }, [isAndroidApp]);

  const resetLightboxUiTimer = useCallback(() => {
    if (!isAndroidApp) return;
    setLightboxUiVisible(true);
    startLightboxUiAutoHide();
  }, [isAndroidApp, startLightboxUiAutoHide]);

  const toggleAndroidLightboxUi = useCallback(() => {
    if (!isAndroidApp) return;
    setLightboxUiVisible((visible) => {
      const next = !visible;
      if (next) {
        startLightboxUiAutoHide();
      } else if (lightboxUiTimer.current) {
        clearTimeout(lightboxUiTimer.current);
      }
      return next;
    });
  }, [isAndroidApp, startLightboxUiAutoHide]);

  useEffect(() => {
    if (!isAndroidApp || !lightboxOpen) {
      if (lightboxUiTimer.current) clearTimeout(lightboxUiTimer.current);
      if (!lightboxOpen) setLightboxUiVisible(true);
      (window as any).R34ProAndroid?.setImmersive?.(false);
      return;
    }

    (window as any).R34ProAndroid?.setImmersive?.(true);

    const uiHiddenFromNav = new URL(window.location.href).searchParams.get('r34_ui') === '0';
    if (uiHiddenFromNav) {
      setLightboxUiVisible(false);
      if (lightboxUiTimer.current) clearTimeout(lightboxUiTimer.current);
      return;
    }

    setLightboxUiVisible(true);
    startLightboxUiAutoHide();
    return () => {
      if (lightboxUiTimer.current) clearTimeout(lightboxUiTimer.current);
      (window as any).R34ProAndroid?.setImmersive?.(false);
    };
  }, [isAndroidApp, lightboxOpen, startLightboxUiAutoHide]);

  useEffect(() => {
    const mobileMedia = window.matchMedia('(max-width: 900px)');
    const landscapeMedia = window.matchMedia('(orientation: landscape)');

    const syncLayout = () => {
      const mobile = mobileMedia.matches || !!(window as any).R34ProAndroid;
      const landscape = landscapeMedia.matches;
      setIsMobile(mobile);
      setIsLandscape(landscape);
      document.body.classList.toggle('r34pro-mobile', mobile);
      document.documentElement.classList.toggle('r34pro-landscape', landscape);
      if ((window as any).R34ProAndroid) {
        document.documentElement.classList.add('r34pro-android');
      }
      if (mobile && !(window as any).R34ProAndroid) setSidebarOpen(false);
    };

    syncLayout();
    mobileMedia.addEventListener('change', syncLayout);
    landscapeMedia.addEventListener('change', syncLayout);
    window.addEventListener('resize', syncLayout);
    return () => {
      mobileMedia.removeEventListener('change', syncLayout);
      landscapeMedia.removeEventListener('change', syncLayout);
      window.removeEventListener('resize', syncLayout);
      document.body.classList.remove('r34pro-mobile');
      document.documentElement.classList.remove('r34pro-landscape');
    };
  }, []);

  const effectiveGridSize = (() => {
    if (!isMobile) return gridSize;
    if (isLandscape) {
      const width = typeof window !== 'undefined' ? window.innerWidth : 800;
      if (width >= 1024) return Math.min(Math.max(gridSize, 4), 6);
      if (width >= 768) return Math.min(Math.max(gridSize, 3), 5);
      return Math.min(Math.max(gridSize, 3), 4);
    }
    return Math.min(gridSize, 2);
  })();

  const submitSearch = (tags: string) => {
    const trimmed = tags.trim();
    if (!trimmed) return;
    window.location.href = `${RULE34_ORIGIN}/index.php?page=post&s=list&tags=${encodeURIComponent(trimmed)}`;
  };

  const appendTagToSearch = useCallback((tag: string) => {
    const normalized = tag.replace(/\s+/g, '_').trim();
    if (!normalized) return;
    setSearchValue((prev) => {
      const parts = prev.trim() ? prev.trim().split(/\s+/).filter(Boolean) : [];
      if (parts.includes(normalized)) {
        const next = parts.filter((p) => p !== normalized);
        return next.length ? `${next.join(' ')} ` : '';
      }
      return `${prev.trim() ? `${prev.trim()} ` : ''}${normalized} `;
    });
    setSidebarOpen(true);
    setShowSuggestions(false);
  }, []);

  const selectedSearchTags = searchValue.trim()
    ? searchValue.trim().split(/\s+/).filter(Boolean)
    : [];

  const isTagSelected = useCallback(
    (tag: string) => selectedSearchTags.includes(tag.replace(/\s+/g, '_').trim()),
    [selectedSearchTags]
  );

  const postId = data.type === 'post' ? data.id : null;

  useEffect(() => {
    lightboxHistoryPushedRef.current = false;
  }, [postId]);

  useEffect(() => {
    if (!lightboxOpen || data.type !== 'post') return;
    if (lightboxHistoryPushedRef.current) return;

    const withLb = new URL(window.location.href);
    const withoutLb = new URL(window.location.href);
    withoutLb.searchParams.delete('r34_lb');
    withoutLb.searchParams.delete('r34_ui');
    withLb.searchParams.set('r34_lb', '1');

    history.replaceState({ r34Lightbox: false }, '', withoutLb.toString());
    history.pushState({ r34Lightbox: true }, '', withLb.toString());
    lightboxHistoryPushedRef.current = true;
  }, [lightboxOpen, data.type, postId]);

  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setSlideTick(0);
  }, [postId, lightboxOpen, data.type, data.type === 'post' ? data.mediaType : null]);

  useEffect(() => {
    setVideoMuted(true);
  }, [postId]);

  useEffect(() => {
    if (data.type !== 'post' || data.mediaType !== 'video') return;

    const prefetched: HTMLLinkElement[] = [];
    const prefetchNeighborVideo = async (postUrl?: string) => {
      if (!postUrl || postUrl === '#') return;
      try {
        const res = await fetch(postUrl, { credentials: 'include' });
        if (!res.ok) return;
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const parsed = parseRule34Page(doc, new URL(postUrl, RULE34_ORIGIN).searchParams);
        if (parsed?.type === 'post' && parsed.mediaType === 'video' && parsed.highresUrl) {
          const link = document.createElement('link');
          link.rel = 'prefetch';
          link.as = 'video';
          link.href = parsed.highresUrl;
          document.head.appendChild(link);
          prefetched.push(link);
        }
      } catch {
        /* ignore prefetch failures */
      }
    };

    void prefetchNeighborVideo(data.nextUrl);
    void prefetchNeighborVideo(data.prevUrl);
    return () => prefetched.forEach((link) => link.remove());
  }, [data.type, data.type === 'post' ? data.mediaType : null, data.type === 'post' ? data.nextUrl : null, data.type === 'post' ? data.prevUrl : null, postId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      const newScale = Math.min(Math.max(1, scale + delta), MAX_ZOOM_SCALE);
      
      if (newScale !== scale) {
        const mediaEl = imageRef.current ?? videoRef.current;
        const rect = mediaEl?.getBoundingClientRect();
        if (rect) {
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          const ratio = newScale / scale;
          
          setPosition(pos => ({
            x: pos.x - (mouseX * ratio - mouseX),
            y: pos.y - (mouseY * ratio - mouseY)
          }));
        }
        setScale(newScale);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [lightboxOpen, scale]);

  useEffect(() => {
    if (data.type !== 'post' || data.mediaType !== 'video') {
      setSlideMaxTicks(slideshowInterval * 10);
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setSlideMaxTicks(slideshowInterval * 10);
      return;
    }

    const syncDuration = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        setSlideMaxTicks(Math.max(20, Math.round(duration * VIDEO_SLIDESHOW_RATIO * 10)));
      } else {
        setSlideMaxTicks(slideshowInterval * 10);
      }
    };

    if (video.readyState >= 1) syncDuration();
    else video.addEventListener('loadedmetadata', syncDuration, { once: true });

    return () => video.removeEventListener('loadedmetadata', syncDuration);
  }, [postId, slideshowInterval, lightboxOpen, data.type, data.type === 'post' ? data.mediaType : null]);

  useEffect(() => {
    if (!isPlaying || data.type !== 'post' || data.mediaType !== 'video') return;
    if (!uiReady) return;
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => {});
  }, [isPlaying, postId, lightboxOpen, data.type, data.type === 'post' ? data.mediaType : null, uiReady]);

  useEffect(() => {
    return () => {
      if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (data.type === 'list') {
      setSearchValue(data.searchTags === 'all' ? '' : data.searchTags);
    }
  }, [data.type, data.type === 'list' ? data.searchTags : null]);

  const fetchSuggestions = async (val: string) => {
    if (!val || val.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const lastTag = val.split(' ').pop() || '';
      if (lastTag.length < 2) return;

      const res = await fetch(
        `${RULE34_ORIGIN}/autocomplete.php?q=${encodeURIComponent(lastTag.toLowerCase())}`
      );
      if (!res.ok) return;
      const list: unknown = await res.json();
      if (!Array.isArray(list)) return;
      const labels = list.map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          const v = o.value ?? o.label;
          if (typeof v === 'string') return v;
        }
        return '';
      }).filter(Boolean);
      setSuggestions(labels);
      setShowSuggestions(labels.length > 0);
    } catch (e) {
      console.error('Autocomplete error', e);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearchValue(val);
    if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current);
    suggestionTimeout.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  /**
   * Navigate directly to prev/next post using URL.
   * We append our own "Reframer Tags" to the URL to persist UI state.
   */
  const appendR34NavParams = useCallback((target: URL) => {
    if (lightboxOpen) target.searchParams.set('r34_lb', '1');
    if (isPlaying) target.searchParams.set('r34_ss', '1');
    if (slideshowInterval !== 5) target.searchParams.set('r34_si', slideshowInterval.toString());
    if (gridSize !== 4) target.searchParams.set('r34_gs', gridSize.toString());
    if (bulkCount !== 10) target.searchParams.set('r34_bc', bulkCount.toString());
    if (isAndroidApp && lightboxOpen && !lightboxUiVisible) {
      target.searchParams.set('r34_ui', '0');
    }
  }, [lightboxOpen, isPlaying, slideshowInterval, gridSize, bulkCount, isAndroidApp, lightboxUiVisible]);

  const navigateToPost = useCallback((direction: 'prev' | 'next') => {
    if (data.type !== 'post') return;
    let url = direction === 'prev' ? data.prevUrl : data.nextUrl;
    if (url && url !== '#') {
      const target = new URL(url, RULE34_ORIGIN);
      appendR34NavParams(target);
      if (isMobile) setSidebarOpen(false);
      videoRef.current?.pause();
      pauseAllPageMedia();
      (window as any).__r34proShowLoadingShell?.();
      window.location.href = target.href;
    }
  }, [data, appendR34NavParams, isMobile]);

  useEffect(() => { navigateToPostRef.current = navigateToPost; }, [navigateToPost]);
  useEffect(() => { resetLightboxUiTimerRef.current = resetLightboxUiTimer; }, [resetLightboxUiTimer]);
  useEffect(() => { toggleAndroidLightboxUiRef.current = toggleAndroidLightboxUi; }, [toggleAndroidLightboxUi]);

  const fetchNeighbors = useCallback(async (postId: string, tags: string) => {
    try {
      const baseUrl = `${RULE34_ORIGIN}/public/post_helpers2.php?action=fetch_id_cache`;
      const url = `${baseUrl}&tags=${encodeURIComponent(tags)}&id=${postId}`;
      
      const res = await fetch(url);
      if (!res.ok) return;
      
      const ids = await res.json();
      if (!Array.isArray(ids)) return;
      
      const idx = ids.indexOf(parseInt(postId));
      if (idx === -1) return;
      
      const prevId = idx > 0 ? ids[idx - 1] : undefined;
      const nextId = idx < ids.length - 1 ? ids[idx + 1] : undefined;
      
      setData(current => {
        if (current.type !== 'post' || current.id !== postId) return current;
        return {
          ...current,
          prevUrl: prevId ? buildPostViewUrl(prevId, tags) : (current as PostData).prevUrl,
          nextUrl: nextId ? buildPostViewUrl(nextId, tags) : (current as PostData).nextUrl,
        };
      });
    } catch (e) {
      console.warn('[Neighbors] Fetch failed', e);
    }
  }, []);

  useEffect(() => {
    if (data.type === 'post') {
      // If we are missing navigation links, fetch them from the ID cache exactly like the site does
      if (!data.nextUrl || !data.prevUrl || data.nextUrl.includes('#') || data.prevUrl.includes('#')) {
        fetchNeighbors(data.id, data.searchTags);
      }
    }
  }, [data.id, data.type, data.searchTags, fetchNeighbors]);

  const [isEnabled, setIsEnabled] = useState(true);
  const [activeTheme, setActiveTheme] = useState('obsidian');

  useEffect(() => {
    chrome.storage.local.get(['extensionEnabled', 'activeTheme', 'walkthroughCompleted'], (result) => {
      if (result.extensionEnabled !== undefined) setIsEnabled(result.extensionEnabled);
      if (result.activeTheme !== undefined) setActiveTheme(result.activeTheme);
      if (!result.walkthroughCompleted) setShowWalkthrough(true);
    });
  }, []);

  const toggleExtension = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    chrome.storage.local.set({ extensionEnabled: newState });
    // Reload to apply/removethe look
    window.location.reload();
  };

  useEffect(() => {
    if (isEnabled) {
      document.body.classList.add('void-active');
      document.body.setAttribute('data-theme', activeTheme);
    } else {
      document.body.classList.remove('void-active');
      document.body.removeAttribute('data-theme');
    }
  }, [isEnabled, activeTheme]);

  // Global Keyboard Navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const isTyping = ['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName);
      if (isTyping) return;
      
      // Left / Prev (Left Arrow or A)
      if ((e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') && !isTyping) {
        e.preventDefault();
        navigateToPost('prev');
      }
      // Right / Next (Right Arrow or D)
      if ((e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') && !isTyping) {
        e.preventDefault();
        navigateToPost('next');
      }
      // Slideshow Toggle (S)
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        setIsPlaying(p => !p);
      }
      // Lightbox Toggle (F)
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (lightboxOpenRef.current) closeLightboxRef.current();
        else openLightboxRef.current();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigateToPost, setIsPlaying, isPlaying, lightboxOpen]);

  useEffect(() => {
    if (!isMobile || data.type !== 'post') return;

    const postMediaType = data.mediaType;
    const container = lightboxOpen
      ? (postMediaType === 'video' ? postViewContainerRef.current : lightboxGestureRef.current)
      : postGestureRef.current;
    if (!container) return;

    let startX = 0;
    let startY = 0;
    let lastPinchDistance = 0;
    let pinchReady = false;
    let gesture: 'none' | 'pan' | 'pinch' | 'swipe' = 'none';

    const getDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const isChromeTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return !!target.closest('.lightbox-chrome-root, .lightbox-chrome-top, .lightbox-chrome-bottom, .lightbox-chrome-btn, .lightbox-top-actions, .lightbox-mobile-controls, .boutique-select, .boutique-select-menu, .boutique-select-option, button, a, input, select');
    };

    const onTouchStart = (event: TouchEvent) => {
      if (isChromeTarget(event.target)) return;
      swipeHandledRef.current = false;
      if (event.touches.length === 2) {
        gesture = 'pinch';
        touchGestureRef.current = 'pinch';
        lastPinchDistance = getDistance(event.touches);
        pinchReady = lastPinchDistance >= MIN_PINCH_DISTANCE;
        if (isAndroidAppRef.current && lightboxOpenRef.current) {
          resetLightboxUiTimerRef.current();
        }
        return;
      }

      if (event.touches.length === 1) {
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        if (scaleRef.current > 1) {
          gesture = 'pan';
          touchGestureRef.current = 'pan';
          dragStart.current = { x: startX - positionRef.current.x, y: startY - positionRef.current.y };
          setIsDragging(true);
        } else {
          gesture = 'none';
          touchGestureRef.current = 'none';
        }
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (gesture === 'pinch' && event.touches.length === 2) {
        event.preventDefault();
        const distance = getDistance(event.touches);
        if (!pinchReady) {
          if (distance < MIN_PINCH_DISTANCE) return;
          pinchReady = true;
          lastPinchDistance = distance;
          return;
        }
        if (lastPinchDistance <= 0) {
          lastPinchDistance = distance;
          return;
        }
        const factor = Math.max(0.88, Math.min(1.12, distance / lastPinchDistance));
        const nextScale = Math.min(MAX_ZOOM_SCALE, Math.max(1, scaleRef.current * factor));
        setScale(nextScale);
        if (nextScale <= 1) setPosition({ x: 0, y: 0 });
        lastPinchDistance = distance;
        return;
      }

      if (gesture === 'pan' && event.touches.length === 1 && scaleRef.current > 1) {
        event.preventDefault();
        setPosition({
          x: event.touches[0].clientX - dragStart.current.x,
          y: event.touches[0].clientY - dragStart.current.y,
        });
        return;
      }

      if (event.touches.length === 1 && scaleRef.current <= 1 && gesture !== 'pinch') {
        const dx = event.touches[0].clientX - startX;
        const dy = event.touches[0].clientY - startY;
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.1) {
          gesture = 'swipe';
          touchGestureRef.current = 'swipe';
          event.preventDefault();
        }
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const travel = Math.hypot(deltaX, deltaY);

      if (gesture === 'pinch' || gesture === 'pan') {
        gesture = 'none';
        touchGestureRef.current = 'none';
        setIsDragging(false);
        if (scaleRef.current <= 1.05) {
          setScale(1);
          setPosition({ x: 0, y: 0 });
        }
        return;
      }

      if (scaleRef.current > 1) {
        gesture = 'none';
        touchGestureRef.current = 'none';
        return;
      }

      if (lightboxOpenRef.current && deltaY > 90 && deltaY > Math.abs(deltaX) * 1.3) {
        closeLightboxRef.current();
        gesture = 'none';
        touchGestureRef.current = 'none';
        return;
      }

      if (
        gesture === 'swipe' ||
        (Math.abs(deltaX) >= 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1)
      ) {
        swipeHandledRef.current = true;
        if (deltaX > 0) navigateToPostRef.current('prev');
        else navigateToPostRef.current('next');
        gesture = 'none';
        touchGestureRef.current = 'none';
        return;
      }

      if (travel < 14 && !swipeHandledRef.current) {
        if (lightboxOpenRef.current) {
          if (isAndroidAppRef.current) toggleAndroidLightboxUiRef.current();
        } else {
          openLightboxRef.current();
        }
      }

      gesture = 'none';
      touchGestureRef.current = 'none';
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [isMobile, data.type, data.type === 'post' ? data.mediaType : null, lightboxOpen, postId]);

  useEffect(() => {
    const onPopState = () => {
      if (lightboxOpenRef.current) {
        setLightboxOpen(false);
        lightboxHistoryPushedRef.current = false;
        return;
      }
      window.location.reload();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);



  // Rebuilt Slideshow Logic
  useEffect(() => {
    if (!isPlaying) {
      setSlideTick(0);
      return;
    }
    const timer = setInterval(() => {
      setSlideTick(prev => {
        if (prev >= slideMaxTicks) {
           navigateToPost('next');
           return 0;
        }
        return prev + 1;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [isPlaying, slideMaxTicks, navigateToPost]);

  /**
   * BACKGROUND QUEUE SYNC
   * Listens for progress updates from the background download engine.
   * This allows the "Grab Posts" process to persist across page reloads.
   */
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const pollState = () => {
      chrome.storage.local.get(['bulkQueueState'], (res) => {
        const state = res.bulkQueueState;
        if (state) {
          setIsBulkDownloading(state.isDownloading);
          setBulkProgress(state.progress);
          setBulkTotal(state.total);
          
          // Stop polling if download finished and UI was showing it
          if (!state.isDownloading && isBulkDownloading) {
             // Let it stay "complete" for a moment then clear
             setTimeout(() => setIsBulkDownloading(false), 3000);
          }
        }
      });
    };

    // Initial poll
    pollState();
    
    // Set up continuous poll
    interval = setInterval(pollState, 1000);
    
    return () => clearInterval(interval);
  }, [isBulkDownloading]);

  /**
   * UI STATE Persistence
   * Handled by appending r34_lb, r34_ss, r34_ui, etc. to outgoing navigation URLs.
   */

  // Global Keyboard Listener (State only - Navigation is handled by site keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      // Ensure any logic here DOES NOT call preventDefault() for ArrowKeys
      // because we want the site's native logic to fire.
      if (e.key === 'Escape') closeLightboxRef.current();
      if (e.key === ' ') { e.preventDefault(); setIsPlaying(p => !p); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const downloadPost = (url: string, id: string, tags: string, mediaType?: 'image' | 'video') => {
     const extMatch = url.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)/i);
     const ext = extMatch ? extMatch[0] : mediaType === 'video' ? '.mp4' : '.jpg';
     const sanitize = (s: string) => s.replace(/[^a-z0-9_]/gi, '_').substring(0, 50);
     const filename = `R34_${sanitize(tags)}_${id}${ext}`;
     chrome.runtime.sendMessage({ type: 'DOWNLOAD', url, filename });
  };

  /**
   * START BULK DOWNLOAD
   * Offloads the grab/collection logic to the background script.
   * This ensures the process is not interrupted by the full-page reloads
   * used during navigation.
   */
  const startBulkDownload = async () => {
    if (data.type !== 'post') return;
    
    console.log("[R34Pro] UI: Dispatching START_QUEUE...");
    chrome.runtime.sendMessage({ 
      type: 'START_QUEUE', 
      tags: data.searchTags, 
      startId: data.id, 
      count: bulkCount 
    }, (res) => {
      if (chrome.runtime.lastError) {
        console.error("[R34Pro] UI: Dispatch FAILED", chrome.runtime.lastError.message);
      } else {
        console.log("[R34Pro] UI: Dispatch ACKNOWLEDGED", res);
      }
    });
  };

  const tagsByCategory = data.type === 'post' ? data.tags.reduce((acc, tag) => {
    acc[tag.category] = acc[tag.category] || [];
    acc[tag.category].push(tag.name);
    return acc;
  }, {} as Record<string, string[]>) : {};

  const getTagColor = (cat: string) => {
    if (cat === 'artist') return 'bg-zinc-900/50 !text-theme-primary border-theme-primary/30 hover:bg-zinc-900 hover:border-theme-primary transition-all';
    if (cat === 'copyright') return '!text-white bg-purple-900/40 border-purple-500/30 hover:bg-purple-800/50';
    if (cat === 'character') return '!text-white bg-emerald-900/40 border-emerald-500/30 hover:bg-emerald-800/50';
    if (cat === 'metadata') return '!text-white bg-blue-900/40 border-blue-500/30 hover:bg-blue-800/50';
    return '!text-white bg-white/5 border-white/10 hover:bg-white/10 hover:border-theme-primary/30';
  };

  const renderProfilePanel = () => (
    <div className="flex flex-col gap-4 py-2 relative z-10 border-t border-white/5 pt-6">
      <div className="text-[10px] font-black text-gold px-1 uppercase tracking-[0.2em] opacity-80">Profile</div>
      {accountSession.isLoggedIn ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-theme-primary/20 bg-theme-primary/5 px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-theme-primary font-black">Signed in</div>
            <div className="text-sm font-bold text-white mt-1">
              {accountSession.userId ? `User #${accountSession.userId}` : 'Rule34 account'}
            </div>
          </div>
          {accountSession.favoritesUrl && (
            <button
              type="button"
              onClick={() => { window.location.href = accountSession.favoritesUrl!; }}
              className="w-full bg-zinc-900 hover:bg-zinc-800 border border-white/10 p-4 rounded-2xl text-left transition-all active:scale-95"
            >
              <div className="text-xs font-black uppercase tracking-widest text-white">My Favorites</div>
              <div className="text-[10px] text-zinc-500 mt-1">Saved posts gallery</div>
            </button>
          )}
          {accountSession.profileUrl && (
            <button
              type="button"
              onClick={() => { window.location.href = accountSession.profileUrl!; }}
              className="w-full bg-zinc-900/60 hover:bg-zinc-800 border border-white/5 p-3 rounded-xl text-left text-[11px] font-bold text-zinc-300 transition-all"
            >
              My Profile
            </button>
          )}
          {accountSession.mailUrl && (
            <button
              type="button"
              onClick={() => { window.location.href = accountSession.mailUrl!; }}
              className="w-full bg-zinc-900/60 hover:bg-zinc-800 border border-white/5 p-3 rounded-xl text-left text-[11px] font-bold text-zinc-300 transition-all"
            >
              My Mail
            </button>
          )}
          <button
            type="button"
            onClick={() => { window.location.href = accountSession.logoutUrl ?? `${RULE34_ORIGIN}/index.php?page=account&s=login&code=01`; }}
            className="w-full bg-zinc-950 hover:bg-red-950/40 border border-white/5 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-red-300 transition-all"
          >
            Logout
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[10px] text-zinc-500 px-1">Sign in to save favorites and sync your Rule34 account.</p>
          <button
            type="button"
            onClick={() => { window.location.href = accountLoginUrl(); }}
            className="btn-theme w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border border-white/10"
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => { window.location.href = accountRegisterUrl(); }}
            className="w-full py-3 rounded-xl bg-zinc-900 border border-white/10 text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:text-white transition-all"
          >
            Create Account
          </button>
        </div>
      )}
    </div>
  );



  if (!isEnabled) {
    return (
      <div className="fixed bottom-6 right-6 z-[9999999] void-navigator-root">
        <button 
          onClick={toggleExtension}
          className="bg-zinc-950 border border-gold/20 p-4 rounded-2xl text-gold font-bold text-[10px] shadow-[0_20px_50px_rgba(0,0,0,1)] hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-3 backdrop-blur-xl">
          <img src={chrome.runtime.getURL('logo.webp')} className="w-6 h-6 rounded-md" alt="R34 Pro" />
          ENABLE R34 PRO
        </button>
      </div>
    );
  }

  return (
    <div className={`w-full h-full max-w-full flex bg-black text-zinc-100 overflow-hidden font-sans fixed inset-0 z-[99999999] void-navigator-root ${isMobile ? 'flex-col' : 'flex-row'}`}>
       {/* Walkthrough Tutorial Overlay */}
       {showWalkthrough && (
         <div className="fixed inset-0 z-[1000000000] bg-black/98 backdrop-blur-3xl flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-700">
            <div className="max-w-xl w-full glass-panel-heavy !p-16 md:!p-24 rounded-[4.5rem] border border-white/10 flex flex-col items-center text-center gap-16 animate-in zoom-in-95 slide-in-from-bottom-20 duration-700 ease-out shadow-[0_100px_200px_rgba(0,0,0,1)] mobile-walkthrough-panel">
               
               {/* Step Content Mapping */}
               {walkthroughStep === 0 && (
                 <>
                   <div className="w-32 h-32 rounded-[2.2rem] bg-theme-primary/10 flex items-center justify-center shadow-[0_0_80px_rgba(var(--theme-primary-rgb),0.3)] mb-4">
                      <img src={chrome.runtime.getURL('logo.webp')} className="w-24 h-24 object-contain drop-shadow-2xl" alt="Logo" />
                   </div>
                   <div className="space-y-8 px-6">
                      <h2 className="text-5xl font-black text-white uppercase tracking-tighter leading-tight !m-0 !p-0">R34 Pro <span className="text-theme-primary">Navigation</span></h2>
                      <p className="text-zinc-400 text-lg font-medium leading-relaxed max-w-[90%] mx-auto !m-0 !p-0">This extension provides a high-performance interface for browsing Rule34 posts. Follow this guide to learn the controls.</p>
                   </div>
                 </>
               )}

               {walkthroughStep === 1 && (
                 <>
                   <div className="w-32 h-32 rounded-[2.2rem] bg-zinc-900 border border-white/10 flex items-center justify-center shadow-2xl mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--theme-primary)" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                   </div>
                   <div className="space-y-8 px-6">
                      <h2 className="text-4xl font-black text-white uppercase tracking-tight !m-0 !p-0">Sidebar Panel</h2>
                      <p className="text-zinc-400 text-lg font-medium leading-relaxed max-w-[90%] mx-auto !m-0 !p-0">The left panel allows you to disable the extension, access this help menu, or find random posts from the current gallery.</p>
                   </div>
                 </>
               )}

               {walkthroughStep === 2 && (
                 <>
                   <div className="w-32 h-32 rounded-[2.2rem] bg-theme-primary/10 flex items-center justify-center shadow-inner mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--theme-primary)" strokeWidth="2.5"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                   </div>
                   <div className="space-y-8 px-6">
                      <h2 className="text-4xl font-black text-white uppercase tracking-tight !m-0 !p-0">Slideshow Controls</h2>
                      <p className="text-zinc-400 text-lg font-medium leading-relaxed max-w-[90%] mx-auto !m-0 !p-0">Enable Slideshow for automatic navigation. You can adjust the interval and view settings in the playback bar at the bottom.</p>
                   </div>
                 </>
               )}

               {walkthroughStep === 3 && (
                 <>
                   {isMobile ? (
                     <div className="flex gap-4 mb-4">
                       <div className="w-28 h-28 rounded-[2rem] bg-zinc-950 border border-gold/40 flex flex-col items-center justify-center gap-1 shadow-2xl">
                         <span className="text-3xl font-black text-gold uppercase !m-0 !p-0 leading-none">SWIPE</span>
                         <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none mt-1">Navigate</span>
                       </div>
                       <div className="w-28 h-28 rounded-[2rem] bg-zinc-950 border border-gold/40 flex flex-col items-center justify-center gap-1 shadow-2xl">
                         <span className="text-3xl font-black text-gold uppercase !m-0 !p-0 leading-none">TAP</span>
                         <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none mt-1">Controls</span>
                       </div>
                     </div>
                   ) : (
                     <div className="flex gap-8 mb-4">
                       <div className="w-28 h-28 rounded-[2rem] bg-zinc-950 border border-gold/40 flex flex-col items-center justify-center gap-1 shadow-2xl">
                         <span className="text-4xl font-black text-gold uppercase !m-0 !p-0 leading-none">A / D</span>
                         <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none mt-1">Navigation</span>
                       </div>
                       <div className="w-28 h-28 rounded-[2rem] bg-zinc-950 border border-gold/40 flex flex-col items-center justify-center gap-1 shadow-2xl">
                         <span className="text-4xl font-black text-gold uppercase !m-0 !p-0 leading-none">S / F</span>
                         <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none mt-1">Shortcuts</span>
                       </div>
                     </div>
                   )}
                   <div className="space-y-8 px-6">
                      <h2 className="text-4xl font-black text-white uppercase tracking-tight !m-0 !p-0">
                        {isMobile ? 'Touch Controls' : 'Keyboard Shortcuts'}
                      </h2>
                      <p className="text-zinc-400 text-lg font-medium leading-relaxed max-w-[90%] mx-auto !m-0 !p-0">
                        {isMobile
                          ? <>Swipe left or right to move between posts. Use the bottom bar for prev/next, fullscreen, and slideshow. Pinch to zoom in lightbox.</>
                          : <>Use <strong>A / D</strong> or arrows to move between posts. Press <strong>S</strong> for slideshow and <strong>F</strong> for fullscreen lightbox.</>}
                      </p>
                   </div>
                 </>
               )}

               {/* Step Controller */}
               <div className="w-full flex flex-col gap-10 mt-12 px-6">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (walkthroughStep < 3) {
                        setWalkthroughStep(walkthroughStep + 1);
                      } else {
                        setShowWalkthrough(false);
                        chrome.storage.local.set({ walkthroughCompleted: true });
                      }
                    }}
                    className="w-full py-8 md:py-10 rounded-[2.5rem] btn-theme font-black text-[13px] tracking-[0.35em] shadow-2xl hover:scale-[1.03] active:scale-95 transition-all !glow-theme-strong border border-white/20 cursor-pointer uppercase">
                    {walkthroughStep < 3 ? 'NEXT STEP' : 'FINISH TUTORIAL'}
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowWalkthrough(false);
                      chrome.storage.local.set({ walkthroughCompleted: true });
                    }}
                    className="w-full py-4 rounded-xl bg-transparent hover:bg-white/5 text-zinc-600 hover:text-white transition-all font-black text-[11px] uppercase tracking-[0.4em] cursor-pointer opacity-30 hover:opacity-100 !m-0">
                    SKIP TUTORIAL
                  </button>
               </div>

               {/* Step Indicator */}
               <div className="flex gap-4">
                  {[0,1,2,3].map(i => (
                    <div key={i} className={`h-2.5 rounded-full transition-all duration-700 ${i === walkthroughStep ? 'w-16 bg-theme-primary shadow-[0_0_20px_rgba(var(--theme-primary-rgb),0.6)]' : 'w-2.5 bg-white/10'}`} />
                  ))}
               </div>
            </div>
         </div>
       )}
      {/* Side Panel (The Obsidian Blade) */}
      {!lightboxOpen && (
        <>
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 z-[120] bg-black/70 mobile-drawer-backdrop"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div className={`${isMobile
          ? `fixed inset-y-0 left-0 z-[130] w-[min(100%,22rem)] max-w-[320px] mobile-sidebar transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
          : 'w-[380px] relative'
        } h-full flex-shrink-0 bg-black border-r border-white/10 flex flex-col z-[100] focus:outline-none`}>
        <div className={`${isMobile ? 'py-6' : 'py-12'} flex items-center justify-center gap-6 border-b border-white/5 relative px-6`}>
          <div className="flex gap-3">
            <button 
              onClick={toggleExtension}
              className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition-all cursor-pointer group active:scale-90 shadow-xl"
              title="Disable R34 Pro">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="group-hover:text-theme-primary"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
            </button>
            <button 
              onClick={() => {
                setWalkthroughStep(0);
                setShowWalkthrough(true);
              }}
              className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 text-zinc-400 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all cursor-pointer group active:scale-90 shadow-xl"
              title="Help & Tutorial">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </button>
          </div>
          <img 
            src={chrome.runtime.getURL('logo.webp')} 
            className="w-16 h-16 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.8)] border border-theme-primary/20 object-contain p-1 bg-black/40" 
            alt="R34 Pro" 
            onError={(e) => {
               (e.target as HTMLImageElement).src = '/logo.webp';
            }}
          />
        </div>

        <div className="flex gap-2 p-4 pt-6 border-b border-white/5">
          <button 
            onClick={() => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' })}
            className="flex-1 bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 py-3 rounded-xl text-[10px] font-black text-zinc-400 hover:text-white transition-all uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            Options
          </button>
          <button 
            onClick={() => window.open('https://patreon.com/R34Pro', '_blank')}
            className="flex-1 bg-gold/10 hover:bg-gold/20 border border-gold/30 py-3 rounded-xl text-[10px] font-black text-gold hover:text-white transition-all uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-gold/5">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 10.63 21 8.55 21 7V5c0-1.1-.9-2-2-2zM5 7h2v3c-1.1 0-2-.9-2-2V7zm14 1c0 1.1-.9 2-2 2V7h2v1z"></path></svg>
            Patreon
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 pt-4 scrollbar-hide flex flex-col gap-8 custom-scrollbar-hack">
          
          {/* SEARCH (Restored to Top) */}
          <div className="flex flex-col gap-4 py-4 relative z-10">
            <div className="text-[10px] font-black text-gold px-1 text-left w-full uppercase tracking-[0.2em] opacity-80">Search Engine</div>
            {isMobile && (
              <p className="text-[10px] text-zinc-500 px-1 -mt-2">Tap tags to add them here, then search.</p>
            )}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                window.location.href = `${RULE34_ORIGIN}/index.php?page=post&s=list&tags=${encodeURIComponent(searchValue)}`;
              }}
              className="flex flex-col gap-3"
            >
              <div className="relative">
                <input 
                   name="tags"
                   type="text" 
                   value={searchValue}
                   onChange={(e) => handleSearchChange(e.target.value)}
                   onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                   onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                   placeholder="Enter tags..."
                   className="w-full bg-zinc-950 border border-white/10 rounded-xl text-xs px-4 py-3 focus:border-theme-primary/50 transition !text-white shadow-inner font-bold"
                   autoComplete="off"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-950 border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[200] max-h-64 overflow-y-auto overflow-x-hidden backdrop-blur-3xl p-1">
                    {suggestions.map((s, idx) => (
                      <div 
                        key={idx}
                        onClick={() => {
                          const parts = searchValue.split(' ');
                          parts.pop();
                          const newVal = [...parts, s].join(' ') + ' ';
                          setSearchValue(newVal);
                          setSuggestions([]);
                          setShowSuggestions(false);
                        }}
                        className="px-4 py-2.5 text-[11px] hover:bg-theme-primary/10 hover:text-theme-primary cursor-pointer transition-all rounded-lg text-zinc-400 font-medium"
                      >
                        {s.replace(/_/g, ' ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button 
                type="submit"
                className="btn-theme w-full py-3 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest shadow-xl border border-white/10"
              >
                Search
              </button>
            </form>
          </div>

          {data.type !== 'post' && renderProfilePanel()}
          
          {data.type === 'post' && (
            <div className="flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.03] border border-white/5 shadow-inner">
            <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                     <span className="text-[13px] font-bold text-white tracking-tight">Slideshow</span>
                     <span className="text-[10px] text-zinc-500 font-medium">Auto-navigate gallery</span>
                  </div>
                  <div className={`flex items-center gap-3 ${isPlaying ? '' : 'animate-in fade-in slide-in-from-bottom-6 duration-1000'}`}>
                    <BoutiqueSelect 
                      value={slideshowInterval}
                      onChange={setSlideshowInterval}
                      options={[2, 3, 5, 8, 10, 15, 30]}
                      title="Slideshow Interval"
                    />
                    <button 
                      onClick={() => setIsPlaying(p => !p)}
                      className={`h-7 w-14 rounded-full transition-all flex items-center p-1 cursor-pointer border border-white/5 ${isPlaying ? '!bg-theme-primary' : 'bg-zinc-900 shadow-inner'}`}>
                      <div className={`h-5 w-5 rounded-full bg-black shadow-lg transition-all ${isPlaying ? 'translate-x-7' : 'translate-x-0'}`} />
                    </button>
                  </div>
               </div>
               
               {isPlaying && (
                 <div className="h-1.5 w-full bg-zinc-900/50 rounded-full overflow-hidden border border-white/5 mt-2">
                    <div className="h-full liquid-theme-bar" style={{ width: `${(slideTick / slideMaxTicks) * 100}%` }}></div>
                 </div>
               )}
            </div>
          )}



          
          {data.type === 'post' && Object.entries(tagsByCategory).sort((a,b) => b[1].length - a[1].length).map(([cat, tags]) => (
             <div key={cat} className="space-y-6 pt-10 border-t border-white/5">
               <div className="text-sm font-bold text-zinc-300 uppercase tracking-widest px-1">{cat}</div>
               <div className="flex flex-wrap gap-3">
                 {tags.map((t, ti) => (
                   isMobile ? (
                     <button
                       key={`${cat}-${t}-${ti}`}
                       type="button"
                       onClick={() => appendTagToSearch(t)}
                       className={`px-5 py-2.5 rounded-2xl text-sm transition-all cursor-pointer border hover:-translate-y-0.5 active:scale-95 inline-block font-medium text-left ${
                         isTagSelected(t)
                           ? 'ring-2 ring-theme-primary border-theme-primary bg-theme-primary/25 text-white scale-105 shadow-[0_0_20px_var(--theme-glow)]'
                           : `${getTagColor(cat)} hover:scale-105`
                       }`}
                     >
                       {t.replace(/_/g, ' ')}
                     </button>
                   ) : (
                   <a 
                     key={`${cat}-${t}-${ti}`} 
                     href={`${RULE34_ORIGIN}/index.php?page=post&s=list&tags=${encodeURIComponent(t.replace(/\s+/g, '_'))}`}
                     className={`px-5 py-2.5 rounded-2xl text-sm transition-all cursor-pointer border hover:-translate-y-0.5 hover:scale-105 active:scale-95 inline-block font-medium ${getTagColor(cat)}`}
                   >
                     {t.replace(/_/g, ' ')}
                   </a>
                   )
                 ))}
               </div>
             </div>
          ))}

          {data.type === 'post' && renderProfilePanel()}

          {data.type === 'list' && (
             <div className="space-y-10 pt-8 border-t border-white/5">
                 <div className="text-sm font-bold text-zinc-200 px-1">Gallery Settings</div>
                 <div className="bg-zinc-900 p-8 rounded-3xl border border-white/5 space-y-6">
                    <div className="flex justify-between text-xs text-zinc-400 font-semibold">
                       <span>Thumbnail Size</span>
                       <span className="text-theme-primary">{gridSize === 2 ? 'Large' : gridSize === 4 ? 'Default' : 'Small'}</span>
                    </div>
                    <input 
                      type="range" 
                      min="2" max="8" step="2"
                      value={gridSize}
                      onChange={(e) => setGridSize(Number(e.target.value))}
                      className="w-full accent-theme-primary cursor-pointer h-1.5"
                    />
                 </div>

                 <div className="flex flex-col gap-4">
                   <div className="text-sm font-bold text-zinc-200 px-1">Navigation</div>
                   <button 
                     type="button"
                     onClick={() => { window.location.href = `${RULE34_ORIGIN}/index.php?page=post&s=random`; }}
                     className="w-full bg-zinc-900 hover:bg-zinc-800 p-6 rounded-3xl border border-white/5 text-sm transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-4 font-bold cursor-pointer text-white">
                     Jump to Random Post
                   </button>
                 </div>
             </div>
          )}

          {/* Robust Flagship Footer (Deprioritized Utility below tags) */}
          <div className="flex flex-col gap-8 py-10 border-t border-white/10 bg-white/[0.02] -mx-8 px-8 mt-12">
            
            {data.type === 'post' && (
              <div className="flex flex-col gap-4">
                 <div className="text-[10px] font-black text-theme-primary px-1 uppercase tracking-[0.2em] mb-2 opacity-80">Community & Social</div>
                 
                 <div className="flex flex-col gap-3">
                   <button 
                    onClick={() => { (window as any).iCame?.(data.id); }}
                    className="w-full bg-gradient-to-br from-theme-dark/40 to-theme-primary/10 border border-theme-primary/30 p-5 rounded-2xl flex items-center justify-between group hover:scale-[1.02] active:scale-95 transition-all cursor-pointer shadow-lg shadow-theme-glow">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-theme-primary/20 flex items-center justify-center text-theme-primary group-hover:scale-110 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-xs font-black text-theme-primary uppercase tracking-widest">I CAME!</span>
                        <span className="text-[9px] text-theme-bright/50 font-bold italic">Cast your pulse</span>
                      </div>
                    </div>
                    <img src="https://rule34.xxx/static/icame.png" className="w-8 h-8 opacity-40 group-hover:opacity-100 transition-opacity grayscale group-hover:grayscale-0 invert" alt="P" />
                   </button>

                   <div className="flex gap-3">
                     <button 
                      onClick={() => handleToggleFavorite(data.id)}
                      disabled={favoriteBusy}
                      className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-white/5 p-4 rounded-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.05] active:scale-95 cursor-pointer group disabled:opacity-50">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-500 group-hover:text-theme-primary transition-colors"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg>
                      <span className="text-[10px] font-black text-zinc-400 group-hover:text-white uppercase tracking-widest">Favorite</span>
                     </button>
                     <button 
                      onClick={() => { (window as any).post_vote?.(data.id, 'up'); }}
                      className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-white/5 p-4 rounded-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.05] active:scale-95 cursor-pointer group">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-500 group-hover:text-emerald-500 transition-colors"><path d="M7 10v12"></path><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"></path></svg>
                      <span className="text-[10px] font-black text-zinc-400 group-hover:text-white uppercase tracking-widest">Upvote</span>
                     </button>
                   </div>
                 </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
               <div className="text-[10px] font-black text-zinc-500 px-1 uppercase tracking-[0.2em] mb-2">Discovery & Intelligence</div>
               {data.type === 'post' && (
                 <div className="grid grid-cols-2 gap-2 mb-3">
                   {[
                     { name: 'Saucenao', url: `https://saucenao.com/search.php?db=999&url=${encodeURIComponent(data.imageUrl)}` },
                     { name: 'Similar', url: `https://iqdb.org/?url=${encodeURIComponent(data.imageUrl)}` },
                     { name: 'Waifu2x', url: `https://waifu2x.booru.pics/Home/fromlink?denoise=1&scale=2&url=${encodeURIComponent(data.imageUrl)}` },
                     { name: 'Source', url: data.sourceUrl }
                   ].map(tool => (
                     <button 
                      key={tool.name}
                      onClick={() => { if(tool.url) window.open(tool.url, '_blank'); }}
                      className="p-3 bg-zinc-900/40 hover:bg-zinc-800 rounded-lg border border-white/5 text-[10px] font-black text-zinc-400 hover:text-white transition-all uppercase tracking-widest disabled:opacity-30 flex items-center justify-center"
                      disabled={!tool.url}>
                      {tool.name}
                     </button>
                   ))}
                 </div>
               )}
               <button 
                type="button"
                onClick={() => { window.location.href = `${RULE34_ORIGIN}/index.php?page=post&s=random`; }}
                className="w-full bg-zinc-900/50 hover:bg-zinc-800 p-4 rounded-xl border border-white/5 text-xs transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 font-bold cursor-pointer text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline><polyline points="7.5 19.79 7.5 14.6 3 12"></polyline><polyline points="21 12 16.5 14.6 16.5 19.79"></polyline><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                Random Post
               </button>
            </div>

            <div className="flex flex-col gap-5">
              <div className="text-[10px] font-black text-zinc-500 px-1 uppercase tracking-[0.2em] mb-2 opacity-80">Gallery Control</div>
              
              <div className="bg-zinc-900/30 p-5 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-white">Grid Density</span>
                    <span className="text-[9px] text-zinc-500">Thumbnail scale</span>
                  </div>
                  <span className="text-[11px] font-black text-theme-primary">{gridSize === 2 ? 'High' : gridSize === 4 ? 'Normal' : 'Low'}</span>
                </div>
                <input 
                  type="range" 
                  min="2" max="8" step="2"
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-theme-primary"
                />
              </div>
              
              {/* HD Direct removed per user request */}
            </div>
          </div>
        </div>

        <div className="p-10 border-t border-white/10 flex gap-6 bg-black mobile-sidebar-footer-nav">
           {data.type === 'post' ? (
             <>
               <button
                type="button"
                onClick={() => navigateToPost('prev')}
                className="flex-1 py-5 px-8 rounded-2xl bg-zinc-900 border border-white/10 text-white hover:text-theme-primary transition-all font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 cursor-pointer shadow-xl">
                PREVIOUS
               </button>
               <button
                type="button"
                onClick={() => navigateToPost('next')}
                className="flex-1 py-5 px-8 rounded-2xl btn-theme font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 cursor-pointer border border-white/10">
                NEXT
               </button>
             </>
           ) : (
             <div className="flex-1 py-6 text-zinc-600 font-bold text-xs text-center uppercase tracking-widest border border-dashed border-white/10 rounded-2xl">
                Select a post to view
             </div>
           )}
        </div>
      </div>
        </>
     )}

      {isMobile && !lightboxOpen && (
        <div className="mobile-top-bar fixed top-0 left-0 right-0 z-[110] bg-black/90 border-b border-white/10 flex items-center px-3 gap-2 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="mobile-touch-btn mobile-top-bar-btn w-11 h-11 rounded-xl bg-zinc-900 border border-white/10 text-white flex items-center justify-center active:scale-95 transition-all shrink-0"
            title="Open menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div className="flex-1 min-w-0 mobile-top-bar-title">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-theme-primary">R34 Pro</div>
            <div className="text-[10px] text-zinc-500 truncate mobile-top-bar-subtitle">
              {showSearchLanding
                ? 'Search'
                : data.type === 'account'
                  ? (data.isLoggedIn ? 'Account' : 'Login')
                  : data.type === 'list' && data.listKind === 'favorites'
                    ? 'Favorites'
                : data.type === 'post'
                  ? `Post ${data.id}`
                  : data.type === 'list'
                    ? (data.searchTags === 'all' ? 'All posts' : data.searchTags.replace(/_/g, ' '))
                    : 'R34 Pro'}
            </div>
          </div>
          {data.type === 'post' && (
            <button
              type="button"
              onClick={() => handleToggleFavorite(data.id)}
              disabled={favoriteBusy}
              className="mobile-touch-btn w-11 h-11 rounded-xl bg-zinc-900 border border-white/10 text-white flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
              title="Add to favorites"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              window.location.href = accountSession.isLoggedIn && accountSession.profileUrl
                ? accountSession.profileUrl
                : accountHomeUrl();
            }}
            className="mobile-touch-btn w-11 h-11 rounded-xl bg-zinc-900 border border-white/10 text-white flex items-center justify-center active:scale-95 transition-all"
            title={accountSession.isLoggedIn ? 'My profile' : 'Account'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          </button>
          {data.type === 'post' && (
            <>
              <button
                type="button"
                onClick={() => openLightbox()}
                className="mobile-touch-btn w-11 h-11 rounded-xl bg-zinc-900 border border-white/10 text-white flex items-center justify-center active:scale-95 transition-all"
                title="Fullscreen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              </button>
              <button
                type="button"
                onClick={() => setIsPlaying(p => !p)}
                className={`mobile-touch-btn w-11 h-11 rounded-xl border flex items-center justify-center active:scale-95 transition-all ${isPlaying ? 'bg-theme-primary border-theme-primary text-black' : 'bg-zinc-900 border-white/10 text-white'}`}
                title={isPlaying ? 'Pause slideshow' : 'Start slideshow'}
              >
                {isPlaying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {isMobile && !lightboxOpen && data.type === 'post' && (
        <div className="mobile-bottom-bar fixed bottom-0 left-0 right-0 z-[110] bg-black/95 border-t border-white/10 backdrop-blur-xl px-3 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigateToPost('prev')}
            className="mobile-touch-btn mobile-bottom-bar-btn flex-1 min-h-[48px] rounded-2xl bg-zinc-900 border border-white/10 text-white font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => downloadPost(data.highresUrl, data.id, data.searchTags, data.mediaType)}
            className="mobile-touch-btn w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 text-white flex items-center justify-center active:scale-95 transition-all"
            title="Download"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </button>
          <button
            type="button"
            onClick={() => openLightbox()}
            className="mobile-touch-btn w-12 h-12 rounded-2xl btn-theme border border-white/10 text-black flex items-center justify-center active:scale-95 transition-all"
            title="Lightbox"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </button>
          <button
            type="button"
            onClick={() => navigateToPost('next')}
            className="mobile-touch-btn flex-1 min-h-[48px] rounded-2xl btn-theme font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all border border-white/10"
          >
            Next
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div
        ref={mainContentRef}
        className={`flex-1 relative flex flex-col items-center justify-center overflow-hidden bg-zinc-950/50 mobile-main ${showSearchLanding ? 'overflow-x-hidden overscroll-none mobile-search-shell' : ''} ${isMobile ? `mobile-main-inset ${data.type === 'post' && !lightboxOpen ? 'mobile-main-post-inset' : ''}` : 'p-4 md:p-8'}`}
      >
        {data.type === 'post' && !lightboxOpen && isMobile && (
          <div ref={postGestureRef} className="absolute inset-0 z-[8] mobile-gesture-layer" aria-hidden />
        )}
        {!(data.type === 'post' && !lightboxOpen) && (
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-700 via-zinc-950 to-zinc-950 pointer-events-none"></div>
        )}
        {loading && (
           <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-20 backdrop-blur-md transition-all duration-300">
              <div className="w-12 h-12 border-[4px] border-theme-primary border-t-transparent rounded-full animate-spin glow-theme"></div>
           </div>
        )}

        {data.type === 'account' ? (
          <div className="mobile-account-page mobile-search-landing w-full flex-1 min-h-0 flex flex-col items-center justify-start p-6 gap-6 overflow-y-auto max-w-lg mx-auto">
            <div className="text-center space-y-2 w-full">
              <h1 className="text-2xl font-black uppercase tracking-[0.15em] text-white">
                {data.variant === 'login' ? 'Login' : data.isLoggedIn ? 'My Account' : 'Account'}
              </h1>
              <p className="text-sm text-zinc-400">
                {data.isLoggedIn
                  ? 'Manage your Rule34 profile, favorites, and mail.'
                  : 'Sign in to save favorites and access account features.'}
              </p>
            </div>

            {data.variant === 'login' ? (
              <form onSubmit={handleLoginSubmit} className="w-full flex flex-col gap-4">
                <input
                  type="text"
                  name="user"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  placeholder="Username"
                  autoComplete="username"
                  className="w-full bg-zinc-950 border border-white/10 rounded-2xl px-5 py-4 text-white"
                />
                <input
                  type="password"
                  name="pass"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  className="w-full bg-zinc-950 border border-white/10 rounded-2xl px-5 py-4 text-white"
                />
                {loginError && (
                  <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    {loginError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loginLoading || !loginUser || !loginPass}
                  className="btn-theme w-full py-4 rounded-2xl font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {loginLoading ? 'Logging in…' : 'Log in'}
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = accountRegisterUrl(); }}
                  className="w-full py-3 rounded-2xl bg-zinc-900 border border-white/10 text-zinc-300 text-sm font-bold"
                >
                  Create account
                </button>
              </form>
            ) : (
              <div className="w-full flex flex-col gap-3">
                {data.links.map((link) => (
                  <button
                    key={link.href}
                    type="button"
                    onClick={() => { window.location.href = link.href; }}
                    className="w-full text-left bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 rounded-2xl px-5 py-4 transition-all active:scale-[0.99]"
                  >
                    <div className="text-sm font-black text-white">{link.label}</div>
                    {link.description && (
                      <div className="text-[11px] text-zinc-500 mt-1">{link.description}</div>
                    )}
                  </button>
                ))}
                {!data.isLoggedIn && (
                  <button
                    type="button"
                    onClick={() => { window.location.href = accountLoginUrl(); }}
                    className="btn-theme w-full py-4 rounded-2xl font-black uppercase tracking-widest mt-2"
                  >
                    Login
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => { window.location.href = `${RULE34_ORIGIN}/index.php?page=post&s=list&tags=all&r34_browse=1`; }}
              className="text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-theme-primary transition-colors"
            >
              Back to browse
            </button>
          </div>
        ) : data.type === 'post' ? (
          <>
            {!lightboxOpen && (
            <>
            {/* Navigation Overlays (Transparent areas that navigate directly) */}
            <div
               onClick={() => navigateToPost('prev')}
               className="desktop-only-nav-overlay absolute left-0 top-1/2 -translate-y-1/2 w-32 h-[80%] z-10 cursor-pointer group flex items-center justify-center"
               title="Previous Post (Left Arrow)"
            >
                <div className="bg-black/20 hover:bg-black/40 p-4 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                   <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </div>
            </div>
            <div
               onClick={() => navigateToPost('next')}
               className="desktop-only-nav-overlay absolute right-0 top-1/2 -translate-y-1/2 w-32 h-[80%] z-10 cursor-pointer group flex items-center justify-center"
               title="Next Post (Right Arrow)"
            >
                <div className="bg-black/20 hover:bg-black/40 p-4 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                   <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
            </div>

             <div className={`absolute top-6 right-6 z-10 flex gap-2 ${isMobile ? 'hidden' : ''}`}>
               <button 
                  onClick={() => downloadPost(data.highresUrl, data.id, data.searchTags, data.mediaType)}
                  className={`bg-black/60 hover:bg-theme-primary border border-white/10 hover:border-theme-bright text-white hover:text-black rounded-2xl backdrop-blur-3xl transition-all shadow-2xl group glow-theme cursor-pointer active:opacity-70 ${isMobile ? 'p-3' : 'p-4'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-y-0.5 transition-transform"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
               </button>
             </div>
            </>
            )}
            
            <div 
              ref={postViewContainerRef}
              className={`mobile-post-stage relative w-full h-full rounded-2xl overflow-hidden flex items-center justify-center group transition-all duration-300 ${
                lightboxOpen ? 'fixed inset-0 z-[99999998] bg-black/98 rounded-none mobile-post-lightbox' : ''
              } ${scale > 1 ? 'cursor-grab' : 'cursor-zoom-in'}`}
            >
               {data.mediaType === 'video' ? (
                 <PostVideoPlayer
                   ref={videoRef}
                   key={data.highresUrl}
                   src={data.highresUrl}
                   poster={data.imageUrl}
                   showControls={lightboxOpen}
                   muted={videoMuted}
                   onTap={isAndroidApp && lightboxOpen ? toggleAndroidLightboxUi : undefined}
                   className={`mobile-post-media max-w-full max-h-full object-contain transition-transform ${isDragging ? 'duration-0' : 'duration-300'} ${lightboxOpen ? 'max-h-[85vh] shadow-2xl rounded-lg' : ''} ${scale <= 1 && !lightboxOpen ? 'group-hover:scale-[1.02]' : ''}`}
                   style={scale > 1 ? { transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, transformOrigin: 'center center' } : undefined}
                 />
               ) : (
                 <img 
                   ref={postImageRef}
                   key={data.imageUrl}
                   src={data.imageUrl} 
                   className={`max-w-full max-h-full object-contain transition-transform ${isDragging ? 'duration-0' : 'duration-300'} ${loading ? 'opacity-0 scale-95' : 'opacity-100'} ${scale <= 1 ? 'group-hover:scale-[1.02]' : ''}`}
                   style={scale > 1 ? { transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, transformOrigin: 'center center' } : undefined}
                   alt="Post Image"
                   draggable={false}
                 />
               )}
            </div>
          </>
        ) : showSearchLanding ? (
          <div className="mobile-search-landing mobile-search-shell w-full flex-1 min-h-0 flex flex-col items-center justify-center p-6 gap-4 overflow-hidden">
            <div className="mobile-search-hero flex flex-col items-center gap-4 w-full max-w-md">
              <img
                src={chrome.runtime.getURL('logo.webp')}
                className="mobile-search-logo w-24 h-24 rounded-3xl shadow-[0_0_50px_rgba(212,175,55,0.35)] border border-theme-primary/30 object-contain p-2 bg-black/40 shrink-0"
                alt="R34 Pro"
              />
              <div className="text-center space-y-3 max-w-md mobile-search-copy">
                <h1 className="text-2xl font-black uppercase tracking-[0.2em] text-white">R34 Pro Search</h1>
                <p className="text-sm text-zinc-400">Enter tags to browse Rule34 with the full reskin experience.</p>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch(searchValue);
              }}
              className="mobile-search-form w-full max-w-md flex flex-col gap-4"
            >
              <div className="relative">
                <input
                  name="tags"
                  type="text"
                  value={searchValue}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="e.g. tag1 tag2"
                  className="w-full bg-zinc-950 border border-white/10 rounded-2xl text-base px-5 py-4 focus:border-theme-primary/50 transition !text-white shadow-inner font-medium"
                  autoComplete="off"
                  autoFocus
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-950 border border-white/10 rounded-xl shadow-2xl z-[200] max-h-64 overflow-y-auto p-1">
                    {suggestions.map((s, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          const parts = searchValue.split(' ');
                          parts.pop();
                          const newVal = [...parts, s].join(' ') + ' ';
                          setSearchValue(newVal);
                          setSuggestions([]);
                          setShowSuggestions(false);
                        }}
                        className="px-4 py-3 text-sm hover:bg-theme-primary/10 hover:text-theme-primary cursor-pointer transition-all rounded-lg text-zinc-400"
                      >
                        {s.replace(/_/g, ' ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="btn-theme w-full py-4 rounded-2xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 font-black text-sm uppercase tracking-[0.2em] shadow-xl border border-white/10"
              >
                Search Rule34
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                window.location.href = `${RULE34_ORIGIN}/index.php?page=post&s=list&tags=all&r34_browse=1`;
              }}
              className="text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-theme-primary transition-colors"
            >
              Browse all posts
            </button>
          </div>
        ) : (
          <div className="w-full h-full overflow-y-auto scrollbar-hide mobile-grid">
            {data.listKind === 'favorites' && (
              <div className="max-w-[1800px] mx-auto w-full px-4 pt-4 pb-2 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-widest">My Favorites</h2>
                  <p className="text-xs text-zinc-500 mt-1">{data.items.length} saved posts on this page</p>
                </div>
                <button
                  type="button"
                  onClick={() => { window.location.href = accountHomeUrl(); }}
                  className="text-[10px] font-black uppercase tracking-widest text-theme-primary"
                >
                  Account
                </button>
              </div>
            )}
             <div 
               className="grid gap-6 p-4 max-w-[1800px] mx-auto w-full overflow-y-auto"
               style={{ 
                 gridTemplateColumns: `repeat(${effectiveGridSize}, minmax(0, 1fr))`,
                 display: 'grid'
               }}
            >
                {data.items.map(item => (
                  <div 
                    key={item.id} 
                    onClick={() => { window.location.href = buildPostViewUrl(item.id, data.searchTags); }}
                    className="mobile-grid-item aspect-[3/4] landscape:aspect-square relative rounded-2xl overflow-hidden glass-panel border border-white/5 hover:border-theme-primary/50 transition-all group cursor-pointer shadow-lg hover:scale-[1.05] hover:-translate-y-1 active:scale-95"
                  >
                     <img 
                       src={item.thumbUrl} 
                       className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                       alt="Thumb"
                       loading="lazy"
                     />
                     {item.mediaType === 'video' && (
                       <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md p-1.5 rounded-lg border border-white/20">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                       </div>
                     )}
                     {data.listKind === 'favorites' && (
                       <button
                         type="button"
                         onClick={(e) => {
                           e.stopPropagation();
                           handleRemoveFavorite(item.id);
                         }}
                         disabled={favoriteBusy}
                         className="absolute top-2 left-2 z-10 bg-black/70 hover:bg-red-600/80 border border-white/10 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                       >
                         Remove
                       </button>
                     )}
                     <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-4 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                        <div className="text-[10px] text-white font-bold tracking-tight mb-1 truncate">ID: {item.id}</div>
                        <div className="flex flex-wrap gap-1 max-h-[40px] overflow-hidden">
                           {item.tags.slice(0, 3).map(t => (
                             <span key={t} className="text-[8px] bg-white/10 text-zinc-300 px-1 rounded truncate max-w-full italic">{t}</span>
                           ))}
                        </div>
                     </div>
                  </div>
                ))}
             </div>

              {/* Pagination Bar */}
              {data.pagination && data.pagination.length > 0 && (
                <div className="max-w-[1800px] mx-auto w-full px-4 py-12 flex flex-wrap justify-center gap-2">
                    {data.pagination.map((p, i) => (
                       <button
                         key={i}
                         disabled={p.isCurrent || !p.url || p.url === '#'}
                         onClick={() => { 
                           if (p.url && p.url !== '#') {
                             const target = new URL(p.url, RULE34_ORIGIN);
                             appendR34NavParams(target);
                             window.location.href = target.href;
                           }
                         }}
                         className={`min-w-[40px] h-10 px-3 rounded-lg flex items-center justify-center transition-all font-medium text-xs border ${
                          p.isCurrent 
                            ? 'bg-gradient-to-tr from-theme-dark to-theme-primary text-white border-theme-primary shadow-[0_0_15px_var(--theme-glow)]' 
                            : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:text-theme-primary hover:border-theme-primary/30 active:scale-95 cursor-pointer'
                        }`}
                       >
                         {p.label === '<<' ? 'First' : p.label === '<' ? 'Prev' : p.label === '>' ? 'Next' : p.label === '>>' ? 'Last' : p.label}
                       </button>
                    ))}
                 </div>
               )}
          </div>
        )}
      </div>

      {/* Lightbox stage — images only (video reuses the same player in post view) */}
      {data.type === 'post' && lightboxOpen && data.mediaType !== 'video' && (
        <div
          className="lightbox-stage fixed inset-0 z-[100000000] pointer-events-none animate-in fade-in duration-200 group/lightbox"
        >
          <button
            type="button"
            aria-label="Close lightbox"
            className="lightbox-stage-backdrop absolute inset-0 bg-black/98 backdrop-blur-2xl pointer-events-auto cursor-default border-0 p-0"
            onClick={() => {
              if (isAndroidApp) {
                if (!lightboxUiVisible) resetLightboxUiTimer();
                else closeLightbox();
                return;
              }
              closeLightbox();
            }}
          />

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20 transition-all duration-300 pointer-events-none">
              <div className="void-spinner"></div>
            </div>
          )}

          {rateLimited && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <div className="bg-red-500/20 backdrop-blur-xl border border-red-500/50 p-6 rounded-2xl flex flex-col items-center gap-3 text-red-400 font-bold shadow-[0_0_50px_rgba(239,68,68,0.3)]">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                <span>RATE LIMITED</span>
                <span className="text-xs text-red-300 font-medium">Pausing for a few seconds...</span>
              </div>
            </div>
          )}

          <div
            ref={containerRef}
            className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none"
            onMouseDown={(e) => {
              if (scale > 1) {
                setIsDragging(true);
                dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
              }
            }}
            onMouseMove={(e) => {
              if (isDragging && scale > 1) {
                setPosition({
                  x: e.clientX - dragStart.current.x,
                  y: e.clientY - dragStart.current.y
                });
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
            <div
              ref={lightboxGestureRef}
              className="relative max-w-full max-h-full pointer-events-auto mobile-gesture-layer lightbox-media-gesture-layer touch-manipulation"
              onClick={(e) => {
                e.stopPropagation();
                if (isAndroidApp) toggleAndroidLightboxUi();
              }}
            >
              <img
                ref={imageRef}
                src={data.highresUrl}
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'crosshair',
                  transformOrigin: 'center center',
                }}
                className={`shadow-2xl rounded-lg transition-transform ${isDragging ? 'duration-0' : 'duration-300'} ${loading ? 'opacity-50' : 'opacity-100'}`}
                alt="Highres"
                draggable={false}
              />
            </div>
          </div>
        </div>
      )}

      {data.type === 'post' && lightboxOpen && (
        <LightboxChromeLayer
          closeLightbox={closeLightbox}
          onDownload={() => downloadPost(data.highresUrl, data.id, data.searchTags, data.mediaType)}
          isAndroidApp={isAndroidApp}
          lightboxUiVisible={lightboxUiVisible}
          resetLightboxUiTimer={resetLightboxUiTimer}
          isMobile={isMobile}
          isPlaying={isPlaying}
          slideTick={slideTick}
          slideMaxTicks={slideMaxTicks}
          slideshowInterval={slideshowInterval}
          setSlideshowInterval={setSlideshowInterval}
          navigateToPost={navigateToPost}
          loading={loading}
          setIsPlaying={setIsPlaying}
        />
      )}

      {profileNotice && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100000010] bg-zinc-950/95 border border-theme-primary/30 text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl">
          {profileNotice}
        </div>
      )}
    </div>
  );
};

export default defineContentScript({
  matches: ['*://rule34.xxx/*', '*://*.rule34.xxx/*'],
  permissions: ['downloads', 'storage', 'tabs'],
  host_permissions: ['*://rule34.xxx/*', '*://*.rule34.xxx/*'],
  icons: {
    "16": "logo.webp",
    "32": "logo.webp",
    "48": "logo.webp",
    "128": "logo.webp"
  },
  main() {
    const data = parseRule34Page(document, new URLSearchParams(window.location.search));
    if (!data) return;

    // Keep the loading shell visible until React mounts; dismiss happens from App/verifyInjection.

    const rootContainer = document.createElement('div');
    rootContainer.id = 'reframer-root';
    rootContainer.className = 'void-navigator-root';
    document.body.appendChild(rootContainer);
    
    setTimeout(() => {
        const root = createRoot(rootContainer);
        root.render(<App initialData={data} />);
    }, 0);
  }
});
