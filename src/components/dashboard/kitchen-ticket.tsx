'use client';
import { useLocale, useTranslations } from 'next-intl';
import { direction, localizedName } from '@/i18n/config';
import type { KitchenTicket } from '@/types/kitchen-ticket';

export function KitchenTicketContent({ ticket }: { ticket: KitchenTicket }) {
  const locale = useLocale(); const t = useTranslations('Kitchen');
  return <article className="kitchen-ticket" dir={direction(locale)} data-testid="kitchen-ticket">
    <header className="ticket-heading">
      <h1 dir="auto">{ticket.restaurantName}</h1>
      <h2>{ticket.fulfillmentType === 'TAKEAWAY' ? t('takeaway') : ticket.tableNumber === null ? t('tableUnknown') : <>{t('table')} <bdi dir="ltr">{ticket.tableNumber}</bdi></>}</h2>
      {ticket.customerName && <p className="ticket-customer" dir="auto">{ticket.customerName}</p>}
      <p>{t('title')}</p>
      <p>{t('preparedAt')} <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(ticket.preparedAt))}</bdi></p>
      <p>{t('orderReferences')} <bdi dir="ltr">{ticket.orders.map(order => `#${order.orderNumber}`).join(' + ')}</bdi></p>
      {ticket.orders.length > 1 && <p>{t('orderCount', { count: ticket.orders.length })}</p>}
    </header>
    {ticket.orders.map((order, index) => <section className="ticket-order" key={index} data-testid="ticket-order">
      <h3>{t('order')} <bdi dir="ltr">#{order.orderNumber}</bdi></h3>
      {order.notes && <p className="ticket-note"><strong>{t('note')}</strong><span dir="auto">{order.notes}</span></p>}
      {order.items.map((item, itemIndex) => <section className="ticket-item" key={itemIndex}>
        <h4><bdi dir="ltr">{item.quantity} ×</bdi> <bdi>{localizedName(item, locale)}</bdi></h4>
        {item.options.filter(group => group.selected.length || group.removed.length).map((group, groupIndex) => <div className="ticket-options" key={groupIndex}>
          <h5>{localizedName(group, locale)}</h5>
          {group.selected.length > 0 && <ul>{group.selected.map((option, optionIndex) => <li key={optionIndex}><bdi>{localizedName(option, locale)}</bdi></li>)}</ul>}
          {group.removed.length > 0 && <div className="ticket-removed"><strong>{t('remove')}</strong><ul>{group.removed.map((option, optionIndex) => <li key={optionIndex}><bdi>{localizedName(option, locale)}</bdi></li>)}</ul></div>}
        </div>)}
        {item.note && <p className="ticket-note"><strong>{t('note')}</strong><span dir="auto">{item.note}</span></p>}
      </section>)}
    </section>)}
    <footer className="ticket-footer">{t('title')}</footer>
  </article>;
}
