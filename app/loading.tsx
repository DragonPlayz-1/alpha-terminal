import { Card, Skeleton } from "@/components/ui";

export default function Loading() {
  return <main className="min-h-dvh px-5 py-10"><div className="mx-auto max-w-[1280px] space-y-5"><Skeleton className="h-8 w-48" /><Card className="p-6"><Skeleton className="h-8 w-64" /><Skeleton className="mt-4 h-4 w-full max-w-xl" /><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-28" />)}</div></Card></div></main>;
}
