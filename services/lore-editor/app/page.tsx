import Link from 'next/link';
import { getArtifacts } from './actions';

const ARTIFACT_LABELS: Record<string, string> = {
  lore_overview:       'Lore Overview',
  canon_rules:         'Canon Rules',
  characters:          'Characters',
  locations:           'Locations',
  timeline:            'Timeline',
  visual_constraints:  'Visual Constraints',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default async function HomePage() {
  let artifacts;
  try {
    artifacts = await getArtifacts();
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-red-400">Erro ao conectar ao Postgres. Verifique a variável DATABASE_URL.</p>
      </div>
    );
  }

  if (artifacts.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-muted">
          Nenhum artefato encontrado. Execute o workflow{' '}
          <code className="text-gold">tLotD-Lore</code> para popular o banco.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-base font-bold tracking-widest uppercase text-gold mb-1">
          Artefatos Canônicos
        </h1>
        <p className="text-xs text-muted">
          {artifacts.length} artefato{artifacts.length !== 1 ? 's' : ''} · Fonte de verdade do validador tLotD-02
        </p>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left px-5 py-3 text-xs font-semibold tracking-widest uppercase text-dim">
                Artefato
              </th>
              <th className="text-left px-5 py-3 text-xs font-semibold tracking-widest uppercase text-dim">
                Tipo
              </th>
              <th className="text-left px-5 py-3 text-xs font-semibold tracking-widest uppercase text-dim">
                Atualizado em
              </th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {artifacts.map((a, i) => (
              <tr
                key={a.artifact_name}
                className={`border-b border-border last:border-0 hover:bg-surface transition-colors ${
                  i % 2 === 0 ? 'bg-canvas' : 'bg-surface/50'
                }`}
              >
                <td className="px-5 py-4 font-medium text-text">
                  {ARTIFACT_LABELS[a.artifact_name] ?? a.artifact_name}
                  <span className="ml-2 text-xs font-mono text-dim">{a.artifact_name}</span>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-bold tracking-wider uppercase ${
                      a.artifact_type === 'json'
                        ? 'bg-blue-900/40 text-blue-300'
                        : 'bg-emerald-900/40 text-emerald-300'
                    }`}
                  >
                    {a.artifact_type === 'json' ? 'JSON' : 'MD'}
                  </span>
                </td>
                <td className="px-5 py-4 text-muted font-mono text-xs">
                  {formatDate(a.updated_at)}
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/artifact/${a.artifact_name}`}
                    className="inline-block px-4 py-1.5 text-xs font-semibold tracking-wide uppercase rounded border border-gold/30 text-gold hover:bg-gold/10 transition-colors"
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-dim">
        Edições manuais podem ser sobrescritas pela próxima execução do workflow{' '}
        <code className="text-muted">tLotD-Lore</code>.
      </p>
    </div>
  );
}
