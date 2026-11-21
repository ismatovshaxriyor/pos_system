/**
 * Server IP'si o'zgarganda (router/tarmoq almashdi, DHCP qayta taqsimladi) ilova qotib qolmasligi uchun:
 * saqlangan manzil javob bermasa, saqlangan `restaurant_id` bo'yicha tarmoqni qayta qidiramiz va topilgan
 * yangi manzilni saqlaymiz. Sessiya (token, qurilma) o'zgarmaydi - foydalanuvchi qayta kirmaydi.
 */
import { probeServer, type FoundServer } from './discovery';

export type RecoveryOutcome =
  /** Saqlangan manzil javob beryapti. */
  | 'healthy'
  /** Manzil o'zgargan edi: yangisi topilib saqlandi. */
  | 'moved'
  /** Javob yo'q va tarmoqda bizning restoran topilmadi (boshqa tarmoq / server o'chiq). */
  | 'lost'
  /** Server tanlanmagan - qiladigan ish yo'q. */
  | 'idle';

export interface RecoveryDeps {
  getUrl: () => string | null;
  getRestaurantId: () => string | null;
  /** Yangi manzilni (va ID'ni) saqlaydi. */
  adopt: (url: string, restaurantId: string | null) => Promise<void>;
  /** Tarmoqni qidiradi (platformaga xos: mDNS + LAN skaner). */
  find: (signal: AbortSignal) => Promise<FoundServer[]>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  probeTimeoutMs?: number;
}

/**
 * Bir marta tekshiradi va kerak bo'lsa manzilni yangilaydi. Hech qachon throw qilmaydi.
 *
 * Xavfsizlik: ID saqlangan bo'lsa FAQAT shu ID'li server qabul qilinadi (qo'shni restoranga
 * ulanib ketmaslik uchun). ID yo'q (eski o'rnatish) bo'lsa - tarmoqda bitta server topilgandagina.
 */
export async function recoverServer(deps: RecoveryDeps): Promise<RecoveryOutcome> {
  const url = deps.getUrl();
  if (!url) return 'idle';
  const stored = deps.getRestaurantId();

  const current = await probeServer(url, { fetchImpl: deps.fetchImpl, timeoutMs: deps.probeTimeoutMs ?? 2500, signal: deps.signal });
  if (current) {
    const id = current.info.restaurant_id;
    if (!stored && id) {
      await deps.adopt(url, id); // eski o'rnatish: ID'ni birinchi marta eslab qolamiz
      return 'healthy';
    }
    if (!stored || !id || id === stored) return 'healthy';
    // Shu IP'da endi BOSHQA restoran javob beryapti (IP qayta berilgan) - bizniki emas, qidiramiz.
  }
  if (deps.signal?.aborted) return 'lost';

  let found: FoundServer[];
  try {
    found = await deps.find(deps.signal ?? new AbortController().signal);
  } catch {
    return 'lost';
  }
  if (deps.signal?.aborted) return 'lost';

  const match = stored ? found.find((s) => s.info.restaurant_id === stored) : found.length === 1 ? found[0] : undefined;
  if (!match) return 'lost';
  if (match.url === url) return 'healthy'; // qidiruv paytida o'zi tiklandi
  await deps.adopt(match.url, match.info.restaurant_id ?? stored);
  return 'moved';
}

export interface ServerWatcherOptions {
  /** Bitta tekshiruv (odatda `recoverServer` ni ilova bog'lamalari bilan). */
  check: () => Promise<RecoveryOutcome>;
  /** Hammasi yaxshi bo'lganda tekshiruv oralig'i. */
  healthyMs?: number;
  /** Birinchi tekshiruvgacha kutish (ilova stale manzil bilan ochilgan bo'lsa tez tiklansin). */
  initialMs?: number;
  /** Server topilmayotganda oraliq (skaner og'ir - kamroq urinamiz). */
  lostMs?: number;
  /** `'moved'` bo'lganda chaqiriladi (masalan realtime'ni qayta ulash). */
  onMoved?: () => void;
}

/**
 * `check`ni davriy chaqiradi; bir vaqtda faqat bittasi ishlaydi. `nudge()` - kutmasdan hozir tekshirish
 * (masalan, real-time uzilganda). Taymerlar `start`/`stop` bilan boshqariladi.
 */
export class ServerWatcher {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private active = false;
  private readonly healthyMs: number;
  private readonly lostMs: number;
  private readonly initialMs: number;

  constructor(private readonly opts: ServerWatcherOptions) {
    this.healthyMs = opts.healthyMs ?? 30_000;
    this.lostMs = opts.lostMs ?? 15_000;
    this.initialMs = opts.initialMs ?? 2_000;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.schedule(this.initialMs);
  }

  stop(): void {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Hozir (kechiktirmasdan) tekshiradi; allaqachon ketayotgan bo'lsa hech narsa qilmaydi. */
  nudge(): void {
    if (!this.active || this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.tick();
  }

  private schedule(ms: number): void {
    if (!this.active) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    if (this.running || !this.active) return;
    this.running = true;
    let outcome: RecoveryOutcome = 'lost';
    try {
      outcome = await this.opts.check();
    } catch {
      outcome = 'lost';
    } finally {
      this.running = false;
    }
    if (outcome === 'moved') this.opts.onMoved?.();
    this.schedule(outcome === 'lost' ? this.lostMs : this.healthyMs);
  }
}
