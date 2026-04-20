import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

const Popup = () => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [theme, setTheme] = useState('obsidian');

  const themes = [
    { id: 'obsidian', name: 'Obsidian', color: 'bg-[#d4af37]' },
    { id: 'ruby', name: 'Ruby', color: 'bg-[#e11d48]' },
    { id: 'emerald', name: 'Emerald', color: 'bg-[#10b981]' },
    { id: 'cobalt', name: 'Cobalt', color: 'bg-[#2563eb]' },
  ];

  useEffect(() => {
    chrome.storage.local.get(['extensionEnabled', 'activeTheme'], (result) => {
      if (result.extensionEnabled !== undefined) setIsEnabled(result.extensionEnabled);
      if (result.activeTheme !== undefined) setTheme(result.activeTheme);
    });
  }, []);

  const changeTheme = (newTheme: string) => {
    setTheme(newTheme);
    chrome.storage.local.set({ activeTheme: newTheme }, () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
      });
    });
  };

  const toggleExtension = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    chrome.storage.local.set({ extensionEnabled: newState });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
    });
  };

  return (
    <div className="w-[300px] bg-black text-white p-6 font-sans border border-white/10 overflow-hidden">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <img src="/logo.webp" className="w-12 h-12 rounded-xl border border-white/10 shadow-lg" alt="L" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">R34 Pro</h1>
            <p className={`text-[10px] font-black uppercase tracking-[0.2em] mt-1 ${theme === 'obsidian' ? 'text-gold' : 'text-white'}`}>Professional Engine</p>
          </div>
        </div>

        <div className="h-px bg-white/5 mx-[-24px]"></div>

        <div className="flex flex-col gap-5">
           <div className="flex flex-col gap-2">
             <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Theme Tier</span>
             <div className="grid grid-cols-4 gap-2 bg-white/[0.03] p-2 rounded-2xl border border-white/5">
                {themes.map(t => (
                  <button 
                    key={t.id}
                    onClick={() => changeTheme(t.id)}
                    className={`h-10 rounded-xl flex items-center justify-center transition-all border scale-100 active:scale-95 ${theme === t.id ? 'border-white/40 ring-1 ring-white/10 bg-white/5' : 'border-transparent hover:bg-white/5 opacity-40 hover:opacity-100'}`}
                    title={t.name}
                  >
                    <div className={`w-4 h-4 rounded-full ${t.color} shadow-lg`} />
                  </button>
                ))}
             </div>
           </div>

          <div className="flex items-center justify-between bg-white/[0.03] p-4 rounded-2xl border border-white/5">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white">System Power</span>
              <span className="text-[10px] text-zinc-500">{isEnabled ? 'Engine Online' : 'System Offline'}</span>
            </div>
            <button 
              onClick={toggleExtension}
              className={`h-7 w-13 rounded-full transition-all flex items-center p-1 cursor-pointer border border-white/5 ${isEnabled ? (theme === 'obsidian' ? 'bg-gold' : 'bg-white') : 'bg-zinc-800'}`}>
              <div className={`h-5 w-5 rounded-full bg-black shadow-lg transition-all ${isEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
           <button className="flex-1 py-3 bg-zinc-900 border border-white/5 rounded-xl text-[10px] font-bold text-zinc-400 hover:text-white transition-all uppercase tracking-widest">
             Options
           </button>
           <button className="flex-1 py-3 bg-zinc-900 border border-white/5 rounded-xl text-[10px] font-bold text-gold hover:text-gold-bright transition-all uppercase tracking-widest">
             Patreon
           </button>
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
