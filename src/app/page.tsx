import { Github, Mail, GitCommit, Brain, Zap } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="font-mono text-xl font-bold">jot</div>
          <Link
            href="/login"
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
          Your AI co-founder,
          <br />
          in your inbox.
        </h1>
        <p className="text-lg text-[var(--muted)] mb-10 max-w-xl mx-auto">
          jot reads your commits every day and sends you a blunt, honest
          reflection. What you accomplished. What you're avoiding. The questions
          you should be asking.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 bg-[var(--foreground)] text-[var(--background)] px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          <Github className="w-5 h-5" />
          Connect GitHub
        </Link>
        <p className="text-sm text-[var(--muted)] mt-4">
          7-day free trial. Then $10/month.
        </p>
      </section>

      {/* How it works */}
      <section className="border-t border-[var(--border)] bg-[var(--background)]">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-center mb-16">How it works</h2>
          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[var(--foreground)] text-[var(--background)] flex items-center justify-center mx-auto mb-4">
                <Github className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">1. Connect GitHub</h3>
              <p className="text-sm text-[var(--muted)]">
                Sign in with GitHub and pick which repos to track.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[var(--foreground)] text-[var(--background)] flex items-center justify-center mx-auto mb-4">
                <Brain className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">2. jot reads your commits</h3>
              <p className="text-sm text-[var(--muted)]">
                Every evening, jot analyzes what you shipped that day.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[var(--foreground)] text-[var(--background)] flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">3. Get your reflection</h3>
              <p className="text-sm text-[var(--muted)]">
                A blunt email lands in your inbox. No fluff. Just clarity.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Example reflection */}
      <section className="border-t border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-center mb-10">
            What a jot looks like
          </h2>
          <div className="bg-white dark:bg-neutral-900 border border-[var(--border)] rounded-xl p-8 font-mono text-sm">
            <div className="text-[var(--muted)] mb-6">
              From: jot@mail.jotgrowsideas.com
              <br />
              Subject: Your day in code — January 22
            </div>
            <div className="prose text-[var(--foreground)]">
              <h2>What You Did</h2>
              <p>
                You completely pivoted the funding architecture from a complex
                banking integration to a simplified onramp system. Core changes:
              </p>
              <ul>
                <li>
                  <strong>Ripped out the banking flow</strong> — Removed KYC
                  verification and Plaid connections
                </li>
                <li>
                  <strong>Simplified goal creation</strong> — New flow is Chat →
                  Create → Share → Fund
                </li>
                <li>
                  <strong>Added webhook handling</strong> — Balances update when
                  payments complete
                </li>
              </ul>

              <h2>Observations</h2>
              <p>
                This was a focused day with clear direction. You identified that
                the banking integration was over-engineered for an MVP and made
                the right call to simplify. No obvious yak shaving.
              </p>

              <h2>Questions for Tomorrow</h2>
              <p>
                <strong>1.</strong> Does the onramp actually work end-to-end?
                You built the plumbing but need to test with real transactions.
              </p>
              <p>
                <strong>2.</strong> What happens to existing users with the old
                setup? Migration strategy or grandfather them in?
              </p>
            </div>
            <div className="text-[var(--muted)] mt-6 pt-4 border-t border-[var(--border)]">
              — jot, 8:00 PM
            </div>
          </div>
        </div>
      </section>

      {/* Why section */}
      <section className="border-t border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-center mb-6">
            Building alone is hard
          </h2>
          <p className="text-center text-[var(--muted)] max-w-xl mx-auto mb-10">
            No co-founder to call you out when you're distracted. No one to
            celebrate real progress. No one asking the questions you're
            avoiding. jot is that co-founder.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-[var(--border)] rounded-lg p-6">
              <GitCommit className="w-6 h-6 mb-3" />
              <h3 className="font-semibold mb-2">Sees what you shipped</h3>
              <p className="text-sm text-[var(--muted)]">
                Not what you said you'd do. What you actually committed.
              </p>
            </div>
            <div className="border border-[var(--border)] rounded-lg p-6">
              <Zap className="w-6 h-6 mb-3" />
              <h3 className="font-semibold mb-2">Calls out distractions</h3>
              <p className="text-sm text-[var(--muted)]">
                Scope creep, yak shaving, rabbit holes. jot notices.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl font-bold mb-4">Get your first jot tonight</h2>
          <p className="text-[var(--muted)] mb-8">
            Connect GitHub. Pick a repo. That's it.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-[var(--foreground)] text-[var(--background)] px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <Github className="w-5 h-5" />
            Start free trial
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-[var(--muted)]">
          <div className="font-mono">jot</div>
          <div>Built for solo founders</div>
        </div>
      </footer>
    </div>
  );
}
