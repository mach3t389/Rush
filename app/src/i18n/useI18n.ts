import { useTranslation } from 'react-i18next';

/**
 * Custom hook to access translations.
 * Usage: const { t, i18n } = useI18n();
 * Then use: t('nav.dashboard') to get the translated string
 */
export function useI18n() {
  return useTranslation();
}

/** Maps the app's active language to a Web Speech API locale, for default dictation voice. */
export function defaultSpeechLang(lang: string): string {
  return lang.startsWith('en') ? 'en-US' : 'fr-FR';
}

export default useI18n;
