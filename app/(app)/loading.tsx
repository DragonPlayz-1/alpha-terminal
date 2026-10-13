import { Card, Skeleton } from "@/components/ui";

export default function AppLoading() {
  return <div className="space-y-5"><Skeleton className="h-8 w-56" /><Card className="p-6"><Skeleton className="h-5 w-40" /><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-28" />)}</div></Card></div>;
}
