export const maxDuration = 30;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    },
  });
}

/**
 * Handle GET requests for Edge CDN caching (7 days Vercel / Cloudflare edge cache for studyguide)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const text = url.searchParams.get('text') || url.searchParams.get('input') || '';
    const voiceId = url.searchParams.get('voice_id') || url.searchParams.get('voice') || 'altair';
    const language = url.searchParams.get('language') || 'en';
    const withTimestamps = url.searchParams.get('with_timestamps') !== 'false';
    const source = url.searchParams.get('source') || '';
    const isPrivate = url.searchParams.get('is_private') === 'true' || 
                      url.searchParams.get('cache_scope') === 'private' || 
                      source === 'notebook';

    if (!text || !text.trim()) {
      return new Response(
        JSON.stringify({ error: 'Text prompt is required for TTS synthesis' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    return await handleTtsSynthesis(req, text.trim(), voiceId, language, withTimestamps, isPrivate);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal Grok TTS Proxy Error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

/**
 * Handle POST requests
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = body.text || body.input || '';
    if (!text || typeof text !== 'string' || !text.trim()) {
      return new Response(
        JSON.stringify({ error: 'Text prompt is required for TTS synthesis' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const voiceId = body.voice_id || body.voice || 'altair';
    const language = body.language || 'en';
    const withTimestamps = body.with_timestamps !== false;
    const source = body.source || '';
    const isPrivate = body.is_private === true || 
                      body.cache_scope === 'private' || 
                      source === 'notebook';

    return await handleTtsSynthesis(req, text.trim(), voiceId, language, withTimestamps, isPrivate);
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Grok TTS Proxy Error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

/**
 * Core synthesis helper:
 * - Study Guide voice tutorials: 7-day Public Edge CDN Cache shared across all students
 * - My Notebooks / Private notes: Private no-store Edge CDN headers (cached on user's device only)
 */
async function handleTtsSynthesis(
  req: Request,
  text: string,
  voiceId: string,
  language: string,
  withTimestamps: boolean,
  isPrivate = false
) {
  const apiKey =
    process.env.XAI_API_KEY ||
    process.env.GROK_API_KEY ||
    process.env.VITE_XAI_API_KEY ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'XAI_API_KEY is not configured on the server' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  const response = await fetch('https://api.x.ai/v1/tts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId || 'altair',
      language: language || 'en',
      with_timestamps: withTimestamps,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(errorText, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const payload = await response.json();

  // Edge CDN Cache headers:
  // - Study Guide: 7 Days Edge CDN Cache (604800s) shared across students
  // - Notebooks: Private no-store (student device only)
  const edgeCacheHeaders = isPrivate
    ? {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      }
    : {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400',
        'CDN-Cache-Control': 'public, max-age=604800',
        'Vercel-CDN-Cache-Control': 'public, max-age=604800',
      };

  const clientWantsBinary = req.headers.get('accept')?.includes('audio/') && !withTimestamps;
  if (clientWantsBinary && payload.audio) {
    const binaryString = atob(payload.audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Response(bytes.buffer, {
      status: 200,
      headers: {
        'Content-Type': payload.content_type || 'audio/mpeg',
        'Content-Length': bytes.byteLength.toString(),
        ...edgeCacheHeaders,
      },
    });
  }

  // Return full JSON payload with base64 audio and audio_timestamps
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...edgeCacheHeaders,
    },
  });
}
