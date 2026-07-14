import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, FileText, Loader2, Network, Search, User as UserIcon } from 'lucide-react';
import { searchApi } from '@/services/endpoints';
import { useDebounce } from '@/hooks/useDebounce';
import { dropdownVariants } from '@/animations/variants';
import { cn } from '@/utils/cn';
import { StatusBadge } from '@/components/ui';
import type { GatePassStatus } from '@/types';

interface Hit {
  id: string;
  title: string;
  subtitle: string;
  link: string;
  group: string;
  icon: typeof FileText;
  status?: GatePassStatus;
}

/**
 * Global search across gate passes, employees, departments and units. The API
 * scopes every group to what the caller may see, so an employee searching for a
 * colleague's pass simply gets no hit.
 */
export const GlobalSearch = () => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debounced = useDebounce(query, 250);
  const enabled = debounced.trim().length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchApi.global(debounced),
    enabled,
    staleTime: 30_000,
  });

  const hits = useMemo<Hit[]>(() => {
    if (!data) return [];
    return [
      ...(data.gatePasses ?? []).map((item) => ({
        id: item._id,
        title: item.gatePassNumber,
        subtitle: `${item.employeeName} · ${item.reason}`,
        link: `/gate-pass/${item._id}`,
        group: 'Gate Passes',
        icon: FileText,
        status: item.status,
      })),
      ...(data.employees ?? []).map((item) => ({
        id: item._id,
        title: item.name,
        subtitle: `${item.employeeId} · ${item.designation ?? ''}`,
        link: `/users/${item._id}`,
        group: 'Employees',
        icon: UserIcon,
      })),
      ...(data.departments ?? []).map((item) => ({
        id: item._id,
        title: item.name,
        subtitle: item.code,
        link: `/departments`,
        group: 'Departments',
        icon: Network,
      })),
      ...(data.units ?? []).map((item) => ({
        id: item._id,
        title: item.name,
        subtitle: item.code,
        link: `/units`,
        group: 'Units',
        icon: Building2,
      })),
    ];
  }, [data]);

  /* ⌘K / Ctrl-K focuses the field from anywhere. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => setCursor(0), [debounced]);

  const go = (hit: Hit) => {
    navigate(hit.link);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!hits.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (c + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (c - 1 + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(hits[cursor]);
    }
  };

  // Group the flat hit list for rendering, preserving order.
  const grouped = hits.reduce<Record<string, Hit[]>>((acc, hit) => {
    (acc[hit.group] ??= []).push(hit);
    return acc;
  }, {});

  let index = -1;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search gate passes, people, departments…"
          className="input-base h-10 pl-11 pr-16"
          aria-label="Global search"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-content-subtle sm:block">
          ⌘K
        </kbd>
        {isFetching && (
          <Loader2 className="absolute right-12 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-500" />
        )}
      </div>

      <AnimatePresence>
        {open && enabled && (
          <motion.div
            variants={dropdownVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="glass-strong absolute left-0 right-0 z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl p-2 shadow-glass-lg"
          >
            {!hits.length && !isFetching ? (
              <p className="px-3 py-8 text-center text-sm text-content-muted">
                No results for “{debounced}”
              </p>
            ) : (
              Object.entries(grouped).map(([group, groupHits]) => (
                <div key={group} className="mb-1 last:mb-0">
                  <p className="px-3 py-1.5 text-2xs font-bold uppercase tracking-widest text-content-subtle">
                    {group}
                  </p>
                  {groupHits.map((hit) => {
                    index += 1;
                    const active = index === cursor;
                    const Icon = hit.icon;
                    return (
                      <button
                        key={`${hit.group}-${hit.id}`}
                        type="button"
                        onClick={() => go(hit)}
                        onMouseEnter={() => setCursor(hits.indexOf(hit))}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                          active ? 'bg-brand-500/10' : 'hover:bg-content/5'
                        )}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-content">{hit.title}</p>
                          <p className="truncate text-xs text-content-muted">{hit.subtitle}</p>
                        </div>
                        {hit.status && <StatusBadge status={hit.status} />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GlobalSearch;
