"use strict";
/* Astro Imaging Planner: catalog and sky math. Runs in the browser; no server round trips. */
// The catalog lives in static/catalog.json (built from OpenNGC by tools/build_catalog.py) and is loaded at start-up.
// Each row: [id, common name, type, RA hours J2000, Dec deg J2000, mag, major arcmin, minor arcmin,
//            surface brightness mag/arcsec2, catalogs "M"/"C"/"N", aliases[]]
let CAT=[], CAT_SOURCE="";
async function loadCatalog(url){const r=await fetch(url,{credentials:"same-origin"});
  if(!r.ok)throw new Error("Couldn't load the object catalog. Reload the page to try again.");
  const d=await r.json();CAT=d.objects;CAT_SOURCE=d.source;return CAT;}

// Bright stars and constellation figures for the chart overlay (static/sky.json, built by tools/build_sky.py).
// Optional: if it fails to load, the chart simply has no overlay.
let SKY=null;
async function loadSky(url){try{const r=await fetch(url,{credentials:"same-origin"});if(r.ok)SKY=await r.json();}catch(e){SKY=null;}return SKY;}

const R=Math.PI/180;
const J2000=Date.UTC(2000,0,1,12), JYEAR=31557600000;

// Minutes the time zone is ahead of UTC at instant d.
function tzOff(d,tz){const p=new Intl.DateTimeFormat("en-US",{timeZone:tz,hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).formatToParts(d);
  const g=t=>+p.find(x=>x.type===t).value;return (Date.UTC(g("year"),g("month")-1,g("day"),g("hour"),g("minute"),g("second"))-d.getTime())/6e4;}
// Local wall-clock time in zone tz -> UTC milliseconds. Day overflow (d=32) is fine.
function zoned(y,m,d,h,mi,tz){const base=Date.UTC(y,m-1,d,h,mi);const t=base-tzOff(new Date(base),tz)*6e4;return base-tzOff(new Date(t),tz)*6e4;}
// Approximate precession; yrs may be negative. Returns [RA deg, Dec deg].
function precess(raH,dec,yrs){const a=raH*15*R,dl=dec*R;
  const dRa=(3.075+1.336*Math.sin(a)*Math.tan(dl))*yrs/240;
  const dDec=20.04*Math.cos(a)*yrs/3600;return [raH*15+dRa,dec+dDec];}
function lstDeg(ms,lon){const D=ms/864e5+2440587.5-2451545;return ((280.46061837+360.98564736629*D+lon)%360+360)%360;}
function altaz(raDeg,dec,ms,lat,lon){const H=(lstDeg(ms,lon)-raDeg)*R,d=dec*R,p=lat*R;
  const alt=Math.asin(Math.sin(p)*Math.sin(d)+Math.cos(p)*Math.cos(d)*Math.cos(H));
  const az=Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(p)-Math.tan(d)*Math.cos(p))/R+180;
  return [alt/R,(az%360+360)%360];}
// Alt/az at a moment -> J2000 [RA deg, Dec deg].
function toRaDec(alt,az,ms,s){const a=alt*R,A=az*R,p=s.lat*R;
  const dec=Math.asin(Math.sin(a)*Math.sin(p)+Math.cos(a)*Math.cos(p)*Math.cos(A));
  const H=Math.atan2(-Math.sin(A)*Math.cos(a),Math.cos(p)*Math.sin(a)-Math.sin(p)*Math.cos(a)*Math.cos(A))/R;
  const raNow=((lstDeg(ms,s.lon)-H)%360+360)%360;
  const [ra,d]=precess(raNow/15,dec/R,-(ms-J2000)/JYEAR);return [(ra%360+360)%360,d];}

// J2000 RA hours / Dec -> [alt, az] at moment ms for site s.
function skyAltAz(raH,dec,ms,s){const [ra,d]=precess(raH,dec,(ms-J2000)/JYEAR);return altaz(ra,d,ms,s.lat,s.lon);}

// Sky box geometry. Azimuth windows may cross north (e.g. 330 to 30).
function boxGeom(az0,az1){let w=((az1-az0)%360+360)%360;if(w===0)w=360;return {w,c:az0+w/2};}
// Azimuth measured from the box's left edge: 0..w is inside the box.
function relAz(az,g){return ((az-g.c)%360+540)%360-180+g.w/2;}

// Longest continuous stretch an object spends inside the box during the session.
function evaluate(o,s){const [ra,dec]=precess(o[3],o[4],(s.t0-J2000)/JYEAR);
  const n=Math.round((s.t1-s.t0)/6e4);let run=0,best=0,bs=0,be=0,cs=0;const path=[];
  for(let i=0;i<=n;i++){const [al,az]=altaz(ra,dec,s.t0+i*6e4,s.lat,s.lon),x=relAz(az,s.g);path.push([al,x]);
    if(al>=s.al0&&al<=s.al1&&x>=0&&x<=s.g.w){if(!run)cs=i;run++;if(run-1>best){best=run-1;bs=cs;be=i;}}else run=0;}
  let lo=90,hi=-90;for(let i=bs;i<=be;i++){lo=Math.min(lo,path[i][0]);hi=Math.max(hi,path[i][0]);}
  return {o,best:be-bs,bs,be,path,lo,hi};}

// The box's footprint in J2000 RA/Dec at a moment.
function boxSky(ms,s){const pts=[];for(let i=0;i<=12;i++){const f=i/12,az=s.az0+s.g.w*f,al=s.al0+(s.al1-s.al0)*f;
    pts.push([s.al0,az],[s.al1,az],[al,s.az0],[al,s.az0+s.g.w]);}
  const c=toRaDec((s.al0+s.al1)/2,s.g.c,ms,s);let r0=0,r1=0,d0=90,d1=-90;
  pts.forEach(([al,az])=>{const [r,d]=toRaDec(al,az,ms,s),dr=((r-c[0]+540)%360)-180;r0=Math.min(r0,dr);r1=Math.max(r1,dr);d0=Math.min(d0,d);d1=Math.max(d1,d);});
  return {c,ra0:c[0]+r0,ra1:c[0]+r1,d0,d1};}

function fmtRA(deg){const h=((deg%360+360)%360)/15;let hh=Math.floor(h),mm=(h-hh)*60;if(mm>=59.95){hh=(hh+1)%24;mm=0;}
  return `${String(hh).padStart(2,"0")}h ${mm.toFixed(1).padStart(4,"0")}m`;}
function fmtDec(d){const a=Math.abs(d);let D=Math.floor(a),M=Math.round((a-D)*60);if(M===60){D++;M=0;}
  return `${d<0?"\u2212":"+"}${String(D).padStart(2,"0")}\u00b0 ${String(M).padStart(2,"0")}\u2032`;}

// ---- Sun and Moon -------------------------------------------------------------------------------
// Low-precision series (Meeus, Astronomical Algorithms ch. 25 and 47, main terms only):
// the Sun to about 0.01 degrees, the Moon to about 0.3 degrees. Positions are for the equinox of date,
// which is what altaz() expects.
const nrm=d=>(d%360+360)%360, sind=d=>Math.sin(d*R), cosd=d=>Math.cos(d*R);
const jcent=ms=>(ms/864e5+2440587.5-2451545)/36525;
function eclToEq(lam,bet,T){const e=23.439291-0.0130042*T;
  const ra=Math.atan2(sind(lam)*cosd(e)-Math.tan(bet*R)*sind(e),cosd(lam))/R;
  const dec=Math.asin(sind(bet)*cosd(e)+cosd(bet)*sind(e)*sind(lam))/R;return [nrm(ra),dec];}
function sunPos(ms){const T=jcent(ms),L=280.46646+36000.76983*T,g=357.52911+35999.05029*T;
  const lam=nrm(L+(1.914602-0.004817*T)*sind(g)+0.019993*sind(2*g)+0.000289*sind(3*g));
  const [ra,dec]=eclToEq(lam,0,T);return {ra,dec,lam};}
function moonPos(ms){const T=jcent(ms);
  const L0=218.3164477+481267.88123421*T,l=134.9633964+477198.8675055*T,m=357.5291092+35999.0502909*T,
        F=93.272095+483202.0175233*T,D=297.8501921+445267.1114034*T;
  const lam=nrm(L0+6.288774*sind(l)+1.274027*sind(2*D-l)+0.658314*sind(2*D)+0.213618*sind(2*l)-0.185116*sind(m)
    -0.114332*sind(2*F)+0.058793*sind(2*D-2*l)+0.057066*sind(2*D-m-l)+0.053322*sind(2*D+l)+0.045758*sind(2*D-m)
    -0.040923*sind(m-l)-0.03472*sind(D)-0.030383*sind(m+l)+0.015327*sind(2*D-2*F)-0.012528*sind(l+2*F)+0.01098*sind(l-2*F));
  const bet=5.128122*sind(F)+0.280602*sind(l+F)+0.277693*sind(l-F)+0.173237*sind(2*D-F)+0.055413*sind(2*D-l+F)
    +0.046271*sind(2*D-l-F)+0.032573*sind(2*D+F)+0.017198*sind(2*l+F);
  const par=0.950724+0.051818*cosd(l)+0.009531*cosd(2*D-l)+0.007843*cosd(2*D)+0.002824*cosd(2*l);  // horizontal parallax, deg
  const [ra,dec]=eclToEq(lam,bet,T);return {ra,dec,lam,bet,par};}
// The Moon as seen from the site: altitude corrected for parallax, plus phase.
function moonAt(ms,lat,lon){const m=moonPos(ms),s=sunPos(ms),[alt,az]=altaz(m.ra,m.dec,ms,lat,lon);
  const elong=nrm(m.lam-s.lam),psi=Math.acos(cosd(m.bet)*cosd(m.lam-s.lam))/R;
  return {ra:m.ra,dec:m.dec,alt:alt-m.par*cosd(alt),az,illum:(1-cosd(psi))/2,waxing:elong<180,elong};}
// Named the way people describe it: within a day or so of full or new, it's "full" or "new".
// Local sidereal time as "19h 41m".
function fmtLST(ms,lon){const h=lstDeg(ms,lon)/15;let hh=Math.floor(h),mm=Math.round((h-hh)*60);if(mm===60){hh=(hh+1)%24;mm=0;}
  return `${String(hh).padStart(2,"0")}h ${String(mm).padStart(2,"0")}m`;}
// When an object crosses the meridian (due south, its highest point) nearest to tRef, and how high it is then.
function transitOf(o,tRef,lat,lon){const [ra,dec]=precess(o[3],o[4],(tRef-J2000)/JYEAR);
  const H=((lstDeg(tRef,lon)-ra)%360+540)%360-180;      // hour angle, degrees: + means already past the meridian
  return {t:tRef-H/360.9856*864e5,alt:90-Math.abs(lat-dec)};}
function phaseName(e,k){if(k>=0.97)return "Full Moon";if(k<=0.03)return "New Moon";
  return e<84?"Waxing crescent":e<96?"First quarter":e<180?"Waxing gibbous":e<264?"Waning gibbous":e<276?"Last quarter":"Waning crescent";}
function sepDeg(ra1,d1,ra2,d2){return Math.acos(Math.min(1,sind(d1)*sind(d2)+cosd(d1)*cosd(d2)*cosd(ra1-ra2)))/R;}
const MOON_UP=-0.8, SUN_UP=-0.833;   // centre altitude at rise/set: refraction plus semi-diameter
// Times when f(ms) crosses level between t0 and t1 (scan every 5 minutes, refine by bisection).
function crossings(f,level,t0,t1){const out=[];let pt=t0,pv=f(t0)-level;
  for(let t=t0+3e5;t<=t1;t+=3e5){const v=f(t)-level;
    if((pv<0)!==(v<0)){let a=pt,b=t,va=pv;for(let i=0;i<12;i++){const c=(a+b)/2,vc=f(c)-level;if((va<0)===(vc<0)){a=c;va=vc;}else b=c;}
      out.push({t:(a+b)/2,rising:pv<0});}
    pt=t;pv=v;}
  return out;}
// Sun and Moon events for the night that begins on the session date (local noon to noon).
function nightInfo(noon,lat,lon){const t1=noon+864e5;
  const sunAlt=t=>{const p=sunPos(t);return altaz(p.ra,p.dec,t,lat,lon)[0];};
  const first=(xs,rising)=>(xs.find(x=>x.rising===rising)||{}).t??null;
  const sx=crossings(sunAlt,SUN_UP,noon,t1),ax=crossings(sunAlt,-18,noon,t1);
  const mx=crossings(t=>moonAt(t,lat,lon).alt,MOON_UP,noon,t1);
  return {sunset:first(sx,false),sunrise:first(sx,true),dusk:first(ax,false),dawn:first(ax,true),
          moonrise:first(mx,true),moonset:first(mx,false),moonUpAtNoon:moonAt(noon,lat,lon).alt>MOON_UP};}
