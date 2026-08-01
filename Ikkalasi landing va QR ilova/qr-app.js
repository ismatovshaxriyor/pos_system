/* HamrohPOS — QR menyu va hisob ilovasi
   Backend shartnomasi (o'zgarmas):
     GET  {BASE}/api/public/menu/
     GET  {BASE}/api/public/table/<qr_code>/
     POST {BASE}/api/public/table/<qr_code>/call-waiter/
   Ulash: <script>window.HAMROH_API_BASE="https://server.local"</script> yoki ?qr=<uuid> */
(function(){
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const BASE=window.HAMROH_API_BASE??'';
const QP=new URLSearchParams(location.search);
const QR=QP.get('qr')||'demo-table-12';
const POLL=15000;

const num=v=>{const n=parseFloat(v);return isNaN(n)?0:n};
const som=v=>Math.round(num(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'\u00A0');
const clock=iso=>{try{return new Intl.DateTimeFormat('uz',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso))}catch(e){return '—'}};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ——— MOCK (backend yo'q bo'lsa) ——— */
const MOCK_MENU=[
{id:1,name:"Issiq taomlar",image:null,products:[
 {id:5,name:"Norin",price:"42000.00",image:null,barcode:"",is_available:true},
 {id:6,name:"Lag'mon",price:"38000.00",image:null,barcode:"",is_available:true},
 {id:7,name:"Osh",price:"35000.00",image:null,barcode:"",is_available:true},
 {id:8,name:"Manti",price:"32000.00",image:null,barcode:"",is_available:true},
 {id:9,name:"Shashlik",price:"28000.00",image:null,barcode:"",is_available:false},
 {id:10,name:"Chuchvara",price:"30000.00",image:null,barcode:"",is_available:true}]},
{id:2,name:"Salatlar",image:null,products:[
 {id:11,name:"Achchiq-chuchuk",price:"18000.00",image:null,barcode:"",is_available:true},
 {id:12,name:"Olivye",price:"22000.00",image:null,barcode:"",is_available:true},
 {id:13,name:"Bodring-pomidor",price:"16000.00",image:null,barcode:"",is_available:true},
 {id:14,name:"Sezar",price:"34000.00",image:null,barcode:"",is_available:true}]},
{id:3,name:"Ichimliklar",image:null,products:[
 {id:15,name:"Ayron",price:"12000.00",image:null,barcode:"4780012340015",is_available:true},
 {id:16,name:"Ko'k choy",price:"8000.00",image:null,barcode:"",is_available:true},
 {id:17,name:"Kompot",price:"10000.00",image:null,barcode:"",is_available:true},
 {id:18,name:"Suv 0.5",price:"6000.00",image:null,barcode:"4780012340022",is_available:true}]},
{id:4,name:"Shirinliklar",image:null,products:[
 {id:19,name:"Chak-chak",price:"20000.00",image:null,barcode:"",is_available:true},
 {id:20,name:"Muzqaymoq",price:"18000.00",image:null,barcode:"",is_available:true},
 {id:21,name:"Bodom halvo",price:"24000.00",image:null,barcode:"",is_available:false}]}];
const MOCK_TABLE=empty=>({table_id:12,table_name:"12",zone_name:"VIP",qr_code:QR,service_charge_rate:10,
 current_order:empty?null:{id:148,status:"in_progress",order_type:"dine_in",
  items:[
   {id:1,product_name:"Norin",quantity:2,price:"42000.00",status:"ready",modifiers:{},is_printed:true},
   {id:2,product_name:"Lag'mon",quantity:1,price:"38000.00",status:"new",modifiers:{},is_printed:true},
   {id:3,product_name:"Ayron",quantity:2,price:"12000.00",status:"ready",modifiers:{},is_printed:true}],
  tax_amount:"0.00",service_charge:"14600.00",discount_amount:"0.00",
  total_amount:"146000.00",final_amount:"160600.00",created_at:"2026-08-01T14:20:00+05:00"}});

let LIVE=false,demoEmpty=false,menu=[],table=null,cat=0;

async function api(path,opts){
  const r=await fetch(BASE+path,Object.assign({headers:{'Content-Type':'application/json'}},opts));
  if(!r.ok)throw new Error(r.status);
  return r.status===204?null:r.json();
}
async function loadMenu(){
  try{menu=await api('/api/public/menu/');LIVE=true}
  catch(e){menu=MOCK_MENU;LIVE=false;$('#demobar').hidden=false}
  drawCats();drawMenu();
}
async function loadTable(){
  try{table=await api(`/api/public/table/${encodeURIComponent(QR)}/`);LIVE=true}
  catch(e){table=MOCK_TABLE(demoEmpty);LIVE=false;$('#demobar').hidden=false}
  const label=table.zone_name?`${table.table_name} (${table.zone_name})`:String(table.table_name||'—');
  $('#sfTable').setAttribute('text',label);
  drawBill();
}

/* ——— Menyu ——— */
const ORDER_TYPE={dine_in:"Stolga",takeaway:"Olib ketish",delivery:"Yetkazib berish"};
const ITEM_ST={new:["Yangi","new"],in_progress:["Tayyorlanmoqda","new"],ready:["Tayyor","ready"],served:["Berildi","ready"],cancelled:["Bekor","closed"]};

function thumb(p,big){
  if(p.image)return `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${esc((p.name||'?')[0])}'}))">`;
  return `<span>${esc((p.name||'?')[0])}</span>`;
}
function drawCats(){
  $('#catbar').innerHTML=menu.map((c,i)=>`<button data-c="${i}" aria-selected="${i===cat}">${esc(c.name)}</button>`).join('');
}
function drawMenu(){
  const c=menu[cat];
  if(!c){$('#menuList').innerHTML='<div class="spin">Menyu bo\'sh</div>';return}
  const items=(c.products||[]).map(p=>`<button class="item ${p.is_available?'':'item--off'}" data-p="${p.id}">
    <span class="thumb">${thumb(p)}</span>
    <span><span class="item__n">${esc(p.name)}</span>${p.is_available?'':'<br><span class="tag-off">Tugagan</span>'}</span>
    <span class="item__p">${som(p.price)}<br><span class="lbl">so'm</span></span></button>`).join('');
  $('#menuList').innerHTML=`<div class="cathd"><h3>${esc(c.name)}</h3><span class="lbl">${(c.products||[]).length} ta taom</span></div>${items}`;
}
$('#catbar').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;cat=+b.dataset.c;drawCats();drawMenu();$('#scr').scrollTop=0});

/* ——— Taom tafsiloti ——— */
$('#menuList').addEventListener('click',e=>{
  const b=e.target.closest('.item');if(!b)return;
  const p=(menu[cat].products||[]).find(x=>String(x.id)===b.dataset.p);if(!p)return;
  $('#sheetBody').innerHTML=`<div class="hero-img">${thumb(p,true)}</div>
    <div class="sheet__n">${esc(p.name)}</div>
    <div class="kv">
      <div class="kv__r"><span>Narx</span><span>${som(p.price)}&nbsp;so'm</span></div>
      <div class="kv__r"><span>Holat</span><span style="color:${p.is_available?'var(--ok)':'var(--ink-40)'}">${p.is_available?'Mavjud':'Tugagan'}</span></div>
      <div class="kv__r"><span>Kategoriya</span><span>${esc(menu[cat].name)}</span></div>
      ${p.barcode?`<div class="kv__r"><span>Shtrix-kod</span><span>${esc(p.barcode)}</span></div>`:''}
      <div class="kv__r"><span>Kod</span><span>#${esc(p.id)}</span></div>
    </div>
    <div class="note" style="margin-bottom:24px">Buyurtma berish uchun ofitsiantga murojaat qiling.</div>`;
  $('#sheet').setAttribute('open','');
});
$('#sheetClose').addEventListener('click',()=>$('#sheet').removeAttribute('open'));

/* ——— Hisob ——— */
function drawBill(){
  const v=$('#vBill');
  if(!table){v.innerHTML='<div class="spin">Yuklanmoqda</div>';return}
  const o=table.current_order;
  const label=table.zone_name?`${table.table_name} (${table.zone_name})`:table.table_name;
  if(!o){
    v.innerHTML=`<div class="billhd"><span class="lbl">Stol</span><div class="billhd__r"><h3 style="font-family:var(--f-display);font-weight:800;font-size:30px;text-transform:uppercase;line-height:1">${esc(label)}</h3></div></div>
    <div class="empty"><div class="empty__l"></div><div class="empty__t">Hali buyurtma<br>ochilmagan</div>
    <p class="lede" style="font-size:14px;margin:0 auto">Bu stolda ochiq hisob yo'q. Buyurtma berish uchun ofitsiantni chaqiring — hisob ochilgach shu yerda jonli ko'rinadi.</p></div>`;
    return;
  }
  const items=(o.items||[]).map(it=>{
    const st=ITEM_ST[it.status]||["—","closed"];
    return `<div class="brow brow--${st[1]}">
      <div><div class="brow__n">${esc(it.product_name)}</div><div class="brow__m">${som(it.price)} × ${it.quantity} · ${st[0]}</div></div>
      <div class="brow__s">${som(num(it.price)*it.quantity)}</div></div>`}).join('');
  const disc=num(o.discount_amount),tax=num(o.tax_amount),srv=num(o.service_charge);
  v.innerHTML=`<div class="billhd">
      <span class="lbl">Stol</span>
      <div class="billhd__r"><h3 style="font-family:var(--f-display);font-weight:800;font-size:30px;text-transform:uppercase;line-height:1">${esc(label)}</h3><span class="stpill">Ochiq</span></div>
      <div class="lic__rows" style="margin-top:12px;border-top:var(--hair)">
        <div class="sum"><span>Buyurtma</span><b>#${esc(o.id)}</b></div>
        <div class="sum"><span>Turi</span><b>${ORDER_TYPE[o.order_type]||esc(o.order_type)}</b></div>
        <div class="sum" style="border-bottom:0"><span>Ochilgan</span><b>${clock(o.created_at)}</b></div>
      </div></div>
    <div class="cathd" style="padding-top:16px"><h3>Pozitsiyalar</h3><span class="lbl">${(o.items||[]).length} ta</span></div>
    ${items}
    <div class="sums" style="margin-top:14px">
      <div class="sum"><span>Oraliq jami</span><b>${som(o.total_amount)}</b></div>
      ${srv?`<div class="sum"><span>Xizmat haqi ${table.service_charge_rate||''}%</span><b>${som(srv)}</b></div>`:''}
      ${tax?`<div class="sum"><span>Soliq</span><b>${som(tax)}</b></div>`:''}
      ${disc?`<div class="sum"><span>Chegirma</span><b>−${som(disc)}</b></div>`:''}
    </div>
    <div class="final"><div><span class="lbl">Yakuniy summa</span><split-flap id="sfFinal" mode="num" text="${som(o.final_amount)}" pad="9" step="48"></split-flap></div><span class="lbl" style="padding-bottom:6px">so'm</span></div>
    <div class="note">Hisobni yopish uchun ofitsiant yoki kassirga murojaat qiling.</div>`;
}

/* ——— Tablar ——— */
$$('.tab').forEach(t=>t.addEventListener('click',()=>{
  $$('.tab').forEach(x=>x.setAttribute('aria-selected',x===t));
  const m=t.dataset.tab==='menu';
  $('#vMenu').hidden=!m;$('#vBill').hidden=m;$('#scr').scrollTop=0;
}));

/* ——— Ofitsiant chaqirish ——— */
let calling=false;
$('#fab').addEventListener('click',async()=>{
  if(calling)return;calling=true;
  const fab=$('#fab');fab.disabled=true;
  try{await api(`/api/public/table/${encodeURIComponent(QR)}/call-waiter/`,{method:'POST',body:'{}'})}catch(e){}
  const t=$('#toast');$('#sfToast').setAttribute('text','CHAQIRILDI');$('#toastMsg').textContent='Ofitsiant tez orada keladi';
  t.setAttribute('open','');
  setTimeout(()=>{t.removeAttribute('open');fab.disabled=false;calling=false},2600);
});

/* ——— Demo tugmalari ——— */
$$('[data-demo]').forEach(b=>b.addEventListener('click',()=>{
  demoEmpty=b.dataset.demo==='empty';
  $$('[data-demo]').forEach(x=>x.setAttribute('aria-pressed',x===b));
  table=MOCK_TABLE(demoEmpty);drawBill();
  $$('.tab').forEach(x=>x.setAttribute('aria-selected',x.dataset.tab==='bill'));
  $('#vMenu').hidden=true;$('#vBill').hidden=false;$('#scr').scrollTop=0;
}));

/* ——— Qurilma ramkasi ——— */
const embedded=window.self!==window.top;
function frameCheck(){document.body.classList.toggle('framed',!embedded&&!document.body.dataset.fs&&innerWidth>=680&&innerHeight>=620)}
$('#fsBtn').addEventListener('click',()=>{document.body.dataset.fs='1';frameCheck();$('#fsBtn').style.display='none'});
addEventListener('resize',frameCheck);frameCheck();

/* ——— Ishga tushirish ——— */
loadMenu();loadTable();
setInterval(()=>{if(LIVE)loadTable()},POLL);
})();
