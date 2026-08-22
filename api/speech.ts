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
 * Handle GET requests for Edge CDN caching (7 days Vercel / Cloudflare edge cache)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const text = url.searchParams.get('text') || url.searchParams.get('input') || '';
    const voiceId = url.searchParams.get('voice_id') || url.searchParams.get('voice') || 'altair';
    const language = url.searchParams.get('language') || 'en';
    const withTimestamps = url.searchParams.get('with_timestamps') !== 'false';

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

    return await handleTtsSynthesis(req, text.trim(), voiceId, language, withTimestamps);
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

    return await handleTtsSynthesis(req, text.trim(), voiceId, language, withTimestamps);
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
 * Core synthesis helper with 7-day Edge Caching
 */
async function handleTtsSynthesis(
  req: Request,
  text: string,
  voiceId: string,
  language: string,
  withTimestamps: boolean
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

  // 7 Days Edge CDN Cache: 604800 seconds
  const edgeCacheHeaders = {
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
