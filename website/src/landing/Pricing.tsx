import React, { useEffect, useState } from 'react';
import { fetchPricingPlans } from './api';
import { MOCK_PLANS, PricingPlanEntry } from './pricingTypes';

interface Props {
  onCta: () => void;
}

export const Pricing: React.FC<Props> = ({ onCta }) => {
  const [plans, setPlans] = useState<PricingPlanEntry[]>(MOCK_PLANS);

  useEffect(() => {
    fetchPricingPlans()
      .then((data) => { if (data.length) setPlans(data); })
      .catch(() => {});
  }, []);

  return (
    <section className="wrap sec" id="narx">
      <div className="sec__head">
        <span className="sec__num">04</span>
        <h2 className="h2">Narx</h2>
        <span className="eyebrow" style={{ marginLeft: 'auto' }}>Restoran hajmiga qarab</span>
      </div>
      <div className="plans">
        {plans.map((p) => (
          <div className={`plan${p.is_highlighted ? ' plan--pick' : ''}`} key={p.tier_label}>
            <span className={`eyebrow${p.is_highlighted ? ' eyebrow--sig' : ''}`}>{p.tier_label}</span>
            <div className="plan__t">{p.title}</div>
            <split-flap className="plan__price" mode="alpha" text={p.price_label} auto step={55}></split-flap>
            <div className="lbl">{p.subtitle}</div>
            <ul>
              {p.features.map((f, i) => (
                <li key={i} data-off={f.is_included ? undefined : ''}>{f.text}</li>
              ))}
            </ul>
            <button className={`btn${p.is_highlighted ? ' btn--sig' : ''}`} onClick={onCta}>{p.cta_label}</button>
          </div>
        ))}
      </div>
      <p className="lbl" style={{ marginTop: 14 }}>Narx terminal soni, filial soni va integratsiya hajmiga qarab kelishiladi. Demo va hisob-kitob uchun biz bilan bog'laning.</p>
    </section>
  );
};
