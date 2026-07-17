'use client';

import { useState } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';

/**
 * Export data button — downloads a JSON dump of every table via
 * GET /api/settings/export (cloud-3: previously called a server action
 * that wrote the dump to <dataDir>/exports/ and showed the path for the
 * user to copy; now a plain browser download, which works identically on
 * node and workerd since there's no disk write on either path).
 */
export function ExportDataButton() {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'pending' }
    | { kind: 'done'; filename: string }
    | { kind: 'error'; msg: string }
  >({ kind: 'idle' });

  const trigger = async () => {
    setState({ kind: 'pending' });
    try {
      const res = await fetch('/api/settings/export');
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`);
      }
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? 'shadow-tracker-export.json';

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setState({ kind: 'done', filename });
    } catch (err) {
      setState({
        kind: 'error',
        msg: err instanceof Error ? err.message : 'Export failed',
      });
    }
  };

  if (state.kind === 'idle') {
    return (
      <button
        type="button"
        onClick={trigger}
        className="inline-flex items-center gap-2 font-display tracking-wide-display uppercase text-sm text-bone-dim hover:text-bone transition-colors border border-bone-dim hover:border-bone px-4 py-2"
      >
        <Download size={14} strokeWidth={1.5} />
        Export data
      </button>
    );
  }

  if (state.kind === 'pending') {
    return (
      <span className="font-mono text-sm text-bone-dim">
        ↳ exporting…
      </span>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="space-y-2">
        <span className="font-mono text-sm text-accent">
          export failed: {state.msg}
        </span>
        <button
          type="button"
          onClick={() => setState({ kind: 'idle' })}
          className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-bone transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  // Done
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 font-mono text-sm text-signal-ok">
        <CheckCircle2 size={14} strokeWidth={1.5} />
        downloaded {state.filename}
      </div>
      <button
        type="button"
        onClick={() => setState({ kind: 'idle' })}
        className="font-display tracking-wide-display uppercase text-xs text-bone-mute hover:text-bone transition-colors"
      >
        Done
      </button>
    </div>
  );
}
