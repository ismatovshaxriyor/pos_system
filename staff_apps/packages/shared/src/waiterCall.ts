/**
 * Mijoz stoldagi QR saytidan "Ofitsiant chaqirish"ni bosganda server barcha
 * ilovalarga `call_waiter` eventini yuboradi (`PublicCallWaiterView`). Bu yerda
 * ikkala ilova uchun umumiy qism: kimga ko'rsatish va navbatni yuritish.
 */

/** `call_waiter` eventining `data` qismi. */
export interface CallWaiterData {
  notification_id: number;
  table_id: number;
  table_name: string;
  reason: string;
  message: string;
  created_at: string;
  /** Stolning ochiq buyurtmasidagi ofitsiant; null - hammaga. Bola 0.3.29 dan oldin umuman kelmaydi. */
  waiter_id?: number | null;
}

/** Ekrandagi navbatdagi bitta chaqiruv. Bir stoldan qayta chaqirilsa yangi qator emas, `count` oshadi. */
export interface WaiterCall {
  tableId: number;
  tableName: string;
  reason: string;
  at: string;
  count: number;
}

/** Stolning ofitsianti bo'lsa faqat unga; bo'lmasa (yoki eski server) hammaga: ofitsiant, kassir, menejer. */
export function isWaiterCallForUser(data: CallWaiterData, userId: number): boolean {
  return data.waiter_id == null || data.waiter_id === userId;
}

export function mergeWaiterCall(calls: readonly WaiterCall[], data: CallWaiterData): WaiterCall[] {
  const existing = calls.find((c) => c.tableId === data.table_id);
  if (existing) {
    return calls.map((c) =>
      c === existing ? { ...c, tableName: data.table_name, reason: data.reason, at: data.created_at, count: c.count + 1 } : c,
    );
  }
  return [
    ...calls,
    { tableId: data.table_id, tableName: data.table_name, reason: data.reason, at: data.created_at, count: 1 },
  ];
}

/** "11" -> "11-stol"; "VIP 2" yoki "Stol #5" o'zgarmaydi. */
export function waiterCallTableLabel(tableName: string): string {
  return /^\d+$/.test(tableName.trim()) ? `${tableName.trim()}-stol` : tableName;
}
