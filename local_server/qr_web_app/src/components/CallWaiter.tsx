import React from 'react';
import { useApp } from '../context/AppContext';

export const CallWaiterFab: React.FC = () => {
  const { calling, callWaiter } = useApp();
  return (
    <button className="btn btn--sig fab" disabled={calling} onClick={callWaiter}>
      Ofitsiantni chaqirish
    </button>
  );
};

export const CallWaiterToast: React.FC = () => {
  const { toastOpen } = useApp();
  return (
    <div className="toast" data-open={toastOpen || undefined}>
      <div className="toast__in">
        <split-flap theme="board" text="CHAQIRILDI" pad={10} step={54}></split-flap>
        <div className="lbl">Ofitsiant tez orada keladi</div>
      </div>
    </div>
  );
};
