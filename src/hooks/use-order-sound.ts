'use client';
import { useEffect, useRef, useState } from 'react';

export function useOrderSound(restaurantId: string) {
  const key = `dsmenu-sound:${restaurantId}`;
  const [state, setState] = useState<'off' | 'enable' | 'on'>('enable');
  const audio = useRef<AudioContext | null>(null);
  const enabled = useRef(false);
  const nextTone = useRef(0);
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => { if (!disposed) { try { if (localStorage.getItem(key) === 'off') setState('off'); } catch { /* Memory preference still works. */ } } });
    return () => { disposed = true; enabled.current = false; void audio.current?.close(); audio.current = null; };
  }, [key]);
  async function toggle() {
    if (enabled.current) { enabled.current = false; setState('off'); try { localStorage.setItem(key, 'off'); } catch {} return; }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      enabled.current = audio.current.state === 'running';
      setState(enabled.current ? 'on' : 'enable');
      if (enabled.current) { try { localStorage.setItem(key, 'on'); } catch {} }
    } catch { setState('enable'); }
  }
  function play() {
    const context = audio.current;
    if (!enabled.current || !context) return;
    if (context.state !== 'running') { enabled.current = false; setState('enable'); return; }
    const oscillator = context.createOscillator();
    const start = Math.max(context.currentTime, nextTone.current);
    nextTone.current = start + 0.3;
    const gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.frequency.setValueAtTime(880, start);
    gain.gain.setValueAtTime(0.12, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
    oscillator.start(start); oscillator.stop(start + 0.25);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  return { state, toggle, play };
}
