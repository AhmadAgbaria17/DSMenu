import { getTranslations } from 'next-intl/server';
import { requireSuperAdminPage } from '@/lib/platform-context';
import { CreateRestaurantForm } from '@/components/admin/create-restaurant-form';
export default async function NewRestaurantPage() {
  await requireSuperAdminPage(); const t = await getTranslations('Admin');
  return <><h1 className="mb-6 text-3xl font-bold">{t('createRestaurant')}</h1><CreateRestaurantForm /></>;
}
