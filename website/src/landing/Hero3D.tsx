import React, { useEffect, useRef } from 'react';
import { mountHero3D } from './scene3d';

export const Hero3D: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const cleanup = mountHero3D(ref.current);
    return cleanup;
  }, []);

  return (
    <div id="hero3d" ref={ref}>
      <span className="hero3d__tag lbl">Sxema 01 — Ona-Bola tugunlari</span>
    </div>
  );
};
