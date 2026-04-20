import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import '../assets/main.css';
import {
  RULE34_ORIGIN,
  buildPostViewUrl,
  parseRule34Page,
  toAbsoluteRule34Url,
  type PageData,
} from '../lib/parseRule34Page';



/**
 * REFRAMER CORE ARCHITECTURE
 * 
 * 1. Physical Key Relay: This extension prioritizes 1:1 behavioral parity with Rule34.
 *    Instead of complex SPA logic, it uses standard window.location.href reloads.
 * 2. State Persistence: UI states (Slideshow, Lightbox, Grid) are stored in sessionStorage
 *    to survive reloads and maintain seamless user experience.
 * 3. Atomic Parsing: The site is parsed once per load into a PageData object.
 */
const BoutiqueSelect = ({ value, onChange, options, title }: { 
  value: number, 
  onChange: (v: number) => void, 
  options: number[],
  title?: string
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef} onClick={e => e.stopPropagation()}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-black/40 border border-white/10 text-[10px] font-bold text-white px-3 py-2 rounded-lg flex items-center gap-3 hover:border-theme-primary/50 transition-all cursor-pointer min-w-[65px] justify-between shadow-inner"
        title={title}
      >
        <span>{value}s</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full glass-panel overflow-hidden z-[1000] animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xl border border-white/10">
          <div className="flex flex-col p-1 bg-zinc-950/90 backdrop-blur-xl">
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setIsOpen(false); }}
                className={`w-full px-3 py-2 text-[10px] font-bold text-left rounded-md transition-all cursor-pointer ${value === opt ? 'bg-theme-primary text-black' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}
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
    return Number(currentParams.get('r34_gs')) || 4;
  });
  
  // Zoom/Pan State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const postId = data.type === 'post' ? data.id : null;

  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [postId, lightboxOpen]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      const newScale = Math.min(Math.max(1, scale + delta), 10);
      
      if (newScale !== scale) {
        const rect = imageRef.current?.getBoundingClientRect();
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
    return () => {
      if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current);
    };
  }, []);

  useEffect(() => {
    setSearchValue(data.searchTags === 'all' ? '' : data.searchTags);
  }, [data.searchTags]);

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
  const navigateToPost = useCallback((direction: 'prev' | 'next') => {
    if (data.type !== 'post') return;
    let url = direction === 'prev' ? data.prevUrl : data.nextUrl;
    if (url && url !== '#') {
      const target = new URL(url, RULE34_ORIGIN);
      if (lightboxOpen) target.searchParams.set('r34_lb', '1');
      if (isPlaying) target.searchParams.set('r34_ss', '1');
      if (slideshowInterval !== 5) target.searchParams.set('r34_si', slideshowInterval.toString());
      if (gridSize !== 4) target.searchParams.set('r34_gs', gridSize.toString());
      if (bulkCount !== 10) target.searchParams.set('r34_bc', bulkCount.toString());
      window.location.href = target.href;
    }
  }, [data, lightboxOpen, isPlaying, slideshowInterval, gridSize, bulkCount]);

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
        setLightboxOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigateToPost, setIsPlaying, setLightboxOpen, isPlaying, lightboxOpen]);

  useEffect(() => {
    const onPopState = () => {
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
    if (loading) return;

    const timer = setInterval(() => {
      setSlideTick(prev => {
        const maxTicks = slideshowInterval * 10;
        if (prev >= maxTicks) {
           // We use the latest navigateToPost which may have been updated
           // by the fetchNeighbors async effect.
           navigateToPost('next');
           return 0;
        }
        return prev + 1;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [isPlaying, slideshowInterval, loading, navigateToPost]);

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
   * Handled by appending 'r34_lb' and 'r34_ss' to outgoing navigation URLs.
   */

  // Global Keyboard Listener (State only - Navigation is handled by site keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      // Ensure any logic here DOES NOT call preventDefault() for ArrowKeys
      // because we want the site's native logic to fire.
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === ' ') { e.preventDefault(); setIsPlaying(p => !p); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const downloadPost = (url: string, id: string, tags: string) => {
     const extMatch = url.match(/\.(jpg|jpeg|png|gif|mp4|webm)/i);
     const ext = extMatch ? extMatch[0] : '.jpg';
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
    <div className="w-screen h-screen flex bg-black text-zinc-100 overflow-hidden font-sans fixed inset-0 z-[99999999] void-navigator-root">
       {/* Walkthrough Tutorial Overlay */}
       {showWalkthrough && (
         <div className="fixed inset-0 z-[1000000000] bg-black/98 backdrop-blur-3xl flex items-center justify-center p-8 md:p-12 animate-in fade-in duration-700">
            <div className="max-w-xl w-full glass-panel-heavy !p-16 md:!p-24 rounded-[4.5rem] border border-white/10 flex flex-col items-center text-center gap-16 animate-in zoom-in-95 slide-in-from-bottom-20 duration-700 ease-out shadow-[0_100px_200px_rgba(0,0,0,1)]">
               
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
                   <div className="space-y-8 px-6">
                      <h2 className="text-4xl font-black text-white uppercase tracking-tight !m-0 !p-0">Keyboard Shortcuts</h2>
                      <p className="text-zinc-400 text-lg font-medium leading-relaxed max-w-[90%] mx-auto !m-0 !p-0">Use <strong>A / D</strong> or arrows to move between posts. Press <strong>S</strong> for slideshow and <strong>F</strong> for fullscreen lightbox.</p>
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
        <div className="w-[380px] h-full flex-shrink-0 bg-black border-r border-white/10 flex flex-col z-[100] relative focus:outline-none">
        <div className="py-12 flex items-center justify-center gap-6 border-b border-white/5 relative px-6">
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
                    <div className="h-full liquid-theme-bar" style={{ width: `${(slideTick / (slideshowInterval * 10)) * 100}%` }}></div>
                 </div>
               )}
            </div>
          )}



          
          {data.type === 'post' && Object.entries(tagsByCategory).sort((a,b) => b[1].length - a[1].length).map(([cat, tags]) => (
             <div key={cat} className="space-y-6 pt-10 border-t border-white/5">
               <div className="text-sm font-bold text-zinc-300 uppercase tracking-widest px-1">{cat}</div>
               <div className="flex flex-wrap gap-3">
                 {tags.map((t, ti) => (
                   <a 
                     key={`${cat}-${t}-${ti}`} 
                     href={`${RULE34_ORIGIN}/index.php?page=post&s=list&tags=${encodeURIComponent(t.replace(/\s+/g, '_'))}`}
                     className={`px-5 py-2.5 rounded-2xl text-sm transition-all cursor-pointer border hover:-translate-y-0.5 hover:scale-105 active:scale-95 inline-block font-medium ${getTagColor(cat)}`}
                   >
                     {t.replace(/_/g, ' ')}
                   </a>
                 ))}
               </div>
             </div>
          ))}

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
                      onClick={() => { (window as any).addFav?.(data.id); (window as any).notice?.('Added to favorites'); }}
                      className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-white/5 p-4 rounded-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.05] active:scale-95 cursor-pointer group">
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

        <div className="p-10 border-t border-white/10 flex gap-6 bg-black">
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
     )}

      {/* Main Content Area */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden bg-zinc-950/50">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-700 via-zinc-950 to-zinc-950 pointer-events-none"></div>
        {loading && (
           <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-20 backdrop-blur-md transition-all duration-300">
              <div className="w-12 h-12 border-[4px] border-theme-primary border-t-transparent rounded-full animate-spin glow-theme"></div>
           </div>
        )}

        {data.type === 'post' ? (
          <>
            {/* Navigation Overlays (Transparent areas that navigate directly) */}
            <div
               onClick={() => navigateToPost('prev')}
               className="absolute left-0 top-1/2 -translate-y-1/2 w-32 h-[80%] z-10 cursor-pointer group flex items-center justify-center"
               title="Previous Post (Left Arrow)"
            >
                <div className="bg-black/20 hover:bg-black/40 p-4 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                   <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </div>
            </div>
            <div
               onClick={() => navigateToPost('next')}
               className="absolute right-0 top-1/2 -translate-y-1/2 w-32 h-[80%] z-10 cursor-pointer group flex items-center justify-center"
               title="Next Post (Right Arrow)"
            >
                <div className="bg-black/20 hover:bg-black/40 p-4 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                   <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
            </div>

             <div className="absolute top-6 right-6 z-10 flex gap-2">
               <button 
                  onClick={() => downloadPost(data.highresUrl, data.id, data.searchTags)}
                  className="bg-black/60 hover:bg-theme-primary border border-white/10 hover:border-theme-bright text-white hover:text-black p-4 rounded-2xl backdrop-blur-3xl transition-all shadow-2xl group glow-theme cursor-pointer active:opacity-70">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-y-0.5 transition-transform"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
               </button>
            </div>
            
            <div 
              className="relative w-full h-full rounded-2xl overflow-hidden glass-panel flex items-center justify-center cursor-zoom-in group shadow-2xl transition-all duration-300 bg-zinc-900/50"
              onClick={() => setLightboxOpen(true)}
            >
               {data.mediaType === 'video' ? (
                 <video 
                   key={data.highresUrl}
                   src={data.highresUrl}
                   muted
                   autoPlay
                   loop
                   playsInline
                   className={`max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-[1.02] ${loading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
                 />
               ) : (
                 <img 
                   key={data.imageUrl}
                   src={data.imageUrl} 
                   className={`max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-[1.02] ${loading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
                   alt="Post Image"
                 />
               )}
               <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none flex items-end justify-center pb-8">
                 <span className="text-white backdrop-blur-md px-6 py-2.5 rounded-full bg-black/60 font-medium text-sm border border-white/10 flex items-center gap-2 shadow-xl translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                   Enter Fullscreen Lightbox
                 </span>
               </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full overflow-y-auto p-4 md:p-8 scrollbar-hide">
             <div 
               className="grid gap-6 p-4 max-w-[1800px] mx-auto w-full overflow-y-auto"
               style={{ 
                 gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                 display: 'grid'
               }}
            >
                {data.items.map(item => (
                  <div 
                    key={item.id} 
                    onClick={() => { window.location.href = buildPostViewUrl(item.id, data.searchTags); }}
                    className="aspect-[3/4] relative rounded-2xl overflow-hidden glass-panel border border-white/5 hover:border-theme-primary/50 transition-all group cursor-pointer shadow-lg hover:scale-[1.05] hover:-translate-y-1 active:scale-95"
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
                             if (isPlaying) target.searchParams.set('r34_ss', '1');
                             if (slideshowInterval !== 5) target.searchParams.set('r34_si', slideshowInterval.toString());
                             if (gridSize !== 4) target.searchParams.set('r34_gs', gridSize.toString());
                             if (bulkCount !== 10) target.searchParams.set('r34_bc', bulkCount.toString());
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

      {/* Lightbox Overlay */}
      {data.type === 'post' && lightboxOpen && (
        <div 
          className="fixed inset-0 z-[99999999] bg-black/98 backdrop-blur-2xl flex flex-col items-center justify-center cursor-default animate-in fade-in duration-200 group/lightbox"
          onClick={(e) => {
             if (e.target === e.currentTarget) setLightboxOpen(false);
          }}
        >
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
            className="relative w-full h-full flex items-center justify-center overflow-hidden"
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
            {data.mediaType === 'video' ? (
              <video 
                src={data.highresUrl}
                controls
                autoPlay
                loop
                className="max-w-full max-h-[85vh] shadow-2xl rounded-lg z-10"
                style={{ maxHeight: '85vh' }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img 
                ref={imageRef}
                src={data.highresUrl} 
                style={{ 
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                  maxWidth: '100%', 
                  maxHeight: '100%', 
                  objectFit: 'contain',
                  cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'crosshair',
                  transformOrigin: '0 0' // Crucial for zoom-to-cursor math
                }}
                className={`shadow-2xl rounded-lg transition-transform ${isDragging ? 'duration-0' : 'duration-300'} ${loading ? 'opacity-50' : 'opacity-100'}`}
                alt="Highres"
                onClick={(e) => e.stopPropagation()}
                draggable={false}
              />
            )}
          </div>

          <div className="absolute top-6 right-6 z-10 flex gap-3">
            <button 
                onClick={() => downloadPost(data.highresUrl, data.id, data.searchTags)}
                className="bg-black/60 hover:bg-theme-primary border border-white/10 hover:border-theme-bright text-white hover:text-black p-4 rounded-full backdrop-blur-3xl transition-all shadow-2xl group glow-theme cursor-pointer active:opacity-70"
                title="Download Archival Copy"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-y-0.5 transition-transform"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </button>
            <button 
               className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-md transition-all border border-white/10 hover:scale-110 active:scale-95 shadow-xl"
               onClick={() => setLightboxOpen(false)}
               title="Close Lightbox (Esc)"
            >
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div 
             className="absolute top-6 left-6 flex flex-col items-start gap-4 opacity-0 -translate-x-10 group-hover/lightbox:opacity-100 group-hover/lightbox:translate-x-0 transition-all duration-300 z-50"
             onClick={e => e.stopPropagation()}
          >
            {isPlaying && (
              <div className="lightbox-progress-track">
                 <div className="lightbox-progress-fill" style={{ width: `${(slideTick / (slideshowInterval * 10)) * 100}%` }}></div>
              </div>
            )}
            
            <div className={`glass-panel bg-black/60 px-6 py-4 rounded-2xl flex items-center gap-8 shadow-[0_0_30px_rgba(0,0,0,0.8)] border border-white/10 ${isPlaying ? '' : 'animate-in fade-in slide-in-from-bottom-5 duration-500'}`}>
                <BoutiqueSelect 
                  value={slideshowInterval}
                  onChange={setSlideshowInterval}
                  options={[2, 3, 5, 8, 10]}
                  title="Slideshow Interval"
                />

               <div className="w-px h-8 bg-white/10"></div>
               
                <button
                    type="button"
                    onClick={(e) => {
                       e.stopPropagation();
                       (e.currentTarget as HTMLElement).blur();
                       navigateToPost('prev');
                    }}
                    disabled={loading}
                    title="Previous Post (Left Arrow)"
                    className="lightbox-control-btn text-white transition-all p-2 rounded-full cursor-pointer z-50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
                 </button>

                <button 
                   onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
                   title={isPlaying ? "Pause Slideshow (Space)" : "Start Slideshow (Space)"}
                   className={`lightbox-play-btn ${!isPlaying ? 'opacity-80' : ''}`}>
                   {isPlaying ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                   ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="ml-1"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                   )}
                </button>

                 <button
                    type="button"
                    onClick={(e) => {
                       e.stopPropagation();
                       (e.currentTarget as HTMLElement).blur();
                       navigateToPost('next');
                    }}
                    disabled={loading}
                    title="Next Post (Right Arrow)"
                    className="lightbox-control-btn text-white transition-all p-2 rounded-full cursor-pointer z-50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                 </button>
               
               <div className="w-px h-8 bg-white/10"></div>

               <button 
                  onClick={() => downloadPost(data.highresUrl, data.id, data.searchTags)}
                  className="text-zinc-400 hover:text-white hover:scale-110 active:scale-95 transition-all flex flex-col items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
               </button>
            </div>
          </div>
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

    // Root isolation is handled via .void-active class toggling in the App component.

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
