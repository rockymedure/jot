---
name: jot-logo
description: Generate and use the jot brand logo and icon. Use when creating favicons, email avatars, OG images, or any visual asset that needs the jot logo mark. The logo is a lowercase "j" with a simple circular dot.
---

# jot Logo

The jot logo is a minimal, geometric lowercase "j" with a bold circular dot above it. It represents simplicity, developer focus, and the "jot down" metaphor.

## Logo Mark

The primary mark is a standalone "j" character designed for:
- Favicons (16x16, 32x32)
- App icons (180x180 for Apple touch)
- Email avatars (BIMI, Gravatar)
- Social profile images

### Generating the Logo

When generating the jot logo, use these parameters:

```
Style: Minimal, geometric, flat
Character: Lowercase "j" with circular dot
Font weight: Bold/heavy
Colors: Black (#000000) on white, or white on black
Background: Solid white (#FFFFFF) or transparent
Aspect ratio: Square (1:1)
```

Example prompt for image generation:

> A minimal favicon for "jot" app. Design: A bold lowercase letter "j" with a simple circular dot above it. Black letter on pure white background. Clean sans-serif font, centered in a square format. No borders, no shadows, no extra elements. Crisp, modern, tech aesthetic.

## Logo Files

Located in `/public/`:
- `favicon.png` - Browser favicon
- `apple-touch-icon.png` - iOS home screen
- `jot-bimi.svg` - BIMI email avatar (SVG Tiny PS format)

## BIMI SVG Requirements

For email avatars, BIMI requires SVG Tiny PS format:

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg version="1.2" baseProfile="tiny-ps" xmlns="http://www.w3.org/2000/svg" 
     viewBox="0 0 100 100" width="100" height="100">
  <title>jot</title>
  <rect width="100" height="100" fill="#FFFFFF"/>
  <g fill="#000000">
    <circle cx="50" cy="22" r="10"/>
    <rect x="42" y="36" width="16" height="40"/>
    <path d="M42 76 L42 82 Q42 92 32 92 L28 92 L28 84 L32 84 Q34 84 34 82 L34 76 Z"/>
  </g>
</svg>
```

## Wordmark

The full wordmark is "jot" in monospace font, used in:
- Headers and navigation
- Email signatures
- Marketing materials

```css
font-family: monospace;
font-weight: bold;
font-size: 24px;
```

## Usage Guidelines

1. **Minimum size**: 16px for digital, ensure dot remains visible
2. **Clear space**: Maintain padding equal to the dot's diameter
3. **No modifications**: Don't rotate, stretch, or add effects
4. **Color variants**: Black on light backgrounds, white on dark backgrounds
