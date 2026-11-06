import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LanguageProvider } from './i18n/LanguageContext';
import { migrateLegacyStorage } from './lib/storage';
import { StoreProvider } from './store/StoreContext';
import './index.css';

// Before anything reads the storage: bring over what was saved under the app's former name.
migrateLegacyStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </LanguageProvider>
  </StrictMode>,
);
