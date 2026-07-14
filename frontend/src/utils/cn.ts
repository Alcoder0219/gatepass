import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names, letting later Tailwind classes win conflicts. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export default cn;
