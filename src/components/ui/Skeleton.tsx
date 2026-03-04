interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse rounded-xl bg-white/5 ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="p-3 rounded-xl bg-white/3 animate-pulse space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-white/5" />
        <div className="flex-1 space-y-1">
          <div className="h-3.5 w-24 rounded bg-white/6" />
          <div className="h-2.5 w-16 rounded bg-white/4" />
        </div>
      </div>
    </div>
  );
}

export function CheckTileSkeleton() {
  return (
    <div className="p-3 rounded-xl bg-white/3 animate-pulse space-y-2 border border-white/5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-white/6" />
        <div className="flex-1">
          <div className="h-3 w-20 rounded bg-white/6" />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div className="h-2.5 w-12 rounded bg-white/4" />
        <div className="h-5 w-14 rounded bg-white/6" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-white/3" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}
