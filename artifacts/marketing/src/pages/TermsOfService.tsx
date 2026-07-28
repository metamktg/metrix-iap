import { Link } from "wouter";
import { BrandMark } from "../components/BrandMark";

const EFFECTIVE_DATE = "July 28, 2026";
const CONTACT_EMAIL = "meta@metamktgagency.com";

export default function TermsOfService() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center mx-app-bg text-white">
      <header className="w-full px-6 py-4 flex justify-between items-center mx-topbar fixed top-0 z-50">
        <Link href="/" className="cursor-pointer">
          <BrandMark />
        </Link>
      </header>

      <main className="flex-1 w-full max-w-3xl px-6 pt-32 pb-24 mx-auto">
        <h1 className="text-4xl font-extrabold text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-[var(--mx-text-faint)] mb-10">Effective {EFFECTIVE_DATE}</p>

        <div className="space-y-8 text-[var(--mx-text-soft)] leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-2">1. Acceptance</h2>
            <p>
              By creating an account or connecting a Meta ad account to Metrix, you agree to these
              Terms. Metrix is provided by Meta Marketing Agency to invited agencies and their clients.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-2">2. The service</h2>
            <p>
              Metrix reads ad performance data from connected Meta ad accounts (read-only,{" "}
              <code className="text-[var(--mx-cyan)]">ads_read</code> scope) to generate analysis,
              strategy, and creative-brief output. Metrix never modifies campaigns, ads, or Pages on
              your Meta account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-2">3. Your responsibilities</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You must have authorization to connect the Meta ad account you select.</li>
              <li>Keep your login credentials confidential; you are responsible for activity under your account.</li>
              <li>Use Metrix only for lawful advertising analysis and reporting purposes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-2">4. Data</h2>
            <p>
              Our handling of the data pulled from your Meta ad account is described in our{" "}
              <Link href="/privacy" className="text-[var(--mx-cyan)] underline">
                Privacy Policy
              </Link>
              . You may disconnect your account or request deletion at any time (see{" "}
              <Link href="/data-deletion" className="text-[var(--mx-cyan)] underline">
                Data Deletion Instructions
              </Link>
              ).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-2">5. Availability &amp; changes</h2>
            <p>
              Metrix is provided "as is" during onboarding and pilot phases. We may change or discontinue
              features and will make reasonable efforts to notify connected users of material changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-2">6. Contact</h2>
            <p>
              Questions about these Terms:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--mx-cyan)] underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <footer className="w-full py-8 text-center text-sm text-[var(--mx-text-faint)] border-t border-[var(--mx-border-soft)] mt-auto">
        &copy; {new Date().getFullYear()} Metrix Intelligence Platform. All rights reserved.
      </footer>
    </div>
  );
}
