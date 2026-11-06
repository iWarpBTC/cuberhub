import { useSyncExternalStore } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { dbError, subscribeDbError } from '../sync/db';

/** Says so when the database cannot work; such a failure stops the whole app. */
export function DatabaseError() {
  const { t } = useLanguage();
  const error = useSyncExternalStore(subscribeDbError, dbError);
  if (error === null) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[100] bg-red-900 px-4 py-3 text-center text-sm text-red-50">
      {t.sync.errors[error.type]}
    </div>
  );
}
