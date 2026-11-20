import { useEffect, useState } from 'react';

const PIN_LENGTH = 6;

interface Props {
  /** To'liq kiritilganda avtomatik chaqiriladi. Xato bo'lsa `reject` ni tashlang - PIN tozalanadi va "silkinadi". */
  onComplete: (pin: string) => Promise<void>;
  disabled?: boolean;
}

/** Sensorli 6 xonali PIN klaviatura: ekran klaviaturasi kerak emas, 6-raqamda o'zi yuboradi. */
export function PinPad({ onComplete, disabled }: Props) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  async function submit(value: string) {
    setBusy(true);
    try {
      await onComplete(value);
    } catch {
      setShake(true);
      setTimeout(() => setShake(false), 400);
    } finally {
      setPin('');
      setBusy(false);
    }
  }

  function press(d: string) {
    if (busy || disabled) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  }

  // Doimiy ulangan raqamli klaviatura (monoblok + tashqi klaviatura) ham ishlasin.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const locked = busy || disabled;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className={`pin-dots${shake ? ' shake' : ''}`} aria-label={`${pin.length} / ${PIN_LENGTH} raqam kiritildi`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className={i < pin.length ? 'filled' : ''} />
        ))}
      </div>
      <div className="pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" disabled={locked} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" disabled={locked || pin.length === 0} onClick={() => setPin('')} aria-label="Tozalash">
          C
        </button>
        <button type="button" disabled={locked} onClick={() => press('0')}>
          0
        </button>
        <button type="button" disabled={locked || pin.length === 0} onClick={() => setPin((p) => p.slice(0, -1))} aria-label="O'chirish">
          ⌫
        </button>
      </div>
    </div>
  );
}
