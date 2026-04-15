export function ScheduleSkeleton() {
  return (
    <ul className="space-y-3 animate-pulse">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex gap-4 rounded-lg border border-slate-100 bg-slate-50 p-3"
        >
          <div className="flex flex-col gap-1">
            <div className="h-3 w-10 rounded bg-slate-200" />
            <div className="h-3 w-10 rounded bg-slate-200" />
          </div>
          <div className="flex-1">
            <div className="h-4 w-3/5 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-1/3 rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TasksSkeleton() {
  return (
    <ul className="space-y-2 animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"
        >
          <div className="h-4 w-4 rounded-full border-2 border-slate-200" />
          <div className="h-4 flex-1 rounded bg-slate-200" />
          <div className="h-3 w-12 rounded bg-slate-100" />
        </li>
      ))}
    </ul>
  );
}
