import { Link } from "wouter";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { COPY, BOOK_DEMO_URL } from "../content";
import { BrandMark } from "../components/BrandMark";

export default function Thanks() {
  const searchParams = new URLSearchParams(window.location.search);
  const status = searchParams.get("status");
  
  const isAlreadyRequested = status === "already_requested";

  return (
    <div className="min-h-screen w-full flex flex-col items-center mx-app-bg text-white">
      {/* Navbar */}
      <header className="w-full px-6 py-4 flex justify-between items-center mx-topbar fixed top-0 z-50">
        <Link href="/" className="cursor-pointer">
          <BrandMark />
        </Link>
        <a
          href="/login"
          className="px-4 py-2 text-sm font-semibold text-[var(--mx-cyan)] border border-[var(--mx-border-strong)] rounded-lg bg-[var(--mx-cyan)]/[0.07] hover:bg-[var(--mx-cyan)]/[0.14] transition-colors"
        >
          Log in →
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center w-full px-6 py-32">
        <div className="mx-card max-w-2xl w-full p-10 md:p-14 text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mb-8 mx-glow-cyan shadow-[0_0_30px_rgba(53,217,111,0.3)]">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>
          
          <h1 className="text-4xl font-extrabold text-white mb-4">
            {isAlreadyRequested ? COPY.thanks.alreadyRequested : COPY.thanks.headline}
          </h1>
          <p className="text-lg text-[var(--mx-text-soft)] mb-12 max-w-md mx-auto leading-relaxed">
            {COPY.thanks.message}
          </p>

          <div className="bg-black/30 border border-[var(--mx-border-soft)] rounded-xl p-8 text-left mb-12">
            <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-wider text-center">{COPY.thanks.stepsHeadline}</h3>
            <div className="space-y-6">
              {COPY.thanks.steps.map((step, index) => (
                <div key={index} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--mx-border-medium)] flex items-center justify-center text-sm font-bold text-white">
                    {index + 1}
                  </div>
                  <div>
                    <h4 className="font-bold text-white mb-1">{step.title}</h4>
                    <p className="text-sm text-[var(--mx-text-muted)]">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a 
              href={BOOK_DEMO_URL} 
              target="_blank" 
              rel="noreferrer" 
              className="mx-secondary-btn px-8 py-4 w-full sm:w-auto text-base"
            >
              {COPY.form.secondaryButton}
              <ArrowRight className="w-4 h-4" />
            </a>
            <Link 
              href="/" 
              className="mx-secondary-btn px-8 py-4 w-full sm:w-auto text-base"
            >
              Return Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
