export const maxDuration = 45;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-DashScope-WorkSpace',
    },
  });
}

/**
 * Handle GET requests for Edge CDN caching
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
    return new Response(JSON.stringify({ error: err.message || 'Internal TTS Proxy Error' }), {
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

    const MAX_TTS_CHARS = 9000;
    if (text.length > MAX_TTS_CHARS) {
      return new Response(
        JSON.stringify({ error: `Text too long for single TTS synthesis (${text.length} chars, max ${MAX_TTS_CHARS}).` }),
        {
          status: 413,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    return await handleTtsSynthesis(req, text.trim(), voiceId, language, withTimestamps, isPrivate);
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

/**
 * Core synthesis helper:
 * 1. Tries xAI TTS if XAI_API_KEY is configured.
 * 2. Seamlessly falls back to Alibaba Cloud DashScope TTS (qwen3-tts-flash / CosyVoice)
 *    and converts to base64 audio response with duration and character timestamps.
 */
async function handleTtsSynthesis(
  req: Request,
  text: string,
  voiceId: string,
  language: string,
  withTimestamps: boolean,
  isPrivate = false
) {
  const xaiApiKey =
    process.env.XAI_API_KEY ||
    process.env.GROK_API_KEY ||
    process.env.VITE_XAI_API_KEY;

  if (xaiApiKey) {
    try {
      const response = await fetch('https://api.x.ai/v1/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${xaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice_id: voiceId || 'altair',
          language: language || 'en',
          with_timestamps: withTimestamps,
        }),
      });

      if (response.ok) {
        const payload = await response.json();
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch (_) {
      // Fall through to DashScope TTS
    }
  }

  // Alibaba Cloud DashScope TTS
  const alibabaKey =
    process.env.ALIBABA_API_KEY ||
    process.env.VITE_ALIBABA_API_KEY ||
    'sk-ws-H.DDDDYYH.77I2.MEUCIQDFmMXN1sJiSo1GSM17A-65_s-fgtJY_BICS4RqTZXM4QIgclZDSyfzQqiHHQHlnAFWiu_9RIcJNvaM2TgL7kBRr9E';

  const workspaceId =
    process.env.ALIBABA_WORKSPACE_ID ||
    process.env.VITE_ALIBABA_WORKSPACE_ID ||
    'ws-o3v6mh0i8y9tqdfx';

  const baseUrl =
    process.env.ALIBABA_DASHSCOPE_URL ||
    process.env.VITE_ALIBABA_DASHSCOPE_URL ||
    'https://ws-o3v6mh0i8y9tqdfx.ap-southeast-1.maas.aliyuncs.com/api/v1';

  const alibabaVoice = mapToAlibabaVoice(voiceId);

  const dashscopeRes = await fetch(
    `${baseUrl.replace(/\/+$/, '')}/services/aigc/multimodal-generation/generation`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${alibabaKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-WorkSpace': workspaceId,
      },
      body: JSON.stringify({
        model: 'qwen3-tts-flash',
        input: {
          text: text.trim(),
          voice: alibabaVoice,
          language_type: 'English',
        },
      }),
    }
  );

  if (!dashscopeRes.ok) {
    const errBody = await dashscopeRes.text();
    return new Response(JSON.stringify({ error: `TTS Synthesis error: ${errBody}` }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const dsData = await dashscopeRes.json();
  const audioUrl = dsData?.output?.audio?.url || dsData?.output?.audio || '';

  if (!audioUrl) {
    return new Response(JSON.stringify({ error: 'Failed to obtain audio URL from TTS provider' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Fetch the synthesized audio binary and convert to base64
  const audioBinaryRes = await fetch(audioUrl);
  const arrayBuffer = await audioBinaryRes.arrayBuffer();
  const base64Audio = Buffer.from(arrayBuffer).toString('base64');

  // Estimate duration and generate synchronized timestamps
  const words = text.trim().split(/\s+/);
  const estimatedDuration = Math.max(2, words.length / 2.8);
  const graphChars = text.split('');
  const graphTimes: [number, number][] = graphChars.map((_, idx) => {
    const start = (idx / graphChars.length) * estimatedDuration;
    const end = ((idx + 1) / graphChars.length) * estimatedDuration;
    return [start, end];
  });

  const payload = {
    audio: base64Audio,
    content_type: 'audio/mp3',
    duration: estimatedDuration,
    audio_timestamps: {
      graph_chars: graphChars,
      graph_times: graphTimes,
    },
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': isPrivate ? 'no-store' : 'public, max-age=604800, s-maxage=604800, immutable',
    },
  });
}

function mapToAlibabaVoice(rawVoice?: string): string {
  if (!rawVoice) return 'Jennifer';
  const lower = rawVoice.toLowerCase().trim();
  if (lower.includes('altair') || lower.includes('male') || lower.includes('onyx') || lower.includes('echo')) {
    return 'Stanley';
  }
  if (lower.includes('nova') || lower.includes('shimmer') || lower.includes('female') || lower.includes('jennifer')) {
    return 'Jennifer';
  }
  return 'Jennifer';
}
