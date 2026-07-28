import { Link } from "wouter";
import { BrandMark } from "../components/BrandMark";

const EFFECTIVE_DATE = "July 28, 2026";
const CONTACT_EMAIL = "meta@metamktgagency.com";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center mx-app-bg text-white">
      <header className="w-full px-6 py-4 flex justify-between items-center mx-topbar fixed top-0 z-50">
        <Link href="/" className="cursor-pointer">
          <BrandMark />
        </Link>
      </header>

      <main className="flex-1 w-full max-w-3xl px-6 pt-32 pb-24 mx-auto">
        <h1 className="text-4xl font-extrabold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-[var(--mx-text-faint)] mb-10">Effective {EFFECTIVE_DATE}</p>

        <div className="space-y-8 text-[var(--mx-text-soft)] leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-2">1. Who we are</h2>
            <p>
              Metrix ("Metrix", "we", "us") is an ad-performance analysis platform operated by Meta
              Marketing Agency for advertising agencies and their clients. This policy explains what
              data we collect when you connect a Meta (Facebook) ad account, how we use it, and how you
              can have it deleted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-2">2. Data we collect from Meta</h2>
            <p>
              When you connect your Meta ad account via Facebook Login, Metrix requests only the{" "}
              <code className="text-[var(--mx-cyan)]">ads_read</code> permission. We use it solely to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>List the ad accounts your Meta user can access, so you can choose which one to connect.</li>
              <li>
                Read ad performance insights (spend, reach, impressions, clicks, and related campaign,
                ad set, and ad-level metrics and breakdowns) for the account you select.
              </li>
            </ul>
            <p className="mt-2">
              Metrix never requests permissions to create, edit, or delete campaigns, ads, or Pages, and
              never posts on your behalf.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-2">3. How we use and store data</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access tokens are encrypted at rest (AES-256-GCM) and are never logged or displayed.</li>
              <li>
                Insights data is stored in our database to power your Metrix dashboard, analysis, and
                AI-generated strategy and creative briefs. It is not sold or shared with third parties.
              </li>
              <li>Data is scoped to your account and the team members you grant access to.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-2">4. Deleting your data</h2>
            <p>
              You can disconnect your Meta account at any time from Settings → Integrations, which
              revokes our stored token immediately. To request deletion of all associated data, see our{" "}
              <Link href="/data-deletion" className="text-[var(--mx-cyan)] underline">
                Data Deletion Instructions
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-2">5. Contact</h2>
            <p>
              Questions about this policy or your data:{" "}
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
