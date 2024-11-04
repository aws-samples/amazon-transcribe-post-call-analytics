import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslations from './en/en.json';
import esTranslations from './es/es.json';

const resources = {
  en: {
    translation: enTranslations
  },
  es: {
    translation: esTranslations
  }
};

const preferredLanguage = localStorage.getItem('language') || 'es';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: preferredLanguage,
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;