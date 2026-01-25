"use client";

import { useState } from "react";
import { Github, ChevronRight } from "lucide-react";

const variants = [
  {
    headline: (
      <>
        Your day in code,
        <br />
        delivered to your inbox.
      </>
    ),
    subtext:
      "jot sends you a daily reflection on what you built, why it matters, and where to take things tomorrow.",
  },
  {
    headline: (
      <>
        Your AI co-founder,
        <br />
        in your inbox.
      </>
    ),
    subtext:
      "jot reads your commits every day and sends you a blunt, honest reflection. What you accomplished. What you're avoiding. The questions you should be asking.",
  },
  {
    headline: (
      <>
        See what you're building.
      </>
    ),
    subtext:
      "jot understands what you built today and why. Every morning, you get a reflection—what you accomplished, what it means for your project, and what to focus on next.",
  },
  {
    headline: (
      <>
        What should I build next?
      </>
    ),
    subtext:
      "jot understands your work and sends you a daily reflection. What you built. Why it matters. Where to go tomorrow. Weekly recaps show the shape of your project coming together.",
  },
  {
    headline: (
      <>
        Clarity, every morning.
      </>
    ),
    subtext:
      "jot understands what you built and why. You get a daily reflection on your progress and a clear sense of what to tackle next. Weekly summaries tie it all together.",
  },
  {
    headline: (
      <>
        Know what you built.
        <br />
        Know what's next.
      </>
    ),
    subtext:
      "jot sends you a daily reflection on your work—what you accomplished, why it matters, and where to focus tomorrow.",
  },
  {
    headline: (
      <>
        Finally see your own progress.
      </>
    ),
    subtext:
      "jot understands what you're building and sends you daily reflections. What you did, why it mattered, what's next. Weekly recaps show the bigger picture.",
  },
];

export function HeroToggle() {
  const [current, setCurrent] = useState(0);

  const next = () => {
    setCurrent((prev) => (prev + 1) % variants.length);
  };

  const variant = variants[current];

  return (
    <>
      {/* Hero Section */}
      <section className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight md:leading-snug mb-6">
          <span key={current} className="animate-fade-in">
            {variant.headline}
          </span>
        </h1>
        <p
          key={`sub-${current}`}
          className="text-lg text-[var(--muted)] mb-10 max-w-xl mx-auto animate-fade-in"
        >
          {variant.subtext}
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

      {/* FAB */}
      <button
        onClick={next}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[var(--foreground)] text-[var(--background)] rounded-full shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity z-50"
        title="Next headline variant"
      >
        <span className="text-sm font-mono font-bold">{current + 1}/{variants.length}</span>
      </button>
    </>
  );
}
