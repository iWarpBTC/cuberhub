import { useLanguage } from '../i18n/LanguageContext';

/**
 * Which build this is, and a way to load the app again. An app on a phone's home screen has no reload
 * button, and loading again is how it gets a new release.
 */
export function BuildInfo({ className = '' }: { className?: string }) {
  const { t, lang } = useLanguage();
  const built = new Date(__BUILD__.date).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <p className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-neutral-600 ${className}`}>
      <span title={t.about.built(built)} className="font-mono">
        {t.about.build(__BUILD__.version, __BUILD__.commit)}
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        title={t.about.reloadTitle}
        className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100"
      >
        {t.about.reload}
      </button>
    </p>
  );
}
