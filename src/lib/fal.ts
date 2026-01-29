import { fal } from "@fal-ai/client";
import { createServiceClient } from "./supabase/service";

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
 * Upload image to Supabase Storage and return permanent public URL
 */
async function uploadToStorage(imageUrl: string, filename: string): Promise<string | null> {
  try {
    console.log("[COMIC] Downloading image from fal.ai...");
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error("[COMIC] Failed to download image:", response.status);
      return null;
    }
    
    const buffer = await response.arrayBuffer();
    const supabase = createServiceClient();
    
    console.log("[COMIC] Uploading to Supabase Storage...");
    const { error: uploadError } = await supabase.storage
      .from("comics")
      .upload(filename, buffer, {
        contentType: "image/png",
        upsert: true,
      });
    
    if (uploadError) {
      console.error("[COMIC] Upload error:", uploadError);
      return null;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("comics")
      .getPublicUrl(filename);
    
    console.log("[COMIC] Uploaded to storage:", publicUrl);
    return publicUrl;
  } catch (error) {
    console.error("[COMIC] Storage upload error:", error);
    return null;
  }
}

// Timeout for fal.ai comic generation (60 seconds)
const COMIC_GENERATION_TIMEOUT_MS = 60 * 1000;

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeout]);
}

/**
 * Generate a comic strip from a reflection using Nano Banana Pro
 * Returns the permanent URL of the generated comic image (stored in Supabase)
 */
export async function generateComic(reflection: string, reflectionId?: string): Promise<string | null> {
  if (!process.env.FAL_KEY) {
    console.log("[COMIC] FAL_KEY not configured, skipping comic generation");
    return null;
  }

  try {
    console.log("[COMIC] Generating comic with Nano Banana Pro...");
    const prompt = buildCreativePrompt(reflection);

    const generatePromise = fal.subscribe("fal-ai/nano-banana-pro", {
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

    const result = await withTimeout(
      generatePromise,
      COMIC_GENERATION_TIMEOUT_MS,
      `Comic generation timed out after ${COMIC_GENERATION_TIMEOUT_MS / 1000}s`
    );

    const tempImageUrl = (result.data as { images: { url: string }[] }).images[0]?.url;
    
    if (!tempImageUrl) {
      console.log("[COMIC] No image URL in response");
      return null;
    }

    console.log("[COMIC] Comic generated, uploading to permanent storage...");
    
    // Generate unique filename
    const timestamp = Date.now();
    const filename = reflectionId 
      ? `${reflectionId}.png`
      : `comic-${timestamp}.png`;
    
    // Upload to Supabase Storage for permanent URL
    const permanentUrl = await uploadToStorage(tempImageUrl, filename);
    
    if (permanentUrl) {
      console.log("[COMIC] Comic saved permanently:", permanentUrl);
      return permanentUrl;
    }
    
    // Fallback to temporary URL if storage upload fails
    console.log("[COMIC] Storage upload failed, using temporary URL");
    return tempImageUrl;
  } catch (error) {
    console.error("[COMIC] Error generating comic:", error);
    return null;
  }
}
