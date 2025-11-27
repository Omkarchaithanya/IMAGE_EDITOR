# AI Image Editor (Next.js)

Transform images with natural language commands. Common edits (background removal, black & white, warm tone, watercolor-style) run locally in the browser; other prompts fall back to cloud providers when available.

## Stack
- Next.js (App Router) + React + TypeScript
- Client-side canvas effects + `@imgly/background-removal` (WASM/ONNX) for local edits
- Provider adapters: OpenAI, Gemini, Replicate, fal (best-effort, first-success wins)

## Quick Start
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Environment
Create `.env.local` with any providers you want to enable:
```
OPENAI_API_KEY=your-openai-key
GEMINI_API_KEY=your-gemini-key
REPLICATE_API_TOKEN=your-replicate-key
FAL_KEY=your-fal-key
# Optional: force one provider
IMAGE_API_PROVIDER=openai|gemini|fal|replicate
```
If no paid providers succeed, local effects still work for the supported commands.

## How It Works
- `app/page.tsx`: uploads, prompt input, local processing (background removal via WASM, grayscale, warm tone, watercolor), then POSTs to `/api/edit` if needed.
- `app/api/edit/route.ts`: tries available providers in order and returns the first successful image URL/data URI; errors are aggregated for visibility.
- `components/*`: `Image Uploader`, `Prompt Input`, `Result Display`.

## Common Commands
- Local: “remove background”, “make it black and white”, “add warm sunset lighting”, “turn into a watercolor painting”.
- Other prompts will call the configured providers (requires credits/limits on your accounts).

## Notes
- First local background removal may take a moment to download WASM/ONNX assets.
- Lint may warn about `<img>` usage; keep or swap to `next/image` if desired.
- Only few feature are available ( like : remove background, make it black and white, add warm sunset lighting, turn into a watercolor            painting) Due to limit usage of API 
