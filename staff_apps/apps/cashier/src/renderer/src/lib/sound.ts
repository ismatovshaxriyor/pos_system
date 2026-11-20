import { getAppearance } from './appearance';

let ctx: AudioContext | null = null;

/** To'lov qabul qilinganda yumshoq ikki notali signal (E5 → A5). Sozlamada o'chirilgan bo'lsa jim. */
export function playPaid(): void {
  if (!getAppearance().sound) return;
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const notes: [number, number][] = [
      [659.25, 0],
      [880, 0.13],
    ];
    for (const [freq, delay] of notes) {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.07, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  } catch {
    // Audio mavjud bo'lmasa to'lov jarayoniga ta'sir qilmasin.
  }
}
