import { useRef, useState, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { File as FileIcon, Image as ImageIcon, Paperclip, UploadCloud, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatBytes } from '@/utils/format';
import { Button } from './Button';

export interface FileUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  accept?: string;
  maxFiles?: number;
  maxSizeMb?: number;
  label?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
}

/** Drag-and-drop + click-to-browse, with client-side size/count guards that
 *  mirror the server's multer limits so the user fails fast, not after upload. */
export const FileUpload = ({
  files,
  onChange,
  accept = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx',
  maxFiles = 5,
  maxSizeMb = 5,
  label = 'Attachments',
  hint,
  error,
  disabled,
}: FileUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const accept_ = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    setLocalError(null);

    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (next.length >= maxFiles) {
        setLocalError(`You can attach at most ${maxFiles} files`);
        break;
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        setLocalError(`${file.name} is larger than ${maxSizeMb}MB`);
        continue;
      }
      next.push(file);
    }
    onChange(next);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) accept_(event.dataTransfer.files);
  };

  const remove = (index: number) => onChange(files.filter((_, i) => i !== index));

  const message = error ?? localError;

  return (
    <div className="w-full">
      {label && <span className="mb-1.5 block text-sm font-medium text-content">{label}</span>}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all duration-200',
          dragging
            ? 'border-brand-500 bg-brand-500/10 scale-[1.01]'
            : 'border-line hover:border-brand-500/50 hover:bg-brand-500/[0.03]',
          message && 'border-danger-500/60',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <motion.div
          animate={dragging ? { y: -4, scale: 1.08 } : { y: 0, scale: 1 }}
          className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand-500"
        >
          <UploadCloud className="h-5 w-5" />
        </motion.div>

        <p className="text-sm font-medium text-content">
          {dragging ? 'Drop to attach' : 'Drag files here, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-content-subtle">
          {hint ?? `Up to ${maxFiles} files, max ${maxSizeMb}MB each`}
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple={maxFiles > 1}
          accept={accept}
          disabled={disabled}
          onChange={(event) => {
            accept_(event.target.files);
            event.target.value = ''; // allow re-picking the same file
          }}
          className="hidden"
        />
      </div>

      {message && <p className="mt-1.5 text-xs font-medium text-danger-500">{message}</p>}

      <AnimatePresence initial={false}>
        {files.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-2 overflow-hidden"
          >
            {files.map((file, index) => (
              <motion.li
                key={`${file.name}-${index}`}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface-sunken/50 px-3 py-2.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                  {file.type.startsWith('image/') ? (
                    <ImageIcon className="h-4 w-4" />
                  ) : (
                    <FileIcon className="h-4 w-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content">{file.name}</p>
                  <p className="text-xs text-content-subtle">{formatBytes(file.size)}</p>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(index);
                  }}
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

/** Read-only list of already-uploaded attachments on a saved gate pass. */
export const AttachmentList = ({
  attachments,
}: {
  attachments: { _id: string; originalName: string; size: number; url: string; mimetype: string }[];
}) => {
  if (!attachments.length) {
    return <p className="text-sm text-content-subtle">No attachments</p>;
  }

  return (
    <ul className="space-y-2">
      {attachments.map((attachment) => (
        <li key={attachment._id}>
          <a
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-line bg-surface-sunken/50 px-3 py-2.5 transition-colors hover:border-brand-500/40 hover:bg-brand-500/5"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
              <Paperclip className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-content">{attachment.originalName}</p>
              <p className="text-xs text-content-subtle">{formatBytes(attachment.size)}</p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
};

export default FileUpload;
