/* ================= DATOS ================= */
const POS=[
  {id:'esq_izq',n:'Esquina izq.',c:'ESQ IZQ',x:32,y:236},
  {id:'c45_izq',n:'45° izq.',    c:'45 IZQ', x:58,y:158},
  {id:'frontal',n:'Frontal',     c:'FRONTAL',x:150,y:118},
  {id:'c45_der',n:'45° der.',    c:'45 DER', x:242,y:158},
  {id:'esq_der',n:'Esquina der.',c:'ESQ DER',x:268,y:236}
];
const TESTS=[
  ...POS.map(p=>({id:p.id,n:'Tiro '+p.n,tipo:'tiro',u:'%',d:'Aciertos sobre intentos'})),
  {id:'libres',n:'Tiros libres',tipo:'tiro',u:'%',d:'Aciertos sobre intentos'},
  {id:'vel_con',n:'Velocidad con pelota',tipo:'tiempo',u:'s',d:'Una cancha completa, en segundos'},
  {id:'vel_sin',n:'Velocidad sin pelota',tipo:'tiempo',u:'s',d:'Una cancha completa, en segundos'}
];
const EXTRA_DISPO=[{id:'salto',n:'Salto vertical',u:'cm'},{id:'agil',n:'Agilidad en T',u:'s'},{id:'flex',n:'Flexibilidad',u:'cm'}];
const FECHAS=['Mar','Abr','Jun','Ago'];
const BIBLIO=[
  {t:'Tiro de la esquina',d:'Entrada con pies armados'},
  {t:'Mecánica de libres',d:'Rutina previa + 2 series'},
  {t:'Manejo mano débil',d:'Conos, cambio sin mirar'},
  {t:'Salida en velocidad',d:'3 arranques de media cancha'}
];
const NOM13=[['Tomás','Fernández'],['Mateo','Sosa'],['Juan Cruz','López'],['Valentino','Díaz'],['Franco','Aguirre'],
  ['Santino','Vera'],['Bruno','Cáceres'],['Ciro','Paniagua'],['Gael','Escobar'],['Thiago','Medina'],['Simón','Roldán'],['Ian','Ledesma']];
const NOM15=[['Nicolás','Acosta'],['Lautaro','Giménez'],['Benjamín','Ríos'],['Pablo','Sarmiento'],['Tobías','Ferreyra'],
  ['Lautaro','Ojeda'],['Ignacio','Villalba'],['Facundo','Aguirre'],['Máximo','Benítez'],['Valentín','Sosa'],
  ['Bautista','Peralta'],['Joaquín','Núñez'],['Dante','Olivera'],['Emir','Quiroga']];

function rng(s){let x=s*7919+13;return()=>{x=(x*9301+49297)%233280;return x/233280}}
function armar(noms,semilla,altBase){
  return noms.map(([n,a],i)=>{
    const r=rng(semilla+i*13),v={};
    TESTS.forEach(t=>{
      let base = t.tipo==='tiro' ? (t.id==='libres'?45+r()*25:22+r()*30) : 4.4+r()*1.4;
      const s=[];
      for(let k=0;k<FECHAS.length;k++){
        s.push(+base.toFixed(t.tipo==='tiempo'?1:0));
        base += t.tipo==='tiempo' ? -(.02+r()*.12) : (r()*5-.6);
      }
      v[t.id]=s;
    });
    return{id:i,nom:n,ape:a,dor:4+i,pos:['Base','Escolta','Alero','Ala-pívot','Pívot'][Math.floor(r()*5)],
      alt:Math.round(altBase+r()*16),peso:Math.round(48+r()*18),v,ini:(n[0]+a[0])};
  });
}
const CATS=[
  {id:'u13',sig:'U13',n:'Infantiles',jug:armar(NOM13,101,152),extra:[],cargados:{}},
  {id:'u15',sig:'U15',n:'Cadetes',   jug:armar(NOM15,307,166),extra:['salto'],cargados:{}}
];
let E={cat:0,pant:'p-resumen',jug:0,rol:'profe',stack:[],test:'libres',stSeg:0,fiSeg:0};
let C={test:null,intentos:10,val:{},act:null,buf:''};

/* ================= HELPERS ================= */
const $=i=>document.getElementById(i);
const cat=()=>CATS[E.cat];
const jugs=()=>cat().jug;
const test=id=>TESTS.find(t=>t.id===id)||EXTRA_DISPO.find(t=>t.id===id);
const ult=(j,id)=>j.v[id]?j.v[id][FECHAS.length-1]:null;
const prom=(id,k)=>{const a=jugs().map(j=>j.v[id]?j.v[id][k]:null).filter(x=>x!=null);
  return a.length?a.reduce((s,x)=>s+x,0)/a.length:0};
function toast(t){$('toast-tx').textContent=t;$('toast').classList.add('on');
  clearTimeout(window._t);window._t=setTimeout(()=>$('toast').classList.remove('on'),2500)}

/* Mismo tono que --gris-cl en tokens.css (auditoría #2). El eje Y, la unidad
   y las 3 líneas de "promedio de la categoría" de los gráficos leen de esta
   única constante en vez de repetir el hex a mano. */
const COL_MUTED='#726E65';

/* ================= CANCHA ================= */
function cancha(svg,vals,{alto=200}={}){
  const W=300,H=290;
  const L='#C9C5BE', T='#131316';
  let g=`<rect x="6" y="6" width="288" height="278" fill="#FBFAF8" stroke="${L}" stroke-width="1.5"/>`;
  // zona
  g+=`<rect x="104" y="176" width="92" height="108" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  g+=`<circle cx="150" cy="176" r="34" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  // aro y tablero
  g+=`<line x1="134" y1="272" x2="166" y2="272" stroke="${T}" stroke-width="2.5"/>`;
  g+=`<line x1="150" y1="272" x2="150" y2="266" stroke="${T}" stroke-width="2"/>`;
  g+=`<circle cx="150" cy="262" r="6" fill="none" stroke="${T}" stroke-width="2"/>`;
  // linea de 3
  g+=`<path d="M28 284 L28 232 A126 126 0 0 1 272 232 L272 284" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  // marcadores
  POS.forEach(p=>{
    const v=vals[p.id];
    const op=v==null?0:Math.max(.18,Math.min(1,(v-15)/55));
    g+=`<circle cx="${p.x}" cy="${p.y}" r="21" fill="#D9122E" opacity="${op}"/>`;
    g+=`<circle cx="${p.x}" cy="${p.y}" r="21" fill="none" stroke="#D9122E" stroke-width="1.6"/>`;
    g+=`<text x="${p.x}" y="${p.y+5}" text-anchor="middle" font-family="IBM Plex Mono" font-size="14.5"
        font-weight="600" fill="${op>.55?'#fff':'#131316'}">${v==null?'—':Math.round(v)}</text>`;
    g+=`<text x="${p.x}" y="${p.y+34}" text-anchor="middle" font-family="Barlow Condensed" font-size="10"
        letter-spacing="1" fill="#6E6B66">${p.c}</text>`;
  });
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  svg.style.height=alto+'px';
  svg.innerHTML=g;
}

/* ================= GRÁFICO CON EJES ================= */
function grafico(svg,series,{u='%',alto=170,dec=0}={}){
  const W=320,H=alto,ml=30,mr=8,mt=12,mb=24;
  const todos=series.flatMap(s=>s.d);
  let min=Math.min(...todos),max=Math.max(...todos);
  const pad=(max-min)*.25||1; min=min-pad; max=max+pad;
  if(u==='%'){min=Math.max(0,min)}
  const X=i=>ml+i*(W-ml-mr)/(FECHAS.length-1);
  const Y=v=>mt+(1-(v-min)/(max-min))*(H-mt-mb);
  let g='';
  // grilla + eje Y
  for(let k=0;k<=3;k++){
    const v=min+(max-min)*k/3, y=Y(v);
    g+=`<line x1="${ml}" y1="${y}" x2="${W-mr}" y2="${y}" stroke="#EAE6DF" stroke-width="1"/>`;
    g+=`<text x="${ml-6}" y="${y+3.5}" text-anchor="end" font-family="IBM Plex Mono" font-size="10" fill="${COL_MUTED}">${v.toFixed(dec)}</text>`;
  }
  // eje X
  g+=`<line x1="${ml}" y1="${Y(min)}" x2="${W-mr}" y2="${Y(min)}" stroke="#C9C5BE" stroke-width="1.2"/>`;
  FECHAS.forEach((f,i)=>{
    g+=`<text x="${X(i)}" y="${H-8}" text-anchor="middle" font-family="Barlow Condensed" font-size="11.5"
        letter-spacing=".7" fill="#6E6B66">${f.toUpperCase()}</text>`;
  });
  g+=`<text x="4" y="9" font-family="Barlow Condensed" font-size="10" letter-spacing="1" fill="${COL_MUTED}">${u.toUpperCase()}</text>`;
  series.forEach(s=>{
    const pts=s.d.map((v,i)=>`${X(i)},${Y(v)}`).join(' ');
    g+=`<polyline points="${pts}" fill="none" stroke="${s.c}" stroke-width="${s.w||2.4}"
        ${s.dash?'stroke-dasharray="5 4"':''} stroke-linejoin="round"/>`;
    if(!s.dash)s.d.forEach((v,i)=>{
      g+=`<circle cx="${X(i)}" cy="${Y(v)}" r="${i===s.d.length-1?4:2.8}" fill="${i===s.d.length-1?s.c:'#fff'}" stroke="${s.c}" stroke-width="1.8"/>`});
  });
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.style.height=alto+'px';svg.innerHTML=g;
}

/* ================= CHROME ================= */
function head(){
  const dentro=['p-ficha','p-carga'].includes(E.pant);
  let izq,tit,sub;
  if(dentro){izq=`<button class="atras" onclick="volver()">‹</button>`;
    tit=E.pant==='p-ficha'?'Ficha':'Carga de test';sub=cat().sig+' · 2026'}
  else if(E.rol==='jugador'){izq=`<div class="escudo">NOB</div>`;tit='Pablo Sarmiento';sub='U15 · Newell\'s'}
  else{izq=`<div class="escudo">NOB</div>`;tit='Cuerpo técnico';sub='Newell\'s · Temporada 2026'}
  $('head').innerHTML=`${izq}<div><h1>${tit}</h1><div class="sub">${sub}</div></div>
    <div class="rol"><button class="${E.rol==='profe'?'on':''}" onclick="rol('profe')">Profe</button>
    <button class="${E.rol==='jugador'?'on':''}" onclick="rol('jugador')">Jugador</button></div>`;
  $('cats').style.display=(E.rol==='jugador'||E.pant==='p-carga')?'none':'flex';
}
function cats(){
  $('cats').innerHTML=CATS.map((c,i)=>{
    const falt=TESTS.length-Object.keys(c.cargados).length;
    return `<button class="cat ${i===E.cat?'on':''}" onclick="setCat(${i})">
      <div><div class="sig">${c.sig}</div><div class="mini">${c.jug.length} jug · ${falt?falt+' sin cargar':'al día'}</div></div>
    </button>`}).join('')+`<button class="cat mas" onclick="toast('En la versión real, alta de categoría')">+</button>`;
}
function nav(){
  const ic={res:'<path d="M4 13h5v7H4zM10 8h5v12h-5zM16 4h4v16h-4z"/>',
    pl:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 8.5a3 3 0 100-5"/><path d="M17.5 14.5c2 .7 3.5 2.6 3.5 5.5"/>',
    med:'<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="18" cy="17" r="2.5"/>',
    rec:'<path d="M4 5h16v14H4z"/><path d="M10 9l5 3-5 3z"/>',
    st:'<path d="M3 17l5-6 4 4 4-7 5 5"/><path d="M3 21h18"/>',
    hoy:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>'};
  const it=E.rol==='profe'
    ?[['p-resumen','Hoy',ic.res],['p-plantel','Plantel',ic.pl],['p-medir','Medir',ic.med],['p-recursos','Recursos',ic.rec],['p-stats','Datos',ic.st]]
    :[['p-hoy','Mi espacio',ic.hoy]];
  $('nav').innerHTML=it.map(([id,t,s])=>`<button class="${E.pant===id?'on':''}" onclick="ir('${id}')">
    <svg viewBox="0 0 24 24">${s}</svg><span>${t}</span></button>`).join('');
}
function ir(id,push){
  if(push)E.stack.push(E.pant);
  E.pant=id;
  document.querySelectorAll('.pant').forEach(p=>p.classList.toggle('on',p.id===id));
  $('cuerpo').scrollTop=0;$('kb').classList.remove('on');
  head();nav();
  if(id==='p-resumen')pResumen();
  if(id==='p-plantel')pPlantel();
  if(id==='p-medir')pMedir();
  if(id==='p-recursos')pRecursos();
  if(id==='p-stats')pStats();
  if(id==='p-hoy')pHoy();
}
function volver(){ir(E.stack.pop()||'p-resumen')}
function setCat(i){E.cat=i;cats();ir(E.pant)}
function rol(r){E.rol=r;E.stack=[];ir(r==='profe'?'p-resumen':'p-hoy')}

/* ================= RESUMEN ================= */
function pResumen(){
  const c=cat(),falt=TESTS.filter(t=>!c.cargados[t.id]).length;
  $('res-sub').textContent=`Estás en ${c.sig} ${c.n}. ${falt?falt+' tests sin cargar en esta medición.':'La medición de agosto está completa.'}`;
  $('res-fecha').textContent=c.sig;
  const sinProg=c.jug.filter(j=>ult(j,'libres')-j.v.libres[0]<=0);
  $('res-alertas').innerHTML=`
    <button class="al" onclick="ir('p-medir')"><div class="ico">!</div><div class="tx">
      <b>${falt} tests sin cargar en ${c.sig}.</b><div class="mt">Última medición completa: 9 de agosto</div></div></button>
    <button class="al" onclick="ir('p-stats')"><div class="ico">!</div><div class="tx">
      <b>${sinProg.length} chicos sin mejora en tiro desde marzo.</b><div class="mt">${sinProg.slice(0,3).map(j=>j.nom+' '+j.ape).join(', ')}${sinProg.length>3?'…':''}</div></div></button>
    <div class="al ok"><div class="ico">✓</div><div class="tx">
      <b>El promedio de tiro de la categoría subió 6 puntos.</b><div class="mt">De marzo a agosto, en las 5 posiciones</div></div></div>`;
  const v={};POS.forEach(p=>v[p.id]=prom(p.id,FECHAS.length-1));
  cancha($('res-cancha'),v);
  $('res-tiro').innerHTML=Math.round(POS.reduce((s,p)=>s+v[p.id],0)/5)+'<small> % prom.</small>';
}

/* ================= PLANTEL ================= */
function pPlantel(){
  const c=cat();
  $('pl-tit').textContent=c.sig+' · '+c.n;
  $('pl-sub').textContent=c.jug.length+' jugadores · temporada 2026';
  $('pl-lista').innerHTML=c.jug.map(j=>{
    const d=ult(j,'libres')-j.v.libres[0];
    return `<button class="jug" onclick="verJug(${j.id})">
      <div class="av">${j.ini}</div>
      <div><div class="nom">${j.nom} ${j.ape}</div><div class="det">${j.pos} · ${j.alt} cm</div></div>
      <div class="der"><div class="chip ${d>2?'sube':(d>0?'':'baja')}">${d>0?'+':''}${Math.round(d)} libres</div>
      <span class="flecha">›</span></div></button>`}).join('');
}

/* ================= MEDIR ================= */
function pMedir(){
  const c=cat(),hechos=Object.keys(c.cargados).length;
  $('med-estado').textContent=hechos+' de '+TESTS.length;
  $('med-tests').innerHTML=TESTS.map(t=>filaTest(t,c)).join('');
  $('med-extra').innerHTML=c.extra.length
    ? c.extra.map(id=>filaTest(EXTRA_DISPO.find(e=>e.id===id),c)).join('')
    : `<div class="p" style="padding:2px 2px 8px">Todavía no agregaste ninguno en ${c.sig}.</div>`;
}
function filaTest(t,c){
  const h=c.cargados[t.id];
  return `<button class="test-fila ${h?'hecho':''}" onclick="abrirCarga('${t.id}')">
    <div class="ic">${h?'✓':(t.u==='%'?'%':t.u)}</div>
    <div><div class="t">${t.n}</div><div class="d">${h?h+' de '+c.jug.length+' cargados':(t.d||'Sin cargar')}</div></div>
    <div class="der" style="margin-left:auto"><span class="flecha">›</span></div></button>`;
}

/* ================= CARGA ================= */
function abrirCarga(id){
  C.test=id;C.intentos=10;C.val={};C.act=null;C.buf='';
  pCarga();ir('p-carga',true);
}
function pCarga(){
  const t=test(C.test),c=cat();
  $('c-nom').textContent=t.n;
  $('c-desc').textContent=t.tipo==='tiempo'||t.u!=='%'
    ? (t.d||'Valor en '+t.u)
    : 'Poné cuántos metió. El porcentaje lo calcula solo.';
  $('c-intentos').style.display=(t.u==='%')?'flex':'none';
  if(t.u==='%')$('c-intentos').innerHTML=
    `<div class="k">Intentos por jugador</div>
     <div class="stp"><button onclick="setInt(-1)">−</button><div class="v">${C.intentos}</div><button onclick="setInt(1)">+</button></div>`;
  $('c-filas').innerHTML=c.jug.map(j=>fila(j,t)).join('');
  const n=Object.keys(C.val).length;
  $('c-btn').textContent=n===c.jug.length?'Guardar test':`Guardar · ${n} de ${c.jug.length}`;
  $('c-btn').disabled=n===0;
}
function fila(j,t){
  const v=C.val[j.id];
  if(t.u==='%'){
    const ints=(v&&v.i)||C.intentos;
    const pills=Array.from({length:ints+1},(_,k)=>
      `<button class="${v&&v.a===k?'on':''}" onclick="setAc(${j.id},${k})">${k}</button>`).join('');
    return `<div class="fila ${v?'':''}" id="f-${j.id}">
      <div class="fila-h"><div class="av" style="width:26px;height:26px;font-size:var(--fs-100)">${j.ini}</div>
        <div class="nom">${j.nom} ${j.ape}</div>
        <button class="int" onclick="cambiarInt(${j.id})">/${ints}</button>
        <div class="res ${v?'si':''}">${v?Math.round(v.a/v.i*100)+'%':'—'}</div></div>
      <div class="pills">${pills}</div></div>`;
  }
  return `<div class="fila ${C.act===j.id?'act':''}" id="f-${j.id}" onclick="activar(${j.id})">
    <div class="fila-h"><div class="av" style="width:26px;height:26px;font-size:var(--fs-100)">${j.ini}</div>
      <div class="nom">${j.nom} ${j.ape}</div>
      <div class="res ${v?'si':''}">${ult(j,C.test)!=null?'ant. '+ult(j,C.test):''}</div></div>
    <div class="tiempo"><div class="caja ${v?'si':''}">${C.act===j.id?(C.buf||'|'):(v?v.a:'—')}</div>
      <div class="u">${t.u==='s'?'segundos':t.u}</div></div></div>`;
}
function setInt(d){C.intentos=Math.max(1,Math.min(30,C.intentos+d));pCarga()}
function cambiarInt(id){
  const v=C.val[id]||{a:0,i:C.intentos};
  v.i=v.i>=15?10:v.i+1;C.val[id]=v;
  if(v.a>v.i)v.a=v.i;
  pCarga();
}
function setAc(id,k){
  const i=(C.val[id]&&C.val[id].i)||C.intentos;
  C.val[id]={a:k,i};
  pCarga();
  const idx=jugs().findIndex(j=>j.id===id), sig=jugs()[idx+1];
  if(sig)$('f-'+sig.id).scrollIntoView({behavior:'smooth',block:'center'});
}
function activar(id){C.act=id;C.buf='';$('kb').classList.add('on');pCarga();
  setTimeout(()=>{const e=$('f-'+id);if(e)e.scrollIntoView({block:'center'})},60)}
function kb(k){
  if(C.act==null)return;
  if(k===','&&C.buf.includes(','))return;
  if(C.buf.length>4)return;
  C.buf+=k;pCarga();
}
function kbBorrar(){
  if(C.act==null)return;
  C.buf=C.buf.slice(0,-1);pCarga();
}
function kbSig(){
  if(C.act==null)return;
  if(C.buf)C.val[C.act]={a:C.buf.replace(',','.'),i:1};
  const idx=jugs().findIndex(j=>j.id===C.act),sig=jugs()[idx+1];
  C.buf='';
  if(sig){C.act=sig.id;pCarga();$('f-'+sig.id).scrollIntoView({behavior:'smooth',block:'center'})}
  else{C.act=null;$('kb').classList.remove('on');pCarga()}
}
function guardarTest(){
  const n=Object.keys(C.val).length;
  cat().cargados[C.test]=n;
  $('kb').classList.remove('on');
  volver();
  toast(`${test(C.test).n} · ${n} jugadores guardados`);
  cats();
}

/* ================= FICHA ================= */
function verJug(id){E.jug=id;pFicha();ir('p-ficha',true)}
function pFicha(){
  const j=jugs()[E.jug],c=cat();
  $('fi-nom').textContent=j.nom+' '+j.ape;
  $('fi-sub').textContent=`#${j.dor} · ${j.pos} · ${c.sig} ${c.n}`;
  $('fi-dat').innerHTML=`
    <button class="d" onclick="abrirFisicos()"><div class="k">Altura</div><div class="v">${j.alt}<small> cm</small></div></button>
    <button class="d" onclick="abrirFisicos()"><div class="k">Peso</div><div class="v">${j.peso}<small> kg</small></div></button>
    <div class="d"><div class="k">Libres</div><div class="v">${Math.round(ult(j,'libres'))}<small> %</small></div></div>`;

  const vJ={},vC={};POS.forEach(p=>{vJ[p.id]=ult(j,p.id);vC[p.id]=prom(p.id,FECHAS.length-1)});
  $('fi-prog').innerHTML=`
    <div class="tarj" style="margin-top:12px">
      <div class="tarj-h"><div class="t">Tiro de campo</div>
        <div class="n">${Math.round(POS.reduce((s,p)=>s+vJ[p.id],0)/5)}<small> % prom.</small></div></div>
      <div class="seg" id="fi-seg" style="margin-top:10px">
        <button class="${E.fiSeg===0?'on':''}" onclick="E.fiSeg=0;pFicha()">Él</button>
        <button class="${E.fiSeg===1?'on':''}" onclick="E.fiSeg=1;pFicha()">Promedio ${cat().sig}</button>
      </div>
      <svg class="g" id="fi-cancha"></svg>
      <div class="leyenda"><span>10 intentos por posición · 9 de agosto</span></div>
    </div>
    <div class="eyebrow">Evolución</div>
    <div class="chips" id="fi-chips"></div>
    <div class="tarj">
      <div class="tarj-h"><div class="t" id="fi-tn"></div><div class="n" id="fi-tv"></div></div>
      <svg class="g" id="fi-graf"></svg>
      <div class="leyenda"><span><i></i>${j.nom}</span><span><i class="pt"></i>Promedio ${cat().sig}</span></div>
    </div>
    <button class="btn osc" onclick="toast('Informe generado (simulado)')">Informe para la familia</button>
    <div style="height:18px"></div>`;
  cancha($('fi-cancha'),E.fiSeg===0?vJ:vC);
  const opts=[...TESTS.filter(t=>t.id!=='vel_con'),...cat().extra.map(id=>EXTRA_DISPO.find(e=>e.id===id))];
  $('fi-chips').innerHTML=opts.map(t=>
    `<button class="${E.test===t.id?'on':''}" onclick="E.test='${t.id}';pFicha()">${t.n.replace('Tiro ','').replace('Velocidad ','Vel. ')}</button>`).join('');
  const t=test(E.test),sj=j.v[E.test]||FECHAS.map(()=>0),sc=FECHAS.map((_,k)=>prom(E.test,k));
  $('fi-tn').textContent=t.n;
  $('fi-tv').innerHTML=(t.u==='s'?sj[3].toFixed(1):Math.round(sj[3]))+`<small> ${t.u}</small>`;
  grafico($('fi-graf'),[{d:sc,c:COL_MUTED,dash:1,w:2},{d:sj,c:'#D9122E'}],{u:t.u,dec:t.u==='s'?1:0,alto:160});

  $('fi-rec').innerHTML=`
    <div class="eyebrow">Lo que le dejaste</div>
    <div class="rec"><div class="t">Tiro de la esquina</div>
      <div class="d">Video + 3 series de 10. Se lo dejaste el 12 de agosto.</div>
      <div class="m"><span class="tag">Lo abrió 6 veces</span><span class="tag">Última vez: hace 2 días</span></div></div>
    <div class="rec"><div class="t">Mecánica de libres</div>
      <div class="d">Para todo el plantel.</div>
      <div class="m"><span class="tag">Lo abrió 2 veces</span></div></div>
    <div class="p" style="margin:2px 2px 12px">Es lo que el chico marcó por su cuenta. Sirve para saber si le interesó, no para evaluarlo.</div>
    <button class="btn" onclick="abrir('sh-rec')">Ofrecerle otro recurso</button><div style="height:18px"></div>`;

  $('fi-hist').innerHTML=`
    <div class="eyebrow">Paso por el club</div>
    <div class="rec"><div class="t">${cat().sig} · 2026 — Martín Cabrera</div><div class="d">En curso</div></div>
    <div class="rec"><div class="t">U13 · 2025 — L. Martínez</div>
      <div class="d"><b>Ficha de traspaso:</b> se trabajó mecánica de tiro y salida de bloqueo. Quedó pendiente la mano izquierda. Callado, pero entrena todo lo que le pedís.</div></div>
    <div class="eyebrow">Entrenamiento vs. partido</div>
    <div class="tarj"><div class="tarj-h"><div class="t">Tiro de campo</div></div>
      <div style="display:flex;gap:26px;margin-top:9px">
        <div><div class="k" style="font-family:'Barlow Condensed';font-size:var(--fs-100);letter-spacing:.11em;text-transform:uppercase;color:var(--gris)">Entrenamiento</div>
          <div style="font-family:'IBM Plex Mono';font-size:var(--fs-200);font-weight:600">${Math.round(POS.reduce((s,p)=>s+vJ[p.id],0)/5)}%</div></div>
        <div><div class="k" style="font-family:'Barlow Condensed';font-size:var(--fs-100);letter-spacing:.11em;text-transform:uppercase;color:var(--gris)">Partido</div>
          <div style="font-family:'IBM Plex Mono';font-size:var(--fs-200);font-weight:600;color:var(--rojo)">${Math.max(15,Math.round(POS.reduce((s,p)=>s+vJ[p.id],0)/5)-17)}%</div></div>
      </div>
      <div class="leyenda"><span>7 partidos cargados · mete solo, le cuesta con presión</span></div></div>
    <div style="height:18px"></div>`;
}
function tab(k,b){document.querySelectorAll('#p-ficha .tabs button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
  ['prog','rec','hist'].forEach(x=>$('fi-'+x).style.display=x===k?'block':'none')}
function abrirFisicos(){const j=jugs()[E.jug];$('in-alt').value=j.alt;$('in-peso').value=j.peso;abrir('sh-fisicos')}
function guardarFisicos(){const j=jugs()[E.jug];
  j.alt=+$('in-alt').value||j.alt;j.peso=+$('in-peso').value||j.peso;cerrar();pFicha();toast('Datos físicos actualizados')}

/* ================= RECURSOS ================= */
function pRecursos(){
  $('rec-cat').textContent=cat().sig;
  $('rec-lista').innerHTML=`
    <div class="rec"><div class="t">Tiro de la esquina</div>
      <div class="d">Video de 1:12 + 3 series de 10 desde cada esquina.</div>
      <div class="m"><span class="tag rojo">4 jugadores</span><span class="tag">3 lo abrieron</span></div></div>
    <div class="rec"><div class="t">Mecánica de tiros libres</div>
      <div class="d">Rutina previa siempre igual, dos series.</div>
      <div class="m"><span class="tag rojo">Todo el plantel</span><span class="tag">9 lo abrieron</span></div></div>
    <div class="rec"><div class="t">Manejo con mano débil</div>
      <div class="d">Conos, cambio de mano sin mirar la pelota.</div>
      <div class="m"><span class="tag rojo">2 jugadores</span><span class="tag">2 lo abrieron</span></div></div>
    <div class="p" style="margin:2px 2px 14px">Nadie queda “en falta” por no abrirlo. Si te interesa saber si sirvió, preguntá en el entrenamiento.</div>`;
}
function ofrecer(){cerrar();toast('Recurso disponible para los chicos')}

/* ================= STATS ================= */
function pStats(){
  const c=cat();
  $('st-sub').textContent=`${c.sig} ${c.n} · ${c.jug.length} jugadores · 4 mediciones en la temporada`;
  $('st-cat1').textContent=c.sig.replace('U','');
  $('st-seg').innerHTML=['Agosto','Marzo'].map((x,i)=>
    `<button class="${E.stSeg===i?'on':''}" onclick="E.stSeg=${i};pStats()">${x}</button>`).join('');
  const k=E.stSeg===0?FECHAS.length-1:0;
  const v={};POS.forEach(p=>v[p.id]=prom(p.id,k));
  cancha($('st-cancha'),v,{alto:210});

  const opts=[...TESTS,...c.extra.map(id=>EXTRA_DISPO.find(e=>e.id===id))];
  $('st-chips').innerHTML=opts.map(t=>
    `<button class="${E.test===t.id?'on':''}" onclick="E.test='${t.id}';pStats()">${t.n.replace('Tiro ','').replace('Velocidad ','Vel. ')}</button>`).join('');
  const t=test(E.test);
  const serie=FECHAS.map((_,i)=>prom(E.test,i));
  const vieja=serie.map((x,i)=>t.u==='s'?x+.25-i*.02:x-4.5-i*.5);
  $('st-tnom').textContent=t.n;
  $('st-tval').innerHTML=(t.u==='s'?serie[3].toFixed(1):Math.round(serie[3]))+`<small> ${t.u}</small>`;
  grafico($('st-graf'),[{d:vieja,c:COL_MUTED,dash:1,w:2},{d:serie,c:'#D9122E'}],{u:t.u,dec:t.u==='s'?1:0,alto:170});

  const dir=t.u==='s'?-1:1;
  const orden=[...c.jug].sort((a,b)=>(ult(b,E.test)-ult(a,E.test))*dir);
  $('st-tabla').innerHTML=`<tr><th>Jugador</th><th>${t.u}</th><th>Δ mar</th></tr>`+
    orden.map(j=>{const d=(ult(j,E.test)-j.v[E.test][0])*dir;
      return `<tr onclick="verJug(${j.id})"><td>${j.ape}, ${j.nom[0]}.</td>
      <td>${t.u==='s'?ult(j,E.test).toFixed(1):Math.round(ult(j,E.test))}</td>
      <td class="${d>0?'up':'dn'}">${d>0?'+':''}${d.toFixed(t.u==='s'?1:0)}</td></tr>`}).join('');
}

/* ================= JUGADOR ================= */
function pHoy(){
  const j=CATS[1].jug[3];
  const v={};POS.forEach(p=>v[p.id]=ult(j,p.id));
  cancha($('hoy-cancha'),v);
  const sc=FECHAS.map((_,k)=>{const a=CATS[1].jug.map(x=>x.v.libres[k]);return a.reduce((s,x)=>s+x,0)/a.length});
  grafico($('hoy-graf'),[{d:sc,c:COL_MUTED,dash:1,w:2},{d:j.v.libres,c:'#D9122E'}],{u:'%',alto:150});
  $('hoy-lib').innerHTML=Math.round(ult(j,'libres'))+'<small> %</small>';
}
function hecho(){$('btn-hecho').textContent='Anotado';$('btn-hecho').style.background='var(--sube)';toast('Anotado. Van 12 este mes.')}

/* ================= SHEETS ================= */
function abrir(id){
  if(id==='sh-rec'){
    $('rec-biblio').innerHTML=BIBLIO.map((b,i)=>
      `<button class="opt ${i===0?'on':''}" onclick="sel(this)"><div><div class="t">${b.t}</div><div class="d">${b.d}</div></div></button>`).join('');
    $('rec-dest').innerHTML=`<button class="on">Todo el plantel</button><button>Un jugador</button><button>Elegir varios</button>`;
    [...$('rec-dest').children].forEach(b=>b.onclick=()=>{[...$('rec-dest').children].forEach(x=>x.classList.remove('on'));b.classList.add('on')});
  }
  if(id==='sh-test'){
    $('sh-test-lista').innerHTML=EXTRA_DISPO.map((e,i)=>
      `<button class="opt ${i===0?'on':''}" onclick="sel(this)" data-id="${e.id}">
        <div><div class="t">${e.n}</div><div class="d">Se mide en ${e.u}</div></div></button>`).join('');
  }
  $('velo').classList.add('on');$(id).classList.add('on');
}
function cerrar(){$('velo').classList.remove('on');document.querySelectorAll('.sheet').forEach(s=>s.classList.remove('on'))}
/* auditoría #13: cierre de sheets con Escape (sin focus trap, no lo necesita el uso táctil) */
document.addEventListener('keydown',e=>{if(e.key==='Escape')cerrar()});
function sel(el){[...el.parentNode.children].forEach(x=>x.classList.remove('on'));el.classList.add('on')}
function agregarTest(){
  const el=$('sh-test-lista').querySelector('.opt.on');
  const id=el?el.dataset.id:'salto';
  if(!cat().extra.includes(id))cat().extra.push(id);
  cerrar();pMedir();toast(EXTRA_DISPO.find(e=>e.id===id).n+' agregado a '+cat().sig);
}

/* ================= INIT ================= */
CATS[0].cargados={esq_izq:12,c45_izq:12,frontal:12,libres:12};
CATS[1].cargados={libres:14,vel_sin:14,esq_izq:14,c45_izq:14,frontal:14,c45_der:14};
cats();ir('p-resumen');
