import 'server-only';
import { Restaurant } from '@/models';
import { requireStaffApi } from '@/lib/staff-http';
import { appOrigin } from '@/lib/env';
import { takeawayQrUrl } from '@/lib/qr';
export async function getTakeawayQr() {
  const staff = await requireStaffApi();
  const restaurant = await Restaurant.findById(staff.restaurantId).select('name slug').lean().orFail();
  return { name: restaurant.name, url: takeawayQrUrl(appOrigin(), restaurant.slug), filename: `${restaurant.slug}-takeaway.png` };
}
