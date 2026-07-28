// ─── Login landing page ────────────────────────────────────────────────
// Split-panel layout: premium brand value proposition on the left,
// login form on the right. Mobile: left collapses to a compact strip.

import { useState, type FormEvent } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { ApiError } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { BrandLogo } from "@/components/brand/BrandMark";
import { CREATE_ACCOUNT_PATH } from "@/navigation/preLoginRoutes";

// ── Value proposition copy (mirrors marketing site COPY) ─────────────────
const FEATURES = [
  { label: "Sprint Test System",      sub: "Structured rapid testing." },
  { label: "Signal Detection",        sub: "Identify what moves performance." },
  { label: "Actionable Intelligence", sub: "Decisions, not passive reports." },
  { label: "Scale With Confidence",   sub: "Repeatable, predictable growth." },
] as const;

const PROOF_POINTS = [
  { value: "+34%",  label: "Avg. ROAS Increase",   evidence: "214 audited campaigns" },
  { value: "−18%",  label: "CPA Reduction",         evidence: "Top quartile partners"  },
  { value: "$2.4M", label: "Wasted Spend Saved",    evidence: "Reallocated, 2025"      },
] as const;

// ── Tiny reusable icon marks ──────────────────────────────────────────────
function SprintIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 4.5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function SignalIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 2" />
      <circle cx="8" cy="8" r="7.2" stroke="currentColor" strokeWidth="0.8" opacity=".4" />
    </svg>
  );
}
function IntelligenceIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
      <polyline points="2,11 5,7 8,9 11,5 14,3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14" cy="3" r="1.2" fill="currentColor" />
    </svg>
  );
}
function ScaleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
      <path d="M5.5 8c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M2 8c0-3.31 2.69-6 6-6s6 2.69 6 6-2.69 6-6 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

const FEATURE_ICONS = [SprintIcon, SignalIcon, IntelligenceIcon, ScaleIcon];

// ─────────────────────────────────────────────────────────────────────────

export function LoginPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      await login(email.trim(), password, rememberMe);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setLoginError("Invalid email or password.");
      } else if (err instanceof ApiError && err.status === 429) {
        setLoginError("Too many attempts. Please wait a few minutes and try again.");
      } else {
        setLoginError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-stretch">

      {/* ── LEFT PANEL — value proposition (lg+) ─────────────────────────── */}
      <div
        className="hidden lg:flex flex-col w-[48%] max-w-2xl border-r border-white/[0.06] relative overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 30% 15%, hsl(222 100% 54% / 0.18) 0%, transparent 70%), " +
            "radial-gradient(ellipse 50% 40% at 70% 85%, hsl(222 100% 54% / 0.08) 0%, transparent 60%), " +
            "hsl(222 28% 7%)",
        }}
      >
        {/* Subtle grid texture overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(222 100% 80%) 1px, transparent 1px), " +
              "linear-gradient(90deg, hsl(222 100% 80%) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative z-10 flex flex-col h-full px-12 py-12">

          {/* ── Brand mark ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <BrandLogo className="w-9 h-9" />
            <span className="text-[22px] font-bold tracking-tight text-white" style={{ letterSpacing: "-0.02em" }}>
              metrix
            </span>
          </div>

          {/* ── Main content — pushes to vertical center ───────────────── */}
          <div className="flex-1 flex flex-col justify-center space-y-10 pt-12 pb-4">

            {/* Headline */}
            <div className="space-y-5">
              <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/40">
                Performance Intelligence Platform
              </p>
              <h1 className="text-[2.6rem] font-bold leading-[1.1] tracking-tight text-white">
                Performance
                <br />
                intelligence for
                <br />
                marketers who need
                <br />
                to move{" "}
                <span className="text-interactive">faster.</span>
              </h1>
              <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-white/40 mt-1">
                TEST.&nbsp;&nbsp;OPTIMIZE.&nbsp;&nbsp;SCALE.&nbsp;&nbsp;REPEAT.
              </p>
            </div>

            {/* Feature capability pills */}
            <div className="grid grid-cols-2 gap-2.5">
              {FEATURES.map(({ label, sub }, i) => {
                const Icon = FEATURE_ICONS[i];
                return (
                  <div
                    key={label}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 space-y-1.5"
                    style={{ backdropFilter: "blur(8px)" }}
                  >
                    <div className="flex items-center gap-2 text-interactive">
                      <Icon />
                      <span className="text-[11px] font-semibold tracking-wide text-white/90">{label}</span>
                    </div>
                    <p className="text-[11px] text-white/45 leading-snug">{sub}</p>
                  </div>
                );
              })}
            </div>

            {/* Proof stats row */}
            <div className="grid grid-cols-3 gap-3">
              {PROOF_POINTS.map(({ value, label, evidence }) => (
                <div key={label} className="space-y-0.5">
                  <p className="text-3xl font-bold text-white tracking-tight" style={{ letterSpacing: "-0.03em" }}>
                    {value}
                  </p>
                  <p className="text-[11px] font-semibold text-white/70">{label}</p>
                  <p className="text-[10px] text-white/35">{evidence}</p>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-2.5 pt-1">
              <a
                href="/www/#request-access"
                className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-all shadow-lg"
                style={{ boxShadow: "0 0 20px hsl(222 100% 54% / 0.35)" }}
              >
                Request Demo Access <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="/www/"
                className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg border border-white/[0.12] text-[13px] text-white/60 hover:text-white/90 hover:border-white/20 transition-colors"
              >
                See More <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Footer */}
          <p className="text-[11px] text-white/25 tracking-wide">
            Built for marketers. Engineered for compounding growth. · METRIX.AD
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL — login form ──────────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 py-12"
        style={{ background: "hsl(222 22% 6%)" }}
      >
        {/* Mobile-only compact brand + CTA strip */}
        <div className="lg:hidden w-full max-w-sm mb-10 space-y-4 pb-8 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <BrandLogo className="w-8 h-8" />
            <span className="text-lg font-bold tracking-tight text-white">metrix</span>
          </div>
          <p className="text-sm text-white/50">Performance intelligence for marketers who need to move faster.</p>
          <a
            href="/www/#request-access"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-interactive hover:opacity-80 transition-opacity"
          >
            Request Demo Access <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="w-full max-w-[340px] space-y-7">

          {/* Form heading */}
          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold text-white tracking-tight" style={{ letterSpacing: "-0.02em" }}>
              Sign in
            </h2>
            <p className="text-[13px] text-white/45">
              Welcome back — enter your credentials below.
            </p>
          </div>

          {/* Login form */}
          <form onSubmit={handleLogin} className="space-y-4" data-testid="form-login">
            <div className="space-y-1.5">
              <label
                htmlFor="login-email"
                className="block text-[11px] font-semibold uppercase tracking-wider text-white/40"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full h-10 px-3.5 rounded-lg text-[13px] text-white placeholder:text-white/25 focus:outline-none transition-colors"
                style={{
                  background: "hsl(222 30% 11%)",
                  border: "1px solid hsl(222 20% 20%)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "hsl(222 100% 54% / 0.5)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "hsl(222 20% 20%)"; }}
                data-testid="input-login-email"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="login-password"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-white/40"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  className="text-[11px] text-white/35 hover:text-white/70 transition-colors"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-10 px-3.5 rounded-lg text-[13px] text-white placeholder:text-white/25 focus:outline-none transition-colors"
                style={{
                  background: "hsl(222 30% 11%)",
                  border: "1px solid hsl(222 20% 20%)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "hsl(222 100% 54% / 0.5)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "hsl(222 20% 20%)"; }}
                data-testid="input-login-password"
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
              <input
                id="login-remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                data-testid="checkbox-remember-me"
              />
              <span className="text-[12px] text-white/40">Remember me</span>
            </label>
            {loginError && (
              <div className="text-[12px] text-red-400/90 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2" data-testid="text-login-error">
                {loginError}
              </div>
            )}
            <button
              type="submit"
              disabled={isLoggingIn || !email.trim() || !password}
              className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
              style={{ boxShadow: "0 0 16px hsl(222 100% 54% / 0.25)" }}
              data-testid="button-login"
            >
              {isLoggingIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {isLoggingIn ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/25">
              No account?
            </span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Request access */}
          <div className="space-y-2">
            <a
              href="/www/#request-access"
              className="w-full h-10 rounded-lg border border-primary/30 bg-primary/[0.08] text-[13px] font-semibold text-interactive hover:bg-primary/[0.14] transition-colors flex items-center justify-center gap-2"
              data-testid="link-request-access"
            >
              Request access <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <p className="text-[11px] text-white/30 text-center leading-relaxed px-2">
              Access is approved by the Metrix team. Approved users receive a
              temporary password by email.
            </p>
          </div>

          {/* Create Account */}
          <div>
            <button
              type="button"
              onClick={() => navigate(CREATE_ACCOUNT_PATH)}
              className="w-full h-10 rounded-lg border border-white/[0.10] text-[13px] font-semibold text-white/55 hover:text-white/80 hover:border-white/20 transition-colors flex items-center justify-center"
              data-testid="button-create-account"
            >
              Create Account
            </button>
          </div>

          {/* Marketing site link — desktop only (mobile has it above) */}
          <div className="text-center hidden lg:block">
            <a
              href="/www/"
              className="inline-flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 transition-colors"
              data-testid="link-marketing-site"
            >
              Learn more about Metrix <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
