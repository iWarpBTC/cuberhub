import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { joinDevice } from '../store/boot';
import { useStore, useStores } from '../store/StoreContext';
import { parseMnemonic, RELAY_URL } from '../sync/db';
import { useSyncStatus } from './useSyncStatus';

const BUTTON = 'rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800';
const PRIMARY = 'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40';
const CARD = 'rounded-lg border border-neutral-800 bg-neutral-900 p-4';

/** The 24 words that connect another device, shown only on request. */
function DeviceKey({ mnemonic }: { mnemonic: string }) {
  const { t } = useLanguage();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <section className={CARD}>
      <h2 className="text-base font-semibold text-neutral-100">{t.sync.key.title}</h2>
      <p className="mt-2 text-sm text-neutral-400">{t.sync.key.explain}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setShown(!shown)} aria-expanded={shown} className={BUTTON}>
          {shown ? t.sync.key.hide : t.sync.key.show}
        </button>
        {shown && (
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(mnemonic).then(() => setCopied(true))}
            className={BUTTON}
          >
            {copied ? t.sync.key.copied : t.sync.key.copy}
          </button>
        )}
      </div>
      {shown && (
        <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm text-neutral-100 sm:grid-cols-4">
          {mnemonic.split(' ').map((word, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-5 shrink-0 text-right text-neutral-500 select-none">{i + 1}</span>
              {word}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Enters the key of another device, which makes this device show (and sync) that device's data. */
function JoinDevice() {
  const { t } = useLanguage();
  const stores = useStores();
  const { scrambles } = useStore();
  const [words, setWords] = useState('');
  const [bring, setBring] = useState(true);
  const [error, setError] = useState<'invalid' | 'same' | null>(null);

  const join = () => {
    const mnemonic = parseMnemonic(words);
    if (mnemonic === null) return setError('invalid');
    if (mnemonic === stores.db.mnemonic) return setError('same');
    joinDevice(stores, mnemonic, bring && scrambles.length > 0);
  };

  return (
    <section className={CARD}>
      <h2 className="text-base font-semibold text-neutral-100">{t.sync.join.title}</h2>
      <p className="mt-2 text-sm text-neutral-400">{t.sync.join.explain}</p>
      <label className="mt-3 block text-xs uppercase tracking-wide text-neutral-500" htmlFor="sync-key">
        {t.sync.join.label}
      </label>
      <textarea
        id="sync-key"
        value={words}
        onChange={(e) => {
          setWords(e.target.value);
          setError(null);
        }}
        rows={3}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="mt-1 w-full resize-y rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 font-mono text-base text-neutral-100 focus:border-neutral-600 focus:outline-none sm:text-sm"
      />
      {error !== null && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {t.sync.join[error]}
        </p>
      )}
      {scrambles.length > 0 && (
        <>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-neutral-300 select-none">
            <input type="checkbox" checked={bring} onChange={(e) => setBring(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-500" />
            {t.sync.join.bring(scrambles.length)}
          </label>
          {!bring && <p className="mt-1 pl-6 text-xs text-amber-400">{t.sync.join.leaveBehind}</p>}
        </>
      )}
      <button type="button" onClick={join} disabled={words.trim() === ''} className={`${PRIMARY} mt-3`}>
        {t.sync.join.submit}
      </button>
    </section>
  );
}

/** Where sync is turned on and devices are connected. */
export function SyncPage() {
  const { t } = useLanguage();
  const { db } = useStores();
  const status = useSyncStatus();
  const on = useSyncExternalStore(db.subscribeSyncStatus, () => db.syncOn);
  const [kept, setKept] = useState(true);
  useEffect(() => {
    void db.persistence.then((persistence) => setKept(persistence !== 'NotPersisted'));
  }, [db]);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
        <h1 className="text-xl font-semibold text-neutral-100">{t.sync.title}</h1>
        <p className="text-sm text-neutral-400">{t.sync.intro}</p>
        {!kept && <p className="rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">{t.sync.notKept}</p>}

        <section className={CARD}>
          {/* Always there, so a screen reader announces the status when it changes. */}
          <p role="status" className="text-sm text-neutral-200">
            {on ? status.message : t.sync.isOff}
          </p>
          {on && <p className="mt-1 text-xs text-neutral-500">{t.sync.server(new URL(RELAY_URL).host)}</p>}
          <button type="button" onClick={() => db.setSync(!on)} className={`${on ? BUTTON : PRIMARY} mt-3`}>
            {on ? t.sync.turnOff : t.sync.turnOn}
          </button>
        </section>

        {on && <DeviceKey mnemonic={db.mnemonic} />}
        <JoinDevice />
      </div>
    </main>
  );
}
