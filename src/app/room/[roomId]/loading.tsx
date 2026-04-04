export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full pt-32">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Fernandle</h1>
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="w-14 h-14 border-2 border-zinc-300 dark:border-zinc-700 rounded-md animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">Loading game...</p>
      </div>
    </div>
  );
}
