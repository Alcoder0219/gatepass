import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { label, error, hint, leftIcon, rightIcon, className, containerClassName, type = 'text', id, ...props },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [revealed, setRevealed] = useState(false);

    const isPassword = type === 'password';
    const resolvedType = isPassword && revealed ? 'text' : type;

    return (
      <div className={cn('w-full', containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-content">
            {label}
            {props.required && <span className="ml-0.5 text-danger-500">*</span>}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-subtle">
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            className={cn(
              'input-base',
              leftIcon && 'pl-11',
              (rightIcon || isPassword) && 'pr-11',
              error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/10',
              className
            )}
            {...props}
          />

          {isPassword && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-content-subtle transition-colors hover:text-content"
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}

          {!isPassword && rightIcon && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-content-subtle">
              {rightIcon}
            </span>
          )}
        </div>

        <AnimatePresence mode="wait">
          {error ? (
            <motion.p
              key="error"
              id={`${inputId}-error`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-danger-500"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </motion.p>
          ) : hint ? (
            <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-content-subtle">
              {hint}
            </p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }
);
Input.displayName = 'Input';

/* ─── Textarea ───────────────────────────────────────────────────────────── */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Shows a live "n / max" counter — pair it with `maxLength`. */
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, showCount, className, id, maxLength, value, ...props }, ref) => {
    const generatedId = useId();
    const areaId = id ?? generatedId;
    const length = typeof value === 'string' ? value.length : 0;

    return (
      <div className="w-full">
        {label && (
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor={areaId} className="block text-sm font-medium text-content">
              {label}
              {props.required && <span className="ml-0.5 text-danger-500">*</span>}
            </label>
            {showCount && maxLength && (
              <span
                className={cn(
                  'text-xs tabular-nums',
                  length > maxLength * 0.9 ? 'text-warning-500' : 'text-content-subtle'
                )}
              >
                {length}/{maxLength}
              </span>
            )}
          </div>
        )}

        <textarea
          ref={ref}
          id={areaId}
          maxLength={maxLength}
          value={value}
          aria-invalid={Boolean(error)}
          className={cn(
            'input-base min-h-[96px] resize-y',
            error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/10',
            className
          )}
          {...props}
        />

        {error ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-danger-500">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        ) : hint ? (
          <p className="mt-1.5 text-xs text-content-subtle">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

/* ─── Select ─────────────────────────────────────────────────────────────── */
export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className, id, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-content">
            {label}
            {props.required && <span className="ml-0.5 text-danger-500">*</span>}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={Boolean(error)}
            className={cn(
              'input-base cursor-pointer appearance-none pr-10',
              error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/10',
              className
            )}
            {...props}
          >
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <svg
            className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {error ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-danger-500">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        ) : hint ? (
          <p className="mt-1.5 text-xs text-content-subtle">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Select.displayName = 'Select';

export default Input;
