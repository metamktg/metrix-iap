import React from 'react';
import { 
  Database, Users, Globe, Wallet, MousePointerClick, 
  ShoppingCart, GitMerge, FileText, Activity, ChevronRight,
  TrendingUp, Award
} from 'lucide-react';
import './funnel-map.css';

export function FunnelMap() {
  // SVG Coordinate mapping for the map lines
  const spineY = 560;
  const topY = 240;
  const bottomY = 860;
  
  const xCoords = {
    flights: 200,
    spend: 550,
    clicks: 900,
    registrations: 1250,
    checkout: 1600
  };

  return (
    <div className="funnel-map-container relative w-[1920px] min-h-[1080px] overflow-hidden text-sm">
      
      {/* App Chrome Suggestion */}
      <div className="absolute top-0 left-0 w-full h-16 border-b border-[var(--border-subtle)] flex items-center px-8 justify-between z-50 bg-[var(--bg-base)]/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white tracking-tighter">MX</div>
          <div className="h-4 w-px bg-[var(--border-subtle)]"></div>
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="funnel-mono text-xs text-[var(--text-muted)]">ANALYSIS · 03</span>
            <span className="text-[var(--text-primary)] font-medium">Analysis Overview</span>
            <span className="px-2 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs flex items-center gap-1 ml-2">
              <Globe className="w-3 h-3 text-[var(--accent-blue)]" />
              Bookster (Meta Ads)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="funnel-mono text-xs text-[var(--text-muted)]">SYSTEM STATUS: NOMINAL</div>
        </div>
      </div>

      {/* SVG Canvas for connective lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        {/* Main Spine Lines */}
        <path d={`M ${xCoords.flights} ${spineY} L ${xCoords.checkout} ${spineY}`} className="funnel-line-solid" />
        <path d={`M ${xCoords.flights} ${spineY} L ${xCoords.checkout} ${spineY}`} className="funnel-line-glow" />
        
        {/* Top Annotation Connections */}
        <path d={`M ${xCoords.registrations} ${topY + 60} L ${xCoords.registrations} ${spineY - 30}`} className="funnel-line" />
        <path d={`M ${xCoords.checkout} ${topY + 60} L ${xCoords.checkout} ${spineY - 30}`} className="funnel-line" />
        
        {/* Bottom Module Connections */}
        <path d={`M ${xCoords.flights} ${spineY + 30} L ${xCoords.flights - 30} ${bottomY - 80}`} className="funnel-line" />
        <path d={`M ${xCoords.spend} ${spineY + 30} L ${xCoords.spend - 80} ${bottomY - 80}`} className="funnel-line" />
        <path d={`M ${xCoords.spend} ${spineY + 30} L ${xCoords.spend + 220} ${bottomY - 80}`} className="funnel-line" />
        <path d={`M ${xCoords.registrations} ${spineY + 30} L ${xCoords.registrations} ${bottomY - 80}`} className="funnel-line" />
      </svg>

      {/* Spine Nodes & Totals */}
      
      {/* Node 1: Flights */}
      <div className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-10" style={{ left: xCoords.flights, top: spineY }}>
        <div className="funnel-label">Input</div>
        <div className="w-16 h-16 rounded-full funnel-node text-[var(--text-primary)]">
          <GitMerge className="w-6 h-6 text-[var(--accent-blue)]" />
        </div>
        <div className="text-center">
          <div className="text-2xl font-light text-white">2</div>
          <div className="funnel-mono text-xs text-[var(--text-muted)]">CONCEPT FLIGHTS</div>
        </div>
      </div>

      {/* Node 2: Spend */}
      <div className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-10" style={{ left: xCoords.spend, top: spineY }}>
        <div className="funnel-label">Delivery</div>
        <div className="w-16 h-16 rounded-full funnel-node text-[var(--text-primary)]">
          <Activity className="w-6 h-6 text-[var(--accent-blue)]" />
        </div>
        <div className="text-center">
          <div className="text-2xl font-light text-white">$3,235</div>
          <div className="funnel-mono text-xs text-[var(--text-muted)]">SPEND</div>
        </div>
      </div>

      {/* Node 3: Clicks */}
      <div className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-10" style={{ left: xCoords.clicks, top: spineY }}>
        <div className="funnel-label">Engagement</div>
        <div className="w-16 h-16 rounded-full funnel-node text-[var(--text-primary)]">
          <MousePointerClick className="w-6 h-6 text-[var(--accent-blue)]" />
        </div>
        <div className="text-center">
          <div className="text-2xl font-light text-white">1,446</div>
          <div className="funnel-mono text-xs text-[var(--text-muted)]">LINK CLICKS</div>
        </div>
      </div>

      {/* Node 4: Registrations */}
      <div className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-10" style={{ left: xCoords.registrations, top: spineY }}>
        <div className="funnel-label">Conversion</div>
        <div className="w-20 h-20 rounded-full funnel-node text-[var(--text-primary)] border-4 border-white shadow-[0_0_25px_var(--accent-blue-glow)] bg-[var(--bg-surface-hover)]">
          <Users className="w-8 h-8 text-white" />
        </div>
        <div className="text-center">
          <div className="text-3xl font-medium text-white text-shadow">78</div>
          <div className="funnel-mono text-xs text-[var(--text-muted)]">RESULTS (REGISTRATIONS)</div>
        </div>
      </div>

      {/* Node 5: Checkout */}
      <div className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-10" style={{ left: xCoords.checkout, top: spineY }}>
        <div className="funnel-label">Deep Funnel</div>
        <div className="w-16 h-16 rounded-full funnel-node text-[var(--text-primary)] border-dashed">
          <ShoppingCart className="w-6 h-6 text-[var(--text-secondary)]" />
        </div>
        <div className="text-center">
          <div className="text-xl font-light text-[var(--text-secondary)]">Tracking</div>
          <div className="funnel-mono text-xs text-[var(--text-muted)]">CHECKOUT DEPTH</div>
        </div>
      </div>


      {/* TOP ANNOTATIONS (Control Reads) */}

      {/* Registration Control */}
      <div className="absolute transform -translate-x-1/2 -translate-y-1/2 w-[340px] funnel-card p-5 z-20" style={{ left: xCoords.registrations, top: topY }}>
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-[var(--accent-blue)]" />
          <div className="funnel-mono text-xs font-semibold text-[var(--accent-blue)]">REGISTRATION CONTROL</div>
        </div>
        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-2 rounded mb-3">
          <code className="text-xs text-[var(--text-primary)]">C2B_STC_QF_BOOK2_T2</code>
        </div>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          <span className="text-white font-medium">C2B's product-demo/time-saving creative</span> is the registration control, especially among female 45-54, but it failed to carry checkout depth in V3.
        </p>
      </div>

      {/* Checkout Control */}
      <div className="absolute transform -translate-x-1/2 -translate-y-1/2 w-[340px] funnel-card p-5 z-20" style={{ left: xCoords.checkout, top: topY }}>
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-emerald-400" />
          <div className="funnel-mono text-xs font-semibold text-emerald-400">PRIMARY CONTROL (CHECKOUT)</div>
        </div>
        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-2 rounded mb-3">
          <code className="text-xs text-[var(--text-primary)]">C4E_STC_QF_BOOK2_T1</code>
        </div>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          <span className="text-white font-medium">C4E's aspirational authority/static system</span> is the checkout-depth control. It generated the clear majority of <code className="text-xs text-[var(--text-muted)] bg-[var(--bg-base)] px-1">onb_initiate_checkout</code> volume.
        </p>
      </div>


      {/* BOTTOM MODULES (Navigation Targets) */}

      {/* IAP Library */}
      <div className="absolute transform -translate-x-1/2 -translate-y-1/2 w-[280px] funnel-card funnel-card-nav p-5 z-20 group" style={{ left: xCoords.flights - 30, top: bottomY }}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[var(--accent-blue)]" />
            <h3 className="font-semibold text-white">IAP Library</h3>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-white transition-colors" />
        </div>
        <p className="text-[var(--text-secondary)] text-xs mb-4 h-10">Cell and variable performance across the account.</p>
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
          <div className="funnel-mono text-[10px] text-[var(--text-muted)]">ROWS ANALYZED</div>
          <div className="funnel-mono text-xs text-[var(--accent-blue)]">12 CELLS · 31 VARS</div>
        </div>
      </div>

      {/* Budget Insight */}
      <div className="absolute transform -translate-x-1/2 -translate-y-1/2 w-[280px] funnel-card funnel-card-nav p-5 z-20 group" style={{ left: xCoords.spend - 80, top: bottomY }}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[var(--accent-blue)]" />
            <h3 className="font-semibold text-white">Budget Insight</h3>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-white transition-colors" />
        </div>
        <p className="text-[var(--text-secondary)] text-xs mb-4 h-10">Spend allocation by result event, concept, and placement.</p>
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
          <div className="funnel-mono text-[10px] text-[var(--text-muted)]">SPEND ANALYZED</div>
          <div className="funnel-mono text-xs text-[var(--accent-blue)]">$8,001</div>
        </div>
      </div>

      {/* Placements */}
      <div className="absolute transform -translate-x-1/2 -translate-y-1/2 w-[280px] funnel-card funnel-card-nav p-5 z-20 group" style={{ left: xCoords.spend + 220, top: bottomY }}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-[var(--accent-blue)]" />
            <h3 className="font-semibold text-white">Placements</h3>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-white transition-colors" />
        </div>
        <p className="text-[var(--text-secondary)] text-xs mb-4 h-10">Where delivery happened and what each placement produced.</p>
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
          <div className="funnel-mono text-[10px] text-[var(--text-muted)]">ROWS ANALYZED</div>
          <div className="funnel-mono text-xs text-[var(--accent-blue)]">38 PLACEMENTS</div>
        </div>
      </div>

      {/* Audience */}
      <div className="absolute transform -translate-x-1/2 -translate-y-1/2 w-[280px] funnel-card funnel-card-nav p-5 z-20 group" style={{ left: xCoords.registrations, top: bottomY }}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[var(--accent-blue)]" />
            <h3 className="font-semibold text-white">Audience</h3>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-white transition-colors" />
        </div>
        <p className="text-[var(--text-secondary)] text-xs mb-4 h-10">Demographic registration signal by age and gender.</p>
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
          <div className="funnel-mono text-[10px] text-[var(--text-muted)]">ROWS ANALYZED</div>
          <div className="funnel-mono text-xs text-[var(--accent-blue)]">62 DEMOGRAPHICS</div>
        </div>
      </div>

    </div>
  );
}
