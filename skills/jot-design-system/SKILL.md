---
name: jot-design-system
description: The jot design system including colors, typography, spacing, and component patterns. Use when building UI for jot, creating marketing materials, or ensuring visual consistency across the product.
---

# jot Design System

jot is a minimal, developer-focused product. The design system reflects this: clean, functional, high-contrast, and respectful of the user's time.

## Colors

### CSS Variables

jot uses CSS custom properties for theming. Defined in `globals.css`:

```css
:root {
  --background: #ffffff;
  --foreground: #0a0a0a;
  --muted: #737373;
  --border: #e5e5e5;
  --surface: #fafafa;
}

[data-theme="dark"] {
  --background: #0a0a0a;
  --foreground: #fafafa;
  --muted: #a3a3a3;
  --border: #262626;
  --surface: #171717;
}
```

### Semantic Usage

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--background` | #ffffff | #0a0a0a | Page background |
| `--foreground` | #0a0a0a | #fafafa | Primary text, icons |
| `--muted` | #737373 | #a3a3a3 | Secondary text, metadata |
| `--border` | #e5e5e5 | #262626 | Dividers, card borders |
| `--surface` | #fafafa | #171717 | Cards, elevated surfaces |

### Accent Colors

Used sparingly for status and actions:

```css
/* Status */
--green: #22c55e;  /* Success, active states */
--amber: #f59e0b; /* Warnings, trial notices */
--red: #ef4444;   /* Errors, destructive actions */
--purple: #a855f7; /* AI thinking, generation */
```

## Typography

### Font Stack

```css
--font-geist-sans: "Geist", system-ui, sans-serif;
--font-geist-mono: "Geist Mono", monospace;
```

### Scale

| Element | Size | Weight | Font |
|---------|------|--------|------|
| H1 | 2xl (1.5rem) | Bold | Sans |
| H2 | xl (1.25rem) | Bold | Sans |
| Body | base (1rem) | Normal | Sans |
| Small | sm (0.875rem) | Normal | Sans |
| Code/Logo | varies | Bold | Mono |

### Brand Text

The "jot" wordmark always uses monospace:

```jsx
<span className="font-mono font-bold text-xl">jot</span>
```

## Spacing

Use Tailwind's spacing scale. Common patterns:

| Context | Value | Tailwind |
|---------|-------|----------|
| Page padding | 24px | `px-6` |
| Section gap | 32-40px | `py-10`, `mb-8` |
| Card padding | 16-32px | `p-4`, `p-8` |
| Item gap | 8-16px | `gap-2`, `gap-4` |

### Max Width

Content containers: `max-w-3xl` (48rem / 768px)
Wide layouts: `max-w-5xl` (64rem / 1024px)

## Components

### Buttons

Primary (CTA):
```jsx
<button className="bg-[var(--foreground)] text-[var(--background)] px-4 py-2 rounded-lg hover:opacity-90">
  Action
</button>
```

Secondary/Ghost:
```jsx
<button className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
  <Icon className="w-4 h-4" />
</button>
```

### Cards

```jsx
<div className="border border-[var(--border)] rounded-lg p-4 hover:border-[var(--foreground)] transition-colors">
  {/* content */}
</div>
```

### Inputs

```jsx
<input className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--foreground)]" />
```

## Iconography

Use Lucide React icons. Standard size: `w-4 h-4` or `w-5 h-5`.

Common icons:
- `Github` - Repo indicators
- `ArrowLeft` - Back navigation
- `Share2` - Share actions
- `Check` - Success states
- `X` - Close/dismiss
- `Loader2` - Loading (with `animate-spin`)

## Voice & Tone

jot's UI copy is:
- **Blunt**: No fluff or marketing speak
- **Direct**: Clear actions, minimal explanation
- **Respectful**: Value the user's time

Examples:
- ✓ "No commits today"
- ✗ "It looks like you haven't made any commits yet today!"
- ✓ "Upgrade to Pro"
- ✗ "Unlock premium features with our Pro plan!"

## Dark Mode

Theme is managed via:
1. `data-theme` attribute on `<html>`
2. Stored in `localStorage` as `jot-theme`
3. Respects system preference via `prefers-color-scheme`

Flash prevention script in `<head>` applies theme before render.
