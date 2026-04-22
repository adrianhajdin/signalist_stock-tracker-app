import { Skeleton } from "@/components/ui/skeleton";

export default function AnalystDetailLoading() {
  return (
    <div className="h-[calc(100dvh-3rem)] flex flex-col">
      <div className="flex items-center justify-between px-6 h-14 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-5 w-14" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="px-6 mt-4">
        <Skeleton className="h-9 w-72" />
      </div>
      <div className="flex-1 px-6 py-6 space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  );
}
