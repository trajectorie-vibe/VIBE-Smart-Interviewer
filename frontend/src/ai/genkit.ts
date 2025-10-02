import 'server-only';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { DEFAULT_MODEL } from './config';

let aiInstance: ReturnType<typeof genkit> | null = null;

// Lazy, server-only initializer to prevent import-time side effects
export function getAI() {
  if (aiInstance) return aiInstance;

  // Bridge environment variables once at first use: prefer GOOGLE_GENAI_API_KEY, accept fallbacks
  const hasNative = !!process.env.GOOGLE_GENAI_API_KEY;
  const fallback = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!hasNative && fallback) {
    // Do not log secrets; just note presence
    console.log('🔑 Using fallback AI key from GEMINI_API_KEY/GOOGLE_API_KEY for GOOGLE_GENAI_API_KEY');
    process.env.GOOGLE_GENAI_API_KEY = fallback;
  }

  aiInstance = genkit({
    plugins: [googleAI()],
    model: DEFAULT_MODEL,
  });
  return aiInstance;
}
