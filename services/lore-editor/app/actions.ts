'use server';

import pool from '@/lib/db';

export type ArtifactRow = {
  artifact_name: string;
  artifact_type: 'json' | 'markdown';
  content_json: Record<string, unknown> | null;
  content_text: string | null;
  updated_at: string;
};

export type ArtifactSummary = Pick<ArtifactRow, 'artifact_name' | 'artifact_type' | 'updated_at'>;

export async function getArtifacts(): Promise<ArtifactSummary[]> {
  const result = await pool.query<ArtifactSummary>(
    'SELECT artifact_name, artifact_type, updated_at FROM lore_artifacts ORDER BY artifact_name',
  );
  return result.rows;
}

export async function getArtifact(name: string): Promise<ArtifactRow | null> {
  const result = await pool.query<ArtifactRow>(
    'SELECT artifact_name, artifact_type, content_json, content_text, updated_at FROM lore_artifacts WHERE artifact_name = $1',
    [name],
  );
  return result.rows[0] ?? null;
}

export async function updateArtifact(name: string, content: string): Promise<void> {
  const check = await pool.query<{ artifact_type: string }>(
    'SELECT artifact_type FROM lore_artifacts WHERE artifact_name = $1',
    [name],
  );
  if (!check.rows[0]) throw new Error(`Artefato '${name}' não encontrado`);

  const { artifact_type } = check.rows[0];

  if (artifact_type === 'json') {
    // Validate JSON before saving — throws SyntaxError if malformed
    JSON.parse(content);
    await pool.query(
      'UPDATE lore_artifacts SET content_json = $2::jsonb, updated_at = now() WHERE artifact_name = $1',
      [name, content],
    );
  } else {
    await pool.query(
      'UPDATE lore_artifacts SET content_text = $2, updated_at = now() WHERE artifact_name = $1',
      [name, content],
    );
  }
}
