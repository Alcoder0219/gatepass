import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { backdropVariants, modalVariants } from '@/animations/variants';
import { Button } from './Button';

type Size = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZES: Record<Size, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  size?: Size;
  children: ReactNode;
  footer?: ReactNode;
  /** Blocks backdrop / Escape dismissal — for a step the user must finish. */
  dismissible?: boolean;
  className?: string;
}

export const Modal = ({
  open,
  onClose,
  title,
  description,
  icon,
  size = 'md',
  children,
  footer,
  dismissible = true,
  className,
}: ModalProps) => {
  /* Escape closes, and the body is locked so the page behind cannot scroll. */
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, dismissible]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={dismissible ? onClose : undefined}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              'glass-strong relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden',
              // Bottom sheet on mobile, centred dialog from `sm` up.
              'rounded-t-3xl sm:rounded-3xl',
              SIZES[size],
              className
            )}
          >
            {(title || dismissible) && (
              <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
                <div className="flex min-w-0 items-start gap-3">
                  {icon && (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
                      {icon}
                    </div>
                  )}
                  <div className="min-w-0">
                    {title && (
                      <h2 id="modal-title" className="text-lg font-semibold text-content">
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p className="mt-0.5 text-sm text-content-muted">{description}</p>
                    )}
                  </div>
                </div>

                {dismissible && (
                  <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </header>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

            {footer && (
              <footer className="flex flex-col-reverse gap-2 border-t border-line bg-surface-sunken/40 px-6 py-4 sm:flex-row sm:justify-end">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

/* ─── Confirm dialog ─────────────────────────────────────────────────────── */
export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Return value is ignored — callers often pass a mutation call directly. */
  onConfirm: () => unknown;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary' | 'success';
  isLoading?: boolean;
  icon?: ReactNode;
}

/** The single confirmation surface for every destructive or irreversible action. */
export const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  isLoading,
  icon,
}: ConfirmDialogProps) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    icon={icon}
    size="sm"
    dismissible={!isLoading}
    footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button variant={tone} onClick={() => void onConfirm()} isLoading={isLoading}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <div className="text-sm leading-relaxed text-content-muted">{message}</div>
  </Modal>
);

export default Modal;
