import {
  CASHIER_LAYOUTS,
  type CashierPanel,
  type TextScale,
  type ThemePref,
} from "@pos/design";
import { setAppearance, useAppearance } from "../lib/appearance";

const THEMES: { id: ThemePref; label: string }[] = [
  { id: "light", label: "Kun" },
  { id: "night", label: "Tun" },
  { id: "auto", label: "Avto" },
];
const SCALES: { id: TextScale; label: string }[] = [
  { id: "normal", label: "Oddiy" },
  { id: "large", label: "Katta" },
  { id: "xlarge", label: "Juda katta" },
];

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      className={`sw${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    />
  );
}

/**
 * ☰ menyu: ko'z uchun sozlamalar (mavzu, matn o'lchami, harakat, tovush) va kamdan-kam kerak bo'ladigan
 * xavfli amallar (kassani yopish, smena almashtirish) - ikki bosqichli tasdiq bilan, tasodifan barmoq tegib ketmasin.
 */
export function MenuSheet({
  registerOpen,
  who,
  onToggleRegister,
  onCloseRegister,
  onSignOut,
  onToggleFullscreen,
  onOpenDebts,
  onOpenDayEnd,
  onClose,
}: {
  registerOpen: boolean;
  who: string;
  /** Kassani OCHISH (yopiq paytda). */
  onToggleRegister: () => void;
  /** Kassani yopish: kun yakuni hisoboti ochiladi, tasdiq shu hisobot ichida. */
  onCloseRegister: () => void;
  onSignOut: () => void;
  onToggleFullscreen?: () => void;
  onOpenDebts: () => void;
  onOpenDayEnd: () => void;
  onClose: () => void;
}) {
  const ap = useAppearance();

  return (
    <div className="overlay side" onClick={onClose}>
      <aside className="menu" onClick={(e) => e.stopPropagation()}>
        <>
          <div className="menu-head">
            <div>
              <span className="lbl">{who}</span>
              <h2>Menyu</h2>
            </div>
            <button
              className="btn ghost menu-close"
              onClick={onClose}
              aria-label="Yopish"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          </div>

          <div className="msec">
            <span className="lbl">Joylashuv (qo'lga moslash)</span>
            <div className="layouts">
              {CASHIER_LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  className={`layout-opt${ap.layout === l.id ? " on" : ""}`}
                  aria-pressed={ap.layout === l.id}
                  onClick={() => setAppearance({ layout: l.id })}
                >
                  <span className="mini" data-layout={l.id} aria-hidden="true">
                    {l.panels.map((p: CashierPanel) => (
                      <i key={p} className={`mp mp-${p}`} />
                    ))}
                  </span>
                  <span className="lo-t">{l.label}</span>
                  <span className="lo-s">{l.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="msec">
            <span className="lbl">Ko'z uchun sozlamalar</span>

            <div className="mblock">
              <div>
                <div className="mrow-t">Mavzu</div>
                <div className="mrow-s">Avto: 19:00 dan keyin tungi mavzu</div>
              </div>
              <div className="tabs">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    className={ap.theme === t.id ? "active" : ""}
                    onClick={() => setAppearance({ theme: t.id })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mblock">
              <div>
                <div className="mrow-t">Matn o'lchami</div>
                <div className="mrow-s">Chek va ro'yxatlar matni</div>
              </div>
              <div className="tabs">
                {SCALES.map((s) => (
                  <button
                    key={s.id}
                    className={ap.textScale === s.id ? "active" : ""}
                    onClick={() => setAppearance({ textScale: s.id })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mrow">
              <div>
                <div className="mrow-t">Harakatni kamaytirish</div>
                <div className="mrow-s">Animatsiyalarsiz, tinch</div>
              </div>
              <Switch
                on={ap.reduceMotion}
                onChange={(v) => setAppearance({ reduceMotion: v })}
                label="Harakatni kamaytirish"
              />
            </div>
            <div className="mrow">
              <div>
                <div className="mrow-t">To'lov tovushi</div>
                <div className="mrow-s">Yumshoq signal</div>
              </div>
              <Switch
                on={ap.sound}
                onChange={(v) => setAppearance({ sound: v })}
                label="To'lov tovushi"
              />
            </div>
          </div>

          <div className="msec">
            <span className="lbl">Kassa</span>
            <div className="menu-actions">
              <button className="btn ghost" onClick={onOpenDayEnd}>
                <span>Kun yakuni hisoboti</span>
                <span className="lbl">bugungi savdo</span>
              </button>
              <button className="btn ghost" onClick={onOpenDebts}>
                <span>Qarzdorlar</span>
                <span className="lbl">nasiyani qaytarish</span>
              </button>
              {onToggleFullscreen && (
                <button className="btn ghost" onClick={onToggleFullscreen}>
                  <span>To'liq ekran / oyna</span>
                  <span className="lbl">F11</span>
                </button>
              )}
              <button
                className="btn danger"
                onClick={() =>
                  registerOpen ? onCloseRegister() : onToggleRegister()
                }
              >
                <span>
                  {registerOpen ? "Kassani yopish" : "Kassani ochish"}
                </span>
                {registerOpen && (
                  <span className="lbl">avval kun yakuni hisoboti</span>
                )}
              </button>
              <button className="btn ghost" onClick={onSignOut}>
                Smenani almashtirish
              </button>
            </div>
          </div>
        </>
      </aside>
    </div>
  );
}
