'use client';

import { useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localizedName } from '@/i18n/config';
import { searchProducts } from '@/lib/menu';
import type { PublicCategory, PublicProduct, PublicRestaurant, PublicTable } from '@/types/menu';
import { CartProvider, useCart } from '@/components/cart/cart-provider';
import { MyOrderButton, MyOrderDrawer } from '@/components/cart/my-order';
import { ProductCard } from './product-card';
import { ProductDetails } from './product-details';
import { OrdersProvider } from '@/components/orders/orders-provider';
import { ServiceActions } from './service-actions';
import { MenuImage } from './menu-image';

type MenuBrowserProps = { restaurant: PublicRestaurant; table: PublicTable | null; categories: PublicCategory[]; products: PublicProduct[] };

export function MenuBrowser(props: MenuBrowserProps) {
  return <CartProvider key={`${props.restaurant.id}:${props.table?.tableNumber ?? 'none'}`} restaurantId={props.restaurant.id} tableNumber={props.table?.tableNumber ?? null} products={props.products}>
    <OrdersProvider slug={props.restaurant.slug} restaurantId={props.restaurant.id} tableNumber={props.table?.tableNumber ?? null}><MenuContents {...props} /></OrdersProvider>
  </CartProvider>;
}

function MenuContents({ restaurant, table, categories, products }: MenuBrowserProps) {
  const locale = useLocale();
  const t = useTranslations('Shopping');
  const menu = useTranslations('Menu');
  const cart = useCart();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const searchId = useId();
  const visible = searchProducts(products, query, locale);
  const selected = products.find(product => product.id === selectedId);
  const featured = visible.filter(product => product.isFeatured);
  const activeSearch = query.trim().length > 0;
  const visibleCategories = activeSearch ? categories.filter(category => visible.some(product => product.categoryId === category.id)) : categories;

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 3500);
    return () => clearTimeout(timer);
  }, [added]);

  function card(product: PublicProduct) {
    return <ProductCard key={product.id} product={product} currency={restaurant.currency} canAdd={cart.ready && cart.canOrder && !cart.locked} onOpen={() => setSelectedId(product.id)} />;
  }

  return <>
    {table && <ServiceActions />}
    <div className="mb-5 mt-8"><label htmlFor={searchId} className="mb-2 block text-sm font-bold">{t('search')}</label>
      <div className="relative"><svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" className="absolute start-4 top-4 text-stone-500"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('searchPlaceholder')} maxLength={150} className="min-h-14 w-full rounded-2xl border border-stone-200 bg-white pe-12 ps-12 text-base shadow-sm" />
        {query && <button type="button" aria-label={t('clearSearch')} onClick={() => setQuery('')} className="absolute end-1 top-1 grid size-12 place-items-center rounded-full text-xl">×</button>}
      </div>
    </div>
    {!table && <p className="mb-4 text-sm text-stone-600">{t('selectTable')}</p>}
    {cart.warning && <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><p>{t(cart.warning === 'storage' ? 'storageWarning' : 'cartRecovered')}</p><button type="button" onClick={cart.dismissWarning} aria-label={t('close')} className="size-11 shrink-0 rounded-full">×</button></div>}
    {visibleCategories.length > 0 && <nav aria-label={menu('categories')} className="sticky top-0 z-10 -mx-5 mb-8 flex gap-2 overflow-x-auto border-b border-stone-200 bg-[#f8f7f2]/95 px-5 py-4 backdrop-blur sm:mx-0 sm:px-0">
      {visibleCategories.map(category => <a key={category.id} href={`#category-${category.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-stone-300 bg-white px-5 text-sm font-bold hover:bg-emerald-950 hover:text-white">{localizedName(category, locale)}</a>)}
    </nav>}
    {activeSearch && <p role="status" className="mb-5 text-sm text-stone-600">{t('results', { count: visible.length })}</p>}
    {featured.length > 0 && <section aria-labelledby="featured-title" className="mb-10"><div className="mb-5 flex items-baseline gap-3"><span aria-hidden="true" className="text-amber-800">✦</span><h2 id="featured-title" className="text-2xl font-bold">{t('featured')}</h2></div><div key={locale} className="menu-product-row" role="region" aria-labelledby="featured-title" tabIndex={0}>{featured.map(card)}</div></section>}
    <h2 className="mb-6 text-3xl font-bold">{menu('title')}</h2>
    {visible.length === 0 && <div className="mb-8 rounded-2xl border border-dashed border-stone-300 p-10 text-center"><p className="font-bold">{activeSearch ? t('noResults') : menu('empty')}</p>{activeSearch && <button type="button" onClick={() => setQuery('')} className="mt-4 min-h-11 rounded-full bg-white px-5 font-bold">{t('clearSearch')}</button>}</div>}
    {visibleCategories.map(category => {
      const categoryProducts = visible.filter(product => product.categoryId === category.id);
      return <section key={category.id} id={`category-${category.id}`} className="mb-10 scroll-mt-24">{category.image && <MenuImage image={category.image} alt={localizedName(category, locale)} className="mb-4 h-32 w-full rounded-2xl" />}<h3 id={`category-title-${category.id}`} className="mb-5 text-xl font-bold">{localizedName(category, locale)}</h3>
        {categoryProducts.length ? <div key={locale} className="menu-product-row" role="region" aria-labelledby={`category-title-${category.id}`} tabIndex={0}>{categoryProducts.map(card)}</div> : <p className="rounded-xl bg-white p-6 text-sm text-stone-500">{t('emptyCategory')}</p>}
      </section>;
    })}
    {selected && <ProductDetails key={selected.id} product={selected} currency={restaurant.currency} onClose={() => setSelectedId(null)} onAdded={() => { setSelectedId(null); setAdded(true); }} />}
    {table && <MyOrderButton currency={restaurant.currency} tableNumber={table.tableNumber} onOpen={() => { setAdded(false); setOrderOpen(true); }} />}
    {orderOpen && table && <MyOrderDrawer restaurant={restaurant} table={table} onClose={() => setOrderOpen(false)} />}
    <div role="status" aria-live="polite" className={added ? 'fixed inset-x-5 bottom-28 z-30 mx-auto w-fit max-w-[calc(100%-2.5rem)] rounded-full bg-white px-6 py-3 text-sm font-bold shadow-lg ring-1 ring-stone-200' : 'sr-only'}>{added ? t('added') : ''}</div>
  </>;
}
