import { Radio, PencilLine, FlaskConical } from 'lucide-react';
import type { Provenance } from '../types';

const provenanceLabels: Record<Provenance, string> = {
  ring_live: 'Ring · Live',
  ring_playground: 'Playground · Simulated',
  ring_simulated: 'Local · Simulated',
  manual: 'Manual',
};

export function ProvenanceBadge({ provenance, isSynthetic = false }: { provenance: Provenance; isSynthetic?: boolean }) {
  const label = provenanceLabels[provenance];
  const Icon = provenance === 'manual' ? PencilLine : provenance === 'ring_simulated' || provenance === 'ring_playground' ? FlaskConical : Radio;
  return (
    <span className={`provenance provenance-${provenance}`}>
      <Icon size={13} aria-hidden="true" />
      <span>{label}</span>
      {isSynthetic && <span className="demo-marker">Synthetic demo data</span>}
    </span>
  );
}
