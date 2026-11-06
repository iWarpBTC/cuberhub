import { useSyncExternalStore } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useStores } from '../store/StoreContext';

export interface SyncStatus {
  /** `off` while sync is not turned on. */
  state: 'off' | 'syncing' | 'synced' | 'disconnected' | 'error';
  /** What to tell the user about it. */
  message: string;
}

/** How sync with the user's other devices is going. */
export function useSyncStatus(): SyncStatus {
  const { t } = useLanguage();
  const { db } = useStores();
  // As text, so that an unchanged status is the same value to React.
  const key = useSyncExternalStore(db.subscribeSyncStatus, () => {
    if (!db.syncOn) return 'off';
    const status = db.syncStatus();
    return status.type === 'Error' ? `Error:${status.error.type}` : status.type;
  });
  switch (key) {
    case 'off':
      return { state: 'off', message: t.sync.isOff };
    case 'NoRelays':
    case 'Syncing':
      return { state: 'syncing', message: t.sync.status[key] };
    case 'Synced':
      return { state: 'synced', message: t.sync.status.Synced };
    case 'Disconnected':
      return { state: 'disconnected', message: t.sync.status.Disconnected };
    default: {
      const type = key.slice('Error:'.length);
      return { state: 'error', message: type === 'ProtocolQuotaError' ? t.sync.status.Quota : t.sync.status.Error(type) };
    }
  }
}
