import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

i18next.use(HttpBackend).use(LanguageDetector).use(initReactI18next).init({
    backend: {
        loadPath: `${process.env.PUBLIC_URL}/locales/{{lng}}/{{ns}}.json`
    },
    detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage']
    },
    react: {
        useSuspense: false
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'ru'],
    debug: process.env.NODE_ENV !== 'production',
    interpolation: {
        escapeValue: false // not needed for react as it escapes by default
    }
});

export default i18next;