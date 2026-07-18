/**
 * The in-dashboard route fallback. FullPageLoader is `min-h-dvh` and centres
 * itself, which inside the content column reads as the page collapsing — so
 * transitions felt like a flash of nothing. This holds roughly the shape of a
 * page instead, so a route change looks like content arriving, not leaving.
 */
export const PageSkeleton = () => (
  <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
    <div className="space-y-3">
      <div className="h-8 w-64 rounded-xl bg-content/10" />
      <div className="h-4 w-96 max-w-full rounded-lg bg-content/[0.07]" />
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-28 rounded-2xl bg-content/[0.07]" />
      ))}
    </div>

    <div className="space-y-3 rounded-2xl bg-content/[0.05] p-5">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-11 rounded-xl bg-content/[0.07]" />
      ))}
    </div>

    <span className="sr-only">Loading page…</span>
  </div>
);

export default PageSkeleton;
