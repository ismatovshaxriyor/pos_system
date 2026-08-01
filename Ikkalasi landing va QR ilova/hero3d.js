/* Hero 3D — OrthographicCamera, gridga tekislangan chek plitalari */
import * as THREE from 'three';
const host=document.getElementById('hero3d');
if(host){
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const C={paper:0xF7F7F3,panel:0xE6E6E0,ink:0x131313,grid:0xB7B7B2,signal:0xD91E18};
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
host.appendChild(renderer.domElement);
renderer.domElement.style.cssText='display:block;width:100%;height:100%';
const scene=new THREE.Scene();
const FRUST=7.4;
const cam=new THREE.OrthographicCamera(-FRUST,FRUST,FRUST,-FRUST,-100,200);
cam.position.set(9,8,9);cam.lookAt(0,.7,0);
scene.add(new THREE.HemisphereLight(0xffffff,0xd8d8d2,1.05));
const key=new THREE.DirectionalLight(0xffffff,1.15);key.position.set(6,12,4);scene.add(key);
const fill=new THREE.DirectionalLight(0xffffff,.4);fill.position.set(-8,4,-6);scene.add(fill);

const root=new THREE.Group();scene.add(root);
// er-yuzasi grid — hairline
const gh=new THREE.GridHelper(20,20,C.grid,C.grid);gh.material.transparent=true;gh.material.opacity=.32;gh.position.y=-1.6;root.add(gh);

// chek plitalari — footprintlari kesishmaydi (aniq gridga yotqizilgan): [x, z, w, d, y, sig]
const SPEC=[[0,0,4,5.2,0,false],[-4.2,-2,2.6,3.2,1.15,false],[3.6,1.6,3,3.6,.6,true],[-1,-4.6,3.2,2.2,1.85,false],[3.2,-2.8,2.2,2.4,2.4,false],[-4,2.4,2,2.6,1.7,false]];
const plates=[];
SPEC.forEach((s,i)=>{
  const [x,z,w,d,y,sig]=s;
  const g=new THREE.Group();
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,.1,d),new THREE.MeshStandardMaterial({color:sig?C.signal:C.paper,roughness:.92,metalness:0}));
  g.add(mesh);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:sig?C.signal:C.grid,transparent:true,opacity:sig?.55:.9}));
  g.add(edges);
  // chek chiziqlari (matn qatorlari) — yupqa plankalar
  const rows=Math.max(2,Math.round(d*1.6));
  for(let r=0;r<rows;r++){
    const lw=w*(r===0?.62:(r%3===0?.34:.78));
    const bar=new THREE.Mesh(new THREE.BoxGeometry(lw,.012,.07),new THREE.MeshBasicMaterial({color:sig?0xffffff:C.ink}));
    bar.material.opacity=r===0?.92:.5;bar.material.transparent=true;
    bar.position.set(-w/2+lw/2+w*.11,.056,-d/2+.42+r*(d-.8)/Math.max(1,rows-1));
    g.add(bar);
  }
  g.position.set(x,y,z);
  root.add(g);
  plates.push({g,ty:y,i});
});
// grid tekisligiga proyeksiya — har plita ostida hairline kontur
plates.forEach(p=>{const [x,z,w,d]=SPEC[p.i];
  const o=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w,d)),new THREE.LineBasicMaterial({color:C.grid}));
  o.rotation.x=-Math.PI/2;o.position.set(x,-1.58,z);root.add(o);});

let t0=null;const DUR=760,STAG=90;
plates.forEach(p=>{p.g.position.y=p.ty+7.5;p.g.rotation.x=.28;p.g.rotation.z=-.2;});
if(RM){plates.forEach(p=>{p.g.position.y=p.ty;p.g.rotation.set(0,0,0)})}
const easeOut=x=>1-Math.pow(1-x,3);
let scrollT=0;
function resize(){
  const r=host.getBoundingClientRect();const w=r.width,h=r.height||520;
  const a=w/h;cam.left=-FRUST*a;cam.right=FRUST*a;cam.top=FRUST;cam.bottom=-FRUST;cam.updateProjectionMatrix();
  renderer.setSize(w,h,false);
}
new ResizeObserver(resize).observe(host);resize();
addEventListener('scroll',()=>{const r=host.getBoundingClientRect();scrollT=Math.min(1,Math.max(0,-r.top/(r.height+400)))},{passive:true});
function loop(ts){
  if(t0===null)t0=ts;
  if(!RM){const el=ts-t0;
    plates.forEach(p=>{
      const k=Math.min(1,Math.max(0,(el-p.i*STAG)/DUR));const e=easeOut(k);
      p.g.position.y=p.ty+(1-e)*7.5;p.g.rotation.x=.28*(1-e);p.g.rotation.z=-.2*(1-e);
    });
  }
  // bitta dolly/pan — kam, ishonarli
  const s=scrollT;
  cam.position.set(9-s*1.6,8+s*3.2,9+s*1.2);cam.lookAt(0,.7-s*.8,0);
  root.rotation.y=s*.16;
  renderer.render(scene,cam);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
}
