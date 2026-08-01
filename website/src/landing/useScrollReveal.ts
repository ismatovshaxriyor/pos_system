import { useEffect, useRef } from 'react';

/** `[data-rv]` bilan belgilangan elementlar ko'rinishga kirganda `.in`
 *  klassini qo'shadi (tokens.css'dagi fade+slide qoidasi). Ref berilgan
 *  konteyner ichidagi barcha `[data-rv]`larni bitta IntersectionObserver
 *  bilan kuzatadi — asl `landing.js`dagi mantiq bilan bir xil. */
export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!ref.current) return;
    const els = ref.current.querySelectorAll<HTMLElement>('[data-rv]');
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }),
      { threshold: 0.12, rootMargin: '0px 0px -40px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return ref;
}
