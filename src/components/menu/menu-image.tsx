'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { PublicImage } from '@/types/menu';

export function MenuImage({ image, alt, className = '', priority = false }: {
  image: PublicImage | null; alt: string; className?: string; priority?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const src = image?.url;
  return <div className={`relative overflow-hidden bg-[#eeeade] ${className}`}>
    {src && src !== failedSource
      ? <Image src={src} alt={alt} fill sizes="(max-width: 640px) 100vw, 600px" className="object-cover" unoptimized
          loading={priority ? 'eager' : 'lazy'} onError={() => setFailedSource(src)} />
      : <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_top_right,#ded9c6,transparent_70%)]" aria-hidden="true">
          <div className="grid size-20 place-items-center rounded-full border border-stone-400/20 bg-white/20 shadow-[0_0_0_12px_#ffffff25]">
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none" className="text-stone-500/60"><circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="1.2" /><circle cx="16" cy="16" r="5" stroke="currentColor" strokeWidth="1.2" /><path d="M3 5v8m3-8v8m-1.5 0v14M28 5v22m0-22c-4 4-4 9 0 10" stroke="currentColor" strokeWidth="1.2" /></svg>
          </div>
        </div>}
  </div>;
}
