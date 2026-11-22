import { waiterCallTableLabel } from '@pos/shared';

import { useWaiterCalls } from '../lib/hooks';

/** Ikki notali qisqa "ding-dong" - fayl/kutubxonasiz, WebAudio bilan. */
function chime(): void {
  try {
    const ctx = new AudioContext();
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.28;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Ovoz chiqmasa ham oyna baribir ko'rinadi.
  }
}

function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Mijoz QR saytidan chaqirsa (stolda ofitsiant yo'q bo'lsa kassaga ham keladi),
 * har qanday ekran ustidan chiqadi. "Ko'rdim" bosilguncha turadi.
 */
export function WaiterCallAlert() {
  const { calls, dismiss } = useWaiterCalls(chime);
  const call = calls[0];
  if (!call) return null;
  return (
    <div className="overlay call-alert">
      <div className="sheet" role="alertdialog" aria-label="Mijoz chaqiruvi">
        <div className="sheet-body">
          <div className="call-alert-eyebrow">Mijoz chaqiryapti</div>
          <div className="call-alert-table">{waiterCallTableLabel(call.tableName)}</div>
          <div className="call-alert-reason">
            {call.reason}
            {call.count > 1 ? ` · ${call.count} marta` : ''}
          </div>
          <div className="muted">
            {clock(call.at)}
            {calls.length > 1 ? ` · yana ${calls.length - 1} ta chaqiruv` : ''}
          </div>
          <button className="btn" autoFocus onClick={() => dismiss(call.tableId)}>
            Ko'rdim
          </button>
        </div>
      </div>
    </div>
  );
}
