import { Badge } from '@/components/ui/badge';
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from '@/types/domain';

const VARIANTS: Record<DocumentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  UPLOADED: 'secondary',
  EXTRACTING: 'secondary',
  EXTRACTED: 'default',
  NEEDS_CORRECTION: 'outline',
  EXTRACTION_FAILED: 'destructive',
  UNSUPPORTED_FORMAT: 'destructive',
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return <Badge variant={VARIANTS[status]}>{DOCUMENT_STATUS_LABELS[status]}</Badge>;
}
