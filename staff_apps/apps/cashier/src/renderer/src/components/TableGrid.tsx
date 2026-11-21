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
}: {
  tables: Table[];
  orders: Order[];
  selectedId: number | null;
  onSelect: (orderId: number) => void;
}) {
  const groups = groupTablesByZone(tables);
  if (groups.length === 0) return <div className="orders-empty muted">Stollar hali qo'shilmagan</div>;

  const open = sortOpenOrders(orders);
  return (
    <>
      {groups.map((g) => (
        <section key={g.zone} className="tg-zone">
          <h3 className="tg-zone-name">{g.zone}</h3>
          <div className="tg-grid">
            {g.tables.map((t) => {
              const mine = open.filter((o) => o.table?.id === t.id);
              const first = mine[0];
              const due = mine.reduce((s, o) => s + toTiyin(o.balance_due), 0);
              const cls = ['tg-tile', first ? 'busy' : 'free', first && first.id === selectedId ? 'active' : ''].filter(Boolean).join(' ');
              return (
                <button
                  key={t.id}
                  className={cls}
                  disabled={!first}
                  onClick={() => first && onSelect(first.id)}
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
