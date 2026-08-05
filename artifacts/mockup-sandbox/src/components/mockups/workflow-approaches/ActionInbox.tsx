import React, { useState } from "react";
import { 
  CheckCircle2, 
  ChevronRight, 
  CircleDashed, 
  FileText, 
  Filter, 
  Inbox, 
  Layout, 
  MessageSquare, 
  Play, 
  Search, 
  Settings, 
  Sparkles, 
  TrendingUp, 
  UploadCloud,
  Zap,
  AlignLeft,
  ArrowRight
} from "lucide-react";
import "./ActionInbox.css";

// --- Mock Data ---

type ActionState = 'active' | 'pending' | 'completed';
type ActionCategory = 'import' | 'analysis' | 'findings' | 'brief' | 'report';

interface WorkflowAction {
  id: string;
  client: string;
  category: ActionCategory;
  title: string;
  description: string;
  timestamp: string;
  state: ActionState;
  priority: 'high' | 'normal' | 'low';
}

const MOCK_ACTIONS: WorkflowAction[] = [
  {
    id: "act_1",
    client: "Bookster",
    category: "brief",
    title: "Draft Creative Brief",
    description: "4 new insights approved. Ready to translate into creative directives.",
    timestamp: "10 min ago",
    state: "active",
    priority: "high"
  },
  {
    id: "act_2",
    client: "Acme Corp",
    category: "analysis",
    title: "Run IAP Scan",
    description: "Meta Ads sync completed. 1.2M impressions ready for analysis.",
    timestamp: "1 hr ago",
    state: "pending",
    priority: "normal"
  },
  {
    id: "act_3",
    client: "Zephyr Athletics",
    category: "findings",
    title: "Review Findings",
    description: "IAP Run #4 finished. System flagged 3 anomaly patterns.",
    timestamp: "2 hrs ago",
    state: "pending",
    priority: "high"
  },
  {
    id: "act_4",
    client: "Lumina",
    category: "report",
    title: "Generate Report",
    description: "Creative Brief 'Q3 Push' has been executed. Awaiting wrap-up.",
    timestamp: "Yesterday",
    state: "pending",
    priority: "normal"
  },
  {
    id: "act_5",
    client: "Bookster",
    category: "findings",
    title: "Review Findings",
    description: "IAP Run #3 finished.",
    timestamp: "Yesterday",
    state: "completed",
    priority: "normal"
  }
];

// --- Components ---

function ActionIcon({ category }: { category: ActionCategory }) {
  switch (category) {
    case 'import': return <UploadCloud className="w-4 h-4" />;
    case 'analysis': return <Play className="w-4 h-4" />;
    case 'findings': return <TrendingUp className="w-4 h-4" />;
    case 'brief': return <FileText className="w-4 h-4" />;
    case 'report': return <Layout className="w-4 h-4" />;
  }
}

export function ActionInbox() {
  const [selectedId, setSelectedId] = useState<string>("act_1");
  const [filter, setFilter] = useState<'all' | 'pending'>('all');

  const selectedAction = MOCK_ACTIONS.find(a => a.id === selectedId);

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden text-foreground">
      
      {/* GLOBAL NAV (Ultra minimal, pushed to the edge) */}
      <div className="w-16 border-r border-border bg-card flex flex-col items-center py-6 justify-between z-10 shrink-0">
        <div className="flex flex-col gap-6">
          <div className="w-8 h-8 bg-foreground text-background flex items-center justify-center font-display font-bold text-lg cursor-pointer">
            M
          </div>
          <button className="w-10 h-10 rounded-none flex items-center justify-center text-primary bg-primary/10 hover:bg-primary/20 transition-colors" title="Action Inbox">
            <Inbox className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 rounded-none flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="All Workspaces">
            <Layout className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <button className="w-10 h-10 rounded-none flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="Settings">
            <Settings className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 bg-border rounded-full flex items-center justify-center text-xs font-medium cursor-pointer">
            JS
          </div>
        </div>
      </div>

      {/* FEED (The Core Loop) */}
      <div className="w-[380px] border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <h1 className="font-display text-xl font-semibold mb-4 tracking-tight">Action Inbox</h1>
          <div className="flex gap-2">
            <button 
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${filter === 'all' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              onClick={() => setFilter('all')}
            >
              All Actions
            </button>
            <button 
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${filter === 'pending' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              onClick={() => setFilter('pending')}
            >
              Requires Attention
            </button>
          </div>
        </div>
        
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search clients, actions..." 
              className="w-full bg-background border border-border pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {MOCK_ACTIONS.filter(a => filter === 'all' || a.state !== 'completed').map(action => {
            const isSelected = selectedId === action.id;
            return (
              <button
                key={action.id}
                onClick={() => setSelectedId(action.id)}
                className={`w-full text-left p-4 border-b border-border transition-all flex gap-4 ${
                  isSelected ? 'bg-primary/5 border-l-4 border-l-primary' : 'hover:bg-muted/50 border-l-4 border-l-transparent'
                } ${action.state === 'completed' ? 'opacity-60' : ''}`}
              >
                <div className="pt-1 shrink-0">
                  {action.state === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                  ) : action.state === 'active' ? (
                    <CircleDashed className="w-5 h-5 text-primary animate-[spin_4s_linear_infinite]" />
                  ) : (
                    <CircleDashed className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{action.client}</span>
                    {action.priority === 'high' && action.state !== 'completed' && (
                      <span className="w-2 h-2 rounded-full bg-accent"></span>
                    )}
                  </div>
                  <div className="font-display font-medium text-base mb-1 truncate text-foreground">
                    {action.title}
                  </div>
                  <div className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                    {action.description}
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5 px-2 py-1 bg-border/50 rounded-sm">
                      <ActionIcon category={action.category} />
                      <span className="capitalize">{action.category}</span>
                    </span>
                    <span>{action.timestamp}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* WORKSPACE PANE */}
      <div className="flex-1 bg-background flex flex-col overflow-hidden relative">
        {selectedAction ? (
          <>
            <div className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">{selectedAction.client}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground capitalize">{selectedAction.category} Phase</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="text-foreground font-medium">{selectedAction.title}</span>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5">
                  View Full Workspace
                </button>
                <button className="bg-foreground text-background px-4 py-1.5 text-sm font-medium hover:bg-foreground/90 transition-colors flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Mark as Completed
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto relative">
              {/* Dynamic Content based on action type */}
              {selectedAction.category === 'brief' && <BriefWorkspace />}
              {selectedAction.category === 'analysis' && <AnalysisWorkspace />}
              {selectedAction.category === 'findings' && <FindingsWorkspace />}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <Inbox className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-display text-lg">Select an action to begin</p>
          </div>
        )}
      </div>

    </div>
  );
}

// --- Specific Workspaces ---

function BriefWorkspace() {
  return (
    <div className="flex h-full animate-in fade-in duration-300">
      {/* Context Sidebar */}
      <div className="w-[320px] border-r border-border bg-card/50 p-6 overflow-y-auto hidden lg:block">
        <h3 className="font-display font-semibold text-sm tracking-wide uppercase text-muted-foreground mb-6">Source Context</h3>
        
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <Zap className="w-4 h-4 text-accent" />
              Insight: Ad Fatigue
            </div>
            <p className="text-sm text-muted-foreground bg-card border border-border p-3 leading-relaxed">
              Creative family "Lifestyle A" reached 4.2 frequency with a 30% drop in CTR. Needs immediate refresh using new UGC assets.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <Zap className="w-4 h-4 text-accent" />
              Insight: Winning Hook
            </div>
            <p className="text-sm text-muted-foreground bg-card border border-border p-3 leading-relaxed">
              "Objection Crusher" intro retained 85% of viewers past 3 seconds. Scale this format to other demographics.
            </p>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 p-8 overflow-y-auto bg-card">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-primary/10 text-primary flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-semibold">Q3 Creative Refresh Brief</h2>
              <p className="text-sm text-muted-foreground font-mono mt-1">ID: BRF-8921 • DRAFT</p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Objective</label>
              <textarea 
                className="w-full bg-transparent border-b border-border pb-2 focus:outline-none focus:border-primary resize-none text-lg leading-relaxed" 
                defaultValue="Refresh top-of-funnel creative to combat ad fatigue while scaling our most successful hook format to new audiences."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target Audience</label>
                <div className="p-4 border border-border bg-background min-h-[100px] text-sm">
                  - Primary: Young Professionals (25-34)<br/>
                  - Secondary: Urban Creatives<br/>
                  - Exclusion: Past Purchasers (30 days)
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deliverables</label>
                <div className="p-4 border border-border bg-background min-h-[100px] text-sm">
                  - 3x UGC Style Videos (9:16)<br/>
                  - 2x Static Image Variants (4:5)<br/>
                  - 5x Copy Variations
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="font-display font-semibold">Creative Directives</h3>
                <button className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
                  <Sparkles className="w-4 h-4" /> Generate with AI
                </button>
              </div>
              
              <div className="group border border-border p-4 hover:border-primary transition-colors cursor-text">
                <h4 className="font-medium text-sm mb-2">Directive 1: The "Objection Crusher" Scale</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Use the winning text hook "Think [Product] is too expensive?" paired with dynamic native-style footage. The first 3 seconds must directly address the cost objection before showing the value proposition.
                </p>
              </div>

              <div className="group border border-border p-4 hover:border-primary transition-colors cursor-text">
                <h4 className="font-medium text-sm mb-2">Directive 2: Lifestyle Refresh</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Replace the fatigued "Lifestyle A" assets with fresh UGC. Focus on raw, unpolished lighting to stand out from highly produced feed content.
                </p>
              </div>
              
              <button className="w-full py-3 border border-dashed border-border text-muted-foreground text-sm font-medium hover:bg-muted/30 transition-colors flex items-center justify-center gap-2">
                <AlignLeft className="w-4 h-4" /> Add Directive
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisWorkspace() {
  return (
    <div className="flex h-full animate-in fade-in duration-300 items-center justify-center p-8">
      <div className="max-w-lg w-full text-center">
        <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-6 relative">
          <Play className="w-8 h-8 text-primary ml-1" />
          <div className="absolute inset-0 border-2 border-primary rounded-full animate-ping opacity-20"></div>
        </div>
        <h2 className="font-display text-2xl font-semibold mb-2">Ready for Analysis</h2>
        <p className="text-muted-foreground mb-8">Data sync from Meta Ads is complete. The engine is ready to process 1.2M impressions to identify creative fatigue and winning patterns.</p>
        
        <div className="bg-card border border-border p-6 text-left mb-8 space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Date Range</span>
            <span className="font-medium font-mono">Last 30 Days</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Accounts</span>
            <span className="font-medium">Acme Global, Acme UK</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Active Creatives</span>
            <span className="font-medium">142</span>
          </div>
        </div>

        <button className="bg-primary text-primary-foreground px-8 py-3 w-full font-semibold text-lg flex items-center justify-center gap-2 hover:bg-primary/90 transition-all active:scale-[0.98]">
          <Sparkles className="w-5 h-5" />
          Run IAP Engine
        </button>
      </div>
    </div>
  );
}

function FindingsWorkspace() {
  return (
    <div className="flex h-full animate-in fade-in duration-300 bg-card p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="font-display text-2xl font-semibold">Run #4 Findings</h2>
            <p className="text-sm text-muted-foreground mt-1 font-mono">Analyzed 12 variables across 45 active creatives</p>
          </div>
          <button className="border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors flex items-center gap-2">
            View Full Report <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="p-5 border border-border bg-background">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Fatigue Warning</div>
            <div className="text-3xl font-display font-semibold text-accent mb-1">3</div>
            <div className="text-sm text-muted-foreground">Creatives hit frequency cap</div>
          </div>
          <div className="p-5 border border-border bg-background">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Win Pattern</div>
            <div className="text-3xl font-display font-semibold text-primary mb-1">Text Overlay</div>
            <div className="text-sm text-muted-foreground">+42% CTR vs average</div>
          </div>
          <div className="p-5 border border-border bg-background">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Spend Efficiency</div>
            <div className="text-3xl font-display font-semibold mb-1">-15%</div>
            <div className="text-sm text-muted-foreground">CPA trend (7d)</div>
          </div>
        </div>

        <h3 className="font-display text-lg font-semibold mb-4">Key Insights to Review</h3>
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="flex gap-4 p-5 border border-border bg-background group hover:border-primary transition-colors">
              <div className="w-8 h-8 bg-muted rounded-none flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-foreground" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-1">Audience Shift Detected: Gen Z</h4>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  The "Urban Commuter" asset set is seeing an unexpected spike in engagement from the 18-24 demographic, driving a 20% lower CPA.
                </p>
                <div className="flex gap-3">
                  <button className="text-xs font-semibold px-3 py-1.5 bg-foreground text-background">Approve for Brief</button>
                  <button className="text-xs font-medium px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground">Dismiss</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
