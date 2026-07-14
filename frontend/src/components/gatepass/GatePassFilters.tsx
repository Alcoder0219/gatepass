import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Filter, Search, X } from 'lucide-react';
import { departmentApi, unitApi } from '@/services/endpoints';
import { useDebouncedCallback } from '@/hooks/useDebounce';
import { usePermissions } from '@/permissions/usePermissions';
import { PERMISSION, STATUS_META } from '@/permissions/constants';
import { Badge, Button, Input, Select } from '@/components/ui';
import type { GatePassFilters as Filters, GatePassStatus } from '@/types';

const STATUS_OPTIONS = (Object.keys(STATUS_META) as GatePassStatus[]).map((status) => ({
  value: status,
  label: STATUS_META[status].label,
}));

export interface GatePassFiltersProps {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
  activeCount: number;
  /** Hide the status control on screens that are already status-scoped (e.g. Rejected). */
  hideStatus?: boolean;
}

/**
 * The filter bar shared by every gate pass list. Search is debounced so typing
 * doesn't fire a request per keystroke; the advanced filters collapse on mobile.
 */
export const GatePassFilters = ({
  filters,
  onChange,
  onReset,
  activeCount,
  hideStatus,
}: GatePassFiltersProps) => {
  const [expanded, setExpanded] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '');
  const { can } = usePermissions();

  // Only fetch the master lists if the user can actually filter across them.
  const canSeeAll = can(PERMISSION.GATEPASS_VIEW_ALL) || can(PERMISSION.GATEPASS_VIEW_DEPARTMENT);

  const { data: units } = useQuery({
    queryKey: ['units', 'lookup'],
    queryFn: unitApi.lookup,
    enabled: canSeeAll,
    staleTime: 10 * 60_000,
  });

  const { data: departments } = useQuery({
    queryKey: ['departments', 'lookup', filters.unit],
    queryFn: () => departmentApi.lookup(filters.unit),
    enabled: canSeeAll,
    staleTime: 10 * 60_000,
  });

  const pushSearch = useDebouncedCallback((value: string) => onChange({ search: value }), 350);

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            value={searchDraft}
            onChange={(event) => {
              setSearchDraft(event.target.value);
              pushSearch(event.target.value);
            }}
            placeholder="Search by pass number, employee or reason…"
            leftIcon={<Search className="h-4 w-4" />}
            rightIcon={
              searchDraft ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchDraft('');
                    onChange({ search: '' });
                  }}
                  className="rounded p-0.5 transition-colors hover:text-content"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : undefined
            }
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={expanded ? 'primary' : 'secondary'}
            leftIcon={<Filter className="h-4 w-4" />}
            onClick={() => setExpanded((v) => !v)}
          >
            Filters
            {activeCount > 0 && (
              <span className="ml-1 rounded-full bg-white/25 px-1.5 py-0.5 text-2xs font-bold tabular-nums">
                {activeCount}
              </span>
            )}
          </Button>

          {activeCount > 0 && (
            <Button variant="ghost" onClick={onReset} leftIcon={<X className="h-4 w-4" />}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {!hideStatus && (
                <Select
                  label="Status"
                  value={filters.status?.toString() ?? ''}
                  onChange={(event) => onChange({ status: event.target.value })}
                  options={STATUS_OPTIONS}
                  placeholder="All statuses"
                />
              )}

              <Select
                label="Type"
                value={filters.type ?? ''}
                onChange={(event) => onChange({ type: event.target.value as Filters['type'] })}
                options={[
                  { value: 'OFFICIAL', label: 'Official' },
                  { value: 'PERSONAL', label: 'Personal' },
                ]}
                placeholder="Both types"
              />

              {canSeeAll && (
                <>
                  <Select
                    label="Unit"
                    value={filters.unit ?? ''}
                    // Changing the unit invalidates the department choice below it.
                    onChange={(event) => onChange({ unit: event.target.value, department: '' })}
                    options={(units ?? []).map((unit) => ({ value: unit._id, label: unit.name }))}
                    placeholder="All units"
                  />

                  <Select
                    label="Department"
                    value={filters.department ?? ''}
                    onChange={(event) => onChange({ department: event.target.value })}
                    options={(departments ?? []).map((d) => ({ value: d._id, label: d.name }))}
                    placeholder="All departments"
                  />
                </>
              )}

              <Input
                type="date"
                label="From"
                value={filters.from ?? ''}
                onChange={(event) => onChange({ from: event.target.value })}
              />

              <Input
                type="date"
                label="To"
                value={filters.to ?? ''}
                onChange={(event) => onChange({ to: event.target.value })}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active filter chips — always visible, so a filtered view never looks empty by accident. */}
      {activeCount > 0 && !expanded && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(filters)
            .filter(([key, value]) => !['page', 'limit', 'sort'].includes(key) && value)
            .map(([key, value]) => (
              <Badge key={key} tone="brand">
                <span className="capitalize">{key}</span>: {String(value)}
                <button
                  type="button"
                  onClick={() => onChange({ [key]: '' } as Partial<Filters>)}
                  className="ml-0.5 rounded-full transition-opacity hover:opacity-70"
                  aria-label={`Remove ${key} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
        </div>
      )}
    </div>
  );
};

export default GatePassFilters;
