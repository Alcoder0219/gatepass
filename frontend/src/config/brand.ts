/**
 * Single source of truth for the product's identity. Change the name, tagline or
 * logo here and every surface — sidebar, auth screens, loader, document title —
 * follows. Nothing else should hardcode the brand.
 */
export const BRAND = {
  name: 'Amsons Group',
  shortName: 'Amsons',
  tagline: 'Enterprise Gate Pass Management',
  /** Served from frontend/public — self-hosted, no external dependency at runtime. */
  logo: '/amson-logo.png',
} as const;
