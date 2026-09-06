export const maxDuration = 60;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, HTTP-Referer, X-Title',
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const apiKey =
      process.env.XKIRO_API_KEY ||
      process.env.VITE_XKIRO_API_KEY ||
      process.env.XTROUTER_API_KEY ||
      process.env.VITE_XTROUTER_API_KEY ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      'sk-xt-9312d096a3750766620ece3f79ecf6e13a26cb850ad6ca54';

    const baseUrl = (process.env.XKIRO_BASE_URL || process.env.VITE_XKIRO_BASE_URL || 'https://api.xkiro.com/v1').replace(/\/+$/, '');

    const requestHeaders: Record<string, string> = {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://avelut.xyz',
      'X-Title': 'Avelut AI (xKiro)',
    };

    const messages = body.messages || [];
    const model = process.env.XKIRO_MODEL || process.env.VITE_XKIRO_MODEL || body.model || 'qwen/qwen3.8-max:free';

    const payload: any = {
      model,
      messages,
      temperature: body.temperature ?? 0.7,
      max_tokens: body.max_tokens ?? 4096,
    };

    if (body.stream) {
      payload.stream = true;
      if (body.stream_options) {
        payload.stream_options = body.stream_options;
      }
    }

    if (body.response_format) {
      payload.response_format = body.response_format;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(payload),
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

    if (body.stream && response.body) {
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const data = await response.text();
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal xKiro Chat Proxy Error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
