'use strict';
/* =====================================================================
   SCRAP RUN — core: constants + helpers shared by the browser game AND
   the headless node sim harness (sim/run.js). NO DOM in this file.
   ===================================================================== */
const W=256, H=144, GROUND=H-22, GRAV=.42, TAU=Math.PI*2;

/* ---- seeded RNG: everything that affects the SIMULATION uses rnd()/ri()/pick() ---- */
function mulberry(a){ return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
let RAND=mulberry(1);
function seedRNG(s){ RAND=mulberry((s>>>0)||1); }
const rnd=(a,b)=>a+RAND()*(b-a), ri=(a,b)=>Math.floor(rnd(a,b+1)), pick=a=>a[Math.floor(RAND()*a.length)];
const clamp=(v,a,b)=>v<a?a:v>b?b:v, sgn=v=>v<0?-1:1, lerp=(a,b,t)=>a+(b-a)*t;
function hash(n){ n|=0; n=(n^61)^(n>>>16); n=n+(n<<3); n=n^(n>>>4); n=Math.imul(n,0x27d4eb2d); n=n^(n>>>15); return n>>>0; }
function rectHit(x,y,r,pad){ pad=pad||0; return x>r[0]-pad&&x<r[2]+pad&&y>r[1]-pad&&y<r[3]+pad; }
function rectsOverlap(a,b){ return a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1]; }
function segDist(px,py,x1,y1,x2,y2){ const dx=x2-x1, dy=y2-y1, l=dx*dx+dy*dy||1; let t=((px-x1)*dx+(py-y1)*dy)/l; t=clamp(t,0,1);
  return Math.hypot(px-(x1+t*dx),py-(y1+t*dy)); }

/* ---- input bits (one byte per player per frame) ---- */
const B_L=1, B_R=2, B_U=4, B_D=8, B_FIRE=16, B_JUMP=32, B_BOMB=64, B_START=128;

/* ---- FX bus: the sim only EMITS cosmetic events (sound, particles, shake, callouts).
        The browser drains it into particles/audio; online the host forwards it to the guest;
        the headless harness just clears it. ---- */
const FXQ=[];
function fx(){ FXQ.push(Array.prototype.slice.call(arguments)); }

/* ---- grades (Cuphead-style) ---- */
const GRADES=[[90,'A+'],[85,'A'],[80,'A-'],[75,'B+'],[70,'B'],[65,'B-'],[60,'C+'],[55,'C'],[50,'C-'],[0,'D']];
function gradeOf(pts){ for(const [m,g] of GRADES) if(pts>=m) return g; return 'D'; }
const GRADE_RANK=g=>GRADES.findIndex(x=>x[1]===g);   // lower = better
