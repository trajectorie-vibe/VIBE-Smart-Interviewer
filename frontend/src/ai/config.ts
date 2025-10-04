/**
 * Central configuration file for AI model settings.
 * This file provides a single source of truth for AI model configurations
 * that can be imported throughout the application.
 * 
 * Model settings are loaded from environment variables with fallbacks.
 */

// Google upgraded Gemini model slugs in mid-2025; the older `gemini-1.5-flash` alias now 404s.
// Use the new `*-001` (stable) or `gemini-2.0-flash` (second generation) defaults unless overridden through env vars.
// Gemini 2.0 Flash is the latest model with multimodal input support, ideal for transcription
const DEFAULT_MODEL_FALLBACK = 'googleai/gemini-2.0-flash';
const TRANSCRIPTION_MODEL_FALLBACK = 'googleai/gemini-2.0-flash';
const SJT_MODEL_FALLBACK = 'googleai/gemini-2.0-flash';

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'googleai/gemini-1.5-flash': 'googleai/gemini-1.5-flash-001',
  'googleai/gemini-1.5-pro': 'googleai/gemini-1.5-pro-001',
  'gemini-1.5-flash': 'googleai/gemini-1.5-flash-001',
  'gemini-1.5-flash-latest': 'googleai/gemini-1.5-flash-latest',
  'gemini-1.5-pro': 'googleai/gemini-1.5-pro-001',
  'gemini-1.5-pro-latest': 'googleai/gemini-1.5-pro-latest',
  // Gemini 2.0 models (second generation)
  'gemini-2.0-flash': 'googleai/gemini-2.0-flash',
  'googleai/gemini-2.0-flash': 'googleai/gemini-2.0-flash',
};

function normalizeModelSlug(slug: string | undefined, fallback: string): string {
  if (!slug) return fallback;
  const trimmed = slug.trim();
  const withoutModelsPrefix = trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed;
  return LEGACY_MODEL_ALIASES[withoutModelsPrefix] || withoutModelsPrefix;
}

// Default model used for most operations - Using Gemini 2.0 Flash (second generation workhorse)
export const DEFAULT_MODEL = normalizeModelSlug(process.env.GEMINI_DEFAULT_MODEL, DEFAULT_MODEL_FALLBACK);

// Model specifically optimized for audio transcription - Gemini 2.0 Flash supports multimodal input
export const TRANSCRIPTION_MODEL = normalizeModelSlug(process.env.GEMINI_TRANSCRIPTION_MODEL, TRANSCRIPTION_MODEL_FALLBACK);

// Model used for SJT evaluation and analysis
export const SJT_EVALUATION_MODEL = normalizeModelSlug(process.env.GEMINI_SJT_EVALUATION_MODEL, SJT_MODEL_FALLBACK);

/**
 * Gets the appropriate model to use based on the task
 * @param task - The AI task being performed
 * @returns The model identifier to use
 */
export function getModelForTask(task: 'transcription' | 'sjt-evaluation' | 'default'): string {
  switch (task) {
    case 'transcription':
      return TRANSCRIPTION_MODEL;
    case 'sjt-evaluation':
      return SJT_EVALUATION_MODEL;
    default:
      return DEFAULT_MODEL;
  }
}

// Logger function removed to avoid client/server component conflicts
