import { useState } from 'react';
import { formatMoney, sortOpenOrders, tiyinToDecimal, toTiyin, type Order, type Table } from '@pos/shared';

/** Stollarni zonalar bo'yicha guruhlab, nomini "2" < "10" tartibida (raqam sifatida) saralaydi. */
export function groupTablesByZone(tables: Table[]): Array<{ zone: string; tables: Table[] }> {
  const byZone = new Map<string, Table[]>();
  for (const t of tables) {
    if (!t.is_active) continue;
    const key = t.zone?.name ?? 'Zonasiz';
    byZone.set(key, [...(byZone.get(key) ?? []), t]);
  }
  const collator = new Intl.Collator('uz', { numeric: true });
  return [...byZone.entries()]
    .sort(([a], [b]) => (a === 'Zonasiz' ? 1 : b === 'Zonasiz' ? -1 : collator.compare(a, b)))
    .map(([zone, list]) => ({ zone, tables: [...list].sort((a, b) => collator.compare(a.name, b.name)) }));
}

/**
 * Hamma stollar: bo'sh yoki band. Holat shu yerda ochiq buyurtmalardan hisoblanadi (serverdagi `status`
 * so'rovchi ofitsiantga nisbiy, kassir uchun ma'nosiz). Band stol bosilsa - uning buyurtmasi ochiladi.
 */
export function TableGrid({
  tables,
  orders,
  selectedId,
  onSelect,
  onPickFree,
}: {
  tables: Table[];
  orders: Order[];
  selectedId: number | null;
  onSelect: (orderId: number) => void;
  /** Bo'sh stol bosilsa: shu stolga yangi buyurtma ochish. */
  onPickFree?: (tableId: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState<string | null>(null);
  const all = groupTablesByZone(tables);
  if (all.length === 0) return <div className="orders-empty muted">Stollar hali qo'shilmagan</div>;

  const total = all.reduce((n, g) => n + g.tables.length, 0);
  const q = query.trim().toLowerCase();
  // Tanlangan zona o'chib ketgan bo'lsa filtr "Hammasi"ga qaytadi.
  const activeZone = zone !== null && all.some((g) => g.zone === zone) ? zone : null;
  const groups = all
    .filter((g) => activeZone === null || g.zone === activeZone)
    .map((g) => ({ ...g, tables: q ? g.tables.filter((t) => t.name.toLowerCase().includes(q)) : g.tables }))
    .filter((g) => g.tables.length > 0);

  const open = sortOpenOrders(orders);
  return (
    <>
      {(total > 8 || all.length > 1) && (
        <div className="tg-tools">
          {total > 8 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Stol nomi"
              aria-label="Stol qidirish"
            />
          )}
          {all.length > 1 && (
            <div className="tg-chips" role="group" aria-label="Zona">
              <button className={activeZone === null ? 'active' : ''} onClick={() => setZone(null)}>Hammasi</button>
              {all.map((g) => (
                <button key={g.zone} className={activeZone === g.zone ? 'active' : ''} onClick={() => setZone(g.zone)}>{g.zone}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {groups.length === 0 && <div className="orders-empty muted">Stol topilmadi</div>}
      {groups.map((g) => (
        <section key={g.zone} className="tg-zone">
          <h3 className="tg-zone-name">{g.zone}</h3>
          <div className="tg-grid">
            {g.tables.map((t) => {
              const mine = open.filter((o) => o.table?.id === t.id);
              const first = mine[0];
              const due = mine.reduce((s, o) => s + toTiyin(o.balance_due), 0);
              const cls = ['tg-tile', first ? 'busy' : 'free', !first && onPickFree ? 'pick' : '', first && first.id === selectedId ? 'active' : ''].filter(Boolean).join(' ');
              return (
                <button
                  key={t.id}
                  className={cls}
                  disabled={!first && !onPickFree}
                  onClick={() => (first ? onSelect(first.id) : onPickFree?.(t.id))}
                  aria-label={`${t.name}: ${first ? 'band' : "bo'sh"}`}
                >
                  <span className="tg-name">{t.name}</span>
                  <span className="tg-state">
                    {first ? formatMoney(tiyinToDecimal(due)) : "Bo'sh"}
                    {mine.length > 1 && <small> · {mine.length} ta</small>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
