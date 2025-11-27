'use client';

import { useState } from 'react';
import ImageUploader from '@/components/ImageUploader';
import PromptInput from '@/components/PromptInput';
import ResultDisplay from '@/components/ResultDisplay';

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBackgroundRemoval = (text: string) =>
    /remove\s+(the\s+)?background|background\s+removal|transparent\s+background/i.test(text);
  const isBlackAndWhite = (text: string) =>
    /black\s*and\s*white|grayscale|greyscale|mono(chrome)?/i.test(text);
  const isWarm = (text: string) => /warm|sunset|golden\s+hour/i.test(text);
  const isWatercolor = (text: string) => /water\s*color|watercolor/i.test(text);

  const dataUrlToBlob = async (dataUrl: string) => {
    const response = await fetch(dataUrl);
    return response.blob();
  };

  const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read processed image'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read processed image'));
      reader.readAsDataURL(blob);
    });

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image for processing'));
      img.src = src;
    });

  const canvasToDataUrl = (draw: (ctx: CanvasRenderingContext2D, img: HTMLImageElement) => void) => {
    return (img: HTMLImageElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      draw(ctx, img);
      return canvas.toDataURL('image/png');
    };
  };

  const applyGrayscale = canvasToDataUrl((ctx, img) => {
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
    ctx.putImageData(imageData, 0, 0);
  });

  const applyWarmTone = canvasToDataUrl((ctx, img) => {
    ctx.filter = 'saturate(1.15) contrast(1.05)';
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255, 142, 74, 0.28)';
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.globalCompositeOperation = 'source-over';
  });

  const applyWatercolor = canvasToDataUrl((ctx, img) => {
    ctx.filter = 'saturate(1.25) contrast(0.9) blur(0.6px)';
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(245, 235, 220, 0.18)';
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.globalCompositeOperation = 'source-over';
  });

  const runLocalTransform = async (imageDataUrl: string, text: string) => {
    if (!(isBlackAndWhite(text) || isWarm(text) || isWatercolor(text))) {
      return null;
    }
    const img = await loadImage(imageDataUrl);
    if (isBlackAndWhite(text)) return applyGrayscale(img);
    if (isWarm(text)) return applyWarmTone(img);
    if (isWatercolor(text)) return applyWatercolor(img);
    return null;
  };

  const handleEdit = async () => {
    if (!image || !prompt.trim()) {
      setError('Please upload an image and enter a command');
      return;
    }

    const normalizedPrompt = prompt.trim();
    setLoading(true);
    setError(null);
    let localFailure: string | null = null;

    // Try to satisfy background removal locally to avoid provider limits.
    if (isBackgroundRemoval(normalizedPrompt)) {
      try {
        const mod = await import('@imgly/background-removal');
        const removeBackground =
          (mod as { removeBackground?: (src: Blob | string) => Promise<Blob> }).removeBackground ||
          (mod as { default?: (src: Blob | string) => Promise<Blob> }).default;

        if (!removeBackground || typeof removeBackground !== 'function') {
          throw new Error('Local removeBackground helper missing');
        }

        const sourceBlob = await dataUrlToBlob(image);
        const processedBlob = await removeBackground(sourceBlob);
        const processedDataUrl = await blobToDataUrl(processedBlob);
        setResult(processedDataUrl);
        setLoading(false);
        return;
      } catch (err) {
        console.error('Local background removal failed', err);
        localFailure = err instanceof Error ? err.message : 'Local background removal failed';
        // Fall through to the API providers as a backup.
      }
    }

    // Try simple local transforms (grayscale, warm tone, watercolor) before remote providers.
    if (!isBackgroundRemoval(normalizedPrompt)) {
      try {
        const localResult = await runLocalTransform(image, normalizedPrompt);
        if (localResult) {
          setResult(localResult);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('Local transform failed', err);
        const message = err instanceof Error ? err.message : 'Local transform failed';
        localFailure = localFailure ? `${localFailure}; ${message}` : message;
      }
    }

    try {
      const response = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, prompt: normalizedPrompt }),
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const payload = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        const message =
          isJson && (payload as { error?: string })?.error
            ? (payload as { error?: string }).error
            : typeof payload === 'string'
              ? payload
              : 'Failed to process image';
        throw new Error(message);
      }

      const result = isJson
        ? (payload as { result?: string }).result
        : typeof payload === 'string'
          ? payload
          : null;

      if (!result) {
        throw new Error('No result returned from the API');
      }

      setResult(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      const combined = localFailure ? `${message} (Local background removal also failed: ${localFailure})` : message;
      setError(combined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-800 mb-4">
            ✨ AI Image Editor
          </h1>
          <p className="text-gray-600 text-lg">
            Transform your images with natural language commands
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8">
          {/* Image Upload Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">
              1️⃣ Upload Image
            </h2>
            <ImageUploader onUpload={setImage} />
          </div>

          {/* Prompt Input Section */}
          {image && (
            <div className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-700">
                2️⃣ Enter Command
              </h2>
              <PromptInput
                value={prompt}
                onChange={setPrompt}
                onSubmit={handleEdit}
                disabled={loading}
              />
            </div>
          )}

          {/* Action Button */}
          {image && prompt && (
            <button
              onClick={handleEdit}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold text-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                '🚀 Apply AI Magic'
              )}
            </button>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Result Section */}
        {result && (
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-2xl font-semibold mb-6 text-gray-700">
              ✅ Result
            </h2>
            <ResultDisplay original={image} result={result} />
          </div>
        )}

        {/* Instructions */}
        {!image && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h3 className="text-xl font-semibold mb-4 text-gray-700">
              💡 Try These Commands:
            </h3>
            <ul className="space-y-2 text-gray-600">
              <li>✂️ &quot;Remove background&quot;</li>
              <li>🎨 &quot;Change to black and white&quot;</li>
              <li>🌅 &quot;Add sunset lighting&quot;</li>
              <li>🖼️ &quot;Make it look like a painting&quot;</li>
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
