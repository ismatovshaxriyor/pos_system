import { flapCells } from '@pos/design';

/**
 * Split-flap ("aylanuvchi taxta") raqamlar: faqat jami (qolgan) summada va "To'landi" qaytimida ishlatiladi -
 * hamma joyda emas, ekran og'irlashmasin. Kattaligi ota elementning `font-size` iga qarab o'zgaradi.
 */
export function Flap({ text, tone = 'plain' }: { text: string; tone?: 'plain' | 'ok' }) {
  return (
    <span className={`flap flap-${tone}`} role="img" aria-label={text}>
      {flapCells(text).map((c, i) =>
        c.gap ? <i key={i} className="g" /> : <i key={i} aria-hidden="true">{c.ch}</i>,
      )}
    </span>
  );
}
