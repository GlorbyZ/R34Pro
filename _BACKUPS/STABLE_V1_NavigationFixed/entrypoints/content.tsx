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



const App = ({ initialData }: { initialData: PageData }) => {
  const [data, setData] = useState<PageData>(initialData);
  const [loading, setLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Slideshow State
  const [isPlaying, setIsPlaying] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState<number>(5);
  const [slideTick, setSlideTick] = useState(0);
  const [rateLimited, setRateLimited] = useState(false);
  
  // Bulk Download State
  const [bulkCount, setBulkCount] = useState<number>(10);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const cancelBulkRef = useRef(false);
  
  // Gallery Settings
  const [gridSize, setGridSize] = useState<number>(4); // Default 4 columns
  
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
  const suggestionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const loadPageFromUrl = useCallback(async (href: string, historyMode: 'push' | 'none') => {
    const absoluteUrl = toAbsoluteRule34Url(href);
    if (!absoluteUrl) {
      console.warn('Invalid or empty URL provided for navigation:', href);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(absoluteUrl, { credentials: 'same-origin' });
      if (!res.ok) {
        console.error('Navigation fetch failed:', res.status, absoluteUrl);
        return;
      }
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const fullUrl = new URL(absoluteUrl);
      const newData = parseRule34Page(doc, fullUrl.searchParams);

      if (newData) {
        // Ensure context is preserved if the new page data somehow missed its tags
        if (newData.searchTags === 'all' && data.searchTags !== 'all') {
           newData.searchTags = data.searchTags;
        }

        setData(newData);
        if (historyMode === 'push') {
          window.history.pushState({ reframer: true }, '', absoluteUrl);
        }
        document.title = newData.title;
      }
    } catch (e) {
      console.error('Navigation error:', e);
    } finally {
      setLoading(false);
    }
  }, [data.searchTags]);

  useEffect(() => {
    const onPopState = () => {
      loadPageFromUrl(window.location.href, 'none');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [loadPageFromUrl]);




  // Rebuilt Slideshow Logic
  useEffect(() => {
    if (!isPlaying) {
      setSlideTick(0);
      return;
    }
    
    // Pause ticking if loading, but DO NOT reset slideTick to 0
    if (loading) return;

    const timer = setInterval(() => {
      setSlideTick(prev => {
        const maxTicks = slideshowInterval * 10;
        if (prev >= maxTicks) {
           // Move to next post using native link OR fallback ID-1
           if (data.type === 'post') {
              const nextTarget = data.nextUrl || buildPostViewUrl(parseInt(data.id) - 1, data.searchTags);
              loadPageFromUrl(nextTarget, 'push');
           } else {
              setIsPlaying(false);
           }
           return 0;
        }
        return prev + 1;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [isPlaying, data, slideshowInterval, loading, loadPageFromUrl]);

  // Reset tick when we actually arrive at a new post
  useEffect(() => {
    setSlideTick(0);
  }, [data.type === 'post' ? data.id : null]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      const key = e.key;
      if (key === 'Escape') setLightboxOpen(false);
      
      if (data.type === 'post') {
        if (key === 'ArrowRight' && data.nextUrl) {
          e.preventDefault();
          loadPageFromUrl(data.nextUrl, 'push');
        }
        if (key === 'ArrowLeft' && data.prevUrl) {
          e.preventDefault();
          loadPageFromUrl(data.prevUrl, 'push');
        }
      }

      if (key === ' ') {
         e.preventDefault();
         setIsPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data, loadPageFromUrl]);

  const downloadPost = (url: string, id: string, tags: string) => {
     const extMatch = url.match(/\.(jpg|jpeg|png|gif|mp4|webm)/i);
     const ext = extMatch ? extMatch[0] : '.jpg';
     const sanitize = (s: string) => s.replace(/[^a-z0-9_]/gi, '_').substring(0, 50);
     const filename = `R34_${sanitize(tags)}_${id}${ext}`;
     chrome.runtime.sendMessage({ type: 'DOWNLOAD', url, filename });
  };

  const startBulkDownload = async () => {
    if (data.type !== 'post') return;
    setIsBulkDownloading(true);
    cancelBulkRef.current = false;
    setBulkProgress(0);
    setBulkTotal(bulkCount);
    
    try {
      const fetchUrl = `${RULE34_ORIGIN}/public/post_helpers2.php?action=fetch_id_cache&tags=${encodeURIComponent(data.searchTags || 'all')}&id=${data.id}`;
      const res = await fetch(fetchUrl);
      if (res.status === 429) {
          setRateLimited(true);
          setIsBulkDownloading(false);
          return;
      }
      const initialIds = await res.json();
      const list = Array.isArray(initialIds) ? initialIds : [];
      let idx = list.indexOf(parseInt(data.id));

      let currentChunk: number[] = [];
      let currentIdx: number = 0;

      if (idx === -1) {
        currentChunk = [parseInt(data.id)];
        currentIdx = 0;
      } else {
        currentChunk = [...list];
        currentIdx = idx;
      }
      const toDownloadIds: string[] = [];
      
      while (toDownloadIds.length < bulkCount) {
         if (cancelBulkRef.current) break;
         
         const dId = currentChunk[currentIdx].toString();
         toDownloadIds.push(dId);
         
         currentIdx++;
         if (currentIdx >= currentChunk.length) {
            // Fetch next chunk of older IDs
            const lastId = currentChunk[currentChunk.length - 1];
            const nextRes = await fetch(
              `${RULE34_ORIGIN}/public/post_helpers2.php?action=fetch_id_cache&tags=${encodeURIComponent(data.searchTags || 'all')}&id=${lastId}&direction=prev`
            );
            if (nextRes.ok) {
               const nextList = await nextRes.json();
                if (nextList && nextList.length > 0) {
                   // Ensure we skip the anchor ID if it's returned again
                   const filtered = nextList.filter((id: number) => !toDownloadIds.includes(id.toString()));
                   if (filtered.length > 0) {
                      currentChunk = filtered;
                      currentIdx = 0;
                      await new Promise(r => setTimeout(r, 500)); // Small delay between cache chunks
                   } else {
                      break; 
                   }
                } else {
                   break; // No more posts
                }
            } else {
               break;
            }
         }
      }
      
      setBulkTotal(toDownloadIds.length);
      
      for (let i = 0; i < toDownloadIds.length; i++) {
         if (cancelBulkRef.current) break;
         
         const dId = toDownloadIds[i];
         if (data.type === 'post' && dId === data.id) {
             downloadPost(data.highresUrl, data.id, data.searchTags);
         } else {
             const htmlRes = await fetch(
               `${RULE34_ORIGIN}/index.php?page=post&s=view&id=${dId}&tags=${encodeURIComponent(data.searchTags || 'all')}`
             );
             const text = await htmlRes.text();
             
             if (htmlRes.status === 429 || text.includes('429 Rate limiting')) {
                 setRateLimited(true);
                 await new Promise(r => setTimeout(r, 6000));
                 setRateLimited(false);
                 i--; 
                 continue;
             }

             const doc = new DOMParser().parseFromString(text, 'text/html');
             const pd = parseRule34Page(doc, new URLSearchParams());
             if (pd && pd.type === 'post' && pd.highresUrl) {
                downloadPost(pd.highresUrl, pd.id, data.searchTags);
             }
         }
         
         setBulkProgress(i + 1);
         if (i < toDownloadIds.length - 1) {
            await new Promise(r => setTimeout(r, 800));
         }
      }
    } catch(e) {
      console.error("Bulk download error", e);
    }
    
    setIsBulkDownloading(false);
    setTimeout(() => { if (!cancelBulkRef.current) setBulkProgress(0); }, 2000);
  };

  const tagsByCategory = data.type === 'post' ? data.tags.reduce((acc, tag) => {
    acc[tag.category] = acc[tag.category] || [];
    acc[tag.category].push(tag.name);
    return acc;
  }, {} as Record<string, string[]>) : {};

  const getTagColor = (cat: string) => {
    if (cat === 'artist') return '!text-white bg-amber-500/20 border-amber-500/30 hover:bg-amber-500/30 glow-amber';
    if (cat === 'copyright') return '!text-white bg-purple-500/20 border-purple-500/30 hover:bg-purple-500/30';
    if (cat === 'character') return '!text-white bg-emerald-500/20 border-emerald-500/30 hover:bg-emerald-500/30';
    if (cat === 'metadata') return '!text-white bg-blue-500/20 border-blue-500/30 hover:bg-blue-500/30';
    return '!text-white bg-white/10 border-white/20 hover:bg-white/20';
  };



  return (
    <div className="w-screen h-screen flex bg-zinc-950 text-zinc-200 overflow-hidden font-sans fixed inset-0 z-[99999999]">
      {/* Side Panel */}
      <div className="w-[380px] h-full flex-shrink-0 glass-panel border-r border-white/5 flex flex-col z-10 relative shadow-2xl">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-zinc-950/40">
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
            Reframer
            {data.type === 'list' && <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded ml-1 font-black">GALLERY</span>}
          </h1>
          <button 
            onClick={() => { window.location.href = `${RULE34_ORIGIN}/index.php?page=post&s=list&tags=${encodeURIComponent(data.searchTags)}`; }}
            className="text-xs font-semibold text-rose-500 hover:text-rose-400 px-3 py-1.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer">EXIT
          </button>
        </div>
        
        {rateLimited && (
           <div className="bg-red-500/20 border-b border-red-500/30 p-3 flex items-center justify-center gap-2 text-red-400 text-xs font-semibold animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.2)]">
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
             RATE LIMITED. PAUSING...
           </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide space-y-8">
          
          {data.type === 'post' && (
            <div className="space-y-5 bg-zinc-900/40 p-5 rounded-2xl border border-white/5 shadow-inner">
              <div className="flex items-center justify-between group">
                 <span className="text-sm font-medium text-white flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={isPlaying ? "#f43f5e" : "none"} stroke={isPlaying ? "#f43f5e" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-colors"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    Auto-Slideshow
                 </span>
                 <div className="flex items-center gap-2">
                   <select 
                      value={slideshowInterval}
                      onChange={(e) => setSlideshowInterval(Number(e.target.value))}
                      className="bg-black/40 border border-white/10 text-xs rounded-md px-1 py-1 text-zinc-300 focus:outline-none hover:border-white/20 transition cursor-pointer"
                   >
                     <option value={2}>2s</option>
                     <option value={3}>3s</option>
                     <option value={5}>5s</option>
                     <option value={8}>8s</option>
                     <option value={10}>10s</option>
                   </select>
                    <button 
                      onClick={() => setIsPlaying(p => !p)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors hover:scale-105 active:scale-95 cursor-pointer ${isPlaying ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]' : 'bg-zinc-700'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isPlaying ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                 </div>
              </div>
              
              {isPlaying && (
                <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                   <div className="h-full bg-rose-500 rounded-full transition-all duration-[100ms] ease-linear" style={{ width: `${(slideTick / (slideshowInterval * 10)) * 100}%` }}></div>
                </div>
              )}
              
              <div className="h-px bg-white/5 my-2"></div>
              
              <div className="space-y-3">
                 <div className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">Bulk Download</div>
                 {!isBulkDownloading ? (
                     <div className="flex gap-2">
                       <input 
                         type="number" 
                         min="1" max="1000" 
                         value={bulkCount} 
                         onChange={(e) => setBulkCount(parseInt(e.target.value) || 1)}
                         className="w-16 bg-black/40 border border-white/10 rounded-lg text-sm text-center px-2 focus:outline-none focus:border-rose-500 transition"
                       />
                       <button 
                          onClick={startBulkDownload}
                          className="flex-1 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-all rounded-lg text-sm font-medium text-zinc-300 py-1.5 flex justify-center items-center gap-1.5 border border-white/5 hover:scale-[1.02] active:scale-95 cursor-pointer">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                          Grab Posts
                       </button>
                     </div>
                 ) : (
                     <div className="space-y-2">
                       <div className="flex justify-between text-xs font-medium">
                          <span className="text-zinc-300">Downloading...</span>
                          <span className="text-emerald-400">{bulkProgress} / {bulkTotal}</span>
                       </div>
                       <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${(bulkProgress / bulkTotal) * 100}%` }}></div>
                       </div>
                       <button 
                         onClick={() => { cancelBulkRef.current = true; setIsBulkDownloading(false); }}
                         className="w-full mt-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs py-1.5 rounded-md transition-all font-medium border border-red-500/20 hover:scale-[1.02] active:scale-95 cursor-pointer">
                         Cancel Queue
                       </button>
                     </div>
                 )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">Actions</div>
            <button 
              type="button"
              onClick={() => loadPageFromUrl(`${RULE34_ORIGIN}/index.php?page=post&s=random`, 'none')}
              disabled={loading}
              className="w-full bg-zinc-800 hover:bg-zinc-700 p-3 rounded-xl border border-white/5 text-sm transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 font-medium cursor-pointer shadow-lg shadow-black/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h2c4.34 0 6.34-4 8-8s3.66-8 8-8h2"></path><path d="M12 12c1.66 4 3.66 8 8 8h2"></path><path d="M2 6h2c4.34 0 6.34 4 8 8"></path><polyline points="18 16 22 20 18 24"></polyline><polyline points="18 8 22 4 18 0"></polyline></svg>
              Surprise Me (Random)
            </button>
          </div>

          <div className="space-y-1 bg-white/[0.03] p-4 rounded-xl border border-white/5 relative">
            <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-2">Search</div>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                window.location.href = `${RULE34_ORIGIN}/index.php?page=post&s=list&tags=${encodeURIComponent(searchValue)}`;
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <input 
                  name="tags"
                  type="text" 
                  value={searchValue}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Search tags..."
                  className="w-full !bg-black/40 border border-white/10 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-rose-500 transition-all placeholder:text-zinc-600 !text-white shadow-inner"
                  autoComplete="off"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto overflow-x-hidden backdrop-blur-xl">
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
                        className="px-4 py-2 text-sm hover:bg-rose-500 hover:text-white cursor-pointer transition-colors border-b border-white/5 last:border-0 !text-zinc-300"
                      >
                        {s.replace(/_/g, ' ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button 
                type="submit"
                className="bg-rose-600 hover:bg-rose-500 text-white p-2 rounded-lg transition-all active:scale-90 cursor-pointer shadow-lg shadow-rose-600/20"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </button>
            </form>
          </div>

          <div className="space-y-1 bg-white/[0.03] p-4 rounded-xl border border-white/5">
            <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider mb-2">Profile</div>
            <div className="text-sm flex justify-between">
              <span className="text-zinc-400">Context</span> 
              <span className="text-white font-medium">{data.type === 'post' ? 'Single Post' : 'Gallery View'}</span>
            </div>
          </div>
          
          {data.type === 'post' && Object.entries(tagsByCategory).sort((a,b) => b[1].length - a[1].length).map(([cat, tags]) => (
             <div key={cat} className="space-y-3 relative">
               <div className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest sticky top-0 bg-zinc-950/95 backdrop-blur-md py-1.5 z-10 border-b border-white/10 mb-4">{cat}</div>
               <div className="flex flex-wrap gap-2">
                 {tags.map((t, ti) => (
                   <a 
                     key={`${cat}-${t}-${ti}`} 
                     href={`${RULE34_ORIGIN}/index.php?page=post&s=list&tags=${encodeURIComponent(t)}`}
                     className={`px-3 py-1.5 rounded-lg text-sm transition-all cursor-pointer border shadow-sm hover:-translate-y-0.5 hover:scale-105 active:scale-95 inline-block ${getTagColor(cat)}`}
                   >
                     {t.replace(/_/g, ' ')}
                   </a>
                 ))}
               </div>
             </div>
          ))}

          {data.type === 'list' && (
             <div className="space-y-4">
                <div className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest border-b border-white/10 pb-2">Gallery View</div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5 space-y-2">
                   <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>Grid Density</span>
                      <span className="text-zinc-200">{gridSize === 2 ? 'Large' : gridSize === 4 ? 'Medium' : 'Compact'}</span>
                   </div>
                   <input 
                     type="range" 
                     min="2" max="8" step="2"
                     value={gridSize}
                     onChange={(e) => setGridSize(Number(e.target.value))}
                     className="w-full accent-rose-500 cursor-pointer"
                   />
                </div>

                <div className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest border-b border-white/10 pb-2 pt-4">Actions</div>
                <button 
                  type="button"
                  onClick={() => { window.location.href = `${RULE34_ORIGIN}/index.php?page=post&s=random`; }}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 p-3 rounded-xl border border-white/5 text-sm transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 font-medium cursor-pointer shadow-lg shadow-black/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h2c4.34 0 6.34-4 8-8s3.66-8 8-8h2"></path><path d="M12 12c1.66 4 3.66 8 8 8h2"></path><path d="M2 6h2c4.34 0 6.34 4 8 8"></path><polyline points="18 16 22 20 18 24"></polyline><polyline points="18 -4 22 0 18 4"></polyline></svg>
                  Random Post
                </button>
             </div>
          )}
        </div>

        <div className="p-4 border-t border-white/5 flex gap-2 bg-zinc-950/80 backdrop-blur-md">
           {data.type === 'post' ? (
             <>
               <button 
                type="button"
                onClick={() => {
                   const target = data.prevUrl || buildPostViewUrl(parseInt(data.id) + 1, data.searchTags);
                   loadPageFromUrl(target, 'push');
                }} 
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 transition-all border border-white/5 font-medium text-sm flex items-center justify-center gap-2 hover:scale-[1.03] active:scale-95 cursor-pointer">
                &#8592; Prev
               </button>
               <button 
                type="button"
                onClick={() => {
                   const target = data.nextUrl || buildPostViewUrl(parseInt(data.id) - 1, data.searchTags);
                   loadPageFromUrl(target, 'push');
                }} 
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 transition-all border border-rose-500 font-medium text-sm flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(244,63,94,0.3)] hover:scale-[1.03] active:scale-95 cursor-pointer">
                Next &#8594;
               </button>
             </>
           ) : (
             <button 
                disabled 
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 text-zinc-600 transition-all border border-white/5 font-medium text-xs text-center">
                Select a post to view
             </button>
           )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden bg-zinc-950/50">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-700 via-zinc-950 to-zinc-950 pointer-events-none"></div>
        {loading && (
           <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-20 backdrop-blur-md transition-all duration-300">
              <div className="w-12 h-12 border-[4px] border-rose-500 border-t-transparent rounded-full animate-spin"></div>
           </div>
        )}

        {data.type === 'post' ? (
          <>
            <div className="absolute top-6 right-6 z-10 flex gap-2">
               <button 
                  onClick={() => downloadPost(data.highresUrl, data.id, data.searchTags)}
                  className="bg-black/60 hover:bg-rose-600 border border-white/10 hover:border-rose-500 text-white p-3 rounded-xl backdrop-blur-lg transition-all shadow-lg hover:scale-110 active:scale-95 group">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-y-0.5 transition-transform"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
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
                    onClick={() => loadPageFromUrl(buildPostViewUrl(item.id, data.searchTags), 'push')}
                    className="aspect-[3/4] relative rounded-2xl overflow-hidden glass-panel border border-white/5 hover:border-rose-500/50 transition-all group cursor-pointer shadow-lg hover:scale-[1.05] hover:-translate-y-1 active:scale-95"
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
                         onClick={() => { if (p.url && p.url !== '#') loadPageFromUrl(p.url, 'push'); }}
                         className={`min-w-[40px] h-10 px-3 rounded-lg flex items-center justify-center transition-all font-medium text-xs border ${
                           p.isCurrent 
                             ? 'bg-rose-500 text-white border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)] cursor-default' 
                             : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:text-white hover:border-white/10 active:scale-95 cursor-pointer'
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
          className="fixed inset-0 z-50 bg-black/98 backdrop-blur-2xl flex flex-col items-center justify-center cursor-default animate-in fade-in duration-200 group/lightbox"
          onClick={(e) => {
             if (e.target === e.currentTarget) setLightboxOpen(false);
          }}
        >
          {loading && (
             <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20 transition-all duration-300 pointer-events-none">
                <div className="w-12 h-12 border-[4px] border-rose-500 border-t-transparent rounded-full animate-spin"></div>
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
            className="absolute inset-0 flex items-center justify-center p-4 md:p-12 z-0 overflow-hidden" 
            onClick={(e) => { if(e.target===e.currentTarget) setLightboxOpen(false); }}
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

          <button 
             className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/5 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-md transition-all border border-white/10 hover:scale-110 active:scale-95 z-50"
             onClick={() => setLightboxOpen(false)}
          >
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>

          <div 
             className="absolute top-6 left-6 flex flex-col items-start gap-4 opacity-0 -translate-x-10 group-hover/lightbox:opacity-100 group-hover/lightbox:translate-x-0 transition-all duration-300 z-50"
             onClick={e => e.stopPropagation()}
          >
            {isPlaying && (
              <div className="w-[400px] h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-white/10 shadow-lg">
                 <div className="h-full bg-rose-500 rounded-full transition-all duration-[100ms] ease-linear" style={{ width: `${(slideTick / (slideshowInterval * 10)) * 100}%` }}></div>
              </div>
            )}
            
            <div className="glass-panel bg-black/60 px-6 py-4 rounded-2xl flex items-center gap-8 shadow-[0_0_30px_rgba(0,0,0,0.8)] border border-white/10">
               <select 
                  value={slideshowInterval}
                  onChange={(e) => setSlideshowInterval(Number(e.target.value))}
                  className="bg-black/60 border border-white/10 text-xs rounded-md px-3 py-2 text-zinc-300 focus:outline-none hover:border-white/20 transition cursor-pointer font-medium"
               >
                 <option value={2}>2s</option>
                 <option value={3}>3s</option>
                 <option value={5}>5s</option>
                 <option value={8}>8s</option>
                 <option value={10}>10s</option>
               </select>

               <div className="w-px h-8 bg-white/10"></div>
               
                <button 
                   type="button"
                   onClick={(e) => { 
                      e.stopPropagation();
                      const target = data.type === 'post' ? (data.prevUrl || buildPostViewUrl(parseInt(data.id) + 1, data.searchTags)) : '';
                      if (target) loadPageFromUrl(target, 'push'); 
                   }}
                   disabled={loading}
                   title="Previous Post (Left Arrow)"
                   className="text-white hover:text-rose-400 hover:scale-110 active:scale-95 transition-all p-2 rounded-full hover:bg-white/5 cursor-pointer z-50">
                   <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
                </button>

               <button 
                  onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
                  title={isPlaying ? "Pause Slideshow (Space)" : "Start Slideshow (Space)"}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-2xl cursor-pointer z-50 ${isPlaying ? 'bg-rose-500 text-white shadow-rose-500/40 ring-4 ring-rose-500/20' : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'}`}>
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
                      const target = data.type === 'post' ? (data.nextUrl || buildPostViewUrl(parseInt(data.id) - 1, data.searchTags)) : '';
                      if (target) loadPageFromUrl(target, 'push'); 
                   }}
                   disabled={loading}
                   title="Next Post (Right Arrow)"
                   className="text-white hover:text-rose-400 hover:scale-110 active:scale-95 transition-all p-2 rounded-full hover:bg-white/5 cursor-pointer z-50">
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
  main() {
    const data = parseRule34Page(document, new URLSearchParams(window.location.search));
    if (!data) return;

    document.body.id = 'reframed-body';

    const rootContainer = document.createElement('div');
    rootContainer.id = 'reframer-root';
    document.body.appendChild(rootContainer);
    
    setTimeout(() => {
        const root = createRoot(rootContainer);
        root.render(<App initialData={data} />);
    }, 0);
  }
});
