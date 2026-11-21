import { ApiError, describeError, formatPhone, normalizePhone, WrongAppError } from '@pos/shared';
import { useState } from 'react';

import { PinPad } from '../components/PinPad';
import { useSession } from '../lib/hooks';
import { pos } from '../lib/pos';

type Mode = 'pin' | 'register' | 'manager';

/**
 * Uch yo'l (backend: `core/auth_views.py`):
 *  - `pin`      - kundalik kirish. Bitta terminalda smenalar almashadi: har kassir o'z PIN'i bilan kiradi.
 *  - `register` - qurilmani birinchi marta ro'yxatdan o'tkazish: menejer bergan 6 xonali bir martalik kod
 *                 (15 daqiqa) + kassir tanlagan PIN.
 *  - `manager`  - menejer telefon + parol bilan (qurilmaga bog'lanmaydi), masalan kod yaratish uchun.
 */
export function LoginScreen() {
  const { notice } = useSession();
  const [mode, setMode] = useState<Mode>('pin');
  const [error, setError] = useState<string | null>(null);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
  }

  async function loginPin(pin: string) {
    setError(null);
    try {
      await pos.loginPin(pin);
    } catch (e) {
      // 429: 5 ta xato urinishdan keyin 5 daqiqa qulf - serverning matni foydalanuvchiga ko'rsatiladi.
      setError(e instanceof WrongAppError ? e.message : describeError(e));
      throw e; // PinPad tozalanib "silkinsin"
    }
  }

  const HEADINGS: Record<Mode, string> = {
    pin: 'PIN kodingizni kiriting',
    register: "Qurilmani ro'yxatdan o'tkazish",
    manager: 'Menejer kirishi',
  };
  return (
    <div className="login">
      <section className="login-brand">
        <span className="lbl">Kassir terminali</span>
        <div>
          <div className="brand">
            Hamroh
            <br />
            POS
          </div>
          <div className="rule" />
          <p className="muted">Internet uzilsa ham ishlaydi. Buyurtma va to'lovlar saqlanadi.</p>
        </div>
        <span className="lbl">&nbsp;</span>
      </section>

      <section className="login-panel">
        <div className="tabs">
          <button className={mode === 'pin' ? 'active' : ''} onClick={() => switchMode('pin')}>
            PIN
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>
            Ro'yxatdan o'tish
          </button>
          <button className={mode === 'manager' ? 'active' : ''} onClick={() => switchMode('manager')}>
            Menejer
          </button>
        </div>

        <div>
          <span className="lbl">Smena boshlanishi</span>
          <h1 style={{ marginTop: 8, fontSize: '2.75rem' }}>{HEADINGS[mode]}</h1>
        </div>
        {notice && <div className="error">{notice}</div>}

        {mode === 'pin' && (
          <>
            <PinPad onComplete={loginPin} />
            {error && <div className="error">{error}</div>}
          </>
        )}
        {mode === 'register' && <RegisterForm />}
        {mode === 'manager' && <ManagerForm />}

        <button className="linkbtn" onClick={() => void pos.session.clearServer()}>
          Boshqa restoranga ulanish
        </button>
      </section>
    </div>
  );
}

function RegisterForm() {
  const [phone, setPhone] = useState('+998');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizePhone(phone);
  const valid = !!normalized && /^\d{6}$/.test(code) && /^\d{6}$/.test(pin);
  // Tugma nega o'chiqligi aniq aytilsin (faqat foydalanuvchi biror narsa yozgandan keyin).
  const hint = !normalized
    ? phone.replace(/\D/g, '').length > 3
      ? "Telefon raqam noto'g'ri. Masalan: +998 90 123 45 67"
      : null
    : !/^\d{6}$/.test(code)
      ? code
        ? `Menejer kodi 6 ta raqam bo'lishi kerak (hozir ${code.length} ta).`
        : null
      : !/^\d{6}$/.test(pin)
        ? pin
          ? `PIN 6 ta raqam bo'lishi kerak (hozir ${pin.length} ta).`
          : null
        : null;

  async function submit() {
    if (!normalized) return;
    setBusy(true);
    setError(null);
    try {
      await pos.registerDevice({ phone: normalized, code, pin, deviceLabel: 'Kassa (Windows)' });
    } catch (e) {
      setError(e instanceof WrongAppError ? e.message : describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void submit();
      }}
    >
      <p className="muted">Menejerdan 6 xonali bir martalik kod oling (15 daqiqa amal qiladi) va o'zingizga yangi 6 xonali PIN tanlang.</p>
      <div className="field">
        <label htmlFor="r-phone">Telefon raqam</label>
        <input id="r-phone" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} inputMode="tel" />
      </div>
      <div className="field">
        <label htmlFor="r-code">Menejer kodi</label>
        <input id="r-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
      </div>
      <div className="field">
        <label htmlFor="r-pin">Yangi PIN (6 xona)</label>
        <input id="r-pin" type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
      </div>
      {hint && !error && <div className="muted">{hint}</div>}
      {error && <div className="error">{error}</div>}
      <button className="btn" type="submit" disabled={busy || !valid}>
        {busy ? 'Yuborilmoqda...' : "Ro'yxatdan o'tish"}
      </button>
    </form>
  );
}

function ManagerForm() {
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError("Telefon raqam noto'g'ri. Masalan: +998 90 123 45 67");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await pos.loginManager(normalized, password);
    } catch (e) {
      // 400 - telefon/parol xato; WrongApp - bu hisob menejer emas.
      setError(e instanceof ApiError || e instanceof WrongAppError ? e.message : describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="field">
        <label htmlFor="m-phone">Telefon raqam</label>
        <input id="m-phone" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} inputMode="tel" />
      </div>
      <div className="field">
        <label htmlFor="m-pass">Parol</label>
        <input id="m-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <div className="error">{error}</div>}
      <button className="btn" type="submit" disabled={busy || !password}>
        {busy ? 'Kirilmoqda...' : 'Kirish'}
      </button>
    </form>
  );
}
