import { notFound } from 'next/navigation';
import { getArtifact } from '@/app/actions';
import ArtifactEditor from './editor';

export default async function ArtifactPage({ params }: { params: { name: string } }) {
  const artifact = await getArtifact(params.name);
  if (!artifact) notFound();

  const initialValue =
    artifact.artifact_type === 'json'
      ? JSON.stringify(artifact.content_json, null, 2)
      : (artifact.content_text ?? '');

  return (
    <ArtifactEditor
      name={artifact.artifact_name}
      type={artifact.artifact_type}
      updatedAt={artifact.updated_at}
      initialValue={initialValue}
    />
  );
}
