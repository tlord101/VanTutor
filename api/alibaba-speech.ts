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
    const text = body.text || body.input || body.input?.text || '';
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

    const workspaceId =
      req.headers.get('x-dashscope-workspace') ||
      process.env.ALIBABA_WORKSPACE_ID ||
      process.env.VITE_ALIBABA_WORKSPACE_ID ||
      'ws-o3v6mh0i8y9tqdfx';

    const baseUrl =
      process.env.ALIBABA_DASHSCOPE_URL ||
      process.env.VITE_ALIBABA_DASHSCOPE_URL ||
      'https://ws-o3v6mh0i8y9tqdfx.ap-southeast-1.maas.aliyuncs.com/api/v1';

    const requestHeaders: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (workspaceId) {
      requestHeaders['X-DashScope-WorkSpace'] = workspaceId;
    }

    const voice = body.voice || 'Jennifer';
    const model = body.model || 'qwen3-tts-flash';

    const response = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/services/aigc/multimodal-generation/generation`,
      {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          model,
          input: {
            text: text.trim(),
            voice,
            language_type: 'English',
          },
        }),
      }
    );

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

    const data = await response.json();
    const audioUrl = data?.output?.audio?.url || data?.output?.audio || '';

    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: 'Alibaba TTS API returned no audio URL in output', raw: data }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to download audio file from ${audioUrl}` }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const arrayBuffer = await audioRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Audio = btoa(binary);

    return new Response(
      JSON.stringify({
        audio: base64Audio,
        content_type: 'audio/wav',
        audio_url: audioUrl,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=604800, s-maxage=604800',
        },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal Alibaba TTS Proxy Error' }),
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
