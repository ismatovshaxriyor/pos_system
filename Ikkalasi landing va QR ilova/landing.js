/* HamrohPOS landing — o'zaro ta'sir mantiqi */
(function(){
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt=n=>Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g," ");

/* ——— Loading ——— */
const load=$('#load');
if(sessionStorage.getItem('hp_loaded')||RM){load.hidden=true}
else{document.documentElement.style.overflow='hidden';
  setTimeout(()=>{load.classList.add('out');document.documentElement.style.overflow='';sessionStorage.setItem('hp_loaded','1');setTimeout(()=>load.hidden=true,400)},1500)}

/* ——— Ticker ——— */
const TICK=["Offline rejimda ishlaydi","<b>Ona-Bola</b> arxitekturasi","QR menyu va jonli hisob","Oshxona displeyi","Smenali kassa hisoboti","Chek printeri integratsiyasi","<b>Asia/Tashkent</b>","Navbatli sinxronizatsiya"];
$('#tick').innerHTML=[...TICK,...TICK].map(t=>`<span>${t}</span>`).join('');

/* ——— Features ——— */
const F=[
["01","Internetsiz ishlaydigan kassa","Internet uzilsa ham savdo to'xtamaydi — lokal server buyurtmani qabul qiladi va navbatga qo'yadi.","Lokal server"],
["02","Ona-Bola sinxronizatsiya","Restoran serveri bulut bilan avtomatik moslashadi; ulanish tiklanganda navbat ketma-ket yuboriladi.","Bulut"],
["03","QR menyu va hisob","Mijoz stoldagi QR orqali menyuni va joriy hisobni real vaqtda ko'radi. To'lov xodim orqali.","Mijoz"],
["04","Oshxona displeyi","Buyurtma bosilgach oshxonaga darhol yetadi; taom holati zalga jonli qaytadi.","Oshxona"],
["05","Chek va hisobot","Chek printeri, smenali kassa hisoboti, kunlik va oylik savdo ko'rsatkichlari.","Hisobot"],
["06","Ko'p filial","Bitta bulutdan barcha filial: menyu, narx, xodim huquqlari va umumiy hisobot.","Tarmoq"]];
$('#ftable').innerHTML=F.map(([n,t,d,k])=>`<div class="frow" data-rv><div class="frow__n">${n}</div><div class="frow__t">${t}</div><div class="frow__d">${d}</div><div class="frow__k">${k}</div></div>`).join('');

/* ——— Kassa demosi ——— */
const MENU=[
{n:"Issiq taomlar",p:[["Norin",42000],["Lag'mon",38000],["Osh",35000],["Manti",32000],["Shashlik",28000],["Chuchvara",30000]]},
{n:"Salatlar",p:[["Achchiq-chuchuk",18000],["Olivye",22000],["Bodring-pomidor",16000],["Sezar",34000]]},
{n:"Ichimliklar",p:[["Ayron",12000],["Ko'k choy",8000],["Kompot",10000],["Suv 0.5",6000]]},
{n:"Shirinliklar",p:[["Chak-chak",20000],["Muzqaymoq",18000],["Bodom halvo",24000]]}];
let cat=0;const cart=new Map();
const cats=$('#cats'),prods=$('#prods'),ordEl=$('#ord'),tFinal=$('#tFinal');
cats.innerHTML=MENU.map((c,i)=>`<button class="cat" role="tab" aria-selected="${i===0}" data-c="${i}">${c.n}</button>`).join('');
function drawProds(){prods.innerHTML=MENU[cat].p.map(([n,p])=>`<button class="prod" data-n="${n}" data-p="${p}"><div class="prod__n">${n}</div><div class="prod__p">${fmt(p)} so'm</div></button>`).join('')}
function drawOrd(){
  if(!cart.size){ordEl.innerHTML='<div class="ord__empty lbl">Buyurtma bo\'sh — taom tanlang</div>'}
  else{ordEl.innerHTML=[...cart.entries()].map(([n,o])=>`<div class="ord__row"><div><div class="ord__n">${n}</div><div class="lbl">${fmt(o.p)} × ${o.q}</div></div><div class="ord__q"><button class="qbtn" data-m="-1" data-n="${n}">−</button><span class="num" style="min-width:16px;text-align:center;font-size:13px">${o.q}</span><button class="qbtn" data-m="1" data-n="${n}">+</button></div><div class="ord__s">${fmt(o.p*o.q)}</div></div>`).join('')}
  let sub=0;cart.forEach(o=>sub+=o.p*o.q);
  const srv=sub*.1;
  $('#tSub').textContent=fmt(sub);$('#tSrv').textContent=fmt(srv);
  $('#ordCount').textContent=cart.size+' pozitsiya';
  $('#printBtn').disabled=!cart.size;
  tFinal.setAttribute('text',fmt(sub+srv));
}
cats.addEventListener('click',e=>{const b=e.target.closest('.cat');if(!b)return;cat=+b.dataset.c;$$('.cat',cats).forEach(x=>x.setAttribute('aria-selected',x===b));drawProds()});
prods.addEventListener('click',e=>{const b=e.target.closest('.prod');if(!b)return;const n=b.dataset.n,p=+b.dataset.p;const o=cart.get(n)||{p,q:0};o.q++;cart.set(n,o);$('#printMsg').textContent='';drawOrd()});
ordEl.addEventListener('click',e=>{const b=e.target.closest('.qbtn');if(!b)return;const n=b.dataset.n,o=cart.get(n);if(!o)return;o.q+=+b.dataset.m;if(o.q<1)cart.delete(n);else cart.set(n,o);drawOrd()});
$('#printBtn').addEventListener('click',()=>{$('#printMsg').innerHTML='<span style="color:var(--ok)">Chek oshxonaga yuborildi · offline navbatda saqlandi</span>';cart.clear();drawOrd()});
drawProds();drawOrd();
const clock=()=>{$('#posClock').textContent=new Intl.DateTimeFormat('uz',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())};
clock();setInterval(clock,1000);

/* ——— Litsenziya ——— */
const LIC={
"HMR-2026-DEMO":{s:"FAOL",c:"ok",rows:[["Restoran","Demo Restoran"],["Tarif","Restoran (B)"],["Terminal","3 / 3"],["Amal qiladi","31.12.2026"]]},
"HMR-2025-TEST":{s:"MUDDATI TUGAGAN",c:"warn",rows:[["Restoran","Test Kafe"],["Tarif","Boshlang'ich (A)"],["Terminal","0 / 1"],["Tugagan","31.12.2025"]]}};
const badge=$('#licBadge'),rows=$('#licRows'),licIn=$('#licIn');
function setRows(r){rows.innerHTML=r.map(([a,b])=>`<div class="lic__row"><span>${a}</span><span>${b}</span></div>`).join('')}
setRows([["Kalit","—"],["Holat","Tekshirilmagan"]]);
function check(){
  const k=licIn.value.trim().toUpperCase();
  if(!k){badge.setAttribute('theme','bare');badge.setAttribute('text','KALIT YO\'Q');setRows([["Kalit","—"],["Holat","Kiritilmagan"]]);return}
  const r=LIC[k];
  if(!r){badge.setAttribute('theme','sig');badge.setAttribute('text','TOPILMADI');setRows([["Kalit",k],["Holat","Bazada yo'q"]]);return}
  badge.setAttribute('theme',r.c);badge.setAttribute('text',r.s);setRows([["Kalit",k],...r.rows]);
}
$('#licBtn').addEventListener('click',check);
licIn.addEventListener('keydown',e=>{if(e.key==='Enter')check()});
$$('.chip').forEach(c=>c.addEventListener('click',()=>{licIn.value=c.dataset.code;check()}));

/* ——— Modal ——— */
const modal=$('#modal'),frame=$('#demoFrame');
function openM(){modal.setAttribute('open','');document.body.style.overflow='hidden';if(frame.src==='about:blank'||!frame.src)frame.src='QR ilova.html'}
function closeM(){modal.removeAttribute('open');document.body.style.overflow=''}
$$('[data-modal]').forEach(b=>b.addEventListener('click',()=>b.dataset.modal==='open'?openM():closeM()));
addEventListener('keydown',e=>{if(e.key==='Escape')closeM()});

/* ——— Scroll reveal ——— */
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -40px'});
$$('[data-rv]').forEach(el=>io.observe(el));
$$('.sec,.plan,.node,.spec tr').forEach((el,i)=>{el.setAttribute('data-rv','');io.observe(el)});
})();
