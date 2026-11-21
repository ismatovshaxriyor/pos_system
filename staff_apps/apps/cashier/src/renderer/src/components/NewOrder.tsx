import {
  addProduct,
  addTemplate,
  cartCount,
  cartTotalTiyin,
  decreaseProduct,
  describeError,
  emptyCart,
  formatMoney,
  MAX_NOTE_LENGTH,
  NOTE_PRESETS,
  productCounts,
  setLineNote,
  setQuantity,
  submitDraft,
  tiyinToDecimal,
  toggleNotePart,
  toTiyin,
  type Cart,
  type Order,
  type Product,
  type SubmitProgress,
  type Table,
} from '@pos/shared';
import { useMemo, useRef, useState } from 'react';

import { useBootstrap } from '../lib/hooks';
import { newUuid, pos } from '../lib/pos';
import { groupTablesByZone } from './TableGrid';

/** Buyurtma qayerga: stolga yoki stolsiz "olib ketish". */
export type Destination = { kind: 'table'; tableId: number } | { kind: 'takeaway' };

/** Bo'sh (ochiq buyurtmasi yo'q) faol stollar. */
function freeTables(tables: Table[], orders: Order[]): Table[] {
  const busy = new Set(orders.filter((o) => o.table).map((o) => o.table!.id));
  return tables.filter((t) => t.is_active && !busy.has(t.id));
}

/**
 * Kassada yangi buyurtma: [menyu] [savat]. Savat serverga FAQAT tasdiqlash oynasidagi
 * "Tasdiqlash va oshxonaga yuborish"da boradi - undan oldin oshxonaga hech narsa chiqmaydi,
 * orqaga qaytilsa stol band bo'lib qolmaydi. Tarmoq uzilsa "Qayta urinish" faqat bajarilmagan qadamlarni takrorlaydi.
 */
export function NewOrder({
  initial,
  onCancel,
  onCreated,
}: {
  initial: Destination | null;
  onCancel: () => void;
  onCreated: (orderId: number) => void;
}) {
  const { data } = useBootstrap();
  const [dest, setDest] = useState<Destination | null>(initial);
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [editLine, setEditLine] = useState<string | null>(null);
  const [tplMsg, setTplMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // sync_uuid qoralama ochilganda bir marta yaratiladi: javob yo'qolib qayta yuborilsa dublikat buyurtma ochilmaydi.
  const [syncUuid] = useState(() => newUuid());
  const progress = useRef<SubmitProgress>({});

  const products = data?.products ?? [];
  const counts = useMemo(() => productCounts(cart), [cart]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (categoryId === null || p.category.id === categoryId) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, categoryId, query]);

  const registerClosed = data ? !data.register_open : false;
  const table = dest?.kind === 'table' ? data?.tables.find((t) => t.id === dest.tableId) : undefined;
  const destLabel = dest === null ? '' : dest.kind === 'takeaway' ? 'Olib ketish' : (table?.name ?? '...');
  const total = cartTotalTiyin(cart);

  async function send() {
    if (busy || cart.length === 0 || !dest) return;
    setBusy(true);
    setError(null);
    try {
      const id = await submitDraft(
        pos.api,
        {
          syncUuid,
          tableId: dest.kind === 'table' ? dest.tableId : null,
          orderType: dest.kind === 'table' ? 'dine_in' : 'takeaway',
          lines: cart,
          note: note.trim() || undefined,
        },
        progress.current,
      );
      onCreated(id);
    } catch (e) {
      // progress saqlanib qoladi: qayta bosilganda faqat bajarilmagan qadamlar takrorlanadi.
      setError(describeError(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  // 1-qadam: qayerga? (stol yoki olib ketish)
  if (!dest) {
    const free = data ? freeTables(data.tables, data.active_orders) : [];
    const groups = groupTablesByZone(free);
    return (
      <section className="neworder">
        <div className="no-pick">
          <div className="no-head">
            <div>
              <span className="lbl">Yangi buyurtma</span>
              <h2>Qayerga?</h2>
            </div>
            <button className="btn ghost" onClick={onCancel}>Bekor qilish</button>
          </div>
          <button className="btn go solo no-takeaway" onClick={() => setDest({ kind: 'takeaway' })}>
            Olib ketish (stolsiz)
          </button>
          {!data ? (
            <div className="muted">Yuklanmoqda...</div>
          ) : groups.length === 0 ? (
            <div className="muted">Bo'sh stol yo'q. Olib ketish buyurtmasini oching yoki stol bo'shashini kuting.</div>
          ) : (
            <div className="no-tables">
              {groups.map((g) => (
                <section key={g.zone} className="tg-zone">
                  <h3 className="tg-zone-name">{g.zone}</h3>
                  <div className="tg-grid">
                    {g.tables.map((t) => (
                      <button key={t.id} className="tg-tile free pick" onClick={() => setDest({ kind: 'table', tableId: t.id })}>
                        <span className="tg-name">{t.name}</span>
                        <span className="tg-state">Bo'sh</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  const lineKey = (productId: number, n: string) => `${productId}\u0000${n}`;

  function pickTemplate(id: number) {
    const t = data?.order_templates?.find((x) => x.id === id);
    if (!t) return;
    const r = addTemplate(cart, t, products);
    setCart(r.cart);
    setTplMsg(
      r.added === 0
        ? "Bu shablondagi taomlar hozir sotuvda yo'q."
        : `"${t.name}": ${r.added} ta taom qo'shildi${r.skipped > 0 ? `, ${r.skipped} tasi sotuvda yo'q` : ''}.`,
    );
  }

  const add = (p: Product) => setCart((c) => addProduct(c, p));

  return (
    <section className="neworder">
      <div className="no-menu">
        <div className="no-head">
          <div>
            <span className="lbl">Yangi buyurtma</span>
            <h2>{destLabel}</h2>
          </div>
          <div className="no-head-actions">
            {!progress.current.orderId && (
              <button className="btn ghost" onClick={() => setDest(null)}>O'zgartirish</button>
            )}
            <button className="btn ghost" onClick={onCancel} disabled={busy}>Bekor qilish</button>
          </div>
        </div>

        {registerClosed && <div className="banner err">Kassa yopiq — buyurtma ochib bo'lmaydi.</div>}

        <div className="no-tools">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Taom qidirish"
            aria-label="Taom qidirish"
          />
          <div className="no-cats" role="tablist" aria-label="Toifalar">
            <button className={categoryId === null ? 'active' : ''} onClick={() => setCategoryId(null)}>Hammasi</button>
            {(data?.categories ?? []).map((c) => (
              <button key={c.id} className={categoryId === c.id ? 'active' : ''} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          {(data?.order_templates?.length ?? 0) > 0 && (
            <div className="no-tpls">
              <span className="lbl">Shablonlar</span>
              {data!.order_templates!.map((t) => (
                <button key={t.id} className="btn ghost no-tpl" onClick={() => pickTemplate(t.id)}>
                  {t.name}
                </button>
              ))}
              {tplMsg && <span className="lbl">{tplMsg}</span>}
            </div>
          )}
        </div>

        <div className="no-products">
          {!data ? (
            <div className="muted">Yuklanmoqda...</div>
          ) : visible.length === 0 ? (
            <div className="muted">Taom topilmadi</div>
          ) : (
            visible.map((p) => {
              const n = counts.get(p.id) ?? 0;
              return (
                <div key={p.id} className={`no-prod${n > 0 ? ' on' : ''}`}>
                  <button className="no-prod-main" onClick={() => add(p)} aria-label={`${p.name} qo'shish`}>
                    <span className="no-prod-name">{p.name}</span>
                    <span className="no-prod-price">{formatMoney(p.price)}</span>
                    {n > 0 && <span className="no-prod-n">{n}×</span>}
                  </button>
                  {n > 0 && (
                    <button className="no-prod-minus" onClick={() => setCart((c) => decreaseProduct(c, p.id))} aria-label={`${p.name} kamaytirish`}>
                      −
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <aside className="no-cart">
        <div className="no-cart-lines">
          {cart.length === 0 && <div className="muted" style={{ padding: '12px 0' }}>Savat bo'sh. Taomni bosib qo'shing.</div>}
          {cart.map((l) => {
            const key = lineKey(l.productId, l.note);
            const open = editLine === key;
            return (
              <div key={key} className="no-line">
                <div className="no-line-top">
                  <span className="no-line-name">{l.name}</span>
                  <span className="mono no-line-sum">{formatMoney(tiyinToDecimal(toTiyin(l.unitPrice) * l.quantity))}</span>
                </div>
                <div className="no-line-ctl">
                  <button className="no-step" onClick={() => setCart((c) => setQuantity(c, l.productId, l.note, l.quantity - 1))} aria-label="Kamaytirish">−</button>
                  <span className="mono no-qty">{l.quantity}</span>
                  <button className="no-step" onClick={() => setCart((c) => setQuantity(c, l.productId, l.note, l.quantity + 1))} aria-label="Ko'paytirish">+</button>
                  <button className="btn ghost no-note-btn" onClick={() => setEditLine(open ? null : key)}>
                    {l.note ? `Izoh: ${l.note}` : 'Izoh'}
                  </button>
                </div>
                {open && (
                  <div className="no-note">
                    <div className="no-note-presets">
                      {NOTE_PRESETS.map((pr) => {
                        const on = l.note.split(';').map((x) => x.trim()).includes(pr);
                        return (
                          <button
                            key={pr}
                            className={`no-chip${on ? ' on' : ''}`}
                            onClick={() => {
                              const next = toggleNotePart(l.note, pr);
                              setCart((c) => setLineNote(c, l.productId, l.note, next));
                              setEditLine(lineKey(l.productId, next.trim().slice(0, MAX_NOTE_LENGTH)));
                            }}
                          >
                            {pr}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="no-cart-foot">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
            placeholder="Buyurtmaga izoh (ixtiyoriy)"
            aria-label="Buyurtmaga izoh"
          />
          {error && <div className="error">{error}</div>}
          <div className="no-total">
            <span className="lbl">{cartCount(cart)} ta · jami</span>
            <span className="mono no-total-sum">{formatMoney(tiyinToDecimal(total))}</span>
          </div>
          <button
            className="btn go solo"
            disabled={cart.length === 0 || registerClosed || busy}
            onClick={() => (progress.current.orderId ? void send() : setConfirming(true))}
          >
            {progress.current.orderId ? 'Qayta urinish' : "Ko'rib chiqish va yuborish"}
          </button>
        </div>
      </aside>

      {confirming && (
        <div className="overlay" onClick={busy ? undefined : () => setConfirming(false)}>
          <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-bar plain">
              <h2>Buyurtmani tasdiqlang</h2>
            </div>
            <div className="sheet-body">
              <span className="lbl">{[destLabel, note.trim()].filter(Boolean).join(' · ')}</span>
              <div className="no-confirm-items">
                {cart.map((l) => (
                  <div className="ri" key={lineKey(l.productId, l.note)}>
                    <span className="ri-qty">{l.quantity}×</span>
                    <span className="ri-name">
                      {l.name}
                      {l.note && <small> · {l.note}</small>}
                    </span>
                    <span className="ri-price">{formatMoney(l.unitPrice)}</span>
                  </div>
                ))}
              </div>
              <div className="no-total">
                <span className="lbl">Jami</span>
                <span className="mono no-total-sum">{formatMoney(tiyinToDecimal(total))}</span>
              </div>
              <span className="lbl">Tasdiqlangach buyurtma oshxonaga yuboriladi va chek chiqadi.</span>
              {error && <div className="error">{error}</div>}
              <button className="btn go solo" onClick={() => void send()} disabled={busy}>
                {busy ? 'Yuborilmoqda...' : 'Tasdiqlash va oshxonaga yuborish'}
              </button>
              <button className="btn ghost" onClick={() => setConfirming(false)} disabled={busy}>Tahrirlash</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
