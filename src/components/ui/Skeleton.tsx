interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse rounded-xl bg-[var(--c-surface)] ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="p-3 rounded-xl bg-[var(--c-surface)] animate-pulse space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[var(--c-surface)]" />
        <div className="flex-1 space-y-1">
          <div className="h-3.5 w-24 rounded bg-[var(--c-surface-hover)]" />
          <div className="h-2.5 w-16 rounded bg-[var(--c-surface)]" />
        </div>
      </div>
    </div>
  );
}

export function CheckTileSkeleton() {
  return (
    <div className="p-3 rounded-xl bg-[var(--c-surface)] animate-pulse space-y-2 border border-[var(--c-border)]">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[var(--c-surface-hover)]" />
        <div className="flex-1">
          <div className="h-3 w-20 rounded bg-[var(--c-surface-hover)]" />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div className="h-2.5 w-12 rounded bg-[var(--c-surface)]" />
        <div className="h-5 w-14 rounded bg-[var(--c-surface-hover)]" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-[var(--c-surface)]" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}
