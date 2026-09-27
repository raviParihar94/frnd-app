export const SUPPORTED_LANGUAGES = [
  'hi',
  'en',
  'te',
  'ta',
  'kn',
  'mr',
  'pa',
  'bho',
] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  hi: 'Hindi',
  en: 'English',
  te: 'Telugu',
  ta: 'Tamil',
  kn: 'Kannada',
  mr: 'Marathi',
  pa: 'Punjabi',
  bho: 'Bhojpuri',
};
