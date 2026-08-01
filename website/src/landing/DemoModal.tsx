import React from 'react';
import { QrApp } from '../qr/QrApp';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const DemoModal: React.FC<Props> = ({ open, onClose }) => (
  <div className="modal" data-open={open || undefined}>
    <div className="modal__bd" onClick={onClose} />
    <div className="modal__pn" role="dialog" aria-modal="true" aria-label="Demo">
      <div className="modal__hd">
        <span className="lbl">Demo · Mijoz QR ilovasi</span>
        <span className="lbl" style={{ marginLeft: 'auto' }}>Stol 12 (VIP)</span>
        <button className="xbtn" onClick={onClose} aria-label="Yopish">×</button>
      </div>
      <div className="modal__bd2">
        <div className="modal__side">
          <span className="eyebrow eyebrow--sig">Qanday ishlaydi</span>
          <h3 className="h3" style={{ margin: '10px 0 14px' }}>Mijoz stoldagi QR kodni skan qiladi</h3>
          <p className="lede" style={{ fontSize: 15 }}>
            Menyu va joriy hisob ochiladi. Buyurtma va to'lovni faqat xodim kiritadi — mijoz ilovasi faqat ko'rsatadi va ofitsiantni chaqira oladi.
          </p>
          <div style={{ marginTop: 22 }} className="lic__rows">
            <div className="lic__row"><span>Menyu</span><span>Kategoriyalar va taomlar</span></div>
            <div className="lic__row"><span>Stol</span><span>Joriy hisob, jonli</span></div>
            <div className="lic__row"><span>Chaqiruv</span><span>Ofitsiantni chaqirish</span></div>
          </div>
        </div>
        <div className="phone">
          <div className="phone__d">
            {open && <QrApp standalone={false} />}
          </div>
        </div>
      </div>
    </div>
  </div>
);
