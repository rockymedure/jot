---
name: jot-reflections
description: How jot generates daily reflections and comic strips from GitHub commits. Use when modifying reflection generation, comic creation, email delivery, or the Claude prompts that power jot.
---

# jot Reflections & Comics

This skill documents how jot generates daily reflections and comic strips from a founder's GitHub commits.

## System Overview

```
GitHub Commits → Claude Reflection → fal.ai Comic → Supabase Storage → Email + App
```

## Reflection Generation

### Trigger Points

Reflections are generated via three entry points:

| Entry Point | File | Use Case |
|-------------|------|----------|
| Cron job | `src/app/api/cron/generate-reflections/route.ts` | Hourly automated generation |
| Manual generate | `src/app/api/reflections/generate/route.ts` | First-time repo setup |
| Streaming | `src/app/api/reflections/stream/route.ts` | Real-time generation with thinking visible |

### Generation Flow

1. **Fetch commits** from all branches since last reflection
2. **Get commit details** (files changed, additions/deletions)
3. **Call Claude** with extended thinking enabled
4. **Generate comic** from reflection content
5. **Store** reflection + comic_url in database
6. **Send email** with comic at top
7. **Write to repo** (optional, `jot/YYYY-MM-DD.md`)

### Claude Prompts

Located in `src/lib/claude.ts`

**Tone**: Supportive, honest co-founder (not tough love)

#### Regular Reflection (`buildReflectionPrompt`)
```markdown
## What You Did
[Acknowledge accomplishments]

## Observations
[Honest perspective on the work]

## Questions for Tomorrow
[Thoughtful questions to consider]
```

#### Quiet Day Reflection (`buildQuietDayPrompt`)
When there are no commits, jot still sends a brief, warm reflection:
```markdown
## A Quiet Day
[2-3 sentences acknowledging and normalizing]

## Worth Thinking About
[One gentle question or prompt]
```

Both include a hidden summary tag for dashboard cards:
```markdown
<!-- summary: One-line summary here -->
```

## Comic Generation

### Architecture

```
Reflection Content → fal.ai (Nano Banana Pro) → Download → Supabase Storage → Permanent URL
```

### Key File

`src/lib/fal.ts`

### Functions

| Function | Purpose |
|----------|---------|
| `generateComic(reflection, reflectionId?)` | Main entry point |
| `buildCreativePrompt(reflection)` | Creates the image generation prompt |
| `uploadToStorage(imageUrl, filename)` | Saves to Supabase for permanent URL |

### Comic Style

- Black and white with clean lines
- 1-6 panels (AI chooses based on content complexity)
- Captures emotional truth, not literal commits
- Speech bubbles with punchy dialogue

### Storage

Comics are stored in Supabase Storage bucket `comics` with public read access:
```
https://[project].supabase.co/storage/v1/object/public/comics/[filename].png
```

## Email Delivery

### File

`src/lib/email.ts`

### Structure

```
[Comic Image - full width, no border]
[Greeting]
[Reflection content as HTML]
[Footer with dashboard links]
```

### Key Points

- Comic appears first (before content)
- No rounded corners on comic
- No section header for comic
- Same comic URL used in email and app

## Database Schema

```sql
-- reflections table
comic_url text  -- Permanent Supabase Storage URL
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API for reflections |
| `FAL_KEY` | fal.ai for comic generation |
| `RESEND_API_KEY` | Email delivery |

## Modifying the System

### To change reflection tone

Edit `buildReflectionPrompt()` in `src/lib/claude.ts`

### To change comic style

Edit `buildCreativePrompt()` in `src/lib/fal.ts`

### To change email layout

Edit `sendReflectionEmail()` in `src/lib/email.ts`

### To add new reflection sections

1. Update the prompt in `claude.ts`
2. Update email HTML in `email.ts`
3. Update app display in `src/app/reflections/[id]/page.tsx`
