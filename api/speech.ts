export const maxDuration = 30;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

const DEFAULT_KITTENML_API_KEY = 'sk_kitten_live_52b60a21556ae99d_Q2vLVOhqKuXnRM4nK-LmX8EMJvDQmftKK9Dj32ZP1KI';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const apiKey =
      process.env.KITTENML_API_KEY ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      DEFAULT_KITTENML_API_KEY;

    const response = await fetch('https://api.kittenml.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: body.model || 'kitten-tts-mini-0.8',
        voice: body.voice || 'Bella',
        input: body.input || '',
        response_format: body.response_format || 'wav',
        speed: body.speed || 1.0,
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

    const audioBuffer = await response.arrayBuffer();
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal TTS Proxy Error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
