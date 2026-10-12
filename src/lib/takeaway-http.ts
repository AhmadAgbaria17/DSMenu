import 'server-only';
import { NextRequest } from 'next/server';
import { resolveTakeaway } from './services/takeaway-session';
import { CustomerRequestError } from './customer-errors';
export type TakeawayContext = { params: Promise<{ slug: string }> };
export const takeawayCookie = (slug: string) => `dsmenu-takeaway-${slug}`;
export async function takeawayContext(request: NextRequest, context: TakeawayContext) {
  if (request.nextUrl.search) throw new CustomerRequestError('INVALID_REQUEST');
  const { slug } = await context.params;
  const restaurant = await resolveTakeaway(slug);
  return { slug, restaurant, token: request.cookies.get(takeawayCookie(slug))?.value };
}
