import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateComic } from '@/lib/fal'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

// Process comics in parallel with concurrency limit
const DEFAULT_CONCURRENCY = 5

/**
 * Backfill comics for all reflections that don't have one
 * Protected by CRON_SECRET
 * 
 * GET /api/comics/backfill - generates comics for all reflections without comic_url
 * GET /api/comics/backfill?limit=10 - limit to first N reflections
 * GET /api/comics/backfill?force=true - regenerate all comics (even existing ones)
 * GET /api/comics/backfill?concurrency=3 - control parallel requests (default 5)
 */
export async function GET(request: Request) {
  // Verify authorization
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '100')
  const force = searchParams.get('force') === 'true'
  const concurrency = Math.min(parseInt(searchParams.get('concurrency') || String(DEFAULT_CONCURRENCY)), 10)

  const supabase = createServiceClient()

  try {
    // Get reflections that need comics
    let query = supabase
      .from('reflections')
      .select('id, content, comic_url')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!force) {
      query = query.is('comic_url', null)
    }

    const { data: reflections, error } = await query

    if (error) {
      console.error('Error fetching reflections:', error)
      return NextResponse.json({ error: 'Failed to fetch reflections' }, { status: 500 })
    }

    // Filter out already processed if not forcing
    const toProcess = force 
      ? reflections || []
      : (reflections || []).filter(r => !r.comic_url)

    console.log(`[BACKFILL] Processing ${toProcess.length} reflections with concurrency ${concurrency}`)

    const results = {
      total: reflections?.length || 0,
      generated: 0,
      failed: 0,
      skipped: (reflections?.length || 0) - toProcess.length,
    }

    // Process in parallel batches
    async function processReflection(reflection: { id: string; content: string }) {
      try {
        console.log(`[BACKFILL] Generating comic for ${reflection.id}`)
        const comicUrl = await generateComic(reflection.content)

        if (comicUrl) {
          await supabase
            .from('reflections')
            .update({ comic_url: comicUrl })
            .eq('id', reflection.id)

          console.log(`[BACKFILL] ✅ Comic saved for ${reflection.id}`)
          return 'generated'
        } else {
          console.log(`[BACKFILL] ⚠️ No comic generated for ${reflection.id}`)
          return 'failed'
        }
      } catch (error) {
        console.error(`[BACKFILL] ❌ Error for ${reflection.id}:`, error)
        return 'failed'
      }
    }

    // Process with concurrency limit using chunked Promise.all
    for (let i = 0; i < toProcess.length; i += concurrency) {
      const batch = toProcess.slice(i, i + concurrency)
      console.log(`[BACKFILL] Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(toProcess.length / concurrency)}`)
      
      const batchResults = await Promise.all(batch.map(processReflection))
      
      for (const result of batchResults) {
        if (result === 'generated') results.generated++
        else results.failed++
      }
    }

    console.log(`[BACKFILL] Complete: ${results.generated} generated, ${results.failed} failed, ${results.skipped} skipped`)
    return NextResponse.json(results)

  } catch (error) {
    console.error('Backfill error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
