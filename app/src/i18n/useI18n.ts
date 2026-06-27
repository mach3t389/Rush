import { useTranslation } from 'react-i18next';

/**
 * Custom hook to access translations.
 * Usage: const { t, i18n } = useI18n();
 * Then use: t('nav.dashboard') to get the translated string
 */
export function useI18n() {
  return useTranslation();
}

export default useI18n;
