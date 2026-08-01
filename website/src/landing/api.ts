import { PricingPlanEntry } from './pricingTypes';

const BASE = '/api/sync/public';

export async function fetchPricingPlans(): Promise<PricingPlanEntry[]> {
  const res = await fetch(`${BASE}/pricing/`);
  if (!res.ok) throw new Error('pricing fetch failed');
  return res.json();
}

export interface LicenseCheckResult {
  status: 'active' | 'expired' | 'inactive' | 'not_found';
  restaurant?: string;
  expires_at?: string;
  hardware_bound?: boolean;
  detail: string;
}

export async function checkLicense(licenseKey: string): Promise<LicenseCheckResult> {
  const res = await fetch(`${BASE}/check-license/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ license_key: licenseKey }),
  });
  return res.json();
}

export interface DemoRequestPayload {
  restaurant_name: string;
  contact_name: string;
  phone: string;
  branch_count?: string;
  note?: string;
}

export async function submitDemoRequest(payload: DemoRequestPayload): Promise<{ id?: string; detail: string }> {
  const res = await fetch(`${BASE}/demo-request/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "So'rovni yuborishda xatolik yuz berdi.");
  return data;
}
