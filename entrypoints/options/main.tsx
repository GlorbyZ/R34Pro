import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

const Options = () => {
  const [gridSize, setGridSize] = useState(250);
  const [useArrows, setUseArrows] = useState(true);

  useEffect(() => {
    chrome.storage.local.get(['gridSize', 'useArrows'], (result) => {
      if (result.gridSize) setGridSize(result.gridSize);
      if (result.useArrows !== undefined) setUseArrows(result.useArrows);
    });
  }, []);

  const saveSettings = () => {
    chrome.storage.local.set({ gridSize, useArrows }, () => {
      alert('Settings Saved');
    });
  };

  return (
    <div className="min-h-screen bg-black text-white p-12 font-sans selection:bg-gold selection:text-black">
      <div className="max-w-3xl mx-auto space-y-12">
        <header className="flex items-center gap-6">
          <img src="/logo.webp" className="w-20 h-20 rounded-2xl shadow-2xl border border-gold/20" alt="Logo" />
          <div className="space-y-1">
            <h1 className="text-4xl font-bold tracking-tight">R34 Pro</h1>
            <p className="text-gold font-black uppercase tracking-[0.3em] text-xs">Professional Engine Configuration</p>
          </div>
        </header>

        <div className="h-px bg-white/10"></div>

        <section className="space-y-8">
            <div className="flex items-center justify-between p-8 bg-white/[0.02] border border-white/5 rounded-3xl group hover:border-gold/20 transition-all">
                <div className="space-y-1">
                    <h3 className="text-lg font-bold">Thumbnail Projection</h3>
                    <p className="text-sm text-zinc-500">Adjust the visual density of the exploration grid.</p>
                </div>
                <div className="flex items-center gap-6">
                    <input 
                        type="range" min="150" max="500" 
                        value={gridSize} 
                        onChange={(e) => setGridSize(Number(e.target.value))}
                        className="w-48 accent-gold cursor-pointer"
                    />
                    <span className="w-12 text-right font-mono text-gold font-bold">{gridSize}px</span>
                </div>
            </div>

            <div className="flex items-center justify-between p-8 bg-white/[0.02] border border-white/5 rounded-3xl group hover:border-gold/20 transition-all">
                <div className="space-y-1">
                    <h3 className="text-lg font-bold">Tactile Navigation</h3>
                    <p className="text-sm text-zinc-500">Enable or disable global arrow-key interception.</p>
                </div>
                <button 
                  onClick={() => setUseArrows(!useArrows)}
                  className={`h-8 w-16 rounded-full transition-all flex items-center p-1 cursor-pointer border border-white/10 ${useArrows ? 'bg-gold' : 'bg-zinc-900'}`}>
                  <div className={`h-6 w-6 rounded-full bg-black shadow-lg transition-all ${useArrows ? 'translate-x-8' : 'translate-x-0'}`} />
                </button>
            </div>
        </section>

        <footer className="pt-12 flex justify-between items-center text-zinc-500">
            <button 
                onClick={saveSettings}
                className="px-8 py-4 bg-gold text-black font-black uppercase tracking-widest rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg glow-gold">
                Synchronize Engine
            </button>
            <div className="flex gap-8 text-[11px] font-bold uppercase tracking-widest">
                <a href="#" className="hover:text-white transition-colors">Documentation</a>
                <a href="#" className="hover:text-white transition-colors">Support</a>
                <a href="#" className="hover:text-gold transition-colors text-gold">Elite Support (Patreon)</a>
            </div>
        </footer>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
