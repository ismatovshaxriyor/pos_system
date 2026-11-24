import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

import { useAppearance } from '../lib/appearance';
import { COL_DEFAULT, applyColumns, getColumns, maxWidth, saveColumns, setColumn, COL_MIN, type Columns } from '../lib/columns';

interface Handle {
  /** Qaysi ustun kengligini o'zgartiradi. */
  col: keyof Columns;
  /** Chegara o'ngga surilganda ustun kengligi qanday o'zgaradi: +1 (kengayadi) yoki -1 (torayadi). */
  sign: 1 | -1;
  style: CSSProperties;
}

/**
 * Har joylashuvda ikki chegara bor (birinchi/ikkinchi ustun orasi va ikkinchi/uchinchi orasi).
 * Chek ustuni egiluvchan (1fr), shuning uchun faqat "buyurtmalar" va "to'lov" ustunlari suriladi.
 */
function handlesFor(layout: string): Handle[] {
  switch (layout) {
    case 'left': // to'lov | chek | buyurtmalar
      return [
        { col: 'pay', sign: 1, style: { left: 'var(--w-pay)' } },
        { col: 'orders', sign: -1, style: { right: 'var(--w-orders)' } },
      ];
    case 'center': // buyurtmalar | to'lov | chek
      return [
        { col: 'orders', sign: 1, style: { left: 'var(--w-orders)' } },
        { col: 'pay', sign: 1, style: { left: 'calc(var(--w-orders) + var(--w-pay))' } },
      ];
    case 'center-flip': // chek | to'lov | buyurtmalar
      return [
        { col: 'pay', sign: -1, style: { right: 'calc(var(--w-pay) + var(--w-orders))' } },
        { col: 'orders', sign: -1, style: { right: 'var(--w-orders)' } },
      ];
    default: // buyurtmalar | chek | to'lov
      return [
        { col: 'orders', sign: 1, style: { left: 'var(--w-orders)' } },
        { col: 'pay', sign: -1, style: { right: 'var(--w-pay)' } },
      ];
  }
}

/**
 * Ustunlar orasidagi suriladigan chegaralar (sichqoncha/sensor/klaviatura). Ikki marta bosish - asl kenglik.
 * `showPay` - to'lov ustuni faqat buyurtma ochiq bo'lganda bor.
 */
export function ColumnHandles({ showPay, containerRef }: { showPay: boolean; containerRef: React.RefObject<HTMLElement | null> }) {
  const { layout } = useAppearance();
  const drag = useRef<{ x: number; start: number; total: number; h: Handle } | null>(null);

  const total = () => containerRef.current?.clientWidth ?? window.innerWidth;

  // Saqlangan kenglik chizishdan oldin qo'llanadi; oyna o'lchami o'zgarsa ustunlar chek ustunini siqib yubormasin.
  useLayoutEffect(() => {
    applyColumns(total());
    const onResize = () => applyColumns(total());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDown(e: PointerEvent<HTMLDivElement>, h: Handle) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: getColumns()[h.col], total: total(), h };
    document.body.classList.add('col-resizing');
  }

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const raw = d.start + d.h.sign * (e.clientX - d.x);
    setColumn(d.h.col, Math.min(maxWidth(d.h.col, d.total), Math.max(COL_MIN[d.h.col], raw)), d.total);
  }

  function onUp() {
    if (!drag.current) return;
    drag.current = null;
    document.body.classList.remove('col-resizing');
    saveColumns();
  }

  function nudge(h: Handle, delta: number) {
    const t = total();
    const next = Math.min(maxWidth(h.col, t), Math.max(COL_MIN[h.col], getColumns()[h.col] + delta));
    setColumn(h.col, next, t);
    saveColumns();
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>, h: Handle) {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowRight') nudge(h, h.sign * step);
    else if (e.key === 'ArrowLeft') nudge(h, -h.sign * step);
    else if (e.key === 'Home' || e.key === 'Enter') nudge(h, COL_DEFAULT[h.col] - getColumns()[h.col]);
    else return;
    e.preventDefault();
  }

  return (
    <>
      {handlesFor(layout)
        .filter((h) => h.col === 'orders' || showPay)
        .map((h) => (
          <div
            key={h.col}
            className="col-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label={h.col === 'orders' ? "Buyurtmalar ustuni kengligi" : "To'lov ustuni kengligi"}
            tabIndex={0}
            title="Suring. Ikki marta bosish - asl kenglik"
            style={h.style}
            onPointerDown={(e) => onDown(e, h)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onDoubleClick={() => nudge(h, COL_DEFAULT[h.col] - getColumns()[h.col])}
            onKeyDown={(e) => onKey(e, h)}
          />
        ))}
    </>
  );
}
