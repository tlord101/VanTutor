/**
 * Voice Preview Generation & Cloud Upload Script
 * Synthesizes short preview audio clips for the 4 instructor voices using Alibaba Cloud Qwen3-TTS-Flash:
 * - Jennifer
 * - Aiden
 * - Kai
 * - Andre
 *
 * Saves files locally to public/assets/voices/ and uploads to Cloudflare R2 / CDN.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables from .env
const envPath = path.join(rootDir, '.env');
const env = {};
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      env[match[1]] = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const ALIBABA_API_KEY = env.VITE_ALIBABA_API_KEY || process.env.VITE_ALIBABA_API_KEY || process.env.ALIBABA_API_KEY;
const R2_WORKER_URL = env.VITE_CLOUDFLARE_R2_WORKER_URL || process.env.VITE_CLOUDFLARE_R2_WORKER_URL;

if (!ALIBABA_API_KEY) {
  console.error('❌ Error: VITE_ALIBABA_API_KEY not found in .env or environment.');
  process.exit(1);
}

const VOICES = [
  {
    id: 'jennifer',
    voiceName: 'Jennifer',
    text: "Hello! I'm Jennifer. Welcome to Avelut, your AI-powered university learning companion. Together, we'll break down complex topics step by step on our interactive whiteboard.",
  },
  {
    id: 'aiden',
    voiceName: 'Aiden',
    text: "Hey there! I'm Aiden. With Avelut, you get crystal-clear explanations, real-time diagrams, and instant answers to help you ace your courses with confidence.",
  },
  {
    id: 'kai',
    voiceName: 'Kai',
    text: "Hi, I'm Kai. Learning on Avelut is calm, intuitive, and tailored to your pace. Ask questions anytime as we visualize each concept together on Avelut.",
  },
  {
    id: 'andre',
    voiceName: 'Andre',
    text: "Greetings. I am Andre. On Avelut, we examine the foundational principles and analytical frameworks of your academic curriculum.",
  },
];

const outputDir = path.join(rootDir, 'public', 'assets', 'voices');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function synthesizeVoice(voiceConfig) {
  console.log(`\n🎙️ Synthesizing preview for: ${voiceConfig.voiceName} (${voiceConfig.id})...`);
  
  const endpoint = 'https://ws-o3v6mh0i8y9tqdfx.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ALIBABA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen3-tts-flash',
      input: {
        text: voiceConfig.text,
        voice: voiceConfig.voiceName,
        language_type: 'English',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Alibaba TTS API failed (HTTP ${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const audioUrl = result?.output?.audio?.url || result?.output?.audio;

  if (!audioUrl) {
    throw new Error(`No audio URL in Alibaba response: ${JSON.stringify(result)}`);
  }

  console.log(`  Downloading audio from CDN...`);
  const audioFetch = await fetch(audioUrl);
  if (!audioFetch.ok) {
    throw new Error(`Failed to download audio binary: ${audioFetch.statusText}`);
  }

  const buffer = Buffer.from(await audioFetch.arrayBuffer());
  const filePath = path.join(outputDir, `${voiceConfig.id}.mp3`);
  fs.writeFileSync(filePath, buffer);
  console.log(`  Saved to local storage: public/assets/voices/${voiceConfig.id}.mp3 (${(buffer.length / 1024).toFixed(1)} KB)`);

  // Optionally upload to Cloudflare R2
  if (R2_WORKER_URL) {
    try {
      console.log(`  Uploading to Cloudflare R2 storage...`);
      const r2UploadUrl = `${R2_WORKER_URL.replace(/\/+$/, '')}/upload?path=voices&fileName=${voiceConfig.id}.mp3`;
      const r2Res = await fetch(r2UploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/mpeg' },
        body: buffer,
      });

      if (r2Res.ok) {
        const r2Data = await r2Res.json();
        console.log(`  Uploaded to R2 CDN: ${r2Data.url || r2UploadUrl}`);
      }
    } catch (r2Err) {
      console.warn(`  (R2 upload note: ${r2Err.message})`);
    }
  }

  return filePath;
}

async function main() {
  console.log('=====================================================');
  console.log('🚀 AVELUT LIVE TUTORIAL VOICE PREVIEW GENERATOR');
  console.log('=====================================================');
  console.log(`Model: qwen3-tts-flash`);
  console.log(`Target Directory: ${outputDir}`);

  for (const voice of VOICES) {
    try {
      await synthesizeVoice(voice);
    } catch (err) {
      console.error(`❌ Failed for voice ${voice.voiceName}:`, err.message);
    }
  }

  console.log('\n Completed generating all 4 voice previews!');
}

main();
