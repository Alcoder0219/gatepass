import { useState } from 'react';
import { cn } from '@/utils/cn';
import { assetUrl, initialsOf } from '@/utils/format';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<Size, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

/** Deterministic hue from the name, so the same person is always the same colour. */
const GRADIENTS = [
  'from-brand-500 to-accent-500',
  'from-violet-500 to-brand-500',
  'from-accent-500 to-emerald-500',
  'from-amber-500 to-rose-500',
  'from-rose-500 to-violet-500',
  'from-emerald-500 to-accent-500',
];

const gradientFor = (seed: string) => {
  const hash = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
};

export const Avatar = ({
  src,
  name,
  size = 'md',
  className,
  ring,
  status,
}: {
  src?: string;
  name?: string;
  size?: Size;
  className?: string;
  ring?: boolean;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}) => {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <div className={cn('relative shrink-0', className)}>
      {showImage ? (
        <img
          src={assetUrl(src)}
          alt={name ?? 'Avatar'}
          onError={() => setFailed(true)}
          className={cn(
            'rounded-full object-cover',
            SIZES[size],
            ring && 'ring-2 ring-brand-500/30 ring-offset-2 ring-offset-surface'
          )}
        />
      ) : (
        <div
          aria-label={name}
          className={cn(
            'flex items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white',
            gradientFor(name ?? '?'),
            SIZES[size],
            ring && 'ring-2 ring-brand-500/30 ring-offset-2 ring-offset-surface'
          )}
        >
          {initialsOf(name)}
        </div>
      )}

      {status && (
        <span
          title={status}
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-2 ring-surface',
            size === 'xs' || size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5',
            status === 'ACTIVE' && 'bg-success-500',
            status === 'INACTIVE' && 'bg-content-subtle',
            status === 'SUSPENDED' && 'bg-danger-500'
          )}
        />
      )}
    </div>
  );
};

/** Overlapping avatar row with a "+n" overflow chip. */
export const AvatarGroup = ({
  people,
  max = 4,
  size = 'sm',
}: {
  people: { name?: string; profileImage?: string }[];
  max?: number;
  size?: Size;
}) => {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <div className="flex -space-x-2">
      {shown.map((person, index) => (
        <Avatar
          key={index}
          name={person.name}
          src={person.profileImage}
          size={size}
          className="ring-2 ring-surface"
        />
      ))}
      {overflow > 0 && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-content/10 font-semibold text-content-muted ring-2 ring-surface',
            SIZES[size]
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
};

export default Avatar;
