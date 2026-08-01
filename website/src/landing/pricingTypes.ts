export interface PricingFeatureEntry {
  text: string;
  is_included: boolean;
}

export interface PricingPlanEntry {
  tier_label: string;
  title: string;
  subtitle: string;
  price_label: string;
  cta_label: string;
  is_highlighted: boolean;
  features: PricingFeatureEntry[];
}

export const MOCK_PLANS: PricingPlanEntry[] = [
  {
    tier_label: 'Tarif A', title: "Boshlang'ich", subtitle: 'Bitta zal, bitta kassa',
    price_label: 'KELISHUV', cta_label: "Bog'lanish", is_highlighted: false,
    features: [
      { text: '1 kassa terminali', is_included: true },
      { text: 'QR menyu va hisob', is_included: true },
      { text: 'Asosiy savdo hisoboti', is_included: true },
      { text: 'Oshxona displeyi', is_included: false },
      { text: "Ko'p filial", is_included: false },
    ],
  },
  {
    tier_label: "Tarif B · Ko'p tanlanadi", title: 'Restoran', subtitle: "To'liq zal + oshxona",
    price_label: 'KELISHUV', cta_label: 'Narxni kelishish', is_highlighted: true,
    features: [
      { text: '3 kassa terminali', is_included: true },
      { text: 'QR menyu va hisob', is_included: true },
      { text: 'Oshxona displeyi', is_included: true },
      { text: 'Lokal server (offline)', is_included: true },
      { text: "Ko'p filial", is_included: false },
    ],
  },
  {
    tier_label: 'Tarif C', title: 'Tarmoq', subtitle: 'Bir nechta filial',
    price_label: 'KELISHUV', cta_label: "Bog'lanish", is_highlighted: false,
    features: [
      { text: 'Cheksiz terminal', is_included: true },
      { text: "Ko'p filial boshqaruvi", is_included: true },
      { text: 'Konsolidatsiyalangan hisobot', is_included: true },
      { text: 'API va maxsus integratsiya', is_included: true },
      { text: "Ajratilgan qo'llab-quvvatlash", is_included: true },
    ],
  },
];
