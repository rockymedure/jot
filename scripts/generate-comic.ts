import { config } from "dotenv";
import { fal } from "@fal-ai/client";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
config({ path: ".env.local" });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FAL_KEY = process.env.FAL_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not found in .env.local");
  process.exit(1);
}

if (!FAL_KEY) {
  console.error("FAL_KEY not found in .env.local");
  process.exit(1);
}

// Configure fal
fal.config({
  credentials: FAL_KEY,
});

interface ComicResult {
  imageUrl: string;
  prompt: string;
  panelDescriptions: string[];
}

function buildCreativePrompt(reflection: string): string {
  return `You are the creative director for a daily comic strip called "jot" — a visual journal for solo founders building in public.

THE CONTEXT:
jot is an AI co-founder that reads a developer's GitHub commits each day and writes them a blunt, honest reflection about what they accomplished. Now you're adding the visual layer — a comic that captures the emotional truth of their day.

TODAY'S REFLECTION:
---
${reflection}
---

YOUR JOB:
Create a single black and white comic strip (6 panels, 2 rows of 3) that tells the emotional story of this day. Not a literal translation of the commits — capture the FEELING. The humor. The struggle. The small victories. The existential moments at 11 PM wondering if any of this matters.

Think like a cartoonist who's lived this life. What moment made them laugh? What made them want to flip the table? What quiet realization hit at the end?

STYLE:
- Simple, expressive cartoon characters (not photorealistic)
- Black and white with clean lines
- Speech bubbles with short, punchy dialogue
- Visual storytelling that works even without words
- The kind of comic a developer would screenshot and share

You have full creative freedom. Make something that connects.`;
}

async function generateComic(reflection: string): Promise<ComicResult> {
  const prompt = buildCreativePrompt(reflection);

  console.log("🎬 Handing full creative control to Nano Banana Pro...\n");
  console.log("📜 Creative brief (first 500 chars):");
  console.log(`   ${prompt.substring(0, 500).replace(/\n/g, "\n   ")}...\n`);

  console.log("⏳ Generating comic...\n");

  // Give Nano Banana Pro full creative freedom
  const result = await fal.subscribe("fal-ai/nano-banana-pro", {
    input: {
      prompt: prompt,
      aspect_ratio: "16:9", // Wide format for comic strip
      output_format: "png",
      resolution: "2K", // Higher res for detail
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS" && update.logs) {
        update.logs.forEach((log) => console.log(`   ${log.message}`));
      }
    },
  });

  const imageUrl = (result.data as { images: { url: string }[] }).images[0].url;

  console.log("✅ Comic generated!", imageUrl);

  return {
    imageUrl,
    prompt,
    panelDescriptions: [], // Nano is the creative director now
  };
}

async function downloadImage(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  console.log(`💾 Saved to ${outputPath}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Default: use today's reflection or the most recent one
    const jotDir = path.join(process.cwd(), "jot");
    const files = fs.readdirSync(jotDir).filter((f) => f.endsWith(".md"));
    files.sort().reverse();

    if (files.length === 0) {
      console.error("No reflection files found in jot/");
      process.exit(1);
    }

    const reflectionPath = path.join(jotDir, files[0]);
    console.log(`📖 Using reflection: ${files[0]}\n`);

    const reflection = fs.readFileSync(reflectionPath, "utf-8");
    const result = await generateComic(reflection);

    // Save the image
    const outputDir = path.join(process.cwd(), "jot", "comics");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const date = files[0].replace(".md", "");
    const outputPath = path.join(outputDir, `${date}.png`);
    await downloadImage(result.imageUrl, outputPath);
  } else if (args[0] === "--all") {
    // Generate comics for all reflections
    const jotDir = path.join(process.cwd(), "jot");
    const files = fs
      .readdirSync(jotDir)
      .filter((f) => f.endsWith(".md"))
      .sort();

    const outputDir = path.join(process.cwd(), "jot", "comics");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const file of files) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`📖 Processing: ${file}\n`);

      const reflection = fs.readFileSync(path.join(jotDir, file), "utf-8");
      const result = await generateComic(reflection);

      const date = file.replace(".md", "");
      const outputPath = path.join(outputDir, `${date}.png`);
      await downloadImage(result.imageUrl, outputPath);
    }
  } else {
    // Use provided file path
    const reflectionPath = args[0];
    const reflection = fs.readFileSync(reflectionPath, "utf-8");
    const result = await generateComic(reflection);

    const outputDir = path.join(process.cwd(), "jot", "comics");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const basename = path.basename(reflectionPath, ".md");
    const outputPath = path.join(outputDir, `${basename}.png`);
    await downloadImage(result.imageUrl, outputPath);
  }
}

main().catch(console.error);
