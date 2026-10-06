export default function DashboardLoading() {
  return <div aria-busy="true" className="animate-pulse space-y-6"><div className="h-10 w-48 rounded-xl bg-stone-200" /><div className="grid gap-4 sm:grid-cols-2">{[1, 2, 3, 4].map(key => <div key={key} className="h-36 rounded-2xl bg-stone-200" />)}</div></div>;
}
