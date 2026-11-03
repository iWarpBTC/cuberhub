import { useRef, useState } from 'react';
import type { AppData } from '../types';
import { useDispatch, useStore } from '../store/StoreContext';
import { ImportError, parseImport, serializeExport } from '../lib/storage';
import { useLanguage } from '../i18n/LanguageContext';
import { ConfirmDialog } from './ConfirmDialog';

export function ImportExport({ onDialogOpenChange }: { onDialogOpenChange: (open: boolean) => void }) {
  const { t } = useLanguage();
  const { scrambles, solves, sets } = useStore();
  const dispatch = useDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<AppData | null>(null);
  const [error, setError] = useState<ImportError | 'failed' | null>(null);

  const setPending = (data: AppData | null) => {
    setPendingImport(data);
    onDialogOpenChange(data !== null);
  };

  const handleExport = () => {
    const json = serializeExport({ scrambles, solves, sets });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rubik-timer-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setError(null);
    try {
      setPending(parseImport(await file.text()));
    } catch (e) {
      setError(e instanceof ImportError ? e : 'failed');
    }
  };

  return (
    <div className="border-t border-neutral-800 p-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleExport}
          className="flex-1 rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          {t.importExport.export}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          {t.importExport.import}
        </button>
      </div>
      {error !== null && (
        <p className="mt-2 text-xs text-red-400">
          {error === 'failed' ? t.importExport.failed : t.importExport.errors[error.code]}
        </p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      {pendingImport !== null && (
        <ConfirmDialog
          title={t.importExport.title}
          message={t.importExport.message(
            scrambles.length,
            solves.length,
            sets.length,
            pendingImport.scrambles.length,
            pendingImport.solves.length,
            pendingImport.sets.length,
          )}
          confirmLabel={t.importExport.confirm}
          destructive
          onConfirm={() => {
            dispatch({ type: 'IMPORT_DATA', data: pendingImport });
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
