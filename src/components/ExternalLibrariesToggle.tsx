import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { EXTERNAL_LIBRARIES, ExternalLibraryDef } from '../services/externalLibraries';
import type { Language } from '../types/session';
import { ToggleSwitch } from './ToggleSwitch';

interface Props {
  language?: Language;
  values: Record<string, boolean>;
  defaults?: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  downloadOnEnable?: boolean;
}

type LibStatus = { state: 'downloading' | 'ready' | 'error'; message?: string };

export const ExternalLibrariesToggle: React.FC<Props> = ({ language, values, defaults, onChange, downloadOnEnable }) => {
  const [statuses, setStatuses] = useState<Record<string, LibStatus>>({});
  const [installed, setInstalled] = useState<Record<string, string>>({});
  const libs: ExternalLibraryDef[] = language
    ? EXTERNAL_LIBRARIES.filter((l) => l.language === language)
    : EXTERNAL_LIBRARIES;

  useEffect(() => {
    window.electronAPI.getInstalledLibraries().then(setInstalled).catch(() => {});
  }, []);

  if (libs.length === 0) return null;

  const isEnabled = (id: string) => {
    if (id in values) return values[id];
    if (defaults && id in defaults) return defaults[id];
    return EXTERNAL_LIBRARIES.find((l) => l.id === id)?.defaultEnabled ?? false;
  };

  const toggle = (lib: ExternalLibraryDef) => {
    if (statuses[lib.id]?.state === 'downloading') return;
    const next = !isEnabled(lib.id);
    onChange({ ...values, [lib.id]: next });
    if (next && downloadOnEnable) {
      ensure(lib, false);
    } else if (!next) {
      setStatuses((prev) => {
        const copy = { ...prev };
        delete copy[lib.id];
        return copy;
      });
    }
  };

  const fail = (lib: ExternalLibraryDef, message: string) => {
    setStatuses((prev) => ({ ...prev, [lib.id]: { state: 'error', message } }));
    onChange({ ...values, [lib.id]: false });
  };

  const ensure = (lib: ExternalLibraryDef, force: boolean) => {
    setStatuses((prev) => ({ ...prev, [lib.id]: { state: 'downloading' } }));
    window.electronAPI
      .ensureExternalLibraries({ language: lib.language, explicitIds: [lib.id], force })
      .then((res) => {
        const r = res.results?.find((x) => x.id === lib.id);
        const ok = r ? r.ok : (res.classpathEntries?.length ?? 0) > 0 || res.enabled?.includes(lib.id);
        if (ok) {
          setStatuses((prev) => {
            const copy = { ...prev };
            delete copy[lib.id];
            return copy;
          });
          if (r?.version) setInstalled((prev) => ({ ...prev, [lib.id]: r.version! }));
        } else {
          fail(lib, r?.message || 'Failed — will retry at runtime.');
        }
      })
      .catch((err: any) => {
        fail(lib, err?.message || 'Failed — will retry at runtime.');
      });
  };

  return (
    <div className="space-y-1.5">
      {libs.map((lib) => {
        const enabled = isEnabled(lib.id);
        const status = statuses[lib.id];
        const failed = status?.state === 'error';
        return (
          <div
            key={lib.id}
            title={lib.description}
            className={`rounded-lg border px-2 py-1.5 transition-colors ${
              failed
                ? 'border-rose-500/50 bg-rose-500/5 dark:border-rose-500/40'
                : enabled
                  ? 'border-emerald-500/40 bg-emerald-500/5 dark:border-emerald-500/30'
                  : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-xs font-medium text-slate-800 dark:text-zinc-100 truncate">{lib.name}</span>
                <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 shrink-0">
                  {installed[lib.id] ?? 'latest'}
                </span>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {enabled && downloadOnEnable && (
                  <button
                    type="button"
                    title={`Re-install ${lib.name}`}
                    aria-label={`Re-install ${lib.name}`}
                    onClick={() => ensure(lib, true)}
                    disabled={status?.state === 'downloading'}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 rounded transition-colors disabled:opacity-50"
                  >
                    {status?.state === 'downloading' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3 h-3" />
                    )}
                  </button>
                )}
                <ToggleSwitch
                  size="sm"
                  checked={enabled}
                  onChange={() => toggle(lib)}
                  disabled={status?.state === 'downloading'}
                  ariaLabel={`Enable ${lib.name}`}
                  activeColor="bg-emerald-600"
                />
              </div>
            </div>
            {status && status.state === 'error' && (
              <p className="text-[10px] leading-snug mt-1 flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span className="truncate">{status.message}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};
