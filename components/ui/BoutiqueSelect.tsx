import React, { useEffect, useRef, useState } from 'react';

export const BoutiqueSelect = ({
  value,
  onChange,
  options,
  title,
  dropUp,
}: {
  value: number;
  onChange: (v: number) => void;
  options: number[];
  title?: string;
  dropUp?: boolean;
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
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {isOpen && (
        <div
          className={`boutique-select-menu absolute left-0 w-full min-w-[72px] glass-panel overflow-hidden z-[100000013] animate-in fade-in duration-200 shadow-2xl border border-white/10 pointer-events-auto touch-manipulation ${
            dropUp ? 'bottom-full mb-2 slide-in-from-bottom-2' : 'top-full mt-2 slide-in-from-top-2'
          }`}
        >
          <div className="flex flex-col p-1 bg-zinc-950/90 backdrop-blur-xl">
            {options.map((opt) => (
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
