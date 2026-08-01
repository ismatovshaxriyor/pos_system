import React, { useState } from 'react';
import { submitDemoRequest } from './api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const LeadModal: React.FC<Props> = ({ open, onClose }) => {
  const [restaurantName, setRestaurantName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [branchCount, setBranchCount] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState('');

  const reset = () => {
    setRestaurantName(''); setContactName(''); setPhone(''); setBranchCount(''); setNote('');
    setStatus('idle'); setMessage('');
  };

  const close = () => { onClose(); setTimeout(reset, 300); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantName.trim() || !contactName.trim() || !phone.trim()) return;
    setStatus('sending');
    try {
      const res = await submitDemoRequest({
        restaurant_name: restaurantName.trim(),
        contact_name: contactName.trim(),
        phone: phone.trim(),
        branch_count: branchCount.trim(),
        note: note.trim(),
      });
      setStatus('ok');
      setMessage(res.detail);
    } catch (err) {
      setStatus('err');
      setMessage(err instanceof Error ? err.message : "So'rovni yuborishda xatolik yuz berdi.");
    }
  };

  return (
    <div className="modal" data-open={open || undefined}>
      <div className="modal__bd" onClick={close} />
      <div className="modal__pn" role="dialog" aria-modal="true" aria-label="Bog'lanish" style={{ height: 'min(620px,calc(100% - 32px))', gridTemplateColumns: 'none' }}>
        <div className="modal__hd">
          <span className="lbl">Bog'lanish</span>
          <button className="xbtn" onClick={close} aria-label="Yopish">×</button>
        </div>
        <div style={{ padding: 26, overflow: 'auto' }}>
          {status === 'ok' ? (
            <>
              <span className="eyebrow eyebrow--sig">Qabul qilindi</span>
              <h3 className="h3" style={{ margin: '10px 0 14px' }}>Rahmat!</h3>
              <p className="lede">{message}</p>
              <button className="btn" style={{ marginTop: 20 }} onClick={close}>Yopish</button>
            </>
          ) : (
            <>
              <span className="eyebrow eyebrow--sig">Demo va narx</span>
              <h3 className="h3" style={{ margin: '10px 0 14px' }}>Restoraningiz haqida ayting</h3>
              <p className="lede" style={{ fontSize: 15 }}>
                Ma'lumotlaringizni qoldiring — mutaxassisimiz tez orada siz bilan bog'lanadi.
              </p>
              <form className="leadform" onSubmit={submit}>
                <input placeholder="Restoran nomi" value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} required />
                <input placeholder="Ismingiz" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
                <input placeholder="Telefon raqam" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                <input placeholder="Filiallar soni (ixtiyoriy)" value={branchCount} onChange={(e) => setBranchCount(e.target.value)} />
                <textarea placeholder="Qo'shimcha izoh (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className={`leadform__msg ${status === 'err' ? 'leadform__msg--err' : ''}`}>{status === 'err' ? message : ''}</div>
                <button className="btn btn--sig" type="submit" disabled={status === 'sending'}>
                  {status === 'sending' ? 'Yuborilmoqda…' : "So'rov yuborish"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
