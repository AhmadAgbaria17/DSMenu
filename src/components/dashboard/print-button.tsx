'use client';
import Image from 'next/image';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
export function PrintButton() { const t = useTranslations('Tables'); return <button className="min-h-12 rounded-xl bg-stone-900 px-6 font-bold text-white print:hidden" onClick={() => window.print()}>{t('printNow')}</button>; }
export function PrintLogo({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <Image unoptimized loading="eager" src={url} width={64} height={64} alt="" className="mx-auto mb-3 object-contain" onError={() => setFailed(true)} />;
}
