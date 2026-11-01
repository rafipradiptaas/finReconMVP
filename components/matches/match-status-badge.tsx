import { Badge } from '@/components/ui/badge';
import { MATCH_STATUS_LABELS, type MatchStatus } from '@/types/domain';

const VARIANTS: Record<MatchStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  FULL_MATCH: 'default',
  PARTIAL_MATCH: 'secondary',
  NO_MATCH: 'outline',
  REJECTED: 'destructive',
};

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  return <Badge variant={VARIANTS[status]}>{MATCH_STATUS_LABELS[status]}</Badge>;
}
