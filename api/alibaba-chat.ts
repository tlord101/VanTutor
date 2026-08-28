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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const apiKey =
      process.env.ALIBABA_API_KEY ||
      process.env.VITE_ALIBABA_API_KEY ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Alibaba Cloud DashScope API Key is not configured on the server' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const response = await fetch(
      'https://ws-o3v6mh0i8y9tqdfx.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen3.7-flash',
          messages: body.messages || [],
          temperature: body.temperature ?? 0.7,
          max_tokens: body.max_tokens ?? 4096,
        }),
      }
    );

    const errorTextOrData = await response.text();
    return new Response(errorTextOrData, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal Alibaba Chat Proxy Error' }),
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
