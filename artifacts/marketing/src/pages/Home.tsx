import { useEffect, useState } from "react";
import { COPY, BOOK_DEMO_URL } from "../content";
import { RequestAccessForm } from "../components/RequestAccessForm";
import { BrandMark } from "../components/BrandMark";
import { Shield, Activity, GitMerge, CheckCircle2, Check, X, Play, Quote } from "lucide-react";

const BENEFIT_ICONS = [Activity, GitMerge, Shield];

export default function Home() {
  const [activeVideo, setActiveVideo] = useState(0);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  const scrollToForm = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById("request-access")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center">
      {/* Navbar */}
      <header className="w-full px-6 py-4 flex justify-between items-center mx-topbar fixed top-0 z-50">
        <BrandMark />
        <div className="flex gap-3 items-center">
          <a href={BOOK_DEMO_URL} target="_blank" rel="noreferrer" className="mx-secondary-btn px-4 py-2 text-sm hidden md:inline-flex">
            {COPY.form.secondaryButton}
          </a>
          <a
            href="/login"
            className="px-4 py-2 text-sm font-semibold text-[var(--mx-cyan)] border border-[var(--mx-border-strong)] rounded-lg bg-[var(--mx-cyan)]/[0.07] hover:bg-[var(--mx-cyan)]/[0.14] transition-colors"
          >
            Log in →
          </a>
        </div>
      </header>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="w-full pt-28 pb-16 px-6 mx-hero-field relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 60% 0%, rgba(0,188,255,0.07) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 10% 80%, rgba(0,80,255,0.05) 0%, transparent 70%)",
          }}
        />
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center relative z-10">
          {/* Left */}
          <div className="flex flex-col justify-center">
            <div className="inline-flex mb-6 px-3 py-1 rounded-full border border-[var(--mx-border-strong)] bg-blue-900/20 text-[var(--mx-cyan)] text-xs font-semibold tracking-wide uppercase mx-glow-blue animate-in fade-in slide-in-from-bottom-4 duration-700 w-fit">
              {COPY.hero.badge}
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight mb-5 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100 fill-mode-both leading-[1.08]">
              {COPY.hero.headline}
            </h1>
            <p className="text-base md:text-lg text-[var(--mx-text-soft)] mb-8 leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200 fill-mode-both max-w-xl">
              {COPY.hero.subheadline}
            </p>
            <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both">
              <a href="#request-access" onClick={scrollToForm} className="mx-primary-btn px-7 py-3.5 text-base w-fit inline-flex">
                {COPY.hero.cta}
              </a>
            </div>
            <p className="mt-5 text-sm text-[var(--mx-text-faint)] animate-in fade-in duration-700 delay-500 fill-mode-both">
              Not ready to apply?{" "}
              <a href={BOOK_DEMO_URL} target="_blank" rel="noreferrer" className="text-[var(--mx-cyan)] hover:underline">
                Book a live demo instead.
              </a>
            </p>
          </div>

          {/* Right: form */}
          <div id="request-access" className="scroll-mt-24">
            <RequestAccessForm />
          </div>
        </div>
      </section>

      {/* ── PROOF STRIP ──────────────────────────────────────── */}
      <section className="w-full border-y border-[var(--mx-border-soft)] bg-black/40 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center divide-y md:divide-y-0 md:divide-x divide-[var(--mx-border-soft)]">
            {COPY.proof.map((item, i) => (
              <div key={i} className="flex flex-col items-center py-4 md:py-2">
                <div className="text-3xl font-black text-[var(--mx-cyan)] mb-0.5 mx-glow-cyan">{item.value}</div>
                <div className="text-sm font-semibold text-white mb-0.5">{item.label}</div>
                <div className="text-[10px] text-[var(--mx-text-faint)] uppercase tracking-wider">{item.evidence}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THE REAL PROBLEM ─────────────────────────────────── */}
      <section className="w-full py-20 px-6 relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-0"
          style={{ background: "radial-gradient(ellipse 60% 50% at 20% 50%, rgba(0,80,255,0.04) 0%, transparent 70%)" }}
        />
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-bold tracking-widest uppercase text-[var(--mx-cyan)] mb-3">{COPY.problem.eyebrow}</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-6 leading-tight">
                {COPY.problem.headline}
              </h2>
              <p className="text-[var(--mx-text-soft)] text-base leading-relaxed mb-8">
                {COPY.problem.body}
              </p>
              <ul className="space-y-3">
                {COPY.problem.bullets.map((b, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-white">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--mx-cyan)]/20 border border-[var(--mx-cyan)]/40 flex items-center justify-center">
                      <Check className="w-3 h-3 text-[var(--mx-cyan)]" />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            {/* Dashboard screenshot */}
            <div className="relative">
              <div className="rounded-2xl overflow-hidden border border-[var(--mx-border-medium)] shadow-[0_0_60px_rgba(0,188,255,0.08)]">
                <img
                  src="/waitlist/dashboard-screenshot.png"
                  alt="Metrix IAP Dashboard"
                  className="w-full object-cover"
                />
              </div>
              {/* Floating badge */}
              <div className="absolute -bottom-4 -left-4 bg-black/80 border border-[var(--mx-border-medium)] backdrop-blur rounded-xl px-4 py-3 text-xs">
                <div className="text-[var(--mx-cyan)] font-bold text-sm">$571</div>
                <div className="text-[var(--mx-text-faint)]">Recoverable waste surfaced</div>
              </div>
              <div className="absolute -top-4 -right-4 bg-black/80 border border-[var(--mx-border-medium)] backdrop-blur rounded-xl px-4 py-3 text-xs">
                <div className="text-green-400 font-bold text-sm">62.3%</div>
                <div className="text-[var(--mx-text-faint)]">Control share identified</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DEMO VIDEOS ──────────────────────────────────────── */}
      <section className="w-full py-20 px-6 border-t border-[var(--mx-border-soft)] bg-black/20">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold tracking-widest uppercase text-[var(--mx-cyan)] mb-3 text-center">See It In Action</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-3 text-center">Watch the platform work.</h2>
          <p className="text-[var(--mx-text-soft)] text-center mb-10 max-w-xl mx-auto">
            See exactly how Metrix turns raw Meta ad data into decisions your team can act on today.
          </p>

          {/* Tab switcher */}
          <div className="flex gap-2 justify-center mb-6">
            {COPY.videos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => setActiveVideo(i)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeVideo === i
                    ? "bg-[var(--mx-cyan)]/15 border border-[var(--mx-border-strong)] text-[var(--mx-cyan)]"
                    : "border border-[var(--mx-border-soft)] text-[var(--mx-text-muted)] hover:border-[var(--mx-border-medium)] hover:text-white"
                }`}
              >
                <Play className="w-3 h-3" />
                {v.label}
              </button>
            ))}
          </div>

          {/* Video player */}
          <div className="rounded-2xl overflow-hidden border border-[var(--mx-border-medium)] shadow-[0_0_80px_rgba(0,188,255,0.08)] bg-black">
            {COPY.videos.map((v, i) => (
              <video
                key={v.id}
                src={v.src}
                controls
                playsInline
                preload="metadata"
                className={`w-full aspect-video ${activeVideo === i ? "block" : "hidden"}`}
              >
                Your browser does not support the video tag.
              </video>
            ))}
          </div>
          <p className="text-center text-xs text-[var(--mx-text-faint)] mt-3">{COPY.videos[activeVideo].title}</p>
        </div>
      </section>

      {/* ── PILLARS ──────────────────────────────────────────── */}
      <section className="w-full py-20 px-6 border-t border-[var(--mx-border-soft)]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-widest uppercase text-[var(--mx-cyan)] mb-3">{COPY.pillars.eyebrow}</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">{COPY.pillars.headline}</h2>
            <p className="text-[var(--mx-text-soft)] max-w-2xl mx-auto">{COPY.pillars.subheadline}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {COPY.pillars.items.map((item, i) => (
              <div
                key={i}
                className="rounded-2xl border border-[var(--mx-border-soft)] bg-black/30 p-7 hover:border-[var(--mx-border-medium)] transition-colors group"
              >
                <div className="text-4xl font-black text-[var(--mx-border-medium)] mb-4 group-hover:text-[var(--mx-cyan)] transition-colors">{item.number}</div>
                <h3 className="text-lg font-bold text-white mb-3">{item.title}</h3>
                <p className="text-sm text-[var(--mx-text-muted)] leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 p-5 rounded-xl border border-[var(--mx-border-soft)] bg-black/20 text-center">
            <p className="text-sm font-semibold text-[var(--mx-text-soft)] uppercase tracking-wider">
              Metrix doesn't just show you data. It turns data into the next actions your team can take to scale.
            </p>
          </div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ─────────────────────────────────── */}
      <section className="w-full py-20 px-6 border-t border-[var(--mx-border-soft)] bg-black/20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold tracking-widest uppercase text-[var(--mx-cyan)] mb-3">{COPY.comparison.eyebrow}</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">{COPY.comparison.headline}</h2>
            <p className="text-[var(--mx-text-soft)] max-w-xl mx-auto">{COPY.comparison.subheadline}</p>
          </div>

          <div className="rounded-2xl border border-[var(--mx-border-medium)] overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-4 bg-black/60 border-b border-[var(--mx-border-soft)]">
              <div className="px-5 py-4 text-xs font-bold text-[var(--mx-text-faint)] uppercase tracking-wider">Capability</div>
              {COPY.comparison.columns.map((col, i) => (
                <div
                  key={i}
                  className={`px-4 py-4 text-center text-xs font-bold uppercase tracking-wider ${
                    i === 0 ? "text-[var(--mx-cyan)]" : "text-[var(--mx-text-faint)]"
                  }`}
                >
                  {col}
                </div>
              ))}
            </div>
            {/* Rows */}
            {COPY.comparison.rows.map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-4 border-b border-[var(--mx-border-soft)] last:border-0 ${
                  i % 2 === 0 ? "bg-black/10" : "bg-black/30"
                }`}
              >
                <div className="px-5 py-4">
                  <div className="text-sm font-semibold text-white">{row.capability}</div>
                  <div className="text-xs text-[var(--mx-text-faint)] mt-0.5 leading-snug">{row.description}</div>
                </div>
                {[row.metrix, row.traditional, row.generic].map((val, j) => (
                  <div key={j} className="flex items-center justify-center py-4">
                    {val ? (
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center ${j === 0 ? "bg-[var(--mx-cyan)]/20" : "bg-white/5"}`}>
                        <Check className={`w-3.5 h-3.5 ${j === 0 ? "text-[var(--mx-cyan)]" : "text-white/40"}`} />
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-red-900/20 flex items-center justify-center">
                        <X className="w-3.5 h-3.5 text-red-400/60" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            {[
              { label: "Clarity", desc: "Metrix goes beyond reporting and identifies the actual drivers behind performance." },
              { label: "Actionability", desc: "Instead of leaving your team with charts, it gives you decision-ready outputs and direction." },
              { label: "Workflow Fit", desc: "Insights move directly into briefs, prioritization, and execution without translation overhead." },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-[var(--mx-border-soft)] bg-black/20 px-5 py-4">
                <div className="text-[var(--mx-cyan)] font-bold text-sm mb-1">{item.label}</div>
                <p className="text-xs text-[var(--mx-text-muted)] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ──────────────────────────────────────── */}
      <section className="w-full py-20 px-6 border-t border-[var(--mx-border-soft)]">
        <div className="max-w-3xl mx-auto text-center">
          <Quote className="w-8 h-8 text-[var(--mx-cyan)]/40 mx-auto mb-6" />
          <blockquote className="text-xl md:text-2xl font-medium text-white leading-relaxed mb-8">
            "{COPY.testimonial.quote}"
          </blockquote>
          <div className="flex flex-col items-center gap-1">
            <div className="font-bold text-white">{COPY.testimonial.name}</div>
            <div className="text-sm text-[var(--mx-text-muted)]">{COPY.testimonial.role}</div>
            <div className="mt-2 px-3 py-1 rounded-full border border-[var(--mx-border-soft)] bg-black/30 text-xs text-[var(--mx-cyan)] font-semibold">
              {COPY.testimonial.stat}
            </div>
          </div>
        </div>
      </section>

      {/* ── BENEFITS CHECKLIST ───────────────────────────────── */}
      <section className="w-full border-t border-[var(--mx-border-soft)] py-20 px-6 bg-black/20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-10 text-center">{COPY.benefits.headline}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {COPY.benefits.items.map((item, i) => {
              const Icon = BENEFIT_ICONS[i];
              return (
                <div
                  key={i}
                  className="flex gap-4 rounded-xl border border-[var(--mx-border-soft)] bg-black/30 px-5 py-5 hover:border-[var(--mx-border-medium)] transition-colors"
                >
                  <div className="flex-shrink-0 mt-0.5 w-9 h-9 rounded-lg bg-blue-900/30 border border-[var(--mx-border-medium)] flex items-center justify-center text-[var(--mx-cyan)]">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--mx-cyan)] flex-shrink-0" />
                      <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                    </div>
                    <p className="text-xs text-[var(--mx-text-muted)] leading-relaxed">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ───────────────────────────────────────── */}
      <section className="w-full py-20 px-6 border-t border-[var(--mx-border-soft)] relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-0"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(0,188,255,0.06) 0%, transparent 70%)" }}
        />
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <p className="text-xs font-bold tracking-widest uppercase text-[var(--mx-cyan)] mb-3">Early Access Available — 200 Max Accepted</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Done guessing. Ready to know?
          </h2>
          <p className="text-[var(--mx-text-soft)] mb-8 max-w-lg mx-auto">
            Join the first 200 accounts getting access to Metrix IAP and see what creative intelligence does to performance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#request-access" onClick={scrollToForm} className="mx-primary-btn px-8 py-4 text-base">
              {COPY.hero.cta}
            </a>
            <a href={BOOK_DEMO_URL} target="_blank" rel="noreferrer" className="mx-secondary-btn px-8 py-4 text-base">
              {COPY.form.secondaryButton}
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full py-8 text-center text-sm text-[var(--mx-text-faint)] border-t border-[var(--mx-border-soft)] mt-auto relative z-10">
        &copy; {new Date().getFullYear()} Metrix Intelligence Platform. All rights reserved.
      </footer>
    </div>
  );
}
