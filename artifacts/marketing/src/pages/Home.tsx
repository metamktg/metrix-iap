import { useEffect } from "react";
import { COPY, BOOK_DEMO_URL } from "../content";
import { RequestAccessForm } from "../components/RequestAccessForm";
import { BrandMark } from "../components/BrandMark";
import { Shield, Activity, GitMerge } from "lucide-react";

export default function Home() {
  // The browser's native hash jump fires before React renders, so handle
  // #request-access (and any other hash) ourselves after mount.
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

  return (
    <div className="min-h-screen w-full flex flex-col items-center">
      {/* Navbar */}
      <header className="w-full px-6 py-4 flex justify-between items-center mx-topbar fixed top-0 z-50">
        <BrandMark />
        <div className="flex gap-4 items-center">
          <a href={BOOK_DEMO_URL} target="_blank" rel="noreferrer" className="mx-secondary-btn px-4 py-2 text-sm hidden md:inline-flex">
            {COPY.form.secondaryButton}
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="w-full pt-32 pb-20 px-6 mx-hero-field relative overflow-hidden flex flex-col items-center justify-center">
        <div className="max-w-4xl mx-auto text-center z-10">
          <div className="inline-block mb-6 px-3 py-1 rounded-full border border-[var(--mx-border-strong)] bg-blue-900/20 text-[var(--mx-cyan)] text-sm font-semibold tracking-wide uppercase mx-glow-blue animate-in fade-in slide-in-from-bottom-4 duration-700">
            {COPY.hero.badge}
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tight mb-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100 fill-mode-both">
            {COPY.hero.headline}
          </h1>
          <p className="text-lg md:text-xl text-[var(--mx-text-soft)] mb-10 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200 fill-mode-both">
            {COPY.hero.subheadline}
          </p>
        </div>
      </section>

      {/* Proof Strip */}
      <section className="w-full border-y border-[var(--mx-border-soft)] bg-black/40 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-[var(--mx-border-soft)]">
            {COPY.proof.map((item, i) => (
              <div key={i} className="flex flex-col items-center pt-8 md:pt-0 first:pt-0">
                <div className="text-4xl font-black text-[var(--mx-cyan)] mb-2 mx-glow-cyan drop-shadow-lg">{item.value}</div>
                <div className="font-semibold text-white mb-2">{item.label}</div>
                <div className="text-xs text-[var(--mx-text-faint)] uppercase tracking-wider">{item.evidence}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content: Form + Benefits */}
      <section className="w-full max-w-6xl mx-auto px-6 py-24 grid grid-cols-1 lg:grid-cols-2 gap-16 relative z-10">
        {/* Left: Benefits */}
        <div className="flex flex-col justify-center space-y-12">
          <div>
            <h2 className="text-3xl font-bold text-white mb-8">{COPY.benefits.headline}</h2>
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="mt-1 flex-shrink-0 w-12 h-12 rounded-xl bg-blue-900/30 border border-[var(--mx-border-medium)] flex items-center justify-center text-[var(--mx-cyan)]">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">{COPY.benefits.items[0].title}</h3>
                  <p className="text-[var(--mx-text-muted)] leading-relaxed">{COPY.benefits.items[0].description}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="mt-1 flex-shrink-0 w-12 h-12 rounded-xl bg-blue-900/30 border border-[var(--mx-border-medium)] flex items-center justify-center text-[var(--mx-cyan)]">
                  <GitMerge className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">{COPY.benefits.items[1].title}</h3>
                  <p className="text-[var(--mx-text-muted)] leading-relaxed">{COPY.benefits.items[1].description}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="mt-1 flex-shrink-0 w-12 h-12 rounded-xl bg-blue-900/30 border border-[var(--mx-border-medium)] flex items-center justify-center text-[var(--mx-cyan)]">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">{COPY.benefits.items[2].title}</h3>
                  <p className="text-[var(--mx-text-muted)] leading-relaxed">{COPY.benefits.items[2].description}</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="pt-8 border-t border-[var(--mx-border-soft)]">
            <p className="text-sm text-[var(--mx-text-faint)] mb-4">Not ready to apply? See it in action first.</p>
            <a href={BOOK_DEMO_URL} target="_blank" rel="noreferrer" className="mx-secondary-btn px-6 py-3 w-fit">
              {COPY.form.secondaryButton}
            </a>
          </div>
        </div>

        {/* Right: Form */}
        <div id="request-access">
          <RequestAccessForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full py-8 text-center text-sm text-[var(--mx-text-faint)] border-t border-[var(--mx-border-soft)] mt-auto relative z-10">
        &copy; {new Date().getFullYear()} Metrix Intelligence Platform. All rights reserved.
      </footer>
    </div>
  );
}
