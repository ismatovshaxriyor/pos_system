/* <split-flap> — vokzal taxtasi uslubidagi varaqlanuvchi matn/raqam
   Atributlar: text, mode="alpha|num", pad="8", theme="light|board|sig", auto (ko'rinishga kirganda ishga tushadi), step="70" */
(function(){
const SETS={alpha:" ABCDEFGHIJKLMNOPQRSTUVWXYZ'-.,:/%()0123456789",num:" 0123456789"};
const RM=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const CSS=`
:host{display:inline-flex;gap:var(--sf-gap,.05em);font-family:inherit;font-weight:inherit;line-height:1;vertical-align:baseline}
.c{position:relative;width:var(--sf-w,.62em);height:var(--sf-h,1.06em);perspective:340px;overflow:hidden;background:var(--sf-bg);color:var(--sf-fg);border-radius:1px;flex:0 0 auto}
.c.e,.c.e .h,.c.e .f{background:transparent;border-bottom-color:transparent}
.h{position:absolute;left:0;width:100%;height:50%;overflow:hidden;background:var(--sf-bg)}
.h>i{position:absolute;left:50%;transform:translateX(-50%);height:var(--sf-h,1.06em);line-height:var(--sf-h,1.06em);font-style:normal;white-space:pre}
.t{top:0;border-bottom:1px solid var(--sf-seam)}
.t>i{top:0}
.b{bottom:0}
.b>i{bottom:0}
.f{position:absolute;left:0;width:100%;height:50%;overflow:hidden;background:var(--sf-bg);backface-visibility:hidden;z-index:3;display:none}
.ft{top:0;transform-origin:bottom center;border-bottom:1px solid var(--sf-seam)}
.fb{top:50%;transform-origin:top center}
.f>i{position:absolute;left:50%;transform:translateX(-50%);height:var(--sf-h,1.06em);line-height:var(--sf-h,1.06em);font-style:normal;white-space:pre}
.ft>i{top:0}
.fb>i{bottom:0}
`;
class SplitFlap extends HTMLElement{
  static get observedAttributes(){return['text','pad','mode']}
  constructor(){super();this.attachShadow({mode:'open'});const s=document.createElement('style');s.textContent=CSS;this.shadowRoot.append(s);this._cells=[];this._cur='';this._busy=false;this._q=null}
  connectedCallback(){
    this._set=SETS[this.getAttribute('mode')==='num'?'num':'alpha'];
    const t=(this.getAttribute('text')||'').toUpperCase();
    this._build(this._len(t));
    if(this.hasAttribute('auto')&&!RM()){this._render(' '.repeat(this._cells.length));
      let fired=false;const go=()=>{if(fired)return;fired=true;io.disconnect();this.flip(t)};
      const io=new IntersectionObserver(e=>{if(e[0].isIntersecting)setTimeout(go,120)},{threshold:.2});io.observe(this);
      const r=this.getBoundingClientRect();
      if(r.top<innerHeight&&r.bottom>0&&r.width>0)setTimeout(go,150);
      setTimeout(go,4000);}
    else this._render(t);
  }
  attributeChangedCallback(n,o,v){if(o===null||!this._cells.length)return;if(n==='text')this.flip((v||'').toUpperCase())}
  _len(t){return Math.max(t.length,parseInt(this.getAttribute('pad')||'0',10))}
  _build(n){
    this._cells.forEach(c=>c.el.remove());this._cells=[];
    for(let i=0;i<n;i++){
      const el=document.createElement('span');el.className='c';
      el.innerHTML='<span class="h t"><i> </i></span><span class="h b"><i> </i></span><span class="f ft"><i> </i></span><span class="f fb"><i> </i></span>';
      this.shadowRoot.append(el);
      this._cells.push({el,top:el.querySelector('.t>i'),bot:el.querySelector('.b>i'),ft:el.querySelector('.ft'),fti:el.querySelector('.ft>i'),fb:el.querySelector('.fb'),fbi:el.querySelector('.fb>i'),ch:' '});
    }
  }
  _norm(t){const n=this._cells.length;t=(t||'').toUpperCase();return t.length>n?t.slice(0,n):t+' '.repeat(n-t.length)}
  _mark(c){c.el.classList.toggle('e',c.ch===' ')}
  _render(t){t=this._norm(t);this._cur=t;this._cells.forEach((c,i)=>{c.ch=t[i];c.top.textContent=c.bot.textContent=t[i];this._mark(c)})}
  set text(v){this.setAttribute('text',v)}
  get text(){return this._cur}
  flip(t){
    t=(t||'').toUpperCase();
    const need=this._len(t);if(need!==this._cells.length){this._build(need);this._render(' '.repeat(need))}
    t=this._norm(t);
    if(RM()){this._render(t);return}
    if(this._busy){this._q=t;return}
    this._busy=true;const step=parseInt(this.getAttribute('step')||'62',10);
    const set=this._set,max=6;
    let done=0,total=this._cells.length;
    this._cells.forEach((c,i)=>{
      const target=set.includes(t[i])?t[i]:' ';
      let from=set.indexOf(c.ch);if(from<0)from=0;
      let to=set.indexOf(target);
      let dist=(to-from+set.length)%set.length;
      if(dist===0){done++;this._mark(c);if(done===total)this._end(t);return}
      if(dist>max){from=(to-max+set.length)%set.length;dist=max;c.ch=set[from];c.top.textContent=c.bot.textContent=c.ch}
      c.el.classList.remove('e');
      const seq=[];for(let k=1;k<=dist;k++)seq.push(set[(from+k)%set.length]);
      setTimeout(()=>this._run(c,seq,step,()=>{done++;this._mark(c);if(done===total)this._end(t)}),i*26);
    });
  }
  _end(t){this._cur=t;this._busy=false;this.dispatchEvent(new CustomEvent('flipend'));if(this._q){const q=this._q;this._q=null;this.flip(q)}}
  /* bitta rAF sikli — WAAPI onfinish zanjiri emas (kadr yo'qotishga chidamli) */
  _run(c,seq,step,cb){
    const half=step/2;let t0=null,next=null,phase=0;
    const start=()=>{next=seq.shift();if(next===undefined){cb();return false}
      c.top.textContent=next;c.fti.textContent=c.ch;c.fbi.textContent=next;
      c.ft.style.display='block';c.ft.style.transform='rotateX(0deg)';
      c.fb.style.display='block';c.fb.style.transform='rotateX(90deg)';
      phase=0;t0=null;return true};
    if(!start())return;
    const tick=ts=>{
      if(t0===null)t0=ts;
      const e=ts-t0;
      if(phase===0){
        const k=Math.min(1,e/half);
        c.ft.style.transform='rotateX('+(-90*k*k)+'deg)';
        if(k>=1){phase=1;t0=ts;c.ft.style.display='none'}
      }else{
        const k=Math.min(1,e/half),p=1-(1-k)*(1-k);
        c.fb.style.transform='rotateX('+(90-90*p)+'deg)';
        if(k>=1){c.fb.style.display='none';c.bot.textContent=next;c.ch=next;if(!start())return}
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
customElements.define('split-flap',SplitFlap);
})();
