import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Upload,
  Users,
} from 'lucide-react';
import { Button, Modal, Switch } from '@/components/ui';
import { userApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { cn } from '@/utils/cn';
import type { UserImportSummary } from '@/types';

/**
 * Bulk user import.
 *
 * Three steps, and the middle one is the point: the file is sent to the server
 * for a dry run first, so the administrator sees exactly which rows will land and
 * why the others will not — BEFORE anything is written. The same validation code
 * then gates the real import, so the preview cannot disagree with the outcome.
 */

type Step = 'pick' | 'preview' | 'done';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export interface UserImportModalProps {
  open: boolean;
  onClose: () => void;
}

export const UserImportModal = ({ open, onClose }: UserImportModalProps) => {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [preview, setPreview] = useState<UserImportSummary | null>(null);
  const [result, setResult] = useState<UserImportSummary | null>(null);

  const reset = useCallback(() => {
    setStep('pick');
    setFile(null);
    setPreview(null);
    setResult(null);
    setSkipInvalid(false);
    setDragging(false);
  }, []);

  const close = useCallback(() => {
    onClose();
    // Let the exit animation finish before the contents snap back.
    window.setTimeout(reset, 200);
  }, [onClose, reset]);

  const previewMutation = useMutation({
    mutationFn: (csv: File) => userApi.importPreview(csv),
    onSuccess: (summary) => {
      setPreview(summary);
      setStep('preview');
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'That file could not be read'));
      setFile(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: (csv: File) => userApi.importCommit(csv, skipInvalid),
    onSuccess: (summary) => {
      setResult(summary);
      setStep('done');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`Imported ${summary.created} user${summary.created === 1 ? '' : 's'}`);
    },
    onError: (error) => toast.error(errorMessage(error, 'The import failed')),
  });

  const accept = useCallback(
    (next: File | undefined) => {
      if (!next) return;
      if (!/\.csv$/i.test(next.name)) {
        toast.error('That needs to be a .csv file');
        return;
      }
      setFile(next);
      previewMutation.mutate(next);
    },
    [previewMutation]
  );

  const template = useCallback(async () => {
    try {
      const blob = await userApi.importTemplate();
      downloadBlob(blob as Blob, 'gatepass-users-template.csv');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not download the template'));
    }
  }, []);

  const copyCredentials = useCallback(() => {
    if (!result) return;
    const text = result.credentials
      .map((c) => `${c.employeeId},${c.name},${c.email},${c.temporaryPassword ?? '(as supplied)'}`)
      .join('\n');
    void navigator.clipboard.writeText(`employeeId,name,email,temporaryPassword\n${text}`);
    toast.success('Credentials copied to the clipboard');
  }, [result]);

  const invalidRows = useMemo(
    () => preview?.rows.filter((row) => !row.valid) ?? [],
    [preview]
  );

  const canImport = Boolean(preview) && (preview!.invalid === 0 || skipInvalid);
  const busy = previewMutation.isPending || importMutation.isPending;

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      icon={<Users className="h-5 w-5" />}
      title="Import users from CSV"
      description={
        step === 'pick'
          ? 'Upload a spreadsheet to create many accounts at once.'
          : step === 'preview'
            ? 'Check what will happen before anything is written.'
            : undefined
      }
      footer={
        step === 'preview' ? (
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={reset} disabled={busy}>
              Choose a different file
            </Button>
            <Button
              onClick={() => file && importMutation.mutate(file)}
              disabled={!canImport || busy}
              isLoading={importMutation.isPending}
              leftIcon={<Upload className="h-4 w-4" />}
            >
              {preview
                ? `Import ${skipInvalid ? preview.valid : preview.total} user${
                    (skipInvalid ? preview.valid : preview.total) === 1 ? '' : 's'
                  }`
                : 'Import'}
            </Button>
          </div>
        ) : step === 'done' ? (
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        ) : undefined
      }
    >
      {/* ── Step 1: pick a file ─────────────────────────────────────────── */}
      {step === 'pick' && (
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              accept(event.dataTransfer.files[0]);
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
              dragging
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-line hover:border-brand-500/60 hover:bg-surface-sunken/50'
            )}
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500">
              <FileSpreadsheet className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold text-content">
              {previewMutation.isPending ? 'Checking the file…' : 'Drop a CSV here, or click to browse'}
            </p>
            <p className="mt-1 text-xs text-content-muted">Up to 500 rows per file</p>

            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => accept(event.target.files?.[0])}
            />
          </div>

          <div className="rounded-2xl bg-surface-sunken/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-content">Not sure of the format?</p>
                <p className="mt-1 text-xs leading-relaxed text-content-muted">
                  Download the template. <strong>Department</strong>, <strong>unit</strong> and{' '}
                  <strong>role</strong> are written as names, exactly as they appear in the app.
                  Leave <strong>password</strong> blank and each person gets a generated one.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={template}
                leftIcon={<Download className="h-4 w-4" />}
                className="shrink-0"
              >
                Template
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: preview ─────────────────────────────────────────────── */}
      {step === 'preview' && preview && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Rows" value={preview.total} />
            <Stat label="Ready" value={preview.valid} tone="success" />
            <Stat label="With errors" value={preview.invalid} tone={preview.invalid ? 'danger' : undefined} />
          </div>

          {preview.invalid > 0 ? (
            <>
              <div className="rounded-2xl border border-danger-500/30 bg-danger-500/5 p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-danger-500" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-content">
                      {preview.invalid} row{preview.invalid === 1 ? '' : 's'} cannot be imported
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-content-muted">
                      Nothing is written unless you fix the file, or explicitly choose to skip these
                      rows. Line numbers match your spreadsheet.
                    </p>
                  </div>
                </div>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {invalidRows.map((row) => (
                  <div key={row.line} className="rounded-xl border border-line bg-surface-sunken/50 p-3">
                    <div className="flex items-baseline gap-2">
                      <span className="rounded-md bg-danger-500/15 px-1.5 py-0.5 font-mono text-2xs font-bold text-danger-500">
                        row {row.line}
                      </span>
                      <span className="truncate text-sm font-medium text-content">
                        {row.name || row.employeeId || row.email || '(blank)'}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {row.errors.map((error, index) => (
                        <li key={index} className="text-xs text-content-muted">
                          <span className="font-semibold text-content-subtle">{error.field}</span>
                          {' — '}
                          {error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <label className="flex items-center justify-between gap-4 rounded-2xl bg-surface-sunken/60 p-4">
                <span className="min-w-0 text-sm">
                  <span className="font-semibold text-content">Skip the bad rows</span>
                  <span className="mt-0.5 block text-xs text-content-muted">
                    Import the {preview.valid} valid row{preview.valid === 1 ? '' : 's'} and ignore
                    the rest.
                  </span>
                </span>
                <Switch checked={skipInvalid} onChange={setSkipInvalid} />
              </label>
            </>
          ) : (
            <div className="flex gap-3 rounded-2xl border border-success-500/30 bg-success-500/5 p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success-500" />
              <p className="text-sm text-content">
                Every row checks out. {preview.total} user
                {preview.total === 1 ? '' : 's'} will be created.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: done ────────────────────────────────────────────────── */}
      {step === 'done' && result && (
        <div className="space-y-5">
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-500/15 text-success-500">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <p className="text-lg font-bold text-content">
              {result.created} user{result.created === 1 ? '' : 's'} imported
            </p>
            {result.invalid > 0 && (
              <p className="mt-1 text-sm text-content-muted">
                {result.invalid} row{result.invalid === 1 ? '' : 's'} skipped.
              </p>
            )}
          </div>

          {result.credentials.some((c) => c.temporaryPassword) && (
            <div className="rounded-2xl border border-warning-500/30 bg-warning-500/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-content">Temporary passwords</p>
                  <p className="mt-1 text-xs leading-relaxed text-content-muted">
                    These are shown <strong>once</strong> and cannot be retrieved again. A welcome
                    email was sent to each person, but copy these now if email is not configured.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={copyCredentials}
                  leftIcon={<Copy className="h-4 w-4" />}
                  className="shrink-0"
                >
                  Copy
                </Button>
              </div>

              <div className="mt-3 max-h-48 overflow-y-auto rounded-xl bg-surface-sunken p-3">
                <table className="w-full text-left font-mono text-xs">
                  <tbody>
                    {result.credentials.map((credential) => (
                      <tr key={credential.employeeId}>
                        <td className="py-1 pr-3 text-content-muted">{credential.email}</td>
                        <td className="py-1 font-semibold text-content">
                          {credential.temporaryPassword ?? '(as supplied)'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

const Stat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'danger';
}) => (
  <div className="rounded-2xl bg-surface-sunken/60 p-4 text-center">
    <p
      className={cn(
        'text-2xl font-bold tabular-nums',
        tone === 'success' && 'text-success-500',
        tone === 'danger' && 'text-danger-500',
        !tone && 'text-content'
      )}
    >
      {value}
    </p>
    <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-content-muted">{label}</p>
  </div>
);

export default UserImportModal;