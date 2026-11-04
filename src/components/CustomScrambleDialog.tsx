import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { createCustomScramble, parseCustomScramble } from '../lib/scramble';
import { useDispatch } from '../store/StoreContext';
import { CubeNet } from './CubeNet';

const INPUT =
  'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-blue-500 focus:outline-none';

/**
 * Lets the user type a scramble in their own notation. The moves are tidied
 * into WCA face turns as they type, shown as a cube net, and saved as a new
 * scramble (added to `setId` when given).
 */
export function CustomScrambleDialog({ setId, onSaved, onClose }: { setId?: string; onSaved?: () => void; onClose: () => void }) {
  const { t } = useLanguage();
  const dispatch = useDispatch();
  const [moves, setMoves] = useState('');
  const [title, setTitle] = useState('');
  const movesRef = useRef<HTMLTextAreaElement>(null);
  const parsed = useMemo(() => parseCustomScramble(moves), [moves]);
  const c = t.customScramble;

  useEffect(() => {
    movesRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const save = () => {
    if (!parsed.ok) return;
    dispatch({ type: 'ADD_SCRAMBLE', scramble: createCustomScramble(parsed.scramble, title), setId });
    onSaved?.();
    onClose();
  };

  const tidied = parsed.ok && parsed.scramble !== moves.trim();
  const error = parsed.ok ? null : parsed.reason === 'empty' ? (moves.trim().length > 0 ? c.empty : null) : c.invalid(parsed.token);

  // Portaled so the overlay covers the viewport even inside a transformed drawer.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={c.title}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="mx-4 flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-neutral-100">{setId === undefined ? c.title : c.titleInSet}</h2>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">{c.movesLabel}</span>
          <textarea
            ref={movesRef}
            value={moves}
            onChange={(e) => setMoves(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                save();
              }
            }}
            rows={3}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={c.movesPlaceholder}
            className={`${INPUT} mt-1 resize-y font-mono`}
          />
        </label>
        <p className="text-xs text-neutral-500">{c.hint}</p>
        {error !== null && <p className="text-sm text-red-400">{error}</p>}
        {parsed.ok && (
          <div className="flex items-start gap-3">
            <div className="w-28 shrink-0">
              <CubeNet scramble={parsed.scramble} />
            </div>
            <div className="min-w-0 text-xs text-neutral-400">
              <p>{c.moveCount(parsed.scramble.split(' ').length)}</p>
              {tidied && (
                <p className="mt-1">
                  {c.savedAs} <span className="font-mono text-neutral-200">{parsed.scramble}</span>
                </p>
              )}
            </div>
          </div>
        )}
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">{c.titleLabel}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={c.titlePlaceholder}
            className={`${INPUT} mt-1`}
          />
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            {t.dialog.cancel}
          </button>
          <button
            type="submit"
            disabled={!parsed.ok}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {c.save}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
