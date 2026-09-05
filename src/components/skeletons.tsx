/** Squelettes de chargement — perception de vitesse pendant le streaming SSR. */

export function SkeletonCards({ n = 6 }: { n?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <div className="skeleton h-5 w-3/4" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-8 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage({ titre = true }: { titre?: boolean }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {titre && <div className="skeleton mb-6 h-8 w-64" />}
      <SkeletonCards />
    </div>
  );
}
