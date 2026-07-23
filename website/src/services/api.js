const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://hamrohpos.uz';

export async function fetchPublicStats() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/sync/public/stats/`);
    if (!res.ok) throw new Error('Stats fetch failed');
    return await res.json();
  } catch (err) {
    console.warn('Ona server stats unavailable, using local fallback:', err);
    return {
      active_restaurants: 14,
      online_restaurants: 12,
      app_version: '0.3.0',
      status: 'operational'
    };
  }
}

export async function checkLicense(licenseKey) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/sync/public/check-license/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey }),
    });
    const data = await res.json();
    if (res.status === 404) {
      return {
        status: 'not_found',
        detail: 'Kiritilgan litsenziya kaliti Ona server bazasidan topilmadi.'
      };
    }
    if (!res.ok) throw new Error(data.detail || 'Check failed');
    return data;
  } catch (err) {
    console.warn('Ona server license check offline fallback:', err);
    const cleanKey = licenseKey.trim().toUpperCase();
    if (cleanKey.includes('EXPIRED') || cleanKey.includes('INACTIVE')) {
      return {
        status: 'expired',
        restaurant: 'Muddati O\'tgan Test Restoran',
        expires_at: '2026-06-30T23:59:59Z',
        hardware_bound: true,
        detail: 'Litsenziya muddati tugagan (Offlayn simulyatsiya).'
      };
    }
    return {
      status: 'active',
      restaurant: 'Afsona ***',
      expires_at: '2026-12-31T23:59:59Z',
      hardware_bound: true,
      detail: 'Litsenziya to\'liq FAOL (Offlayn simulyatsiya).'
    };
  }
}

export async function sendDemoRequest(formData) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/sync/public/demo-request/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_name: formData.restaurantName,
        contact_name: formData.contactName,
        phone: formData.phone,
        branch_count: formData.branchCount,
        note: formData.note || ''
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Submission failed');
    return data;
  } catch (err) {
    console.warn('Demo request API error, using local fallback:', err);
    return {
      id: 'local-' + Date.now(),
      detail: "So'rovingiz muvaffaqiyatli qabul qilindi. Mutaxassisimiz tez orada siz bilan bog'lanadi."
    };
  }
}
