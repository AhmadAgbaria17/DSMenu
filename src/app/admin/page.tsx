import { getTranslations } from 'next-intl/server';
import { requireSuperAdminPage } from '@/lib/platform-context';
import { platformOverview } from '@/lib/services/platform';
export default async function AdminPage() {
  await requireSuperAdminPage(); const data = await platformOverview(); const t = await getTranslations('Admin');
  return <><h1 className="mb-6 text-3xl font-bold">{t('overview')}</h1><div data-testid="admin-overview" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{(['total', 'active', 'inactive', 'users'] as const).map(key => <section key={key} className="rounded-2xl border bg-white p-6"><h2>{t(key)}</h2><p className="mt-3 text-4xl font-bold">{data[key]}</p></section>)}</div></>;
}
