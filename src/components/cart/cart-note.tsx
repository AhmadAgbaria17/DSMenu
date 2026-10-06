'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cartLineKey, MAX_NOTE_LENGTH, MAX_QUANTITY, type CartLine } from '@/lib/cart';
import { useCart } from './cart-provider';
export function CartNote({ line }: { line: CartLine }) {
  const cart = useCart(); const t = useTranslations('Shopping');
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(line.note);
  const key = cartLineKey(line);
  const matching = cart.lines.find(item => cartLineKey(item) !== key && item.productId === line.productId && item.note === note.trim());
  const exceedsLimit = !!matching && matching.quantity + line.quantity > MAX_QUANTITY;
  return <fieldset disabled={cart.locked} className="mt-3">{editing ? <><label className="block text-sm font-bold">{t('note')}<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={MAX_NOTE_LENGTH} rows={2} dir="auto" className="mt-2 w-full rounded-xl border border-stone-300 p-3 text-base" /></label>{exceedsLimit && <p role="alert">{t('limit')}</p>}<div className="mt-2 flex gap-2"><button type="button" disabled={exceedsLimit} onClick={() => { cart.dispatch({ type: 'note', key, note }); setEditing(false); }} className="min-h-11 rounded-full bg-emerald-950 px-4 text-sm font-bold text-white">{t('saveNote')}</button><button type="button" onClick={() => { setNote(line.note); setEditing(false); }} className="min-h-11 rounded-full border px-4 text-sm">{t('cancelNote')}</button></div></> : <button type="button" onClick={() => setEditing(true)} className="min-h-11 rounded-full border px-4 text-sm">{t('editNote')}</button>}</fieldset>;
}
