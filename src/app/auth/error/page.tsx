import Link from "next/link"

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <Link href="/" className="font-mono text-xl font-bold">
            jot
          </Link>
        </div>
      </header>

      {/* Error message */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-2">
            Something went wrong
          </h1>
          <p className="text-[var(--muted)] mb-8">
            We couldn't sign you in. Please try again.
          </p>

          <Link
            href="/login"
            className="inline-flex items-center justify-center bg-[var(--foreground)] text-[var(--background)] px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Try again
          </Link>
        </div>
      </div>
    </div>
  )
}
