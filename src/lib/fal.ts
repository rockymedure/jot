import { fal } from "@fal-ai/client";

// Configure fal with API key
fal.config({
  credentials: process.env.FAL_KEY,
});

/**
 * Build the creative prompt for comic generation
 * Gives Nano Banana Pro full creative control with context
 */
function buildCreativePrompt(reflection: string): string {
  return `You are the creative director for a daily comic strip called "jot" — a visual journal for solo founders building in public.

THE CONTEXT:
jot is an AI co-founder that reads a developer's GitHub commits each day and writes them a blunt, honest reflection about what they accomplished. Now you're adding the visual layer — a comic that captures the emotional truth of their day.

TODAY'S REFLECTION:
---
${reflection}
---

YOUR JOB:
Create a single black and white comic strip that tells the emotional story of this day. Not a literal translation of the commits — capture the FEELING. The humor. The struggle. The small victories. The existential moments at 11 PM wondering if any of this matters.

PANEL COUNT (your choice, 1-6):
- 1 panel: A single powerful moment that says it all
- 2-3 panels: A quick beat, setup → punchline
- 4-6 panels: A full narrative arc with emotional journey

Choose the panel count based on the reflection's complexity:
- Simple day with one theme? Maybe 2-3 panels.
- Epic saga of wins and disasters? Go for 6.
- One devastating realization? A single panel might hit hardest.

Think like a cartoonist who's lived this life. What moment made them laugh? What made them want to flip the table? What quiet realization hit at the end?

STYLE:
- Simple, expressive cartoon characters (not photorealistic)
- Black and white with clean lines
- Speech bubbles with short, punchy dialogue
- Visual storytelling that works even without words
- The kind of comic a developer would screenshot and share

You have full creative freedom. Make something that connects.`;
}

/**
 * Generate a comic strip from a reflection using Nano Banana Pro
 * Returns the URL of the generated comic image
 */
export async function generateComic(reflection: string): Promise<string | null> {
  if (!process.env.FAL_KEY) {
    console.log("[COMIC] FAL_KEY not configured, skipping comic generation");
    return null;
  }

  try {
    console.log("[COMIC] Generating comic with Nano Banana Pro...");
    const prompt = buildCreativePrompt(reflection);

    const result = await fal.subscribe("fal-ai/nano-banana-pro", {
      input: {
        prompt: prompt,
        aspect_ratio: "16:9",
        output_format: "png",
        resolution: "2K",
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS" && update.logs) {
          update.logs.forEach((log) => console.log(`[COMIC] ${log.message}`));
        }
      },
    });

    const imageUrl = (result.data as { images: { url: string }[] }).images[0]?.url;
    
    if (imageUrl) {
      console.log("[COMIC] Comic generated successfully:", imageUrl);
      return imageUrl;
    }

    console.log("[COMIC] No image URL in response");
    return null;
  } catch (error) {
    console.error("[COMIC] Error generating comic:", error);
    return null;
  }
}
