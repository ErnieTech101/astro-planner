"use strict";
/* Astro Imaging Planner: browser UI. Sky math and the catalog live in astro.js. */

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad2=n=>String(n).padStart(2,"0");

async function api(method,url,body){
  const opt={method,credentials:"same-origin",headers:{"X-Requested-With":"aip"}};
  if(body!==undefined){opt.headers["Content-Type"]="application/json";opt.body=JSON.stringify(body);}
  let r;
  try{r=await fetch(url,opt);}catch(e){throw new Error("Can't reach the server. Check your connection and try again.");}
  if(r.status===401){location.href="/login";throw new Error("You've been signed out.");}
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||`The server returned an error (${r.status}).`);
  return j;
}

const DEF={mag:6,dur:60,t0:"19:00",t1:"21:00",site_id:null,unimagedFirst:false,red:false,setupDone:true,cats:"MCN",sb:0,moonRule:"show",showConst:true,showStars:true,showMer:true,showHoriz:true,scope_id:null};
let ST={me:{},settings:{...DEF},sites:[],scopes:[],log:[]};
let last=null,totals=new Map();
const COMMON_TZ=[["America/New_York","Eastern"],["America/Chicago","Central"],["America/Denver","Mountain"],
  ["America/Phoenix","Arizona"],["America/Los_Angeles","Pacific"],["America/Anchorage","Alaska"],["Pacific/Honolulu","Hawaii"]];
const site=()=>ST.sites.find(x=>x.id===ST.settings.site_id)||ST.sites[0];
const tz=()=>site()?.tz||"America/New_York";
const scope=()=>ST.scopes.find(x=>x.id===ST.settings.scope_id)||null;
// Model presets: maker's specs for the main (telephoto) camera, one frame, no mosaic. Members can edit any value.
// FOV checked against sensor size x pixel pitch / focal length. See README for sources.
const SCOPE_PRESETS=[
  {model:"Dwarf Mini",fov_w:2.13,fov_h:1.20,aperture:30,focal:150,pixel:2.9,mount:"altaz",filters:"Astro, Dual-band"},
  {model:"Dwarf 3",fov_w:2.93,fov_h:1.65,aperture:35,focal:150,pixel:2.0,mount:"altaz",filters:"VIS, Astro, Dual-band"},
  {model:"Dwarf II",fov_w:3.19,fov_h:1.79,aperture:24,focal:100,pixel:1.45,mount:"altaz",filters:"Astro, UV/IR cut"},
  {model:"Seestar S30",fov_w:2.13,fov_h:1.20,aperture:30,focal:150,pixel:2.9,mount:"altaz",filters:"UV/IR cut, Dual-band"},
  {model:"Seestar S30 Pro",fov_w:3.99,fov_h:2.24,aperture:30,focal:160,pixel:2.9,mount:"altaz",filters:"UV/IR cut, Dual-band"},
  {model:"Seestar S50",fov_w:1.29,fov_h:0.73,aperture:50,focal:250,pixel:2.9,mount:"altaz",filters:"UV/IR cut, Dual-band"},
  {model:"Seestar S50 Pro",fov_w:2.45,fov_h:1.38,aperture:50,focal:260,pixel:2.9,mount:"altaz",filters:"UV/IR cut, Dual-band"},
  {model:"Other",fov_w:"",fov_h:"",aperture:"",focal:"",pixel:"",mount:"altaz",filters:""}];
// Cameras for the field-of-view calculator: sensor width x height in mm, pixel size in microns.
const CAMERAS=[
  ["ZWO ASI533 (MC/MM)",11.31,11.31,3.76],["ZWO ASI585MC",11.14,6.26,2.9],["ZWO ASI662MC",5.61,3.13,2.9],["ZWO ASI678MC",7.68,4.32,2.0],
  ["ZWO ASI183 (MC/MM)",13.19,8.81,2.4],["ZWO ASI294MC",19.19,13.07,4.63],["ZWO ASI2600 (MC/MM)",23.49,15.70,3.76],
  ["Full-frame DSLR / mirrorless",36,24,""],["APS-C, Canon",22.3,14.9,""],["APS-C, Nikon / Sony / Fuji",23.5,15.6,""],["Micro Four Thirds",17.3,13.0,""]];
const fovDeg=(mm,f)=>2*Math.atan(mm/(2*f))*180/Math.PI;
const fmtFov=x=>`${(+x.fov_w).toFixed(2)}° × ${(+x.fov_h).toFixed(2)}°`;
const tzLabel=z=>(COMMON_TZ.find(t=>t[0]===z)||[0,z.replace(/_/g," ")])[1];

/* ------------------------------------------------------------ helpers */
function hhmmLabel(v){const [h,m]=v.split(":").map(Number);return `${((h+11)%12)+1}:${pad2(m)} ${h<12?"AM":"PM"}`;}
function fmtDur(min){min=Math.round(min);const h=Math.floor(min/60),m=min%60;return h?`${h} h ${pad2(m)} m`:`${m} m`;}
const fmt=ms=>new Intl.DateTimeFormat("en-US",{timeZone:tz(),hour:"numeric",minute:"2-digit"}).format(new Date(ms));
const tzAbbr=ms=>new Intl.DateTimeFormat("en-US",{timeZone:tz(),timeZoneName:"short"}).formatToParts(new Date(ms)).find(p=>p.type==="timeZoneName").value;
const ll=(v,p,n)=>`${Math.abs(v).toFixed(2)}°${v>=0?p:n}`;
// Any spelling of an id, alias or common name ("m 31", "NGC0224", "Caldwell 63", "Helix Nebula") -> the catalog id.
const key=v=>String(v||"").toLowerCase().replace(/^caldwell/,"c").replace(/[^a-z0-9]/g,"").replace(/^(m|ngc|ic|c)0+(\d)/,"$1$2");
let ALIAS=new Map();
function buildAliases(){ALIAS=new Map();
  for(const o of CAT){for(const a of [o[0],...o[10]])ALIAS.set(key(a),o[0]);if(o[1])ALIAS.set(key(o[1]),o[0]);}}
const BYID=()=>new Map(CAT.map(o=>[o[0],o]));
function normObj(v){v=String(v||"").trim();return ALIAS.get(key(v))||v;}
const SB_TYPES=/Galaxy|ebula|Planetary|Supernova/;
let flashT;
function flash(t,bad){const s=$("s1");s.innerHTML=`<span class="${bad?"bad":""}">${esc(t)}</span>`;clearTimeout(flashT);flashT=setTimeout(statusTargets,5000);}

/* ------------------------------------------------------------ settings */
function initControls(){
  for(let i=0;i<24;i++){const mins=16*60+i*30,v=`${pad2(Math.floor(mins/60)%24)}:${pad2(mins%60)}`;
    $("t0").add(new Option(hhmmLabel(v),v));$("t1").add(new Option(hhmmLabel(v),v));}
  for(let m=4;m<=9.001;m+=0.5)$("mag").add(new Option(m.toFixed(1),m.toFixed(1)));
  $("catlist").innerHTML=CAT.map(o=>`<option value="${esc(o[0])}">${esc([o[1]||o[2],...o[10]].join(" · "))}</option>`).join("");
}
function setSel(el,v,fallback){v=String(v);if(![...el.options].some(o=>o.value===v))v=String(fallback);el.value=v;}
function applySettings(){const s=ST.settings;
  setSel($("t0"),s.t0,DEF.t0);setSel($("t1"),s.t1,DEF.t1);setSel($("dur"),s.dur,DEF.dur);
  setSel($("mag"),Number(s.mag).toFixed(1),"6.0");$("unimaged").checked=!!s.unimagedFirst;
  setSel($("sb"),s.sb,0);setSel($("moonrule"),s.moonRule,"show");
  for(const c of "MCN")$("cat_"+c).checked=String(s.cats??"MCN").includes(c);
  $("show_const").checked=s.showConst!==false;$("show_stars").checked=s.showStars!==false;$("show_mer").checked=s.showMer!==false;$("show_horiz").checked=s.showHoriz!==false;}
function readSettings(){Object.assign(ST.settings,{t0:$("t0").value,t1:$("t1").value,dur:+$("dur").value,mag:+$("mag").value,
  site_id:+$("site").value||ST.settings.site_id,unimagedFirst:$("unimaged").checked,
  sb:+$("sb").value,moonRule:$("moonrule").value,cats:[..."MCN"].filter(c=>$("cat_"+c).checked).join(""),
  showConst:$("show_const").checked,showStars:$("show_stars").checked,showMer:$("show_mer").checked,showHoriz:$("show_horiz").checked});}
let saveT;
function saveSettings(){clearTimeout(saveT);saveT=setTimeout(saveSettingsNow,700);}
function saveSettingsNow(){clearTimeout(saveT);return api("PUT","/api/settings",ST.settings).catch(e=>flash("Couldn't save settings: "+e.message,true));}

function renderSites(){const x=site();
  $("site").innerHTML=ST.sites.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");
  if(x)$("site").value=x.id;
  $("sitetitle").textContent=x?x.name:"";
  const sc=scope();
  $("scope").innerHTML=`<option value="">(none)</option>`+ST.scopes.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");
  $("scope").value=sc?String(sc.id):"";
  $("scopeinfo").textContent=sc?`${sc.model&&sc.model!=="Other"&&sc.model!==sc.name?sc.model+" · ":""}${fmtFov(sc)} field${sc.aperture?` · ${sc.aperture} mm`:""}${sc.aperture&&sc.focal?` f/${(sc.focal/sc.aperture).toFixed(1)}`:""}${sc.pixel&&sc.focal?` · ${(206.265*sc.pixel/sc.focal).toFixed(2)}″/pixel`:""} · ${sc.mount==="eq"?"equatorial":"alt-az"}`
    :ST.scopes.length?"No scope picked: choose one to check what fits the frame.":"Add your scope under Setup → Equipment to check what fits the frame.";
  if(x)$("siteinfo").textContent=`${ll(x.lat,"N","S")} ${ll(x.lon,"E","W")} · ${tzLabel(x.tz)} · Az ${x.az0}°–${x.az1}° · Alt ${x.al0}°–${x.al1}°${x.bortle?` · Bortle ${x.bortle}`:""}`;
}
function setToday(){$("date").value=new Intl.DateTimeFormat("en-CA",{timeZone:tz()}).format(new Date());}
function shiftDay(n){const [y,m,d]=$("date").value.split("-").map(Number);$("date").value=new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);run();}
function setRed(on,save){document.body.classList.toggle("red",on);$("red").setAttribute("aria-pressed",String(on));
  try{localStorage.setItem("aip-red",on?"1":"0");}catch(e){}
  if(save){ST.settings.red=on;saveSettings();}if(last)run();}

/* ------------------------------------------------------------ planner */
function sessionParams(){const x=site();if(!$("date").value)setToday();
  const [y,m,d]=$("date").value.split("-").map(Number);
  const [h0,m0]=ST.settings.t0.split(":").map(Number),[h1,m1]=ST.settings.t1.split(":").map(Number);
  const d0=h0<12?d+1:d;   // a start after midnight belongs to the next calendar day
  const t0=zoned(y,m,d0,h0,m0,x.tz);let t1=zoned(y,m,d0,h1,m1,x.tz);if(t1<=t0)t1=zoned(y,m,d0+1,h1,m1,x.tz);
  return {t0,t1,dur:ST.settings.dur,mag:ST.settings.mag,lat:x.lat,lon:x.lon,tz:x.tz,
    az0:x.az0,az1:x.az1,al0:x.al0,al1:x.al1,g:boxGeom(x.az0,x.az1)};}

function computeTotals(){totals=new Map();
  for(const e of ST.log){const id=normObj(e.object_id),t=totals.get(id)||{min:0,n:0,last:""};
    t.min+=(e.subs&&e.sub_sec)?e.subs*e.sub_sec/60:0;t.n++;if(e.session_date>t.last)t.last=e.session_date;totals.set(id,t);}}

const COMPASS16=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
const dir=az=>COMPASS16[Math.round(nrm(az)/22.5)%16];
// How much the Moon interferes with one target during the time it spends in the window.
function moonFor(r,s,moon){const inWin=moon.filter(m=>m.t>=s.t0+r.bs*6e4-3e5&&m.t<=s.t0+r.be*6e4+3e5);
  const up=inWin.some(m=>m.alt>MOON_UP);
  if(!up)return {lvl:"ok",txt:"Down",sep:null};
  const mid=inWin[Math.floor(inWin.length/2)]||moon[0],[ra,dec]=precess(r.o[3],r.o[4],(s.t0-J2000)/JYEAR);
  const sep=Math.round(sepDeg(ra,dec,mid.ra,mid.dec)),k=mid.illum;
  if(k<0.25)return {lvl:"ok",txt:`${sep}°`,note:"faint Moon",sep};
  const [b0,b1]=k>=0.75?[35,70]:k>=0.4?[25,50]:[15,30];
  return sep<b0?{lvl:"bad",txt:`${sep}°`,note:"too close",sep}:sep<b1?{lvl:"warn",txt:`${sep}°`,note:"close",sep}:{lvl:"ok",txt:`${sep}°`,sep};}
// A phase picture: lit on the right while waxing, as seen from the northern hemisphere.
function moonSvg(k,waxing,size){const c=size/2,r=c-2,rx=(r*Math.abs(2*k-1)).toFixed(2),red=document.body.classList.contains("red");
  const lit=red?"#ff3b26":"#fff8c0",dark=red?"#2a0603":"#303040",edge=red?"#ff3b26":"#000";
  const s1=waxing?1:0,s2=waxing?(k<0.5?0:1):(k<0.5?1:0);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="${dark}" stroke="${edge}"/>`+
    (k>0.01?`<path d="M${c} ${c-r}A${r} ${r} 0 0 ${s1} ${c} ${c+r}A${rx} ${r} 0 0 ${s2} ${c} ${c-r}Z" fill="${lit}"/>`:"")+
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${edge}"/></svg>`;}
function skyPanel(s,moon,night){const m0=moon[0],up=moon.filter(m=>m.alt>MOON_UP),pct=Math.round(m0.illum*100);
  $("moonicon").innerHTML=moonSvg(m0.illum,m0.waxing,44);
  const rs=[night.moonrise&&`rises ${fmt(night.moonrise)}`,night.moonset&&`sets ${fmt(night.moonset)}`].filter(Boolean).join(", ");
  let during;
  if(!up.length)during="Below the horizon for your whole session.";
  else{const hi=Math.max(...up.map(m=>m.alt)),mid=up[Math.floor(up.length/2)];
    during=`Up during ${up.length===moon.length?"your whole session":"part of your session"}, ${Math.round(Math.max(0,Math.min(...up.map(m=>m.alt))))}°–${Math.round(hi)}° high in the ${dir(mid.az)}.`;}
  const sun=night.sunset?`Sunset ${fmt(night.sunset)}`:"No sunset tonight";
  const dark=night.dusk&&night.dawn?`fully dark ${fmt(night.dusk)} to ${fmt(night.dawn)}`:"no full darkness tonight (twilight all night)";
  const early=night.dusk&&s.t0<night.dusk?` <b>Your session starts before full darkness</b>; the sky keeps brightening the background until ${fmt(night.dusk)}.`:"";
  $("skyinfo").innerHTML=`<div><b>${phaseName(m0.elong,m0.illum)}</b>, ${pct}% lit${rs?`; ${rs}`:""}. ${during}</div><div>${sun}; ${dark}.${early}</div>`;}

function transitCell(r,s){const tr=transitOf(r.o,(s.t0+s.t1)/2,s.lat,s.lon),inS=tr.t>=s.t0&&tr.t<=s.t1;
  return `<td class="m"${inS?' title="Crosses the meridian during your session"':""}>${inS?"<b>":""}${fmt(tr.t)}${inS?"</b>":""}<div class="nm">${Math.round(tr.alt)}° high</div></td>`;}

// Object size, and how it sits in the scope's frame. Alt-az scopes rotate the field through the night,
// so "Fits" means it fits whichever way it turns; "Snug" needs the long side of the frame.
const fmtArc=v=>v>=1?`${Math.round(v)}′`:`${Math.round(v*60)}″`;
function fmtSize(o){if(o[6]==null)return "";return o[7]!=null&&Math.round(o[7])!==Math.round(o[6])?`${fmtArc(o[6])} × ${fmtArc(o[7])}`:fmtArc(o[6]);}
function frameFit(o,sc){if(!sc||o[6]==null)return null;
  const L=sc.fov_w*60,S=sc.fov_h*60,maj=o[6],mn=o[7]??o[6],pct=Math.max(1,Math.round(maj/L*100));
  if(maj<0.04*L)return {lvl:"ok",txt:"Small",pct,note:"tiny in the frame; crop to enlarge"};
  if(sc.mount==="eq"){   // no field rotation: what fits lengthwise stays fitted
    if(maj<=0.85*L&&mn<=0.85*S)return {lvl:"ok",txt:"Fits",pct,note:maj<=0.8*S?"fits at any angle":"fits; turn the camera to frame it lengthwise"};
    if(maj<=0.98*L&&mn<=0.98*S)return {lvl:"warn",txt:"Snug",pct,note:"fills the frame edge to edge"};
    return {lvl:"bad",txt:"Too big",pct,note:"bigger than one frame: try a mosaic, or image the core"};}
  if(maj<=0.8*S)return {lvl:"ok",txt:"Fits",pct,note:"fits at any angle"};
  if(maj<=0.95*L&&mn<=0.95*S)return {lvl:"warn",txt:"Snug",pct,note:"fills the frame; fits along the long side"};
  return {lvl:"bad",txt:"Too big",pct,note:"bigger than one frame: try a mosaic, or image the core"};}
function sizeCell(o){const sz=fmtSize(o),f=frameFit(o,scope());
  return `<td class="m">${sz||"?"}${f?`<div><span class="mchip ${f.lvl}" title="${esc(f.note)}">${f.txt}</span></div><div class="nm">${f.pct}% of width</div>`:""}</td>`;}

function row(r,s,dim){const o=r.o,t=totals.get(o[0]);
  const lg=t?`<b>${t.min?fmtDur(t.min):"Logged"}</b><div class="nm">${t.n} session${t.n>1?"s":""}</div>`:`<span class="nm">Not yet</span>`;
  return `<tr data-obj="${esc(o[0])}"${dim?' class="dim"':""}><td class="n"><span class="sw${dim?" dash":""}" style="--c:${colOf(r)}"></span>${esc(o[0])} <span class="typ">· ${esc(o[2])}</span>${o[1]||o[10].length?`<div class="nm">${esc([o[1],...o[10]].filter(Boolean).join(" · "))}</div>`:""}</td>
  <td class="m">${o[5].toFixed(1)}${o[8]!=null&&SB_TYPES.test(o[2])?`<div class="nm" title="Surface brightness, mag per square arcsecond">SB ${o[8].toFixed(1)}</div>`:""}</td>${sizeCell(o)}<td class="m">${fmtRA(o[3]*15)}<div class="nm">${fmtDec(o[4])}</div></td>
  <td class="m">${fmt(s.t0+r.bs*6e4)}–${fmt(s.t0+r.be*6e4)}<div class="nm">${r.best} min</div></td>
  <td class="m">${Math.round(r.lo)}°–${Math.round(r.hi)}°</td>${transitCell(r,s)}<td><span class="mchip ${r.moon.lvl}">${r.moon.txt}</span>${r.moon.note?`<div class="nm">${r.moon.note}</div>`:""}</td><td>${lg}</td>
  <td class="act"><button class="btn sm" type="button" data-log="${esc(o[0])}">Log…</button></td></tr>`;}

function statusTargets(){if(!last)return;$("s1").innerHTML=`<b>${last.good.length}</b> target${last.good.length===1?"":"s"} found`;}

function run(){if(!site())return;readSettings();renderSites();computeTotals();
  const s=sessionParams(),st=ST.settings,cats=String(st.cats??"MCN");
  const [y,mo,d]=$("date").value.split("-").map(Number),night=nightInfo(zoned(y,mo,d,12,0,s.tz),s.lat,s.lon);
  const moon=[];for(let t=s.t0;t<=s.t1;t+=3e5){const m=moonAt(t,s.lat,s.lon);moon.push({...m,t,x:relAz(m.az,s.g)});}
  skyPanel(s,moon,night);
  // cheap checks first: catalog, brightness, surface brightness, can it ever get high enough?
  const cands=CAT.filter(o=>[...o[9]].some(c=>cats.includes(c))&&o[5]<=s.mag+1.5&&90-Math.abs(s.lat-o[4])>=s.al0
    &&!(st.sb&&o[8]!=null&&SB_TYPES.test(o[2])&&o[8]>st.sb));
  let res=cands.map(o=>evaluate(o,s)).filter(r=>r.best>=s.dur);
  res.forEach(r=>r.moon=moonFor(r,s,moon));
  const hidden=st.moonRule==="hide"?res.filter(r=>r.moon.lvl==="bad").length:0;
  if(hidden)res=res.filter(r=>r.moon.lvl!=="bad");
  const order=(a,b)=>(ST.settings.unimagedFirst?(totals.has(a.o[0])-totals.has(b.o[0])):0)||a.o[5]-b.o[5];
  const good=res.filter(r=>r.o[5]<=s.mag).sort(order);
  const near=res.filter(r=>r.o[5]>s.mag&&r.o[5]<=s.mag+1.5).sort(order);
  [...good,...near].forEach((r,i)=>r.ci=i);
  const z=tzAbbr(s.t0);document.querySelectorAll(".hwin").forEach(h=>h.textContent=`In window (${z})`);
  $("list").innerHTML=good.length?good.map(r=>row(r,s)).join(""):`<tr><td class="empty" colspan="10">${cats?"":"No catalogs are selected under Filters. "}No objects at magnitude ${s.mag.toFixed(1)} or brighter stay in your box for ${s.dur} minutes on this date. See the list below, or try a later month.</td></tr>`;
  $("near").innerHTML=near.length?near.map(r=>row(r,s,true)).join(""):`<tr><td class="empty" colspan="10">None.</td></tr>`;
  $("win").innerHTML=[["Start",s.t0],["End",s.t1]].map(([l,t])=>{const b=boxSky(t,s);
    return `<tr><td class="n">${l} <span class="typ">${fmt(t)}</span></td><td class="m">${fmtLST(t,s.lon)}</td><td class="m">${fmtRA(b.c[0])}<div class="nm">${fmtDec(b.c[1])}</div></td><td class="m">${fmtRA(b.ra0)} – ${fmtRA(b.ra1)}</td><td class="m">${fmtDec(b.d0)} – ${fmtDec(b.d1)}</td></tr>`;}).join("");
  last={s,good,near,moon,hidden};statusTargets();
  $("s2").textContent=`${fmt(s.t0)}–${fmt(s.t1)} ${z} · LST ${fmtLST(s.t0,s.lon)}–${fmtLST(s.t1,s.lon)}`;
  $("lstinfo").textContent=`Sidereal time ${fmtLST(s.t0,s.lon)} to ${fmtLST(s.t1,s.lon)}`;
  $("s3").textContent=`${cands.length} of ${CAT.length} objects checked${hidden?` · ${hidden} hidden by the Moon`:""} · ${site().name}`;
  draw();}

const COMPASS={0:"N",90:"E",180:"S",270:"W",360:"N"};
// One colour per target, dark enough to read on the pale yellow box. Red Light mode uses shades of red only.
const PAL_DAY=["#000080","#c00000","#007000","#800080","#007070","#8a4b00","#0050d0","#b0008a","#5a6a00","#404040"];
const PAL_RED=["#ff3b26","#ff9a80","#c82814","#ff6a48","#e04a30"];
const colOf=r=>{const p=document.body.classList.contains("red")?PAL_RED:PAL_DAY;return p[r.ci%p.length];};
// Atlas-style object symbols, drawn where each track starts (the target's place at session start).
const SYM_GROUPS=[["Galaxy",["Galaxy"]],["Globular cluster",["Globular"]],["Open cluster",["Open cluster","Star cloud"]],
  ["Cluster + nebula",["Cluster + nebula"]],["Planetary nebula",["Planetary"]],["Nebula",["Nebula","Emission nebula","Reflection nebula","Supernova remnant"]],
  ["Other",["Double star","Other"]]];
const symGroup=t=>(SYM_GROUPS.find(([,ts])=>ts.includes(t))||SYM_GROUPS[6])[0];
function sym(type,x,y,col,bg){const f=v=>v.toFixed(1),S=`stroke="${col}" stroke-width="1.75" fill="${bg}"`;
  switch(symGroup(type)){
    case "Galaxy":return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="7" ry="3.2" transform="rotate(-25 ${f(x)} ${f(y)})" ${S}/>`;
    case "Globular cluster":return `<circle cx="${f(x)}" cy="${f(y)}" r="5.5" ${S}/><path d="M${f(x-5.5)} ${f(y)}H${f(x+5.5)}M${f(x)} ${f(y-5.5)}V${f(y+5.5)}" stroke="${col}" stroke-width="1.25"/>`;
    case "Open cluster":return `<circle cx="${f(x)}" cy="${f(y)}" r="5.5" ${S} stroke-dasharray="2.2 1.7"/>`;
    case "Cluster + nebula":return `<rect x="${f(x-6)}" y="${f(y-6)}" width="12" height="12" ${S}/><circle cx="${f(x)}" cy="${f(y)}" r="3.6" fill="none" stroke="${col}" stroke-width="1.25" stroke-dasharray="1.8 1.4"/>`;
    case "Planetary nebula":return `<circle cx="${f(x)}" cy="${f(y)}" r="3.4" ${S}/><path d="M${f(x-3.4)} ${f(y)}h-3M${f(x+3.4)} ${f(y)}h3M${f(x)} ${f(y-3.4)}v-3M${f(x)} ${f(y+3.4)}v3" stroke="${col}" stroke-width="1.5"/>`;
    case "Nebula":return `<rect x="${f(x-5)}" y="${f(y-5)}" width="10" height="10" ${S}/>`;
    default:return `<rect x="${f(x-4)}" y="${f(y-4)}" width="8" height="8" fill="${col}"/>`;}}
// Faint background: constellation figures and names, bright stars, and the meridian, all as they stand at session start.
function skyLayer(s,X,Y,xA,xB,alB,c,pts,placed){const st=ST.settings,t=s.t0;let out="";
  const inView=(v,al,m=0)=>v>=xA-m&&v<=xB+m&&al>-m&&al<=alB+m;
  if(SKY&&st.showConst!==false){let L="";
    for(const fig of Object.values(SKY.lines))for(const seg of fig){const parts=[[]];
      for(const [ra,dec] of seg){const [al,az]=skyAltAz(ra,dec,t,s),v=relAz(az,s.g),cur=parts[parts.length-1];
        if(cur.length&&Math.abs(v-cur[cur.length-1][2])>90)parts.push([]);parts[parts.length-1].push([X(v),Y(al),v,al]);}
      for(const p of parts)if(p.length>1&&p.some(q=>inView(q[2],q[3],20)))L+=`<polyline points="${p.map(q=>q[0].toFixed(1)+","+q[1].toFixed(1)).join(" ")}"/>`;}
    out+=`<g class="sky" fill="none" stroke="${c("--skyline")}" stroke-width="1">${L}</g>`;}
  if(SKY&&st.showStars!==false){let S="";
    for(const [ra,dec,m] of SKY.stars){const [al,az]=skyAltAz(ra,dec,t,s),v=relAz(az,s.g);
      if(al>0&&inView(v,al,2))S+=`<circle cx="${X(v).toFixed(1)}" cy="${Y(al).toFixed(1)}" r="${Math.max(0.7,2.8-0.42*m).toFixed(2)}"/>`;}
    out+=`<g class="sky" fill="${c("--skystar")}">${S}</g>`;}
  if(SKY&&st.showConst!==false){let N="";
    for(const [,name,,ra,dec] of SKY.names){const [al,az]=skyAltAz(ra,dec,t,s),v=relAz(az,s.g);
      if(!inView(v,al)||al<4||al>alB-3)continue;const lab=name.toUpperCase(),w=lab.length*6.4;
      for(const dy of [0,-12,12]){const x=X(v)-w/2,y=Y(al)+dy;   // step aside from target tracks if we can
        if(!pts.some(([px,py])=>px>x-3&&px<x+w+3&&py>y-11&&py<y+4)){
          N+=`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}">${esc(lab)}</text>`;break;}}}
    out+=`<g class="sky" fill="${c("--skyname")}" font-size="10" font-style="italic" letter-spacing="1">${N}</g>`;}
  if(st.showMer!==false)for(const az of [180,0]){const v=relAz(az,s.g);if(v<xA||v>xB)continue;const x=X(v);
    out+=`<line class="sky" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(alB)}" y2="${Y(0)}" stroke="${c("--meridian")}" stroke-width="1.25" stroke-dasharray="3 4"/>`;
    const lab=az===180?"Meridian (due S)":"Meridian (due N)",w=lab.length*5.8,lx=x+4>X(xB)-w?x-4-w:x+4;
    out+=`<text class="sky" x="${lx.toFixed(1)}" y="${(Y(alB)+12).toFixed(1)}" fill="${c("--meridian")}" font-size="10">${lab}</text>`;
    placed.push({x:lx,y:Y(alB)+12,w});}
  return out;}
// A decorative suburban skyline along the bottom of the chart: houses, trees, poles and wires.
// Random but repeatable: each site gets its own skyline, the same every time. It stays below the sky box,
// hides the faint stars behind it, and is drawn under the target tracks so nothing is lost.
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function horizonLayer(s,Y,x0,x1,c,seed){
  const g0=Y(0),room=g0-Y(Math.max(1,s.al0)),hmax=Math.max(10,Math.min(64,room*0.72)),R=rng(seed),r=(a,b)=>a+(b-a)*R();
  const f=v=>v.toFixed(1);let body="",lit="",wires="",poles=[],mast=false,x=x0-8;
  const rect=(x,y,w,h)=>`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/>`;
  const win=(x,y)=>{if(R()<0.35)lit+=rect(x,y,4,4);};
  while(x<x1+10){const k=R();let w;
    if(k<0.28){w=r(22,38);const h=hmax*r(0.5,0.85),cx=x+w/2;               // round tree
      body+=rect(cx-1.5,g0-h*0.45,3,h*0.45)+`<circle cx="${f(cx)}" cy="${f(g0-h*0.62)}" r="${f(w*0.36)}"/><circle cx="${f(cx-w*0.2)}" cy="${f(g0-h*0.5)}" r="${f(w*0.28)}"/><circle cx="${f(cx+w*0.22)}" cy="${f(g0-h*0.52)}" r="${f(w*0.27)}"/>`;}
    else if(k<0.42){w=r(12,20);const h=hmax*r(0.65,1),cx=x+w/2;              // pine
      body+=`<polygon points="${f(x)},${f(g0-h*0.08)} ${f(cx)},${f(g0-h)} ${f(x+w)},${f(g0-h*0.08)}"/>`+rect(cx-1,g0-h*0.1,2,h*0.1);}
    else if(k<0.72){w=r(34,58);const wh=hmax*r(0.28,0.4),rh=hmax*r(0.18,0.28);   // house with gable roof
      body+=rect(x,g0-wh,w,wh)+`<polygon points="${f(x-3)},${f(g0-wh)} ${f(x+w/2)},${f(g0-wh-rh)} ${f(x+w+3)},${f(g0-wh)}"/>`;
      if(R()<0.6)body+=rect(x+w*0.7,g0-wh-rh*0.9,4,rh*0.6);
      win(x+w*0.2,g0-wh*0.65);win(x+w*0.65,g0-wh*0.65);
      if(!mast&&R()<0.25){mast=true;const mx=x+w*0.25,top=g0-wh-rh-hmax*0.35;  // a rooftop antenna
        body+=rect(mx,top,1.5,hmax*0.35+rh*0.4)+rect(mx-9,top+2,19.5,1.3)+[-8,-4,0,4,8].map(d=>rect(mx+d,top-1,1.2,7)).join("");}}
    else if(k<0.82){w=r(28,38);const wh=hmax*r(0.5,0.62),rh=hmax*r(0.12,0.2);  // two-storey house
      body+=rect(x,g0-wh,w,wh)+`<polygon points="${f(x-2)},${f(g0-wh)} ${f(x+w/2)},${f(g0-wh-rh)} ${f(x+w+2)},${f(g0-wh)}"/>`;
      win(x+w*0.2,g0-wh*0.8);win(x+w*0.62,g0-wh*0.8);win(x+w*0.4,g0-wh*0.35);}
    else if(k<0.9){w=r(6,10);const h=hmax*r(0.75,0.9),px=x+w/2;              // utility pole
      body+=rect(px-1.2,g0-h,2.4,h)+rect(px-7,g0-h+3,14,1.6);poles.push([px,g0-h+4]);}
    else w=r(8,26);                                                         // a gap: lawn
    x+=w+r(2,9);}
  for(let i=1;i<poles.length;i++){const [ax,ay]=poles[i-1],[bx,by]=poles[i];if(bx-ax>260)continue;
    for(const d of [-5,5])wires+=`<path d="M${f(ax+d)} ${f(ay)} Q${f((ax+bx)/2+d)} ${f((ay+by)/2+10)} ${f(bx+d)} ${f(by)}"/>`;}
  return `<g class="horizon"><rect x="${x0}" y="${f(g0-2)}" width="${x1-x0}" height="4" fill="${c("--ground")}"/>`+
    `<g fill="${c("--ground")}">${body}</g><g fill="none" stroke="${c("--ground")}" stroke-width="0.8">${wires}</g>`+
    `<g fill="${c("--window")}">${lit}</g></g>`;}
function legend(groups,c){const el=$("legend");if(!el)return;
  if(!groups.size){el.innerHTML="";return;}
  el.innerHTML="<b>Symbols:</b>"+SYM_GROUPS.filter(([g])=>groups.has(g)).map(([g,ts])=>
    `<span><svg viewBox="0 0 16 16" aria-hidden="true">${sym(ts[0],8,8,c("--text"),c("--field"))}</svg>${g}</span>`).join("");}

function draw(){if(!last)return;const {s,good,near}=last,cs=getComputedStyle(document.body),c=v=>cs.getPropertyValue(v).trim();
  const W=760,H=400,ml=44,mr=16,mt=14,mb=34,padX=Math.min(40,(360-s.g.w)/2),xA=-padX,xB=s.g.w+padX,alB=Math.min(90,s.al1+15);
  const X=v=>ml+(v-xA)/(xB-xA)*(W-ml-mr),Y=a=>mt+(alB-a)/alB*(H-mt-mb);
  const step=xB-xA>200?30:10;
  let g=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sky box chart" font-family="Tahoma, Verdana, sans-serif" font-size="11"><rect width="${W}" height="${H}" fill="${c("--field")}"/>`;
  for(let v=Math.ceil((s.az0+xA)/step)*step-s.az0;v<=xB+1e-9;v+=step){const az=Math.round(((s.az0+v)%360+360)%360);
    g+=`<line x1="${X(v)}" x2="${X(v)}" y1="${Y(alB)}" y2="${Y(0)}" stroke="${c("--grid")}"/><text x="${X(v)}" y="${H-mb+16}" fill="${c("--text")}" text-anchor="middle">${COMPASS[az]||az+"°"}</text>`;}
  for(let a=0;a<=alB;a+=10)g+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(a)}" y2="${Y(a)}" stroke="${c("--grid")}"/><text x="${ml-6}" y="${Y(a)+4}" fill="${c("--text")}" text-anchor="end">${a}°</text>`;
  g+=`<rect x="${X(0)}" y="${Y(s.al1)}" width="${X(s.g.w)-X(0)}" height="${Y(s.al0)-Y(s.al1)}" fill="${c("--box")}" fill-opacity="0.7" stroke="${c("--boxline")}" stroke-width="2"/>`;
  g+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(0)}" y2="${Y(0)}" stroke="${c("--text")}" stroke-width="2"/>`;
  g+=`<clipPath id="cp"><rect x="${ml}" y="${mt}" width="${W-ml-mr}" height="${H-mt-mb}"/></clipPath><g clip-path="url(#cp)">`;
  const halo=c("--field"),placed=[],all=[...near.map(r=>[r,true]),...good.map(r=>[r,false])];
  // every track's points in screen units, so labels can steer clear of all lines, not just other labels
  const pts=all.flatMap(([r])=>r.path.filter((_,i)=>i%2===0).map(p=>[X(p[1]),Y(p[0])]));
  g+=skyLayer(s,X,Y,xA,xB,alB,c,pts,placed);
  if(ST.settings.showHoriz!==false)g+=horizonLayer(s,Y,ml,W-mr,c,(site()?.id||1)*7919+13);
  const fits=(x,y,w)=>x>ml+2&&x+w<W-mr-2&&y-12>mt&&y+3<H-mb
    &&!placed.some(q=>x<q.x+q.w+4&&x+w+4>q.x&&Math.abs(q.y-y)<15)
    &&!pts.some(([px,py])=>px>x-3&&px<x+w+3&&py>y-14&&py<y+5);
  let lines="",labels="";const groups=new Set();
  // the Moon: a thick round-capped line with a disc at the session start, drawn under the targets
  const mv=last.moon.filter(m=>m.alt>0);
  if(mv.length){const mc=document.body.classList.contains("red")?"#ff9a80":"#8c8c8c";let segs=[[]];
    last.moon.forEach(m=>{const cur=segs[segs.length-1];if(m.alt<=0||(cur.length&&Math.abs(m.x-cur[cur.length-1].x)>90)){if(cur.length)segs.push([]);if(m.alt<=0)return;}segs[segs.length-1].push(m);});
    let t=segs.filter(sg=>sg.length>1).map(sg=>`<polyline fill="none" stroke="${mc}" stroke-width="5" stroke-linecap="round" stroke-opacity="0.7" points="${sg.map(m=>X(m.x).toFixed(1)+","+Y(m.alt).toFixed(1)).join(" ")}"/>`).join("");
    t+=`<circle cx="${X(mv[0].x).toFixed(1)}" cy="${Y(mv[0].alt).toFixed(1)}" r="7" fill="${mc}" stroke="${c("--text")}"/>`;
    lines+=`<g class="moontrk">${t}</g>`;mv.forEach(m=>pts.push([X(m.x),Y(m.alt)]));
    const lab=`Moon ${Math.round(mv[0].illum*100)}%`,lw=lab.length*7+4;let spot=null;
    for(const m of [mv[Math.floor(mv.length/2)],mv[0],mv[mv.length-1]]){for(const dy of [-12,22,-26]){const x=X(m.x)-lw/2,y=Y(m.alt)+dy;if(fits(x,y,lw)){spot={x,y};break;}}if(spot)break;}
    if(spot){placed.push({x:spot.x,y:spot.y,w:lw});labels+=`<text x="${spot.x.toFixed(1)}" y="${spot.y.toFixed(1)}" fill="${c("--text")}" stroke="${halo}" stroke-width="4" stroke-linejoin="round" paint-order="stroke" font-size="12" font-weight="bold">${lab}</text>`;}}
  all.forEach(([r,dashed])=>{const col=colOf(r),w=dashed?2:2.75,da=dashed?' stroke-dasharray="7 5"':"",id=esc(r.o[0]);let segs=[[]],t="";
    r.path.forEach((p,i)=>{const cur=segs[segs.length-1];if(cur.length&&Math.abs(p[1]-cur[cur.length-1][1])>90)segs.push([]);segs[segs.length-1].push(p);
      if(i&&i%30===0)t+=`<rect x="${X(p[1])-2.5}" y="${Y(p[0])-2.5}" width="5" height="5" fill="${col}"/>`;});
    segs.forEach(sg=>{if(sg.length>1)t=`<polyline fill="none" stroke="${col}" stroke-width="${w}"${da} stroke-linecap="round" points="${sg.map(p=>X(p[1]).toFixed(1)+","+Y(p[0]).toFixed(1)).join(" ")}"/>`+t;});
    t+=sym(r.o[2],X(r.path[0][1]),Y(r.path[0][0]),col,halo);groups.add(symGroup(r.o[2]));
    lines+=`<g class="trk" data-obj="${id}">${t}</g>`;
    // label: try spots along the in-window part of the track, above then below the line, until one is clear
    const lw=r.o[0].length*7.6+4;let spot=null;
    for(const f of [0.5,0.3,0.7,0.15,0.85,0.05,0.95]){const p=r.path[Math.round(r.bs+(r.be-r.bs)*f)],x=X(p[1])-lw/2,y=Y(p[0]);
      for(const dy of [-9,19,-23,33,-37,47]){if(fits(x,y+dy,lw)){spot={x,y:y+dy};break;}}if(spot)break;}
    if(!spot){const p=r.path[Math.round((r.bs+r.be)/2)];spot={x:X(p[1])-lw/2,y:Y(p[0])-9};}
    placed.push({x:spot.x,y:spot.y,w:lw});
    labels+=`<g class="trk" data-obj="${id}"><text x="${spot.x.toFixed(1)}" y="${spot.y.toFixed(1)}" fill="${col}" stroke="${halo}" stroke-width="4" stroke-linejoin="round" paint-order="stroke" font-size="12" font-weight="bold">${id}</text></g>`;});
  g+=lines+labels;   // labels last, so no line is ever drawn across one
  $("chart").innerHTML=g+`</g></svg>`;legend(groups,c);
  const svg=$("chart").querySelector("svg");
  svg.addEventListener("pointermove",e=>{const b=svg.getBoundingClientRect(),x=(e.clientX-b.left)/b.width*W,y=(e.clientY-b.top)/b.height*H;
    if(x<ml||x>W-mr||y<mt||y>H-mb)return;
    const az=((s.az0+xA+(x-ml)/(W-ml-mr)*(xB-xA))%360+360)%360,al=alB-(y-mt)/(H-mt-mb)*alB;
    const [ra,dec]=toRaDec(al,az,s.t0,s);
    $("cur").textContent=`Az ${az.toFixed(0)}°  Alt ${al.toFixed(0)}°  →  RA ${fmtRA(ra)}  Dec ${fmtDec(dec)}  (at ${fmt(s.t0)}, LST ${fmtLST(s.t0,s.lon)})`;});}

/* ------------------------------------------------------------ dialogs */
let dlgKeys=null;
function openDlg({title,body,buttons=[],wide=false}){
  closeDlg();const o=$("dlg");
  o.innerHTML=`<div class="win dlg${wide?" wide":""}" role="dialog" aria-modal="true" aria-labelledby="dlgT">
    <div class="titlebar"><span class="tt" id="dlgT">${esc(title)}</span><button class="x" type="button" aria-label="Close">✕</button></div>
    <div class="dbody">${body}</div><div class="dmsg" id="dlgMsg" role="alert"></div><div class="dbtns" id="dlgBtns"></div></div>`;
  let def=null;
  buttons.forEach(b=>{const el=document.createElement("button");el.type="button";el.className="btn"+(b.def?" default":"");el.textContent=b.label;
    if(b.def)def=el;
    el.onclick=async()=>{if(b.close){closeDlg();return;}dlgMsg("");el.disabled=true;
      try{await b.run();}catch(err){dlgMsg(err.message);}finally{if(el.isConnected)el.disabled=false;}};
    $("dlgBtns").appendChild(el);});
  o.querySelector(".x").onclick=closeDlg;
  o.onclick=e=>{if(e.target===o)closeDlg();};
  dlgKeys=e=>{if(e.key==="Escape")closeDlg();
    else if(e.key==="Enter"&&def&&e.target.matches(".dbody input:not([type=checkbox])")){e.preventDefault();def.click();}};
  document.addEventListener("keydown",dlgKeys);
  o.hidden=false;
  (o.querySelector(".dbody input:not([readonly]):not([type=hidden]),.dbody select,.dbody textarea")||def)?.focus();
}
function closeDlg(){const o=$("dlg");o.hidden=true;o.innerHTML="";if(dlgKeys)document.removeEventListener("keydown",dlgKeys);dlgKeys=null;}
function dlgMsg(t,ok){const m=$("dlgMsg");if(!m)return;m.textContent=t||"";m.classList.toggle("ok",!!ok);}
const val=id=>$(id).value;

/* ---------- log entry */
const SUB_SECS=[5,10,15,20,30,45,60,90,120,180,300];
async function reloadLog(){ST.log=(await api("GET","/api/log")).log;}
function openLogEntry(e,obj,back){
  const isNew=!e;
  e=e||{session_date:$("date").value,object_id:obj||"",site_id:site()?.id??null,scope_id:scope()?.id??null,subs:"",sub_sec:15,gain:"",filter:"",sky:"",rating:null,notes:""};
  const secs=[...new Set([...SUB_SECS,...(e.sub_sec?[Number(e.sub_sec)]:[])])].sort((a,b)=>a-b);
  const body=`<div class="grid">
    <label class="f"><span>Date (night of):</span><input type="date" id="le_date" value="${esc(e.session_date)}"></label>
    <label class="f"><span>Object:</span><input id="le_obj" list="catlist" maxlength="40" placeholder="M42, NGC 7293…" value="${esc(e.object_id)}" autocapitalize="characters"></label>
    <label class="f"><span>Site:</span><select id="le_site"><option value="">(none)</option>${ST.sites.map(x=>`<option value="${x.id}"${x.id===e.site_id?" selected":""}>${esc(x.name)}</option>`).join("")}</select></label>
    <label class="f"><span>Scope:</span><select id="le_scope"><option value="">(none)</option>${ST.scopes.map(x=>`<option value="${x.id}"${x.id===e.scope_id?" selected":""}>${esc(x.name)}</option>`).join("")}</select></label>
    <label class="f"><span>Number of subs:</span><input type="number" id="le_subs" min="0" step="1" inputmode="numeric" value="${esc(e.subs??"")}"></label>
    <label class="f"><span>Sub length:</span><select id="le_sec"><option value="">—</option>${secs.map(n=>`<option value="${n}"${Number(e.sub_sec)===n?" selected":""}>${n} s</option>`).join("")}</select></label>
    <label class="f"><span>Gain:</span><input id="le_gain" maxlength="20" inputmode="numeric" value="${esc(e.gain)}"></label>
    <label class="f"><span>Filter:</span><input id="le_filter" list="le_filterlist" maxlength="30" value="${esc(e.filter)}"></label><datalist id="le_filterlist"></datalist>
    <label class="f"><span>Result:</span><select id="le_rating"><option value="">—</option>${[1,2,3,4,5].map(n=>`<option value="${n}"${e.rating===n?" selected":""}>${"★".repeat(n)}${"☆".repeat(5-n)}</option>`).join("")}</select></label>
  </div>
  <label class="f"><span>Sky conditions:</span><input id="le_sky" maxlength="120" placeholder="Clear, light haze, Moon 40% up" value="${esc(e.sky)}"></label>
  <label class="f"><span>Notes:</span><textarea id="le_notes" maxlength="2000">${esc(e.notes)}</textarea></label>
  <p class="hint" id="le_total" style="margin:0"></p>`;
  const save=async()=>{const p={session_date:val("le_date"),object_id:normObj(val("le_obj")),site_id:val("le_site")?+val("le_site"):null,scope_id:val("le_scope")?+val("le_scope"):null,
      subs:val("le_subs"),sub_sec:val("le_sec"),gain:val("le_gain"),filter:val("le_filter"),sky:val("le_sky"),rating:val("le_rating"),notes:val("le_notes")};
    if(!p.object_id)throw new Error("Enter the object you imaged, such as M42.");
    ST.log=(await api(isNew?"POST":"PUT",isNew?"/api/log":`/api/log/${e.id}`,p)).log;
    run();
    if(back)openMyLog();else{closeDlg();flash(`${isNew?"Logged":"Updated"} ${p.object_id}.`);}};
  openDlg({title:isNew?"New Log Entry":`Edit Log Entry — ${e.object_id}`,body,
    buttons:[{label:isNew?"Add to Log":"Save",def:true,run:save},{label:"Cancel",run:async()=>back?openMyLog():closeDlg()}]});
  const tot=()=>{const n=+val("le_subs"),sec=+val("le_sec"),o=CAT.find(c=>c[0]===normObj(val("le_obj")));
    $("le_total").textContent=[n&&sec?`Total integration: ${fmtDur(n*sec/60)}`:"",o?`${o[0]}${o[1]?" · "+o[1]:""} · ${o[2]} · mag ${o[5]}`:""].filter(Boolean).join("   |   ");};
  ["le_subs","le_sec","le_obj"].forEach(id=>$(id).addEventListener("input",tot));tot();
  // Filter suggestions: the chosen scope's filters first, then the usual ones
  const fl=()=>{const sc=ST.scopes.find(x=>x.id===+val("le_scope")),own=sc?sc.filters.split(",").map(f=>f.trim()).filter(Boolean):[];
    $("le_filterlist").innerHTML=[...new Set([...own,"None","UV/IR cut","Astro","Dual-band","VIS"])].map(f=>`<option value="${esc(f)}">`).join("");};
  $("le_scope").addEventListener("change",fl);fl();
}

/* ---------- my log */
function openMyLog(){
  const body=`<div class="inline"><label class="inline">View: <select id="ml_view"><option value="e">All entries</option><option value="o">Totals by object</option><option value="s">Totals by scope</option></select></label>
    <input id="ml_q" type="search" placeholder="Search…" style="max-width:220px" aria-label="Search the log"></div>
    <p class="hint" id="ml_sum" style="margin:0"></p><div class="sunken" id="ml_tbl" style="max-height:55vh;overflow:auto"></div>`;
  openDlg({title:"My Imaging Log",wide:true,body,buttons:[
    {label:"New Entry…",run:async()=>openLogEntry(null,"",true)},
    {label:"Export CSV",run:async()=>{location.href="/api/log.csv";}},
    {label:"Close",def:true,close:true}]});
  const render=()=>{const q=val("ml_q").trim().toLowerCase();
    const list=ST.log.filter(e=>!q||[e.object_id,e.notes,e.site_name,e.scope_name,e.sky,e.filter,e.session_date].some(v=>String(v||"").toLowerCase().includes(q)));
    const mins=list.reduce((a,e)=>a+((e.subs&&e.sub_sec)?e.subs*e.sub_sec/60:0),0);
    $("ml_sum").textContent=`${list.length} entr${list.length===1?"y":"ies"} · ${fmtDur(mins)} total integration · ${new Set(list.map(e=>e.object_id)).size} objects`;
    if(!ST.log.length){$("ml_tbl").innerHTML=`<p class="empty">Your log is empty. Use <b>Log…</b> next to a target, or <b>New Entry…</b> below, after your next session.</p>`;return;}
    if(val("ml_view")==="s"){const m=new Map();
      list.forEach(e=>{const k=e.scope_name||"(no scope)",t=m.get(k)||{min:0,n:0,obj:new Set(),last:""};t.min+=(e.subs&&e.sub_sec)?e.subs*e.sub_sec/60:0;t.n++;t.obj.add(e.object_id);if(e.session_date>t.last)t.last=e.session_date;m.set(k,t);});
      const rows=[...m].sort((a,b)=>b[1].min-a[1].min).map(([k,t])=>`<tr><td class="n">${esc(k)}</td><td class="m">${t.n}</td><td class="m">${t.obj.size}</td><td class="m">${fmtDur(t.min)}</td><td class="m">${esc(t.last)}</td></tr>`).join("");
      $("ml_tbl").innerHTML=`<table><thead><tr><th>Scope</th><th>Sessions</th><th>Objects</th><th>Total</th><th>Last used</th></tr></thead><tbody>${rows}</tbody></table>`;return;}
    if(val("ml_view")==="o"){const m=new Map();
      list.forEach(e=>{const t=m.get(e.object_id)||{min:0,n:0,last:""};t.min+=(e.subs&&e.sub_sec)?e.subs*e.sub_sec/60:0;t.n++;if(e.session_date>t.last)t.last=e.session_date;m.set(e.object_id,t);});
      const rows=[...m].sort((a,b)=>b[1].min-a[1].min).map(([id,t])=>{const o=CAT.find(c=>c[0]===id);
        return `<tr><td class="n">${esc(id)}${o&&o[1]?`<div class="nm">${esc(o[1])}</div>`:""}</td><td>${o?esc(o[2]):""}</td><td class="m">${t.n}</td><td class="m">${fmtDur(t.min)}</td><td class="m">${esc(t.last)}</td></tr>`;}).join("");
      $("ml_tbl").innerHTML=`<table><thead><tr><th>Object</th><th>Type</th><th>Sessions</th><th>Total</th><th>Last imaged</th></tr></thead><tbody>${rows}</tbody></table>`;return;}
    const rows=list.map(e=>`<tr><td class="m">${esc(e.session_date)}</td><td class="n">${esc(e.object_id)}</td>
      <td class="m">${e.subs?`${e.subs} × ${e.sub_sec??"?"} s`:"—"}<div class="nm">${e.subs&&e.sub_sec?fmtDur(e.subs*e.sub_sec/60):""}</div></td>
      <td>${esc([e.site_name,e.scope_name].filter(Boolean).join(" · "))}<div class="nm">${esc([e.filter,e.gain&&"gain "+e.gain].filter(Boolean).join(" · "))}</div></td>
      <td class="m">${e.rating?"★".repeat(e.rating):""}</td><td class="wrap">${esc(e.sky)}${e.sky&&e.notes?"<br>":""}<span class="nm">${esc(e.notes)}</span></td>
      <td class="act"><button class="btn sm" type="button" data-edit="${e.id}">Edit</button> <button class="btn sm" type="button" data-del="${e.id}">Delete</button></td></tr>`).join("");
    $("ml_tbl").innerHTML=`<table><thead><tr><th>Date</th><th>Object</th><th>Subs</th><th>Site / setup</th><th>Result</th><th>Sky / notes</th><th></th></tr></thead><tbody>${rows||`<tr><td class="empty" colspan="7">Nothing matches.</td></tr>`}</tbody></table>`;};
  $("ml_view").onchange=render;$("ml_q").oninput=render;render();
  $("ml_tbl").onclick=async ev=>{const ed=ev.target.closest("[data-edit]"),del=ev.target.closest("[data-del]");
    if(ed)openLogEntry(ST.log.find(x=>x.id===+ed.dataset.edit),null,true);
    if(del){const x=ST.log.find(y=>y.id===+del.dataset.del);
      if(!confirm(`Delete the ${x.object_id} entry from ${x.session_date}?`))return;
      try{ST.log=(await api("DELETE",`/api/log/${x.id}`)).log;run();render();}catch(err){dlgMsg(err.message);}}};
}

/* ---------- sites */
function tzOptions(sel){const all=(Intl.supportedValuesOf?Intl.supportedValuesOf("timeZone"):[]).filter(z=>!COMMON_TZ.some(c=>c[0]===z));
  if(sel&&!COMMON_TZ.some(c=>c[0]===sel)&&!all.includes(sel))all.unshift(sel);
  return `<optgroup label="Common">${COMMON_TZ.map(([z,l])=>`<option value="${z}"${z===sel?" selected":""}>${l} (${z})</option>`).join("")}</optgroup>
    <optgroup label="All time zones">${all.map(z=>`<option value="${esc(z)}"${z===sel?" selected":""}>${esc(z.replace(/_/g," "))}</option>`).join("")}</optgroup>`;}
function siteForm(x){return `<div class="grid">
    <label class="f"><span>Site name:</span><input id="sf_name" maxlength="60" value="${esc(x.name)}"></label>
    <label class="f"><span>Time zone:</span><select id="sf_tz">${tzOptions(x.tz)}</select></label>
    <label class="f"><span>Latitude (N is +):</span><input id="sf_lat" type="number" step="0.0001" inputmode="decimal" value="${x.lat}"></label>
    <label class="f"><span>Longitude (E is +, W is −):</span><input id="sf_lon" type="number" step="0.0001" inputmode="decimal" value="${x.lon}"></label>
    <div class="f"><span>Azimuth from / to (°):</span><div class="pair"><input id="sf_az0" type="number" aria-label="Azimuth from" value="${x.az0}"><input id="sf_az1" type="number" aria-label="Azimuth to" value="${x.az1}"></div></div>
    <div class="f"><span>Altitude from / to (°):</span><div class="pair"><input id="sf_al0" type="number" aria-label="Altitude from" value="${x.al0}"><input id="sf_al1" type="number" aria-label="Altitude to" value="${x.al1}"></div></div>
    <label class="f"><span>Bortle class:</span><select id="sf_bortle"><option value="">Not sure</option>${[1,2,3,4,5,6,7,8,9].map(n=>`<option value="${n}"${x.bortle===n?" selected":""}>${n}</option>`).join("")}</select></label>
  </div>
  <label class="f"><span>Notes:</span><textarea id="sf_notes" maxlength="500" placeholder="Trees block the west after 9 pm, neighbor's floodlight…">${esc(x.notes)}</textarea></label>
  <div class="inline"><button class="btn sm" id="sf_geo" type="button">Use My Location</button>
  <span class="hint" style="margin:0">Azimuth runs clockwise from north: 90 = east, 180 = south, 270 = west. A window that crosses north, such as 330 to 30, works too.</span></div>`;}
function readSiteForm(){return {name:val("sf_name"),tz:val("sf_tz"),lat:val("sf_lat"),lon:val("sf_lon"),az0:val("sf_az0"),az1:val("sf_az1"),
  al0:val("sf_al0"),al1:val("sf_al1"),bortle:val("sf_bortle"),notes:val("sf_notes")};}

function openSites(first){
  let sel=site()?.id??null,draft=null;
  const who=esc(ST.me.display_name||ST.me.username);
  const list=()=>`<select id="sl_list" size="8" aria-label="Your sites">${ST.sites.map(x=>`<option value="${x.id}"${!draft&&x.id===sel?" selected":""}>${esc(x.name)}${x.id===site()?.id?" (in use)":""}</option>`).join("")}${draft?`<option value="new" selected>(new site)</option>`:""}</select>`;
  const body=`${first?"":tabStrip("sites")}${first?`<p class="welcome">Welcome, ${who}! Start by setting up your observing site: where you are, your time zone, and the patch of sky you can actually see from there. You can add more sites any time.</p>`:""}
    <div class="cols"><div class="stack"><div id="sl_wrap"></div>
      <div class="inline"><button class="btn sm" id="sl_new" type="button">New Site</button><button class="btn sm" id="sl_del" type="button">Delete</button></div></div>
    <div id="sl_form" class="stack"></div></div>`;
  const cur=()=>draft||ST.sites.find(x=>x.id===sel);
  const load=()=>{$("sl_form").innerHTML=siteForm(cur());$("sf_geo").onclick=geo;};
  const relist=()=>{$("sl_wrap").innerHTML=list();
    $("sl_list").onchange=ev=>{const v=ev.target.value;if(v==="new")return;draft=null;sel=+v;dlgMsg("");relist();load();};};
  const geo=()=>{if(!navigator.geolocation){dlgMsg("This browser can't share its location.");return;}
    dlgMsg("Finding your location…",true);
    navigator.geolocation.getCurrentPosition(p=>{$("sf_lat").value=p.coords.latitude.toFixed(4);$("sf_lon").value=p.coords.longitude.toFixed(4);
      const z=Intl.DateTimeFormat().resolvedOptions().timeZone;if([...$("sf_tz").options].some(o=>o.value===z))$("sf_tz").value=z;
      dlgMsg("Location filled in. Check it, then save.",true);},
      err=>dlgMsg(`Couldn't get your location (${err.message}). You can type it in instead.`),{timeout:15000});};
  const save=async use=>{const p=readSiteForm();let saved;
    if(draft){saved=(await api("POST","/api/sites",p)).site;ST.sites.push(saved);draft=null;}
    else{saved=(await api("PUT",`/api/sites/${sel}`,p)).site;ST.sites=ST.sites.map(x=>x.id===saved.id?saved:x);}
    sel=saved.id;
    if(use||first){ST.settings.site_id=saved.id;ST.settings.setupDone=true;await saveSettingsNow();renderSites();setToday();run();closeDlg();flash(`Using ${saved.name}.`);nextPrompt();return;}
    run();relist();load();dlgMsg(`Saved ${saved.name}.`,true);};
  openDlg({title:first?"Observing Sites":"Setup",wide:true,body,buttons:[
    ...(first?[]:[{label:"Save",run:()=>save(false)}]),
    {label:first?"Save and Start":"Save and Use",def:true,run:()=>save(true)},
    {label:"Help",run:async()=>openHelp("site",()=>openSites(first))},
    {label:"Close",close:true}]});
  relist();load();wireTabs();
  $("sl_new").onclick=()=>{draft={...cur(),id:null,name:"New site",notes:""};relist();load();$("sf_name").select();};
  $("sl_del").onclick=async()=>{dlgMsg("");
    if(draft){draft=null;relist();load();return;}
    if(ST.sites.length<=1){dlgMsg("You need at least one site.");return;}
    const x=cur();if(!confirm(`Delete the site "${x.name}"? Log entries keep their data but lose the site name.`))return;
    try{await api("DELETE",`/api/sites/${x.id}`);ST.sites=ST.sites.filter(y=>y.id!==x.id);
      if(ST.settings.site_id===x.id){ST.settings.site_id=ST.sites[0].id;saveSettingsNow();}
      sel=ST.sites[0].id;await reloadLog();run();relist();load();dlgMsg(`Deleted ${x.name}.`,true);}catch(err){dlgMsg(err.message);}};
}

/* ---------- setup: tabs and equipment */
function tabStrip(on){const t=(id,l)=>`<button type="button" role="tab" id="tab_${id}" aria-selected="${on===id}">${l}</button>`;
  return `<div class="tabs" role="tablist">${t("sites","Sites")}${t("equip","Equipment")}</div>`;}
function wireTabs(){$("tab_sites").onclick=()=>openSites(false);$("tab_equip").onclick=()=>openEquip();}
function openSetup(tab){tab==="equip"?openEquip():openSites(false);}
function scopeForm(x){const known=SCOPE_PRESETS.some(p=>p.model===x.model);
  return `<div class="grid">
    <label class="f"><span>Name:</span><input id="qf_name" maxlength="60" value="${esc(x.name)}" placeholder="My Dwarf Mini"></label>
    <label class="f"><span>Model:</span><select id="qf_model">${SCOPE_PRESETS.map(p=>`<option${p.model===(known?x.model:"Other")?" selected":""}>${esc(p.model)}</option>`).join("")}</select></label>
    <div class="f"><span>Field of view W × H (°):</span><div class="pair"><input id="qf_w" type="number" step="0.01" min="0.05" inputmode="decimal" aria-label="Field of view width" value="${x.fov_w}"><input id="qf_h" type="number" step="0.01" min="0.05" inputmode="decimal" aria-label="Field of view height" value="${x.fov_h}"></div></div>
    <div class="f"><span>Aperture / focal length (mm):</span><div class="pair"><input id="qf_ap" type="number" step="1" inputmode="decimal" aria-label="Aperture" value="${x.aperture??""}"><input id="qf_fl" type="number" step="1" inputmode="decimal" aria-label="Focal length" value="${x.focal??""}"></div></div>
    <label class="f"><span>Pixel size (µm):</span><input id="qf_px" type="number" step="0.01" inputmode="decimal" value="${x.pixel??""}" placeholder="optional"></label>
    <label class="f"><span>Mount:</span><select id="qf_mount"><option value="altaz"${x.mount!=="eq"?" selected":""}>Alt-az</option><option value="eq"${x.mount==="eq"?" selected":""}>Equatorial</option></select></label>
    <label class="f span2"><span>Filters (separate with commas):</span><input id="qf_filters" maxlength="120" value="${esc(x.filters)}" placeholder="Astro, Dual-band"></label>
  </div>
  <div class="inline"><button class="btn sm" id="qf_calcbtn" type="button" aria-expanded="false">Calculate from Camera…</button><span class="hint" style="margin:0">For your own telescope and camera: works out the field of view from the sensor and focal length.</span></div>
  <fieldset class="calc" id="qf_calc" hidden><legend>Field of view calculator</legend><div class="grid">
    <label class="f span2"><span>Camera:</span><select id="qc_cam"><option value="">Other (type the sensor size)</option>${CAMERAS.map((c,i)=>`<option value="${i}">${esc(c[0])}</option>`).join("")}</select></label>
    <div class="f"><span>Sensor W × H (mm):</span><div class="pair"><input id="qc_w" type="number" step="0.01" inputmode="decimal" aria-label="Sensor width"><input id="qc_h" type="number" step="0.01" inputmode="decimal" aria-label="Sensor height"></div></div>
    <label class="f"><span>Pixel size (µm):</span><input id="qc_px" type="number" step="0.01" inputmode="decimal" placeholder="optional"></label>
    <label class="f"><span>Focal length (mm):</span><input id="qc_fl" type="number" step="1" inputmode="decimal"></label>
    <label class="f"><span>Reducer / Barlow:</span><select id="qc_red"><option value="1">None</option><option value="0.8">0.8× reducer</option><option value="0.75">0.75× reducer</option><option value="0.7">0.7× reducer</option><option value="0.63">0.63× reducer</option><option value="2">2× Barlow</option></select></label>
  </div><p class="hint" id="qc_out" style="margin:4px 0"></p>
  <div class="inline"><button class="btn sm" id="qc_fill" type="button">Fill In Field of View</button></div></fieldset>
  <label class="f"><span>Notes:</span><textarea id="qf_notes" maxlength="500" placeholder="Firmware version, dew heater, which tripod…">${esc(x.notes)}</textarea></label>
  <p class="hint" id="qf_info" style="margin:0"></p>`;}
function readScopeForm(){const m=val("qf_model");return {name:val("qf_name"),model:m,fov_w:val("qf_w"),fov_h:val("qf_h"),aperture:val("qf_ap"),focal:val("qf_fl"),pixel:val("qf_px"),mount:val("qf_mount"),filters:val("qf_filters"),notes:val("qf_notes")};}
function openEquip(){
  const fresh=()=>({...SCOPE_PRESETS[0],id:null,name:SCOPE_PRESETS[0].model,notes:""});
  let sel=scope()?.id??ST.scopes[0]?.id??null,draft=ST.scopes.length?null:fresh();
  const list=()=>`<select id="ql_list" size="8" aria-label="Your scopes">${ST.scopes.map(x=>`<option value="${x.id}"${!draft&&x.id===sel?" selected":""}>${esc(x.name)}${x.id===scope()?.id?" (in use)":""}</option>`).join("")}${draft?`<option value="new" selected>(new scope)</option>`:""}</select>`;
  const body=`${tabStrip("equip")}${ST.scopes.length?"":`<p class="welcome">Add the scope you image with. Pick its model and the maker's specs are filled in for you; then the Targets table shows how each object fits in your frame.</p>`}
    <div class="cols"><div class="stack"><div id="ql_wrap"></div>
      <div class="inline"><button class="btn sm" id="ql_new" type="button">New Scope</button><button class="btn sm" id="ql_del" type="button">Delete</button></div></div>
    <div id="ql_form" class="stack"></div></div>`;
  const cur=()=>draft||ST.scopes.find(x=>x.id===sel);
  const info=()=>{const w=+val("qf_w"),h=+val("qf_h"),ap=+val("qf_ap"),fl=+val("qf_fl"),px=+val("qf_px");
    $("qf_info").textContent=[w&&h?`One frame covers ${Math.round(w*60)}′ × ${Math.round(h*60)}′ of sky (the full Moon is about 31′ across).`:"",ap&&fl?`f/${(fl/ap).toFixed(1)}.`:"",
      px&&fl?`Image scale ${(206.265*px/fl).toFixed(2)}″ per pixel.`:""].filter(Boolean).join(" ")+
      (val("qf_model")==="Other"?" Not a smart scope? Use Calculate from Camera."
        :" Presets are the maker's specs for one frame (no mosaic); change anything that's different on yours.");};
  const load=()=>{$("ql_form").innerHTML=scopeForm(cur());
    ["qf_w","qf_h","qf_ap","qf_fl","qf_px"].forEach(id=>$(id).addEventListener("input",info));info();
    // field-of-view calculator
    $("qf_calcbtn").onclick=()=>{const c=$("qf_calc"),open=c.hidden;c.hidden=!open;$("qf_calcbtn").setAttribute("aria-expanded",String(open));
      if(open){if(!val("qc_fl"))$("qc_fl").value=val("qf_fl");if(!val("qc_px"))$("qc_px").value=val("qf_px");calc();$("qc_cam").focus();}};
    const calc=()=>{const sw=+val("qc_w"),sh=+val("qc_h"),f=+val("qc_fl")*+val("qc_red"),px=+val("qc_px");
      if(!(sw>0&&sh>0&&f>0)){$("qc_out").textContent="Enter the sensor size and focal length.";return null;}
      const w=fovDeg(Math.max(sw,sh),f),h=fovDeg(Math.min(sw,sh),f);
      $("qc_out").textContent=`Field of view ${w.toFixed(2)}° × ${h.toFixed(2)}° (${Math.round(w*60)}′ × ${Math.round(h*60)}′) at ${Math.round(f)} mm effective`+
        (px?`, ${(206.265*px/f).toFixed(2)}″ per pixel.`:".");return {w,h,f,px};};
    $("qc_cam").onchange=()=>{const c=CAMERAS[+val("qc_cam")];if(val("qc_cam")!==""&&c){$("qc_w").value=c[1];$("qc_h").value=c[2];$("qc_px").value=c[3];}calc();};
    ["qc_w","qc_h","qc_px","qc_fl","qc_red"].forEach(id=>$(id).addEventListener("input",calc));
    $("qc_fill").onclick=()=>{const r=calc();if(!r)return;$("qf_w").value=r.w.toFixed(2);$("qf_h").value=r.h.toFixed(2);
      $("qf_fl").value=Math.round(r.f);if(r.px)$("qf_px").value=r.px;
      if(val("qf_model")!=="Other"){$("qf_model").value="Other";}
      $("qf_calc").hidden=true;$("qf_calcbtn").setAttribute("aria-expanded","false");info();dlgMsg("Field of view filled in. Check it, then save.",true);};
    let prev=val("qf_model");
    $("qf_model").onchange=()=>{const p=SCOPE_PRESETS.find(q=>q.model===val("qf_model"));
      if(p.model!=="Other"){$("qf_w").value=p.fov_w;$("qf_h").value=p.fov_h;$("qf_ap").value=p.aperture;$("qf_fl").value=p.focal;$("qf_px").value=p.pixel;$("qf_mount").value=p.mount;$("qf_filters").value=p.filters;}
      const n=val("qf_name").trim();if(!n||n===prev)$("qf_name").value=p.model==="Other"?"":p.model;prev=p.model;info();};};
  const relist=()=>{$("ql_wrap").innerHTML=list();
    $("ql_list").onchange=ev=>{const v=ev.target.value;if(v==="new")return;draft=null;sel=+v;dlgMsg("");relist();load();};};
  const save=async use=>{const p=readScopeForm();let saved;
    if(draft){saved=(await api("POST","/api/scopes",p)).scope;ST.scopes.push(saved);draft=null;}
    else{saved=(await api("PUT",`/api/scopes/${sel}`,p)).scope;ST.scopes=ST.scopes.map(x=>x.id===saved.id?saved:x);await reloadLog();}
    sel=saved.id;
    if(use){ST.settings.scope_id=saved.id;await saveSettingsNow();run();closeDlg();flash(`Using ${saved.name}.`);return;}
    run();relist();load();dlgMsg(`Saved ${saved.name}.`,true);};
  openDlg({title:"Setup",wide:true,body,buttons:[
    {label:"Save",run:()=>save(false)},
    {label:"Save and Use",def:true,run:()=>save(true)},
    {label:"Help",run:async()=>openHelp("equipment",()=>openEquip())},
    {label:"Close",close:true}]});
  relist();load();wireTabs();
  $("ql_new").onclick=()=>{draft=fresh();relist();load();$("qf_name").select();};
  $("ql_del").onclick=async()=>{dlgMsg("");
    if(draft){if(!ST.scopes.length)return;draft=null;relist();load();return;}
    const x=cur();if(!confirm(`Delete the scope "${x.name}"? Log entries keep their data but lose the scope name.`))return;
    try{await api("DELETE",`/api/scopes/${x.id}`);ST.scopes=ST.scopes.filter(y=>y.id!==x.id);
      if(ST.settings.scope_id===x.id){ST.settings.scope_id=null;saveSettingsNow();}
      sel=ST.scopes[0]?.id??null;if(!ST.scopes.length)draft=fresh();
      await reloadLog();run();relist();load();dlgMsg(`Deleted ${x.name}.`,true);}catch(err){dlgMsg(err.message);}};
}

/* ---------- account */
function openAccount(forced){const m=ST.me;
  const body=`${forced?`<p class="welcome"><b>Your password was reset by the site administrator.</b> Type the temporary password you were given, then choose a new password of your own.</p>`:""}<fieldset><legend>Profile</legend><div class="grid">
      <label class="f"><span>User name:</span><input value="${esc(m.username)}" readonly></label>
      <label class="f"><span>Your name:</span><input id="ac_name" maxlength="60" value="${esc(m.display_name)}"></label>
      <label class="f"><span>Callsign:</span><input id="ac_call" maxlength="12" value="${esc(m.callsign)}" autocapitalize="characters"></label></div></fieldset>
    <fieldset><legend>Change password</legend><div class="grid">
      <label class="f"><span>${forced?"Temporary":"Current"} password:</span><input id="ac_pw0" type="password" autocomplete="current-password"></label>
      <label class="f"><span>New password:</span><input id="ac_pw1" type="password" autocomplete="new-password" minlength="8"></label>
      <label class="f"><span>New password again:</span><input id="ac_pw2" type="password" autocomplete="new-password" minlength="8"></label></div></fieldset>`;
  openDlg({title:"My Account",body,buttons:[
    {label:"Save Profile",def:!forced,run:async()=>{ST.me=(await api("PUT","/api/account",{display_name:val("ac_name"),callsign:val("ac_call")})).me;
      $("who").textContent=ST.me.display_name||ST.me.username;$("ac_call").value=ST.me.callsign;dlgMsg("Profile saved.",true);}},
    {label:"Change Password",def:!!forced,run:async()=>{if(val("ac_pw1")!==val("ac_pw2"))throw new Error("The two new passwords don't match.");
      await api("POST","/api/password",{current:val("ac_pw0"),new:val("ac_pw1")});["ac_pw0","ac_pw1","ac_pw2"].forEach(i=>$(i).value="");
      if(ST.me.must_change_pw){ST.me.must_change_pw=0;closeDlg();flash("Password changed.");nextPrompt();return;}
      dlgMsg("Password changed.",true);}},
    {label:"Close",close:true}]});
  if(forced)$("ac_pw0").focus();
}

/* ---------- prompts at start-up, one at a time */
function nextPrompt(){
  if(ST.me.must_change_pw)return openAccount(true);
  if(!ST.settings.setupDone)return openSites(true);
  if(ST.news&&ST.news.length)return openNews();
}
const fmtDay=d=>new Date(d+"T12:00:00Z").toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"});
function newsHtml(list){return list.map(n=>`<div><b>Version ${esc(n.version)}</b> <span class="small">· ${esc(fmtDay(n.date))}</span>
  <ul class="news">${n.items.map(i=>`<li>${esc(i)}</li>`).join("")}</ul></div>`).join("");}
function openNews(){
  openDlg({title:"What's New",body:`<div class="icon-row"><svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2l3.5 9.5L29 12l-7.5 6 2.7 10L16 22.3 7.8 28l2.7-10L3 12l9.5-.5z" fill="#ffff00" stroke="#000"/></svg>
    <p style="margin:0">The planner has been updated since your last visit. Here's what's new:</p></div><div class="stack">${newsHtml(ST.news)}</div>`,
    buttons:[{label:"OK",def:true,run:async()=>{ST.news=[];closeDlg();try{await api("POST","/api/news/seen");}catch(e){}}}]});
}

/* ---------- club stats */
async function openStats(){let d;try{d=await api("GET","/api/stats");}catch(e){flash(e.message,true);return;}
  const tile=(n,label)=>`<div class="led"><div class="led-n">${esc(n)}</div><div class="led-l">${esc(label)}</div></div>`;
  const top=d.top?CAT.find(o=>o[0]===d.top.object_id):null;
  const fav=d.top?`<p style="margin:0"><b>Club favorite:</b> ${esc(d.top.object_id)}${top&&top[1]?` · ${esc(top[1])}`:""}, imaged by ${d.top.members} member${d.top.members===1?"":"s"} in ${d.top.entries} session${d.top.entries===1?"":"s"}.</p>`:"";
  openDlg({title:"Club Stats",wide:true,body:`<div class="leds">${tile(d.members,"Members")}${tile(d.active30,"Active this month")}${tile(d.entries.toLocaleString(),"Log entries")}
      ${tile(d.hours.toLocaleString(),"Hours of light collected")}${tile(d.objects,"Different objects imaged")}${tile(d.nights,"Nights logged")}</div>
    ${fav}${d.scopes&&d.scopes.length?`<p style="margin:0"><b>Club scopes:</b> ${d.scopes.map(s=>`${esc(s.model)} (${s.members})`).join(" · ")}</p>`:""}<p class="small" style="margin:0">Club totals since ${esc(d.since?fmtDay(d.since):"the start")}. Nobody's individual log is shown here.</p>`,
    buttons:[{label:"OK",def:true,close:true}]});
}

/* ---------- admin */
function rel(ts){if(!ts)return "never";const d=Math.floor((Date.now()-Date.parse(ts.replace(" ","T")+"Z"))/864e5);
  return d<=0?"today":d===1?"yesterday":`${d} days ago`;}
function setBadge(n){const b=$("adminbadge");if(!b)return;b.textContent=n;b.hidden=!n;
  b.title=`${n} member${n===1?" has":"s have"} been inactive for ${ST.inactive_days||90} days or more`;}
function memberStatus(u){return u.disabled?`<span class="mchip bad">Off</span>`:u.inactive?`<span class="mchip bad">Inactive</span>`:
  u.is_admin?`<span class="mchip ok">Admin</span>`:`<span class="mchip ok">Active</span>`;}
async function openAdmin(){let d;try{d=await api("GET","/api/admin");}catch(e){flash(e.message,true);return;}
  const body=`<fieldset><legend>Invite a friend</legend>
      <div class="inline"><input id="ad_note" maxlength="80" placeholder="Who is it for? (optional)" style="flex:1 1 200px"><button class="btn" id="ad_new" type="button">Create Invite</button></div>
      <div id="ad_code" class="stack" style="margin-top:8px"></div></fieldset>
    <fieldset><legend>Invites</legend><div class="sunken" id="ad_inv" style="max-height:30vh;overflow:auto"></div></fieldset>
    <fieldset><legend>Members</legend><p class="small" id="ad_sum" style="margin:0 0 6px"></p><div class="sunken" id="ad_users" style="max-height:34vh;overflow:auto"></div></fieldset>
    <fieldset><legend>Backup</legend><div class="inline"><button class="btn" id="ad_backup" type="button">Download Backup</button>
      <span class="small">A copy of the whole database (every member's sites and logs) as it is right now. Keep it somewhere safe; it holds members' data.</span></div></fieldset>`;
  openDlg({title:"Administrator",wide:true,body,buttons:[{label:"Close",def:true,close:true}]});
  const render=()=>{
    $("ad_inv").innerHTML=`<table><thead><tr><th>Code</th><th>For</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>${d.invites.map(i=>`<tr>
      <td class="m">${esc(i.code)}</td><td>${esc(i.note)}</td><td class="m">${esc(i.created_at.slice(0,10))}</td>
      <td>${i.used_at?`Used by ${esc(i.used_by||"(deleted)")}`:"Unused"}</td>
      <td class="act">${i.used_at?"":`<button class="btn sm" type="button" data-revoke="${esc(i.code)}">Revoke</button>`}</td></tr>`).join("")||`<tr><td class="empty" colspan="5">No invites yet.</td></tr>`}</tbody></table>`;
    const idle=d.users.filter(u=>u.inactive).length,on=d.users.filter(u=>!u.disabled).length;
    ST.inactive=idle;setBadge(idle);
    $("ad_sum").innerHTML=`${on} member${on===1?"":"s"}${idle?` · <b>${idle} inactive</b> (nothing in ${d.inactive_days} days)`:""}. Least recently active first.`;
    $("ad_users").innerHTML=`<table><thead><tr><th>Member</th><th>Last active</th><th>Last log entry</th><th>Entries</th><th>Status</th><th></th></tr></thead><tbody>${d.users.map(u=>`<tr>
      <td class="n">${esc(u.username)}<div class="nm">${esc([u.display_name,u.callsign].filter(Boolean).join(" · "))}</div></td>
      <td class="m">${esc(rel(u.active_at))}</td><td class="m">${esc(u.last_entry||"none")}</td><td class="m">${u.entries}</td>
      <td>${memberStatus(u)}</td><td class="act"><button class="btn sm" type="button" data-member="${esc(u.username)}">Properties…</button></td></tr>`).join("")}</tbody></table>`;};
  render();
  $("ad_backup").onclick=()=>{location.href="/api/admin/backup.db";dlgMsg("Backup download started. Check your Downloads folder.",true);};
  $("ad_new").onclick=async()=>{dlgMsg("");try{d=await api("POST","/api/admin/invites",{note:val("ad_note")});render();$("ad_note").value="";
    const link=`${location.origin}/signup?code=${encodeURIComponent(d.code)}`;
    $("ad_code").innerHTML=`<div class="inline"><span class="code" id="ad_c">${esc(d.code)}</span><button class="btn sm" id="ad_copy" type="button">Copy Sign-up Link</button></div>
      <span class="small">Send this link: <span id="ad_link" style="user-select:all;word-break:break-all">${esc(link)}</span></span>`;
    $("ad_copy").onclick=()=>{navigator.clipboard.writeText(link).then(()=>dlgMsg("Link copied.",true),()=>{getSelection().selectAllChildren($("ad_link"));dlgMsg("Press Ctrl+C to copy the selected link.",true);});};
  }catch(e){dlgMsg(e.message);}};
  $("ad_users").onclick=ev=>{const b=ev.target.closest("[data-member]");if(b)openMember(d.users.find(u=>u.username===b.dataset.member));};
  $("ad_inv").onclick=async ev=>{const b=ev.target.closest("[data-revoke]");if(!b)return;
    try{d=await api("DELETE",`/api/admin/invites/${encodeURIComponent(b.dataset.revoke)}`);render();dlgMsg("Invite revoked.",true);}catch(e){dlgMsg(e.message);}};
}

function openMember(u){const self=u.id===ST.me.id,q=encodeURIComponent(u.username);
  const row=(k,v)=>`<tr><th style="width:38%">${k}</th><td>${v}</td></tr>`;
  const body=`<div class="sunken"><table>${row("User name",`<b>${esc(u.username)}</b>`)}${row("Name",esc(u.display_name)||"—")}${row("Callsign",esc(u.callsign)||"—")}
      ${row("Status",memberStatus(u))}${row("Joined",esc(u.created_at.slice(0,10)))}${row("Last sign-in",esc(u.last_login?`${u.last_login.slice(0,16)} UTC`:"never"))}
      ${row("Last active",esc(rel(u.active_at)))}${row("Last log entry",esc(u.last_entry||"none"))}${row("Log entries · sites",`${u.entries} · ${u.sites}`)}</table></div>
    <div id="mp_out" class="stack"></div>
    ${self?`<p class="small" style="margin:0">This is your own account. Change your password under <b>Account</b>. To keep the site from losing its administrator, you can't turn off, demote or delete yourself here.</p>`:""}`;
  const after=async d=>{const nu=d.users.find(x=>x.username===u.username);if(nu)openMember(nu);else openAdmin();};
  openDlg({title:`Member Properties — ${u.username}`,body,buttons:[
    {label:"Reset Password",run:async()=>{const d=await api("POST",`/api/admin/users/${q}/reset`,{});
      $("mp_out").innerHTML=`<div class="inline"><span class="code" id="mp_temp">${esc(d.temp)}</span><button class="btn sm" id="mp_copy" type="button">Copy</button></div>
        <span class="small">Give ${esc(u.display_name||u.username)} this temporary password privately (a call or text). They'll be asked to choose a new one at their next sign-in. Their old password no longer works.</span>`;
      $("mp_copy").onclick=()=>navigator.clipboard.writeText(d.temp).then(()=>dlgMsg("Copied.",true),()=>{getSelection().selectAllChildren($("mp_temp"));dlgMsg("Press Ctrl+C to copy.",true);});}},
    ...(self?[]:[
      {label:u.disabled?"Turn On":"Turn Off",run:async()=>after(await api("POST",`/api/admin/users/${q}/disable`,{disabled:!u.disabled}))},
      {label:u.is_admin?"Remove Admin":"Make Admin",run:async()=>after(await api("POST",`/api/admin/users/${q}/admin`,{is_admin:!u.is_admin}))},
      {label:"Delete…",run:async()=>{$("mp_out").innerHTML=`<div class="welcome stack"><b>Delete ${esc(u.username)} and all their sites and log entries?</b>
          <span class="small">This can't be undone except by restoring a backup. To keep their data but stop them signing in, use <b>Turn Off</b> instead. Type <b>${esc(u.username)}</b> to confirm.</span>
          <div class="inline"><input id="mp_confirm" autocomplete="off" style="max-width:220px"><button class="btn" id="mp_del" type="button">Delete Member</button></div></div>`;
        $("mp_confirm").focus();
        $("mp_del").onclick=async()=>{try{await api("DELETE",`/api/admin/users/${q}`,{confirm:val("mp_confirm")});openAdmin();flash(`Deleted ${u.username}.`);}catch(e){dlgMsg(e.message);}};}}]),
    {label:"Back",def:true,run:async()=>openAdmin()}]});
}

/* ---------- help and about */
const strip=h=>h.replace(/<[^>]+>/g," ").replace(/&[a-z]+;/g," ");
function openHelp(id,back){
  const topics=HELP.filter(t=>!t.admin||ST.me.is_admin);let cur=topics.find(t=>t.id===id)||topics[0];
  const body=`<div class="helpwrap"><div class="stack"><input id="hp_q" type="search" placeholder="Search Help…" aria-label="Search Help">
      <select id="hp_list" size="14" aria-label="Help topics"></select></div><div class="sunken helptext" id="hp_text" tabindex="0"></div></div>`;
  openDlg({title:"Astro Imaging Planner Help",wide:true,body,buttons:[{label:back?"Back":"Close",def:true,run:async()=>back?back():closeDlg()}]});
  const list=()=>{const q=val("hp_q").trim().toLowerCase();
    const hits=topics.filter(t=>!q||(t.title+" "+strip(t.html)).toLowerCase().includes(q));
    $("hp_list").innerHTML=hits.map(t=>`<option value="${t.id}"${t===cur?" selected":""}>${esc(t.title)}</option>`).join("")||`<option disabled>No topics match</option>`;};
  const show=t=>{cur=t;$("hp_text").innerHTML=t.html;$("hp_text").scrollTop=0;list();};
  $("hp_q").oninput=list;$("hp_list").onchange=e=>{const t=topics.find(x=>x.id===e.target.value);if(t)show(t);};
  $("hp_text").onclick=e=>{const a=e.target.closest("[data-topic]");if(!a)return;e.preventDefault();const t=topics.find(x=>x.id===a.dataset.topic);if(t)show(t);};
  show(cur);$("hp_list").focus();
}
async function openAbout(){
  const body=`<div class="icon-row"><svg width="48" height="48" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" fill="#000080"/><rect x="1" y="9" width="8" height="4" fill="#c0c0c0" transform="rotate(-30 5 11)"/><rect x="6" y="12" width="2" height="4" fill="#808080"/><circle cx="13" cy="3" r="1.3" fill="#ff0"/><circle cx="9" cy="2" r=".8" fill="#fff"/></svg>
      <div class="stack" style="gap:2px"><b style="font-size:16px">Astro Imaging Planner</b><span>Version ${esc(ST.version||window.AIP_VERSION||"")}</span>
      <span class="small">What can I image tonight, from my own yard, in the time I have?</span></div></div>
    <fieldset><legend>Credits</legend><div class="stack small">
      <div>Created by <b>Dave Doler, K3DFD</b>, Philadelphia.</div>
      <div>Object catalog: <a href="https://github.com/mattiaverga/OpenNGC" target="_blank" rel="noopener">OpenNGC</a> by Mattia Verga, licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. ${CAT.length} objects: Messier, Caldwell and NGC/IC.</div>
      <div>Chart stars and constellation figures: <a href="https://github.com/ofrohn/d3-celestial" target="_blank" rel="noopener">d3-celestial</a> by Olaf Frohn (BSD 3-Clause license), with stars from the XHIP Hipparcos compilation.</div>
      <div>Sun and Moon positions: after Jean Meeus, <i>Astronomical Algorithms</i>.</div>
      <div>Built with Python, Flask and SQLite.</div></div></fieldset>
    <p class="small" style="margin:0">Running at ${esc(location.host)}.</p>`;
  openDlg({title:"About Astro Imaging Planner",body,buttons:[{label:"Version History",run:openHistory},{label:"OK",def:true,close:true}]});
}
async function openHistory(){const d=await api("GET","/api/changelog");
  openDlg({title:"Version History",wide:true,body:`<div class="sunken helptext">${newsHtml(d.changelog)}</div>`,
    buttons:[{label:"Back",run:async()=>openAbout()},{label:"Close",def:true,close:true}]});}

/* ------------------------------------------------------------ wiring */
function wire(){
  $("prev").onclick=()=>shiftDay(-1);$("next").onclick=()=>shiftDay(1);$("today").onclick=()=>{setToday();run();};
  $("red").onclick=()=>setRed(!document.body.classList.contains("red"),true);
  $("newlog").onclick=()=>openLogEntry(null,"");
  $("mylog").onclick=openMyLog;
  $("setup").onclick=()=>openSetup("sites");$("editsites").onclick=()=>openSetup("sites");$("editscopes").onclick=()=>openSetup("equip");
  $("account").onclick=()=>openAccount(false);
  $("stats").onclick=openStats;
  $("help").onclick=()=>openHelp("start");$("about").onclick=openAbout;
  document.addEventListener("keydown",e=>{if(e.key==="F1"){e.preventDefault();if($("dlg").hidden)openHelp("start");}});
  document.addEventListener("click",e=>{const b=e.target.closest(".qbtn[data-help]");if(b)openHelp(b.dataset.help);});
  if($("admin"))$("admin").onclick=openAdmin;
  $("logoff").onclick=async()=>{try{await api("POST","/api/logout");}catch(e){}location.href="/login";};
  ["t0","t1","dur","mag","unimaged","sb","moonrule","cat_M","cat_C","cat_N"].forEach(id=>$(id).addEventListener("change",()=>{run();saveSettings();}));
  ["show_const","show_stars","show_mer","show_horiz"].forEach(id=>$(id).addEventListener("change",()=>{readSettings();draw();saveSettings();}));
  $("site").addEventListener("change",()=>{ST.settings.site_id=+$("site").value;setToday();run();saveSettings();});
  $("scope").addEventListener("change",()=>{ST.settings.scope_id=$("scope").value?+$("scope").value:null;run();saveSettings();});
  $("date").addEventListener("change",run);
  const focus=id=>{const svg=$("chart").querySelector("svg");if(!svg)return;svg.classList.toggle("focus",!!id);
    svg.querySelectorAll(".trk").forEach(t=>t.classList.toggle("hl",t.dataset.obj===id));};
  ["list","near"].forEach(t=>{$(t).addEventListener("mouseover",e=>{const tr=e.target.closest("tr[data-obj]");if(tr)focus(tr.dataset.obj);});
    $(t).addEventListener("mouseleave",()=>focus(null));});
  document.addEventListener("click",e=>{const b=e.target.closest("[data-log]");if(b)openLogEntry(null,b.dataset.log);});
}

async function boot(){
  const skyP=loadSky(`/static/sky.json?v=${window.AIP_VERSION||""}`);   // optional overlay; loads alongside the catalog
  try{await loadCatalog(`/static/catalog.json?v=${window.AIP_VERSION||""}`);buildAliases();await skyP;}
  catch(e){$("s1").innerHTML=`<span class="bad">${esc(e.message)}</span>`;return;}
  initControls();wire();
  try{const st=await api("GET","/api/state");ST={...st,settings:{...DEF,...st.settings}};}
  catch(e){$("s1").innerHTML=`<span class="bad">${esc(e.message)}</span>`;return;}
  if(!ST.sites.some(x=>x.id===ST.settings.site_id))ST.settings.site_id=ST.sites[0]?.id??null;
  ST.scopes=ST.scopes||[];if(!ST.scopes.some(x=>x.id===ST.settings.scope_id))ST.settings.scope_id=null;
  applySettings();renderSites();setToday();
  setRed(!!ST.settings.red,false);
  run();
  if(ST.me.is_admin){ST.inactive_days=ST.inactive_days||90;setBadge(ST.inactive||0);}
  nextPrompt();
}
boot();
