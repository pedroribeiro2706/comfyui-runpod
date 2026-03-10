'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useCallback, useRef } from 'react';
import { updateArtifact } from '@/app/actions';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const ARTIFACT_LABELS: Record<string, string> = {
  lore_overview:       'Lore Overview',
  canon_rules:         'Canon Rules',
  characters:          'Characters',
  locations:           'Locations',
  timeline:            'Timeline',
  visual_constraints:  'Visual Constraints',
};

type Status = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  name: string;
  type: 'json' | 'markdown';
  updatedAt: string;
  initialValue: string;
}

export default function ArtifactEditor({ name, type, updatedAt, initialValue }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(async () => {
    if (status === 'saving') return;

    // Read directly from the editor instance — avoids stale React state
    const content = editorRef.current?.getValue() ?? initialValue;

    if (type === 'json') {
      try {
        JSON.parse(content);
      } catch {
        setStatus('error');
        setErrorMsg('JSON inválido — corrija os erros antes de salvar.');
        return;
      }
    }

    setStatus('saving');
    setErrorMsg('');

    try {
      await updateArtifact(name, content);
      setStatus('saved');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }, [name, type, initialValue, status]);

  const label = ARTIFACT_LABELS[name] ?? name;
  const formattedDate = new Date(updatedAt).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-120px)]">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-xs text-muted hover:text-text transition-colors"
          >
            ← Artefatos
          </Link>
          <span className="text-border">·</span>
          <div>
            <h1 className="text-base font-bold tracking-widest uppercase text-gold leading-none">
              {label}
            </h1>
            <p className="text-xs text-dim mt-0.5 font-mono">
              {name}
              <span className="mx-2 text-border">·</span>
              <span
                className={`inline-block px-1.5 py-0 rounded text-xs font-bold tracking-wider uppercase ${
                  type === 'json'
                    ? 'bg-blue-900/40 text-blue-300'
                    : 'bg-emerald-900/40 text-emerald-300'
                }`}
              >
                {type === 'json' ? 'JSON' : 'Markdown'}
              </span>
              <span className="mx-2 text-border">·</span>
              <span className="text-dim">salvo em {formattedDate}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {status === 'saved' && (
            <span className="text-xs text-emerald-400">Salvo com sucesso</span>
          )}
          {status === 'error' && (
            <span className="text-xs text-red-400 max-w-xs text-right">{errorMsg}</span>
          )}
          <button
            onClick={handleSave}
            disabled={status === 'saving'}
            className={`px-5 h-9 rounded text-sm font-bold tracking-wide uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              status === 'saving'
                ? 'bg-gold/60 text-canvas cursor-wait'
                : 'bg-gold text-canvas hover:bg-gold-hover'
            }`}
          >
            {status === 'saving' ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Warning */}
      <div className="flex-shrink-0 px-4 py-2.5 rounded border border-yellow-800/40 bg-yellow-950/20 text-xs text-yellow-600">
        Edições manuais podem ser sobrescritas pela próxima execução de{' '}
        <code className="font-mono text-yellow-500">tLotD-Lore</code>.
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-border">
        <MonacoEditor
          height="100%"
          language={type === 'json' ? 'json' : 'markdown'}
          defaultValue={initialValue}
          onMount={(editor) => { editorRef.current = editor; }}
          onChange={() => {
            if (status === 'saved' || status === 'error') setStatus('idle');
          }}
          theme="vs-dark"
          loading={
            <div className="flex items-center justify-center h-full bg-[#1e1e1e] text-muted text-sm">
              Carregando editor…
            </div>
          }
          options={{
            fontSize: 14,
            fontFamily: "'Fira Code', 'Cascadia Code', monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            wordWrap: type === 'markdown' ? 'on' : 'off',
            scrollBeyondLastLine: false,
            formatOnPaste: type === 'json',
            tabSize: 2,
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            smoothScrolling: true,
          }}
        />
      </div>
    </div>
  );
}
