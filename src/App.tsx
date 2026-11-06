import { useCallback, useEffect, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { Cheatsheet } from './components/Cheatsheet';
import { Home } from './components/Home';
import { APP_NAME } from './components/sections';
import { SyncPage } from './components/SyncPage';
import { TimerPage } from './components/TimerPage';
import { Training } from './components/training/Training';
import { navigate, useRoute } from './hooks/useRoute';
import { useLanguage } from './i18n/LanguageContext';
import { IOS_APP } from './lib/platform';
import type { CheatsheetTab } from './lib/route';

/** The shell: the header on top of whichever page the URL names. */
export function App() {
  const { t } = useLanguage();
  const route = useRoute();
  const [solving, setSolving] = useState(false);

  // The cheatsheet tab last looked at; links to the cheatsheet come back to it.
  const [cheatsheetTab, setCheatsheetTab] = useState<CheatsheetTab>('moves');
  if (route.page === 'cheatsheet' && route.tab !== cheatsheetTab) setCheatsheetTab(route.tab);
  const openCheatsheet = useCallback(() => navigate({ page: 'cheatsheet', tab: cheatsheetTab }), [cheatsheetTab]);

  useEffect(() => {
    const page = route.page === 'home' ? null : route.page === 'sync' ? t.sync.title : t.nav[route.page];
    document.title = page === null ? APP_NAME : `${page} · ${APP_NAME}`;
  }, [route.page, t]);

  return (
    // Where the header is fixed to the top (see AppHeader), the page starts below it.
    <div className={`flex h-dvh flex-col bg-neutral-950 text-neutral-100 ${IOS_APP ? 'pt-(--header-h)' : ''}`}>
      <AppHeader route={route} cheatsheetTab={cheatsheetTab} dimmed={solving} />
      {route.page === 'home' ? (
        <Home cheatsheetTab={cheatsheetTab} />
      ) : route.page === 'timer' ? (
        <TimerPage onSolvingChange={setSolving} onOpenCheatsheet={openCheatsheet} />
      ) : route.page === 'cheatsheet' ? (
        <Cheatsheet tab={route.tab} />
      ) : route.page === 'sync' ? (
        <SyncPage />
      ) : (
        <Training screen={route.screen} />
      )}
    </div>
  );
}
