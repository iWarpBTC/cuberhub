import type { ReactNode } from 'react';
import bandUrl from '../assets/color-band-dark.svg';
import { useLanguage } from '../i18n/LanguageContext';
import { CHEATSHEET_TABS, TRAINING_SCREENS, routeHref, type CheatsheetTab, type Route, type Section } from '../lib/route';
import { useStore } from '../store/StoreContext';
import { APP_NAME, SECTION_ACCENT, SectionIcon, sectionRoute } from './sections';

interface Shortcut {
  label: string;
  title?: string;
  route: Route;
}

/** One section on the home page. The whole card opens it; the shortcuts jump to a part of it. */
function SectionCard({
  section,
  route,
  description,
  action,
  note,
  shortcuts = [],
}: {
  section: Section;
  route: Route;
  description: string;
  action: string;
  note?: ReactNode;
  shortcuts?: Shortcut[];
}) {
  const { t } = useLanguage();
  const accent = SECTION_ACCENT[section];
  return (
    <li className="relative flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-600 hover:bg-neutral-800/60">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ color: accent, backgroundColor: `${accent}26` }}>
          <SectionIcon section={section} className="h-5 w-5" />
        </span>
        <h2 className="text-lg font-semibold text-neutral-100">{t.nav[section]}</h2>
      </div>
      <p className="text-sm text-neutral-400">{description}</p>
      {note !== undefined && <p className="text-xs text-neutral-500">{note}</p>}
      {shortcuts.length > 0 && (
        <ul className="relative z-10 flex flex-wrap gap-1.5">
          {shortcuts.map(({ label, title, route: target }) => (
            <li key={label}>
              <a
                href={routeHref(target)}
                title={title}
                className="block rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500 hover:bg-neutral-800 hover:text-neutral-100"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      )}
      {/* Stretched over the card, under the shortcuts. */}
      <a
        href={routeHref(route)}
        className="mt-auto self-start rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 after:absolute after:inset-0 after:rounded-lg hover:bg-white"
      >
        {action} →
      </a>
    </li>
  );
}

/** The home page: what the app offers, each section one step away. */
export function Home({ cheatsheetTab }: { cheatsheetTab: CheatsheetTab }) {
  const { t } = useLanguage();
  const { scrambles, solves } = useStore();
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:gap-10 sm:py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="sr-only">{APP_NAME}</h1>
          <img src={bandUrl} alt="" width={212} height={56} className="h-auto w-44 sm:w-52" />
          <p className="text-lg text-balance text-neutral-200 sm:text-xl">{t.home.tagline}</p>
          <p className="max-w-xl text-xs text-balance text-neutral-500">{t.brand.colorBand}</p>
        </div>
        <ul className="grid gap-3 md:grid-cols-3">
          <SectionCard
            section="timer"
            route={sectionRoute('timer', cheatsheetTab)}
            description={t.home.timer.description}
            action={solves.length > 0 ? t.home.timer.continue : t.home.timer.start}
            note={scrambles.length > 0 ? `${t.scrambleCount(scrambles.length)} · ${t.solveCount(solves.length)}` : undefined}
          />
          <SectionCard
            section="cheatsheet"
            route={sectionRoute('cheatsheet', cheatsheetTab)}
            description={t.home.cheatsheet.description}
            action={t.home.cheatsheet.open}
            shortcuts={CHEATSHEET_TABS.map((tab) => ({ label: t.cheatsheet[tab], route: { page: 'cheatsheet', tab } }))}
          />
          <SectionCard
            section="training"
            route={sectionRoute('training', cheatsheetTab)}
            description={t.home.training.description}
            action={t.home.training.open}
            shortcuts={TRAINING_SCREENS.map((screen) => {
              const { name, tagline } = screen === 'trainer' ? t.dry.trainer : t.dry.modes[screen];
              return { label: name, title: tagline, route: { page: 'training', screen } };
            })}
          />
        </ul>
      </div>
    </main>
  );
}
