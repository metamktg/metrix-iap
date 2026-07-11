import React from 'react';
import { Activity, Terminal, ArrowRight, Zap, Target, Users, LayoutDashboard, DollarSign } from 'lucide-react';
import './CommandDeck.css';

export function CommandDeck() {
  return (
    <div className="command-deck-container min-h-screen w-full relative overflow-hidden flex">
      <div className="scanline"></div>
      
      {/* Left Instrument Rail */}
      <aside className="w-64 border-r border-[rgba(56,189,248,0.15)] flex flex-col bg-[rgba(5,10,20,0.95)] z-10 relative shadow-[4px_0_24px_rgba(0,0,0,0.5)] pt-6 pb-6 pl-6 pr-4">
        <div className="mb-12">
          <div className="command-deck-mono text-[10px] text-[var(--accent-blue)] tracking-[0.2em] mb-2 uppercase opacity-70">
            SYSTEM STATUS
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></div>
            <span className="command-deck-mono text-sm text-emerald-400 font-bold">ONLINE</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center gap-8">
          <div className="command-deck-mono text-[10px] text-slate-500 tracking-[0.2em] uppercase mb-[-1rem]">
            ACCOUNT TOTALS / LIVE
          </div>
          
          <MetricReadout label="SPEND" value="$3,235" />
          <MetricReadout label="LINK CLICKS" value="1,446" />
          <MetricReadout label="RESULTS (REG)" value="78" />
          <MetricReadout label="CONCEPT FLIGHTS" value="2" />
        </div>
      </aside>

      {/* Main Status Board */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto z-10 p-8 relative">
        <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
          <svg width="200" height="200" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.5">
            <circle cx="50" cy="50" r="40" />
            <circle cx="50" cy="50" r="30" />
            <line x1="10" y1="50" x2="90" y2="50" />
            <line x1="50" y1="10" x2="50" y2="90" />
          </svg>
        </div>

        {/* Header */}
        <header className="mb-10 flex justify-between items-end border-b border-[rgba(56,189,248,0.15)] pb-6">
          <div>
            <div className="command-deck-mono text-xs text-[var(--accent-blue)] tracking-[0.2em] mb-3 flex items-center gap-2">
              <Terminal size={14} />
              ANALYSIS · 03 // META ADS
            </div>
            <h1 className="text-4xl font-light tracking-tight text-slate-100 flex items-center gap-4 glow-text">
              Analysis Overview
              <span className="text-xl text-slate-500 font-normal">:: BOOKSTER</span>
            </h1>
          </div>
          <div className="text-right command-deck-mono">
            <div className="text-[10px] text-slate-500 tracking-[0.2em] mb-1">DATA FRESHNESS</div>
            <div className="text-sm text-[var(--accent-blue)]">T-MINUS 00:00:00</div>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-6 flex-1">
          {/* Core Control Reads - Status Readouts */}
          <div className="col-span-5 flex flex-col gap-6">
            <div className="command-deck-mono text-xs text-slate-500 tracking-[0.2em] border-b border-slate-800 pb-2 flex items-center gap-2">
              <Activity size={14} className="text-[var(--accent-cyan)]" />
              LIVE STATUS READOUTS
            </div>
            
            <div className="bg-[var(--panel-bg)] border border-[var(--border-color)] p-6 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
              <div className="flex justify-between items-start mb-4 pl-3">
                <div className="command-deck-mono text-xs text-emerald-400 font-bold status-indicator ml-3">
                  HOLDING CONTROL · CHECKOUT DEPTH
                </div>
                <div className="text-[10px] text-slate-500 command-deck-mono border border-slate-700 px-2 py-1 bg-black">
                  RANK: PRIMARY
                </div>
              </div>
              <div className="pl-3">
                <div className="command-deck-mono text-2xl text-slate-100 mb-3 tracking-tight">C4E_STC_QF_BOOK2_T1</div>
                <p className="text-sm leading-relaxed text-slate-400 font-mono">
                  &gt; C4E's aspirational authority/static system is the checkout-depth control. It generated the clear majority of onb_initiate_checkout volume.
                </p>
              </div>
            </div>

            <div className="bg-[var(--panel-bg)] border border-[var(--border-color)] p-6 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
              <div className="flex justify-between items-start mb-4 pl-3">
                <div className="command-deck-mono text-xs text-amber-400 font-bold status-indicator warning ml-3">
                  CONTROL · REGISTRATION
                </div>
                <div className="text-[10px] text-slate-500 command-deck-mono border border-slate-700 px-2 py-1 bg-black">
                  RANK: SECONDARY
                </div>
              </div>
              <div className="pl-3">
                <div className="command-deck-mono text-2xl text-slate-100 mb-3 tracking-tight">C2B_STC_QF_BOOK2_T2</div>
                <p className="text-sm leading-relaxed text-slate-400 font-mono">
                  &gt; C2B's product-demo/time-saving creative is the registration control, especially among female 45-54, but it failed to carry checkout depth in V3.
                </p>
              </div>
            </div>
          </div>

          {/* Analysis Modules - Monitored Channel Matrix */}
          <div className="col-span-7 flex flex-col gap-6">
            <div className="command-deck-mono text-xs text-slate-500 tracking-[0.2em] border-b border-slate-800 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LayoutDashboard size={14} className="text-[var(--accent-blue)]" />
                MONITORED CHANNEL MATRIX
              </div>
              <div className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5">4 CHANNELS ACTIVE</div>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              <ChannelRow 
                icon={<Zap size={18} />}
                title="IAP Library"
                desc="Cell and variable performance across the account."
                stats="12 CELL ROWS · 31 VARIABLE ROWS"
              />
              <ChannelRow 
                icon={<Users size={18} />}
                title="Audience"
                desc="Demographic registration signal by age and gender."
                stats="62 DEMOGRAPHIC ROWS"
              />
              <ChannelRow 
                icon={<Target size={18} />}
                title="Placements"
                desc="Where delivery happened and what each placement produced."
                stats="38 PLACEMENT ROWS"
              />
              <ChannelRow 
                icon={<DollarSign size={18} />}
                title="Budget Insight"
                desc="Spend allocation by result event, concept, and placement."
                stats="$8,001 ANALYZED"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricReadout({ label, value }: { label: string, value: string }) {
  return (
    <div className="relative group">
      <div className="flex gap-2 absolute -left-6 top-1/2 -translate-y-1/2 opacity-20 group-hover:opacity-100 transition-opacity">
        <div className="flex flex-col gap-[2px]">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`rail-tick ${i === 3 ? 'active' : ''}`} />
          ))}
        </div>
      </div>
      <div className="command-deck-mono text-xs text-[var(--accent-blue)] tracking-[0.1em] mb-1">{label}</div>
      <div className="command-deck-mono text-3xl text-slate-100 glow-text">{value}</div>
    </div>
  );
}

function ChannelRow({ icon, title, desc, stats }: { icon: React.ReactNode, title: string, desc: string, stats: string }) {
  return (
    <button className="w-full text-left bg-[var(--panel-bg)] hover:bg-[var(--panel-bg-hover)] border border-[var(--border-color)] hover:border-[var(--accent-blue)] p-4 flex items-center group transition-colors duration-200">
      <div className="p-3 bg-black border border-slate-800 text-[var(--accent-cyan)] mr-4 group-hover:bg-[rgba(34,211,238,0.1)] transition-colors">
        {icon}
      </div>
      
      <div className="flex-1 pr-4">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="command-deck-mono text-lg text-slate-100 tracking-wide group-hover:text-[var(--accent-blue)] transition-colors">{title}</h3>
          <div className="command-deck-mono text-[10px] text-slate-500 tracking-wider flex items-center gap-2">
            <div className="w-16 h-1 bg-slate-800 overflow-hidden">
              <div className="h-full bg-[var(--accent-blue)] w-3/4 opacity-50 group-hover:opacity-100 group-hover:animate-pulse"></div>
            </div>
            {stats}
          </div>
        </div>
        <p className="text-sm text-slate-400 font-mono line-clamp-1">{desc}</p>
      </div>

      <div className="pl-4 border-l border-slate-800 flex flex-col items-center justify-center opacity-50 group-hover:opacity-100 transition-opacity">
        <div className="command-deck-mono text-[10px] text-[var(--accent-blue)] mb-1">OPEN</div>
        <ArrowRight size={16} className="text-[var(--accent-blue)] group-hover:translate-x-1 transition-transform" />
      </div>
    </button>
  );
}
