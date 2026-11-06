import { useLanguage } from '../i18n/LanguageContext';
import { routeHref } from '../lib/route';
import { useSyncStatus, type SyncStatus } from './useSyncStatus';

const DOT: Record<SyncStatus['state'], string> = {
  off: 'bg-neutral-600',
  syncing: 'bg-blue-400',
  synced: 'bg-green-500',
  disconnected: 'bg-amber-400',
  error: 'bg-red-500',
};

/** The way to the sync page, saying in a word how sync is doing. */
export function SyncLink({ className = '' }: { className?: string }) {
  const { t } = useLanguage();
  const { state, message } = useSyncStatus();
  return (
    <a
      href={routeHref({ page: 'sync' })}
      title={message}
      className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 ${className}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[state]}`} />
      {t.sync.title}: {t.sync.short[state]}
      <span aria-hidden="true" className="ml-auto pl-1">
        →
      </span>
    </a>
  );
}
