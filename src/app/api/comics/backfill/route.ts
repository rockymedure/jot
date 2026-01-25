import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateComic } from '@/lib/fal'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

/**
 * Backfill comics for all reflections that don't have one
 * Protected by CRON_SECRET
 * 
 * GET /api/comics/backfill - generates comics for all reflections without comic_url
 * GET /api/comics/backfill?limit=5 - limit to first N reflections
 * GET /api/comics/backfill?force=true - regenerate all comics (even existing ones)
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

    console.log(`[BACKFILL] Processing ${reflections?.length || 0} reflections`)

    const results = {
      total: reflections?.length || 0,
      success: 0,
      failed: 0,
      skipped: 0,
    }

    for (const reflection of reflections || []) {
      try {
        // Skip if already has comic and not forcing
        if (reflection.comic_url && !force) {
          results.skipped++
          continue
        }

        console.log(`[BACKFILL] Generating comic for reflection ${reflection.id}`)
        
        const comicUrl = await generateComic(reflection.content)

        if (comicUrl) {
          await supabase
            .from('reflections')
            .update({ comic_url: comicUrl })
            .eq('id', reflection.id)

          console.log(`[BACKFILL] ✅ Comic saved for ${reflection.id}`)
          results.success++
        } else {
          console.log(`[BACKFILL] ⚠️ No comic generated for ${reflection.id}`)
          results.failed++
        }
      } catch (error) {
        console.error(`[BACKFILL] ❌ Error for ${reflection.id}:`, error)
        results.failed++
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    })

  } catch (error) {
    console.error('Backfill error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
