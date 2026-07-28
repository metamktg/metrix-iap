import { Link } from "wouter";
import { BrandMark } from "../components/BrandMark";

const CONTACT_EMAIL = "meta@metamktgagency.com";

export default function DataDeletion() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center mx-app-bg text-white">
      <header className="w-full px-6 py-4 flex justify-between items-center mx-topbar fixed top-0 z-50">
        <Link href="/" className="cursor-pointer">
          <BrandMark />
        </Link>
      </header>

      <main className="flex-1 w-full max-w-3xl px-6 pt-32 pb-24 mx-auto">
        <h1 className="text-4xl font-extrabold text-white mb-2">Data Deletion Instructions</h1>
        <p className="text-[var(--mx-text-soft)] mb-10">
          How to remove your Meta ad account connection and associated data from Metrix.
        </p>

        <div className="space-y-8 text-[var(--mx-text-soft)] leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-2">1. Disconnect your Meta account (self-serve)</h2>
            <p>
              Sign in to Metrix, go to <strong>Settings → Integrations</strong>, and select{" "}
              <strong>Disconnect</strong> next to your connected Meta account. This immediately revokes
              and deletes your stored Meta access token; Metrix stops pulling any further data from that
              account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-2">2. Request full data deletion</h2>
            <p>
              To have all data associated with your Meta connection permanently deleted from Metrix
              (previously pulled insights, campaign/ad-level reports, and account records), email{" "}
              <a href={`mailto:${CONTACT_EMAIL}?subject=Metrix%20data%20deletion%20request`} className="text-[var(--mx-cyan)] underline">
                {CONTACT_EMAIL}
              </a>{" "}
              from the email address on your Metrix account and state which Meta ad account(s) to
              remove. We confirm and complete deletion within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-2">3. What gets deleted</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Your encrypted Meta access token.</li>
              <li>All stored insight/report rows pulled for the disconnected ad account.</li>
              <li>Generated strategy and creative-brief output derived from that account's data.</li>
            </ul>
            <p className="mt-2">
              Account records required for billing or legal compliance may be retained as required by
              law, with all Meta-sourced ad data removed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-2">Related</h2>
            <p>
              See our{" "}
              <Link href="/privacy" className="text-[var(--mx-cyan)] underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/terms" className="text-[var(--mx-cyan)] underline">
                Terms of Service
              </Link>
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
