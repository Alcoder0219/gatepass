import { cn } from '@/utils/cn';
import { BRAND } from '@/config/brand';

/**
 * The brand mark. The logo art has a white background, so it always sits in a
 * light rounded plate — that reads cleanly on the dark chrome and on the green
 * auth gradient alike. Size it with `className` (h-/w-), the image fills it.
 */
export const Logo = ({ className }: { className?: string }) => (
  <span
    className={cn(
      'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-glow',
      className
    )}
  >
    <img
      src={BRAND.logo}
      alt={`${BRAND.name} logo`}
      className="h-full w-full object-contain p-1"
      draggable={false}
    />
  </span>
);

export default Logo;
