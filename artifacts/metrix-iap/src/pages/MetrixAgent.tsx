// ─── Metrix Agent (Coming Soon + waitlist) ────────────────────────────
// The agent itself is not enabled in this build. Users can join the
// waitlist — emails are stored in Postgres via the API.

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useJoinAgentWaitlist } from "@workspace/api-client-react";
import { Clock, Brain, Database, Zap, ArrowRight, Mail, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

// ─── Status row ────────────────────────────────────────────────────────

function PendingRow({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/20 last:border-b-0">
      <div className="w-5 h-5 rounded border border-border/40 bg-white/[0.03] flex items-center justify-center shrink-0 mt-0.5">
        <Clock className="w-2.5 h-2.5 text-muted-foreground/60" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-foreground/70 leading-tight">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-tight">{sub}</p>}
      </div>
      <span className="text-[8px] font-semibold uppercase tracking-widest text-muted-foreground/60 border border-border/30 px-1.5 py-0.5 rounded shrink-0">
        Pending
      </span>
    </div>
  );
}

// ─── Waitlist form ─────────────────────────────────────────────────────

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<"joined" | "already_joined" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = useJoinAgentWaitlist();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    mutation.mutate(
      { data: { email: trimmed } },
      {
        onSuccess: (res) => setResult(res.status),
        onError: () => setError("Could not join the waitlist. Please try again."),
      }
    );
  };

  if (result) {
    return (
      <div className="p-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] flex items-start gap-3">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] font-semibold text-emerald-300">
            {result === "joined" ? "You're on the waitlist" : "You're already on the waitlist"}
          </p>
          <p className="text-[11px] text-emerald-400/70 mt-0.5 leading-relaxed">
            We'll notify {email.trim()} when Metrix Agent goes live.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="p-4 rounded-xl border border-primary/25 bg-primary/[0.04]">
      <div className="text-[10px] font-mono uppercase tracking-widest text-primary/60 mb-2">
        Join the waitlist
      </div>
      <p className="text-[11px] text-muted-foreground/60 mb-3 leading-relaxed">
        Be first to know when Metrix Agent launches for your workspace.
      </p>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-border/50 bg-white/[0.03] text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 transition-colors"
            aria-label="Email address"
          />
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="h-9 px-4 rounded-lg bg-primary/15 border border-primary/30 text-[12px] font-medium text-primary hover:bg-primary/25 transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
        >
          {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
          Join
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-1.5 mt-2">
          <AlertTriangle className="w-3 h-3 text-red-400/80" />
          <p className="text-[10px] text-red-400/80">{error}</p>
        </div>
      )}
    </form>
  );
}

// ─── MetrixAgent ───────────────────────────────────────────────────────

export function MetrixAgent() {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/40">
        <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest block mb-1">
          Metrix Agent · 07
        </span>
        <h1 className="text-[18px] font-semibold text-foreground leading-tight">Metrix Agent</h1>
        <p className="text-[12px] text-muted-foreground/60 mt-0.5">
          A source-backed AI operator for Metrix workflows. Coming soon.
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg space-y-6">

          {/* Hero card */}
          <div className={cn(
            "relative p-6 rounded-2xl border overflow-hidden",
            "border-border/40 bg-white/[0.02]",
          )}>
            {/* Subtle glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent pointer-events-none" />

            <div className="relative space-y-4">
              {/* Icon + badge */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl border border-primary/30 bg-primary/10 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-primary" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-widest border border-primary/25 bg-primary/[0.08] text-primary/80 px-2 py-1 rounded">
                  Coming soon
                </span>
              </div>

              {/* Copy */}
              <div>
                <h2 className="text-[20px] font-semibold text-foreground leading-tight">Metrix Agent</h2>
                <p className="text-[13px] text-foreground/70 mt-2 leading-relaxed">
                  Your source-backed operator layer for summarizing account state, surfacing next actions, and explaining why each recommendation exists.
                </p>
              </div>

              {/* Capability bullets */}
              <div className="space-y-1.5 pt-1">
                {[
                  { icon: Database, label: "Source-backed intelligence", sub: "Every insight traces to a named table and run." },
                  { icon: Zap,      label: "Next action surfacing",       sub: "Prioritized recommendations across all modules." },
                  { icon: Brain,    label: "Reasoning transparency",      sub: "See why each suggestion was generated." },
                  { icon: ArrowRight, label: "Workflow execution (read-only)", sub: "Summarize, draft, and queue — never auto-apply." },
                ].map(({ icon: Icon, label, sub }) => (
                  <div key={label} className="flex items-start gap-3 p-2.5 rounded-lg border border-border/25 bg-white/[0.02]">
                    <div className="w-6 h-6 rounded border border-border/30 bg-white/[0.03] flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-3 h-3 text-muted-foreground/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-foreground/80 leading-tight">{label}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-tight">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Waitlist */}
          <WaitlistForm />

          {/* Status card */}
          <div className="p-4 rounded-xl border border-border/40 bg-white/[0.02]">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-3">
              Build status
            </div>
            <PendingRow
              label="Agent memory"
              sub="Cross-run workspace memory and context accumulation."
            />
            <PendingRow
              label="Source-backed reasoning"
              sub="Explanation layer linked to intelligence_cards, bsil_suggestions, and review_events."
            />
            <PendingRow
              label="Action execution layer"
              sub="Read-only operator mode with brief drafting and task queuing."
            />
            <PendingRow
              label="Natural language interface"
              sub="Operator-console query mode for account state summaries."
            />
          </div>

          <p className="text-[10px] font-mono text-muted-foreground/50 text-center">
            No fake chat messages · No demo agent output · No simulated responses
          </p>
        </div>
      </div>
    </div>
  );
}
