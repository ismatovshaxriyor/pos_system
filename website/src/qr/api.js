const API_BASE = '/api/public';

export async function fetchMenu() {
  const res = await fetch(`${API_BASE}/menu/`);
  if (!res.ok) throw new Error('Menyu ma\'lumotlarini olib bo\'lmadi');
  return await res.json();
}

export async function fetchTableLive(qrCode) {
  const res = await fetch(`${API_BASE}/table/${qrCode}/`);
  if (!res.ok) throw new Error('Stol ma\'lumotlarini olib bo\'lmadi');
  return await res.json();
}

export async function callWaiter(qrCode, reason = 'Ofitsiant chaqiruvi') {
  const res = await fetch(`${API_BASE}/table/${qrCode}/call-waiter/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error('Xabar yuborishda xatolik yuz berdi');
  return await res.json();
}
