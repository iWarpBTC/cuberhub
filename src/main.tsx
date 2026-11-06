import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DatabaseError } from './components/DatabaseError';
import { LanguageProvider } from './i18n/LanguageContext';
import { migrateLegacyStorage } from './lib/storage';
import { StoreProvider } from './store/StoreContext';
import './index.css';

// Before anything reads the storage: bring over what was saved under the app's former name.
migrateLegacyStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      {/* Outside the wait for the database: a database that cannot open never ends that wait. */}
      <DatabaseError />
      <Suspense fallback={<div className="h-dvh bg-neutral-950" />}>
        <StoreProvider>
          <App />
        </StoreProvider>
      </Suspense>
    </LanguageProvider>
  </StrictMode>,
);
