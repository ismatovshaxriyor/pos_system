import * as THREE from 'three';

/** Hero 3D — OrthographicCamera, gridga tekislangan chek plitalari.
 *  Asl `hero3d.js`dan ported, faqat `getElementById` o'rniga parametr
 *  sifatida host elementi olinadi va tozalash (cleanup) funksiyasi
 *  qaytariladi — React `useEffect` unmount'da shuni chaqiradi. */
export function mountHero3D(host: HTMLElement): () => void {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C = { paper: 0xf7f7f3, panel: 0xe6e6e0, ink: 0x131313, grid: 0xb7b7b2, signal: 0xd91e18 };
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  const scene = new THREE.Scene();
  const FRUST = 7.4;
  const cam = new THREE.OrthographicCamera(-FRUST, FRUST, FRUST, -FRUST, -100, 200);
  cam.position.set(9, 8, 9);
  cam.lookAt(0, 0.7, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8d2, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(6, 12, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(-8, 4, -6);
  scene.add(fill);

  const root = new THREE.Group();
  scene.add(root);
  const gh = new THREE.GridHelper(20, 20, C.grid, C.grid);
  (gh.material as THREE.Material).transparent = true;
  (gh.material as THREE.Material).opacity = 0.32;
  gh.position.y = -1.6;
  root.add(gh);

  // chek plitalari — footprintlari kesishmaydi (aniq gridga yotqizilgan): [x, z, w, d, y, sig]
  const SPEC: [number, number, number, number, number, boolean][] = [
    [0, 0, 4, 5.2, 0, false], [-4.2, -2, 2.6, 3.2, 1.15, false], [3.6, 1.6, 3, 3.6, 0.6, true],
    [-1, -4.6, 3.2, 2.2, 1.85, false], [3.2, -2.8, 2.2, 2.4, 2.4, false], [-4, 2.4, 2, 2.6, 1.7, false],
  ];
  const plates: { g: THREE.Group; ty: number; i: number }[] = [];
  SPEC.forEach((s, i) => {
    const [x, z, w, d, y, sig] = s;
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.1, d),
      new THREE.MeshStandardMaterial({ color: sig ? C.signal : C.paper, roughness: 0.92, metalness: 0 }),
    );
    g.add(mesh);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: sig ? C.signal : C.grid, transparent: true, opacity: sig ? 0.55 : 0.9 }),
    );
    g.add(edges);
    const rows = Math.max(2, Math.round(d * 1.6));
    for (let r = 0; r < rows; r++) {
      const lw = w * (r === 0 ? 0.62 : r % 3 === 0 ? 0.34 : 0.78);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(lw, 0.012, 0.07),
        new THREE.MeshBasicMaterial({ color: sig ? 0xffffff : C.ink }),
      );
      (bar.material as THREE.Material & { opacity: number; transparent: boolean }).opacity = r === 0 ? 0.92 : 0.5;
      (bar.material as THREE.Material).transparent = true;
      bar.position.set(-w / 2 + lw / 2 + w * 0.11, 0.056, -d / 2 + 0.42 + (r * (d - 0.8)) / Math.max(1, rows - 1));
      g.add(bar);
    }
    g.position.set(x, y, z);
    root.add(g);
    plates.push({ g, ty: y, i });
  });
  plates.forEach((p) => {
    const [x, z, w, d] = SPEC[p.i];
    const o = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)),
      new THREE.LineBasicMaterial({ color: C.grid }),
    );
    o.rotation.x = -Math.PI / 2;
    o.position.set(x, -1.58, z);
    root.add(o);
  });

  const DUR = 760, STAG = 90;
  plates.forEach((p) => { p.g.position.y = p.ty + 7.5; p.g.rotation.x = 0.28; p.g.rotation.z = -0.2; });
  if (RM) plates.forEach((p) => { p.g.position.y = p.ty; p.g.rotation.set(0, 0, 0); });
  const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
  let scrollT = 0;
  function resize() {
    const r = host.getBoundingClientRect();
    const w = r.width, h = r.height || 520;
    const a = w / h;
    cam.left = -FRUST * a; cam.right = FRUST * a; cam.top = FRUST; cam.bottom = -FRUST;
    cam.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  const onScroll = () => {
    const r = host.getBoundingClientRect();
    scrollT = Math.min(1, Math.max(0, -r.top / (r.height + 400)));
  };
  addEventListener('scroll', onScroll, { passive: true });

  let t0: number | null = null;
  let raf = 0;
  let stopped = false;
  function loop(ts: number) {
    if (stopped) return;
    if (t0 === null) t0 = ts;
    if (!RM) {
      const el = ts - t0;
      plates.forEach((p) => {
        const k = Math.min(1, Math.max(0, (el - p.i * STAG) / DUR));
        const e = easeOut(k);
        p.g.position.y = p.ty + (1 - e) * 7.5;
        p.g.rotation.x = 0.28 * (1 - e);
        p.g.rotation.z = -0.2 * (1 - e);
      });
    }
    const s = scrollT;
    cam.position.set(9 - s * 1.6, 8 + s * 3.2, 9 + s * 1.2);
    cam.lookAt(0, 0.7 - s * 0.8, 0);
    root.rotation.y = s * 0.16;
    renderer.render(scene, cam);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    removeEventListener('scroll', onScroll);
    renderer.dispose();
    if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
  };
}
