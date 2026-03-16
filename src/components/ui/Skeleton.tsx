interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton rounded-2xl ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="p-4 rounded-2xl bg-[var(--c-surface)] animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--c-surface-hover)]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 rounded bg-[var(--c-surface-hover)]" />
          <div className="h-3 w-16 rounded bg-[var(--c-surface)]" />
        </div>
      </div>
    </div>
  );
}

export function CheckTileSkeleton() {
  return (
    <div className="p-4 rounded-2xl bg-[var(--c-surface)] animate-pulse space-y-3 border border-[var(--c-border)]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--c-surface-hover)]" />
        <div className="flex-1">
          <div className="h-4 w-20 rounded bg-[var(--c-surface-hover)]" />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div className="h-3 w-12 rounded bg-[var(--c-surface)]" />
        <div className="h-6 w-14 rounded bg-[var(--c-surface-hover)]" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-2xl bg-[var(--c-surface)]" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}
