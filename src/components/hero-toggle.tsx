import { Github } from "lucide-react";

export function HeroToggle() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-24 text-center">
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight md:leading-snug mb-6">
        Your day in code,
        <br />
        delivered to your inbox.
      </h1>
      <p className="text-lg text-[var(--muted)] mb-10 max-w-xl mx-auto">
        jot sends you a daily reflection on what you built, why it matters, and where to take things tomorrow.
      </p>
      <a
        href="/api/auth/github"
        className="inline-flex items-center gap-2 bg-[var(--foreground)] text-[var(--background)] px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
      >
        <Github className="w-5 h-5" />
        Connect GitHub
      </a>
      <p className="text-sm text-[var(--muted)] mt-4">
        7-day free trial. Then $10/month.
      </p>
    </section>
  );
}
