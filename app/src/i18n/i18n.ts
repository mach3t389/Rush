import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import frTranslations from '../locales/fr.json';
import enTranslations from '../locales/en.json';

// Load saved language preference from localStorage, default to 'fr'
const savedLanguage = localStorage.getItem('language') || 'fr';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: frTranslations },
      en: { translation: enTranslations },
    },
    lng: savedLanguage,
    fallbackLng: 'fr',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

// Save language preference when it changes
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('language', lng);
});

export default i18n;
