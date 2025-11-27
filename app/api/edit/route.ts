import { NextRequest, NextResponse } from 'next/server';
import fal from '@fal-ai/serverless-client';
import Replicate from 'replicate';

type Provider = 'openai' | 'fal' | 'replicate' | 'gemini';

const falKey = process.env.FAL_KEY;
const replicateToken = process.env.REPLICATE_API_TOKEN;
const openaiKey = process.env.OPENAI_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
const preferredEnv = process.env.IMAGE_API_PROVIDER?.toLowerCase() as Provider | undefined;

if (falKey) {
  fal.config({ credentials: falKey });
}

type ErrorLike = {
  response?: { data?: unknown };
  data?: unknown;
  details?: unknown;
};

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const extra =
      (err as ErrorLike)?.response?.data ||
      (err as ErrorLike)?.response ||
      (err as ErrorLike)?.data ||
      (err as ErrorLike)?.details;
    if (extra) {
      try {
        return `${err.message} | extra: ${JSON.stringify(extra)}`;
      } catch {
        return err.message;
      }
    }
    return err.message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

async function runReplicate(image: string, prompt?: string) {
  if (!replicateToken) {
    throw new Error('REPLICATE_API_TOKEN is missing.');
  }
  const replicate = new Replicate({ auth: replicateToken });
  const output = await replicate.run(
    'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
    { input: { image, prompt } }
  );
  const result = Array.isArray(output) ? output[0] : (output as string | undefined);
  if (!result) throw new Error('Replicate did not return a result');
  return result;
}

async function runFal(image: string, prompt?: string) {
  if (!falKey) {
    throw new Error('FAL_KEY is missing.');
  }
  const resolvedImageUrl = image.startsWith('http')
    ? image
    : await fal.storage.upload(image).then((res) => {
        if (typeof res === 'string') return res;
        if (res?.url) return res.url;
        throw new Error('Failed to upload image to fal storage');
      });

  const falResult = await fal.run('fal-ai/transparent-background', {
    input: {
      image_url: resolvedImageUrl,
      prompt,
    },
  });

  type FalResponse =
    | { data?: { image?: { url?: string } } }
    | { image?: { url?: string } }
    | { output?: { url?: string } };

  const resultUrl =
    (falResult as FalResponse)?.data?.image?.url ||
    (falResult as FalResponse)?.image?.url ||
    (falResult as FalResponse)?.output?.url;

  if (!resultUrl) throw new Error('fal.ai did not return an image URL');
  return resultUrl;
}

async function runOpenAI(prompt?: string) {
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY is missing.');
  }

  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: prompt || 'Photo with background removed',
      size: '1024x1024',
    }),
  });

  const contentType = resp.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await resp.json() : await resp.text();

  if (!resp.ok) {
    const msg =
      isJson && (payload as { error?: { message?: string } })?.error?.message
        ? (payload as { error?: { message?: string } }).error?.message
        : typeof payload === 'string'
          ? payload
          : 'OpenAI request failed';
    throw new Error(msg);
  }

  const result =
    (payload as { data?: { url?: string }[] })?.data?.[0]?.url ||
    (payload as { data?: { b64_json?: string }[] })?.data?.[0]?.b64_json;

  if (!result) throw new Error('OpenAI returned no image');

  const resultUrl = (payload as { data?: { url?: string }[] })?.data?.[0]?.url
    ? (payload as { data?: { url?: string }[] })?.data?.[0]?.url
    : `data:image/png;base64,${(payload as { data?: { b64_json?: string }[] })?.data?.[0]?.b64_json}`;

  return resultUrl;
}

async function runGemini(prompt?: string) {
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY is missing.');
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagegeneration:generate?key=${geminiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: {
          text: prompt || 'Create an image with the background removed',
        },
      }),
    }
  );

  const raw = await resp.text();
  const contentType = resp.headers.get('content-type') || '';
  const payload =
    contentType.includes('application/json') && raw
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        })()
      : raw;

  if (!resp.ok) {
    const msg =
      (payload as { error?: { message?: string } })?.error?.message ||
      (payload as { error?: string })?.error ||
      (typeof payload === 'string' && payload) ||
      'Gemini request failed';
    throw new Error(msg);
  }

  const base64 = (payload as { images?: { data?: string }[] })?.images?.[0]?.data;

  if (!base64) {
    const extra = typeof payload === 'string' ? ` Response: ${payload}` : '';
    throw new Error(`Gemini returned no image data.${extra}`);
  }

  return `data:image/png;base64,${base64}`;
}

export async function POST(req: NextRequest) {
  try {
    const { image, prompt, provider: bodyProvider } = (await req.json()) as {
      image?: string;
      prompt?: string;
      provider?: Provider;
    };

    if (!image) {
      return NextResponse.json({ error: 'Missing image' }, { status: 400 });
    }

    const requested = bodyProvider ?? preferredEnv;

    const available: Provider[] = [];
    if (requested && !available.includes(requested)) available.push(requested);
    if (openaiKey && !available.includes('openai')) available.push('openai');
    if (geminiKey && !available.includes('gemini')) available.push('gemini');
    if (falKey && !available.includes('fal')) available.push('fal');
    if (replicateToken && !available.includes('replicate')) available.push('replicate');

    const errors: string[] = [];

    for (const prov of available) {
      try {
        if (prov === 'openai') {
          const result = await runOpenAI(prompt);
          return NextResponse.json({ result, provider: prov });
        }
        if (prov === 'gemini') {
          const result = await runGemini(prompt);
          return NextResponse.json({ result, provider: prov });
        }
        if (prov === 'fal') {
          const result = await runFal(image, prompt);
          return NextResponse.json({ result, provider: prov });
        }
        if (prov === 'replicate') {
          const result = await runReplicate(image, prompt);
          return NextResponse.json({ result, provider: prov });
        }
      } catch (err) {
        const msg = formatError(err);
        errors.push(`${prov}: ${msg}`);
        // Continue to next provider
      }
    }

    return NextResponse.json(
      { error: `All providers failed: ${errors.join(' | ')}` },
      { status: 502 }
    );
  } catch (error) {
    const message = formatError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
