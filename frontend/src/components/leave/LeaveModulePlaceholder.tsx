import type { ReactNode } from 'react';
import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/ui';

/**
 * Scaffolding placeholder for the Leave Management module.
 *
 * Every leave screen renders this until its real implementation lands, so the
 * navigation, routing and permission wiring can be verified end-to-end before
 * any business logic exists. Replace the whole component per page — do not grow
 * feature code inside this file.
 */
export const LeaveModulePlaceholder = ({
  title,
  subtitle,
  icon,
  planned,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  /** One-line note on what this screen will do, shown inside the empty state. */
  planned: string;
}) => (
  <div>
    <PageHeader
      title={title}
      subtitle={subtitle}
      icon={icon}
      breadcrumbs={[{ label: 'Leave Management' }, { label: title }]}
    />

    <EmptyState
      icon={<Construction className="h-7 w-7" />}
      title="Coming soon"
      message={planned}
    />
  </div>
);

export default LeaveModulePlaceholder;
