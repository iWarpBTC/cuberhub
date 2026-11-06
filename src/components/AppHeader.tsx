import logoUrl from '../assets/logo-dark.svg';
import { useLanguage } from '../i18n/LanguageContext';
import { HOME, SECTIONS, routeHref, type CheatsheetTab, type Route } from '../lib/route';
import { APP_NAME, SECTION_ACCENT, SectionIcon, sectionRoute } from './sections';

/**
 * The bar on top of every page: the logo (a link home, and with its colour
 * band a standing reminder of the side colours), the sections and the
 * language switch. `dimmed` fades it while a solve is being timed.
 */
export function AppHeader({ route, cheatsheetTab, dimmed }: { route: Route; cheatsheetTab: CheatsheetTab; dimmed: boolean }) {
  const { t, lang, setLang } = useLanguage();
  return (
    <header
      className={`flex h-(--header-h) shrink-0 items-stretch border-b border-neutral-800 pr-2 transition-opacity duration-300 ${
        dimmed ? 'opacity-30' : ''
      }`}
    >
      {/* The file brings its own clear space; the margins take back what the bar doesn't need of it. */}
      <a
        href={routeHref(HOME)}
        aria-label={t.brand.home}
        aria-current={route.page === 'home' ? 'page' : undefined}
        title={t.brand.colorBand}
        className="-mr-2 -ml-3 shrink-0 rounded-md hover:brightness-125 sm:-ml-2"
      >
        <img src={logoUrl} alt={APP_NAME} width={360} height={188} className="h-full w-auto" />
      </a>
      <nav aria-label={t.nav.sections} className="flex min-w-0 items-stretch overflow-x-auto">
        {SECTIONS.map((section) => {
          const active = route.page === section;
          return (
            <a
              key={section}
              href={routeHref(sectionRoute(section, cheatsheetTab))}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-1.5 border-y-2 border-transparent px-2.5 text-sm whitespace-nowrap sm:px-3 ${
                active ? 'text-neutral-100' : 'text-neutral-400 hover:text-neutral-100'
              }`}
              style={active ? { borderBottomColor: SECTION_ACCENT[section] } : undefined}
            >
              <SectionIcon section={section} className="hidden h-5 w-5 sm:block" />
              {t.nav[section]}
            </a>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={() => setLang(lang === 'cs' ? 'en' : 'cs')}
        aria-label={t.switchLanguage}
        title={t.switchLanguage}
        className="ml-auto shrink-0 self-center rounded-md px-2.5 py-1.5 font-mono text-xs text-neutral-400 uppercase hover:bg-neutral-800 hover:text-neutral-100"
      >
        {lang === 'cs' ? 'EN' : 'CZ'}
      </button>
    </header>
  );
}
