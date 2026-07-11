import React from 'react';
import { ArrowRight, ChevronRight, Activity, BookOpen, Users, LayoutGrid, DollarSign } from 'lucide-react';
import './briefing.css';

export function AnalystBriefing() {
  return (
    <div className="briefing-container relative overflow-hidden">
      {/* Background noise and gradients */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}></div>
      <div className="absolute top-0 left-1/4 w-1/2 h-[500px] bg-blue-900/10 blur-[120px] pointer-events-none rounded-full"></div>

      <div className="max-w-5xl mx-auto w-full px-8 pt-16 pb-24 relative z-10 flex flex-col gap-16">
        
        {/* Header Strip */}
        <header className="flex flex-col gap-2 border-b border-[#1e293b] pb-6">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[#3b82f6] text-xs font-bold tracking-widest uppercase mb-2">Analysis &middot; 03</p>
              <h1 className="text-4xl font-light tracking-tight text-white briefing-narrative">Analysis Overview</h1>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#94a3b8] uppercase tracking-wider mb-1">Account</p>
              <p className="text-sm font-bold text-white">Bookster <span className="text-[#64748b] font-normal">(Meta Ads)</span></p>
            </div>
          </div>
        </header>

        <main className="grid grid-cols-12 gap-16">
          {/* Left Column: The Briefing (Narrative) */}
          <div className="col-span-8 flex flex-col gap-12">
            
            <section className="flex flex-col gap-8">
              <h2 className="text-sm uppercase tracking-widest text-[#64748b] border-l-2 border-[#3b82f6] pl-3">Core Control Reads</h2>
              
              <div className="flex flex-col gap-10">
                <article className="group">
                  <p className="text-[#94a3b8] text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-[#3b82f6]"></span>
                    Primary Control (Checkout Depth)
                  </p>
                  <p className="text-3xl leading-relaxed text-[#e2e8f0] briefing-narrative">
                    C4E's aspirational authority/static system is the checkout-depth control. It generated the clear majority of <span className="text-[#94a3b8] italic">onb_initiate_checkout</span> volume for <span className="briefing-chip">C4E_STC_QF_BOOK2_T1</span>.
                  </p>
                </article>

                <div className="w-16 h-px bg-[#1e293b]"></div>

                <article className="group">
                  <p className="text-[#94a3b8] text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-[#8b5cf6]"></span>
                    Registration Control
                  </p>
                  <p className="text-2xl leading-relaxed text-[#cbd5e1] briefing-narrative">
                    C2B's product-demo/time-saving creative is the registration control <span className="briefing-chip">C2B_STC_QF_BOOK2_T2</span>, especially among female 45-54, but it failed to carry checkout depth in V3.
                  </p>
                </article>
              </div>
            </section>

          </div>

          {/* Right Column: Data & Navigation */}
          <div className="col-span-4 flex flex-col gap-12">
            
            {/* Account Totals */}
            <section className="flex flex-col gap-6 bg-[#0f172a]/50 p-6 border border-[#1e293b] rounded-xl">
              <h2 className="text-xs uppercase tracking-widest text-[#64748b]">Period Totals</h2>
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-end border-b border-[#1e293b]/50 pb-3">
                  <span className="text-sm text-[#94a3b8]">Spend</span>
                  <span className="text-lg text-white font-medium">$3,235</span>
                </div>
                <div className="flex justify-between items-end border-b border-[#1e293b]/50 pb-3">
                  <span className="text-sm text-[#94a3b8]">Link Clicks</span>
                  <span className="text-lg text-white font-medium">1,446</span>
                </div>
                <div className="flex justify-between items-end border-b border-[#1e293b]/50 pb-3">
                  <span className="text-sm text-[#94a3b8]">Results <span className="text-xs text-[#64748b]">(registrations)</span></span>
                  <span className="text-lg text-white font-medium">78</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-sm text-[#94a3b8]">Concept Flights</span>
                  <span className="text-lg text-white font-medium">2</span>
                </div>
              </div>
            </section>

            {/* Reading Index / Modules */}
            <section className="flex flex-col gap-4">
              <h2 className="text-xs uppercase tracking-widest text-[#64748b] mb-2">Analysis Index</h2>
              
              <div className="flex flex-col gap-2">
                {[
                  {
                    icon: <BookOpen size={16} />,
                    title: "IAP Library",
                    desc: "Cell and variable performance across the account.",
                    stats: "12 cell rows · 31 variable rows"
                  },
                  {
                    icon: <Users size={16} />,
                    title: "Audience",
                    desc: "Demographic registration signal by age and gender.",
                    stats: "62 demographic rows"
                  },
                  {
                    icon: <LayoutGrid size={16} />,
                    title: "Placements",
                    desc: "Where delivery happened and what each placement produced.",
                    stats: "38 placement rows"
                  },
                  {
                    icon: <DollarSign size={16} />,
                    title: "Budget Insight",
                    desc: "Spend allocation by result event, concept, and placement.",
                    stats: "$8,001 analyzed"
                  }
                ].map((mod, idx) => (
                  <div key={idx} className="module-row p-4 border border-[#1e293b] rounded-lg bg-transparent group flex items-start gap-4">
                    <div className="text-[#3b82f6] mt-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      {mod.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <h3 className="text-sm font-bold text-[#e2e8f0] group-hover:text-[#60a5fa] transition-colors">{mod.title}</h3>
                        <ArrowRight size={14} className="text-[#64748b] opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </div>
                      <p className="text-xs text-[#94a3b8] mb-3 leading-relaxed briefing-narrative opacity-90">{mod.desc}</p>
                      <p className="text-[10px] text-[#475569] uppercase tracking-wider font-semibold">{mod.stats}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </div>
        </main>
      </div>
    </div>
  );
}
