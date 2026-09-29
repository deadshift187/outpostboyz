'use strict';
/* =====================================================================
   SIM — every game rule, as a pure state machine.
     newSim({li, np, seed, god, fromBoss, retries}) -> S
     simStep(S, masks[])            masks = input byte per player (core.js B_*)
   No DOM, no timers, all randomness seeded -> the node harness replays it exactly.
   Cosmetics (particles/sound/shake/callouts) go out through fx() only.
   ===================================================================== */
const ENEMY={ walker:{w:10,h:18,hp:3,pts:100}, heavy:{w:20,h:24,hp:14,pts:500}, drone:{w:14,h:8,hp:3,pts:300,air:1},
  jumper:{w:12,h:15,hp:2,pts:150}, turret:{w:14,h:12,hp:6,pts:400}, bike:{w:18,h:15,hp:3,pts:250},
  bomber:{w:22,h:10,hp:5,pts:400,air:1}, shield:{w:12,h:18,hp:6,pts:350}, mine:{w:8,h:9,hp:1,pts:80}, pod:{w:14,h:16,hp:8,pts:300} };
const AMMO={H:200,S:30,R:30,F:60}, GUNLEN={pistol:7,H:10,S:10,R:11,F:10};
const PHP=3;                                  // Cuphead-style hit points
const inp=(p,b)=>(p.in&b)!==0, tap=(p,b)=>(p.hit&b)!==0;

/* ----------------------------- setup ----------------------------- */
function makePlayer(id,x){ return {id,x,y:-20-id*10,vx:0,vy:0,face:1,onGround:false,onPlat:false,crouch:false,aim:'fwd',
  weapon:'pistol',ammo:-1,bombs:10,hp:PHP,inv:120,st:'alive',ghostT:0,fireCd:0,coyote:0,jbuf:0,dropT:0,runT:0,shootT:0,
  knifeT:0,recoil:0,burst:0,tank:-1,prev:0,in:0,hit:0,safeX:x,hits:0,score:0}; }
function makeTank(x){ return {x,y:GROUND-30,vx:0,vy:0,face:1,onGround:false,hp:6,maxhp:6,inv:0,shells:10,aim:0,fireCd:0,burst:0,
  boardCd:0,tread:0,recoil:0,st:'parked',dieT:0,flash:0,shootT:0,drv:-1,safeX:x}; }
function newSim(o){
  seedRNG(o.seed||1); const L=LEVELS[o.li], np=o.np||1;
  const S={li:o.li, L, np, t:0, cam:{x:0,lock:null}, arenaR:null, hitstop:0, phase:'play', endT:0, failT:0,
    players:[], enemies:[], pb:[], eb:[], nades:[], crates:[], pows:[], tanks:[], boss:null, waves:[], hz:[],
    trig:L.trig.map(t=>({x:t.x,e:t.e,lock:t.lock,fired:false,cleared:false,group:[]})),
    bossSeq:false, warnT:0, goT:0, checkpoint:!!o.fromBoss, retries:o.retries||0, god:!!o.god, eid:1,
    stats:{frames:0,hits:0,deaths:0,pows:0,powsTotal:L.pows.length,kills:0,score:0}, result:null };
  for(let i=0;i<np;i++) S.players.push(makePlayer(i,34+i*18));
  S.pows=L.pows.map(x=>({x,y:GROUND,st:'tied',t:0,sway:rnd(0,6)}));
  S.tanks=(L.tanks||[]).map(makeTank);
  for(const c of (L.crush||[])) S.hz.push({k:'crush',x:c.x,w:c.w,per:c.per,off:c.off,cy:12,ph:'up'});
  for(const x of (L.icicles||[])) S.hz.push({k:'icicle',x,y:12,vy:0,st:'hang',t:0});
  for(const l of (L.lasers||[])) S.hz.push({k:'laser',x:l.x,per:l.per,off:l.off,ph:'off'});
  if(o.fromBoss){                                         // checkpoint: straight to the arena
    S.cam.x=L.len-W-40; for(const t of S.trig){ t.fired=true; t.cleared=true; }
    S.pows=[]; S.stats.powsTotal=0; S.tanks=[];
    S.players.forEach((p,i)=>{ p.x=S.cam.x+40+i*18; p.safeX=p.x; }); }
  fx('intro',L.name,L.tag);
  return S;
}

/* ----------------------------- world queries ----------------------------- */
function isGap(S,x){ for(const g of S.L.gaps) if(x>g[0]&&x<g[1]) return true; return false; }
function landY(S,x,prev,now,noPlat){
  if(!noPlat) for(const p of S.L.plats) if(x>p.x+2&&x<p.x+p.w-2&&prev<=p.top+.5&&now>=p.top) return p.top;
  if(now>=GROUND&&prev<=GROUND+.5&&!isGap(S,x)) return GROUND;
  return null; }
function moveBody(S,o,noPlat){ const py=o.y, px=o.x; o.vy=Math.min(o.vy+GRAV,8); o.x+=o.vx; o.y+=o.vy; o.onGround=false; o.onPlat=false;
  if(o.vy>=0){ const ty=landY(S,o.x,py,o.y,noPlat); if(ty!==null){ o.y=ty; o.vy=0; o.onGround=true; o.onPlat=ty!==GROUND; } }
  if(o.y>GROUND+1&&!isGap(S,o.x)&&isGap(S,px)) o.x=px;          // pit walls
  return py; }
function alivePlayers(S){ return S.players.filter(p=>p.st==='alive'); }
function tgt(S,e){ let best=null, bd=1e9; for(const p of S.players){ if(p.st!=='alive')continue;
  const d=Math.abs(p.x-e.x)+Math.abs(p.y-e.y)*.5; if(d<bd){ bd=d; best=p; } } return best; }
function onScreen(S,e){ return e.x>S.cam.x-4&&e.x<S.cam.x+W+4; }
function ecy(e){ return (e.t==='drone'||e.t==='bomber')?e.y:e.y-e.h/2; }
function eHit(e,x,y,pad){ pad=pad||0; return Math.abs(x-e.x)<e.w/2+pad&&Math.abs(y-ecy(e))<e.h/2+pad; }
function pBox(p){ if(p.tank>=0){ const T=p._T; return [T.x-15,T.y-22,T.x+15,T.y]; }
  return [p.x-4,p.y-(p.crouch?10:18),p.x+4,p.y]; }
function pHit(S,p,x,y,pad){ if(p.st!=='alive')return false; return rectHit(x,y,pBox(p),pad||0); }
function hurtAt(S,x,y,pad){ for(const p of S.players) if(pHit(S,p,x,y,pad)){ hurtPlayer(S,p); return true; } return false; }
function hurtRect(S,r){ for(const p of S.players) if(p.st==='alive'&&rectsOverlap(pBox(p),r)) hurtPlayer(S,p); }

/* ----------------------------- damage ----------------------------- */
function hurtPlayer(S,p){
  if(S.god||p.st!=='alive'||S.phase!=='play')return;
  if(p.tank>=0){ hitTank(S,S.tanks[p.tank]); return; }
  if(p.inv>0)return;
  p.hp--; p.hits++; S.stats.hits++; p.inv=90; p.vy=-3; p.vx=-p.face*1.4; p.burst=0;
  S.hitstop=Math.max(S.hitstop,5); fx('hurt',p.x,p.y-10,p.id,p.hp,S.cause||'');
  if(p.hp<=0) downPlayer(S,p); }
function downPlayer(S,p){ p.st='ghost'; p.ghostT=0; p.hp=0; p.vx=0; p.vy=0; p.y-=8; S.stats.deaths++; fx('down',p.x,p.y,p.id);
  p.weapon='pistol'; p.ammo=-1; }
function killEnemy(S,e,silent){ if(e.dead)return; e.dead=true; if(silent)return;
  const pts=ENEMY[e.t].pts; S.stats.kills++; S.stats.score+=pts; fx('kill',e.t,e.x,ecy(e),pts);
  if(e.t==='heavy'||e.t==='pod'||e.t==='turret') fx('boom',e.x,ecy(e),1); else fx('boom',e.x,ecy(e),0);
  if(e.t==='mine') explode(S,e.x,e.y-3,16,3,false);
  if(RAND()<({heavy:.5,shield:.25,turret:.3,bomber:.25}[e.t]||.06)) dropCrate(S,e.x,ecy(e)); }
function damageEnemy(S,e,dmg,kx){ if(e.dead||e.dying)return; e.hp-=dmg; e.flash=4;
  if(!ENEMY[e.t].air&&e.t!=='turret')e.x+=kx||0; fx('ehit',e.x,ecy(e));
  if(e.hp<=0){ if(e.t==='drone'||e.t==='bomber'){ e.dying=true; e.vy=-1; e.spin=0; S.stats.kills++; S.stats.score+=ENEMY[e.t].pts; fx('kill',e.t,e.x,e.y,ENEMY[e.t].pts); }
    else killEnemy(S,e); } }
function explode(S,x,y,r,dmg,hurtsPlayers){ fx('boom',x,y,r>22?1:0);
  for(const e of S.enemies){ if(e.dead||e.dying)continue; if(Math.hypot(e.x-x,ecy(e)-y)<r+e.w/2) damageEnemy(S,e,dmg,sgn(e.x-x)*3); }
  const b=S.boss; if(b&&b.hb) for(const h of b.hb){ const cx=clamp(x,h[0],h[2]), cy=clamp(y,h[1],h[3]); if(Math.hypot(x-cx,y-cy)<r){ damageBoss(S,dmg,h[4]); break; } }
  if(hurtsPlayers) for(const p of S.players){ if(p.st!=='alive')continue; const q=pBox(p);
    if(Math.hypot(clamp(x,q[0],q[2])-x,clamp(y,q[1],q[3])-y)<r*.8) hurtPlayer(S,p); } }

/* ----------------------------- player weapons ----------------------------- */
function aimVec(p){ switch(p.aim){ case 'up':return [0,-1]; case 'diag':return [p.face*.7071,-.7071]; case 'down':return [0,1]; default:return [p.face,0]; } }
function muzzle(p){ const [dx,dy]=aimVec(p), len=GUNLEN[p.weapon], sx=p.x+p.face*2, sy=p.y-(p.crouch?5:12); return [sx+dx*len,sy+dy*len,dx,dy]; }
function useAmmo(p,n){ p.ammo-=n; if(p.ammo<=0){ p.weapon='pistol'; p.ammo=-1; p.burst=0; } }
function knifeTarget(S,p){ const fx_=p.x+p.face*9;
  for(const e of S.enemies){ if(e.dead||e.dying||ENEMY[e.t].air)continue;
    if(Math.abs(e.x-fx_)<e.w/2+5&&Math.abs(ecy(e)-(p.y-(p.crouch?6:9)))<e.h/2+6) return e; }
  return null; }
function tryFire(S,p,pr){ if(p.fireCd>0)return;
  if(p.aim==='fwd'||p.aim==='diag'){ const kt=knifeTarget(S,p);
    if(kt){ p.fireCd=14; p.knifeT=8; fx('knife',p.x+p.face*12,p.y-12); damageEnemy(S,kt,4,p.face*3); S.hitstop=Math.max(S.hitstop,2); return; } }
  const w=p.weapon, [mx,my,dx,dy]=muzzle(p); p.shootT=5; p.recoil=(w==='S'||w==='R')?3:1.5; const o=p.id;
  if(w==='pistol'){ S.pb.push({k:'b',x:mx,y:my,vx:dx*5.5,vy:dy*5.5,life:70,dmg:1,o}); fx('sfx','pistol'); p.fireCd=5; }
  else if(w==='H'){ const a=Math.atan2(dy,dx)+rnd(-.06,.06); S.pb.push({k:'h',x:mx,y:my,vx:Math.cos(a)*6.2,vy:Math.sin(a)*6.2,life:70,dmg:1,o});
    fx('sfx','hmg'); fx('casing',p.x,p.y-12,-p.face); p.fireCd=4; if(pr)p.burst=3; useAmmo(p,1); }
  else if(w==='S'){ for(let i=0;i<7;i++){ const a=Math.atan2(dy,dx)+rnd(-.42,.42), sp=rnd(4.2,6);
      S.pb.push({k:'s',x:mx,y:my,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:rnd(9,14)|0,dmg:2,pierce:1,o}); }
    fx('sfx','shot'); fx('shake',4); p.fireCd=24; useAmmo(p,1); }
  else if(w==='R'){ S.pb.push({k:'r',x:mx,y:my,ang:Math.atan2(dy,dx),sp:1.4,vx:dx*1.4,vy:dy*1.4,life:120,dmg:6,o}); fx('sfx','rocket'); p.fireCd=18; useAmmo(p,1); }
  else if(w==='F'){ const a=Math.atan2(dy,dx)+rnd(-.08,.08);
    S.pb.push({k:'f',x:mx,y:my,vx:Math.cos(a)*3.4+p.vx*.5,vy:Math.sin(a)*3.4-.15,life:22,max:22,dmg:1,pierce:99,hs:[],o});
    if(S.t%4===0)fx('sfx','flame'); p.fireCd=3; if(pr)p.burst=7; useAmmo(p,1); } }
function throwBomb(S,p){ if(p.bombs<=0)return; p.bombs--; fx('sfx','nade');
  S.nades.push({x:p.x+p.face*4,y:p.y-14,vx:p.face*2.4+p.vx*.4,vy:-3.6,bounces:0,o:p.id}); }

/* ----------------------------- tanks ----------------------------- */
function boardTank(S,p,i){ const T=S.tanks[i]; p.tank=i; T.drv=p.id; T.st='driven'; T.face=p.face; p.vx=p.vy=0; p._T=T;
  fx('callout','RHINO!'); fx('sfx','pickup'); }
function ejectTank(S,T,forced){ const p=S.players[T.drv]; T.drv=-1; T.st=forced?'dying':'parked'; T.boardCd=45; T.vx=0; T.burst=0;
  if(!p)return; p.tank=-1; p._T=null; p.x=T.x; p.y=T.y-22; p.vy=-6.5; p.vx=-T.face*.6; p.onGround=false; p.inv=Math.max(p.inv,forced?100:30); fx('sfx','jump'); }
function hitTank(S,T){ if(!T||T.inv>0||T.st!=='driven')return; T.hp--; T.inv=60; T.flash=6; S.hitstop=Math.max(S.hitstop,3);
  fx('shake',5); fx('sfx','shell'); fx('spark',T.x,T.y-12,'#ffb03a',10); if(T.hp<=0){ fx('callout','EJECT!'); ejectTank(S,T,true); } }
function updateTank(S,T,i){
  if(T.st==='gone')return;
  if(T.inv>0)T.inv--; if(T.flash>0)T.flash--; if(T.boardCd>0)T.boardCd--; T.fireCd--; T.shootT--; T.recoil*=.6;
  if(T.st==='dying'){ T.dieT++; if(T.dieT%5===0)fx('spark',T.x+rnd(-10,10),T.y-rnd(4,20),'#ffb03a',4);
    if(T.dieT>50){ explode(S,T.x,T.y-10,40,12,false); fx('chunks',T.x,T.y-10,20); T.st='gone'; } return; }
  const p=T.drv>=0?S.players[T.drv]:null, drv=T.st==='driven'&&p&&p.st==='alive';
  if(drv){ const L=inp(p,B_L), R=inp(p,B_R), U=inp(p,B_U), D=inp(p,B_D);
    if(L&&!R){ T.vx=Math.max(T.vx-.25,-1.6); T.face=-1; } else if(R&&!L){ T.vx=Math.min(T.vx+.25,1.6); T.face=1; } else T.vx*=.8;
    T.aim=U?Math.min(T.aim+.12,Math.PI/2):Math.max(T.aim-.12,0);
    if(tap(p,B_JUMP)){ if(D||inp(p,B_BOMB)){ ejectTank(S,T,false); return; }
      if(T.onGround){ T.vy=-6; T.onGround=false; fx('sfx','jump'); fx('dust',T.x,T.y); } }
    if(tap(p,B_FIRE))T.burst=3;
    if(T.burst>0&&T.fireCd<=0){ T.burst--; T.fireCd=4; T.shootT=4;
      const dx=Math.cos(T.aim)*T.face, dy=-Math.sin(T.aim), j=rnd(-.05,.05);
      S.pb.push({k:'h',x:T.x+dx*14,y:T.y-19+dy*10,vx:(dx*Math.cos(j)-dy*Math.sin(j))*6.4,vy:(dx*Math.sin(j)+dy*Math.cos(j))*6.4,life:70,dmg:2,o:p.id}); fx('sfx','hmg'); }
    if(tap(p,B_BOMB)&&!D&&T.shells>0&&T.fireCd<=0){ T.shells--; T.fireCd=18; T.recoil=4; fx('shake',4);
      S.pb.push({k:'c',x:T.x+T.face*20,y:T.y-15,vx:T.face*5,vy:-.6,life:90,dmg:0,o:p.id}); fx('sfx','shot'); }
    if(T.onGround)T.tread+=T.vx;
    for(const e of S.enemies){ if(e.dead||e.dying||(e.t!=='walker'&&e.t!=='mine'&&e.t!=='jumper'&&e.t!=='shield'))continue;           // squash
      if(Math.abs(e.x-T.x)<18&&Math.abs(e.y-T.y)<10&&(Math.abs(T.vx)>.4||T.vy>1)) damageEnemy(S,e,99,T.face*2); }
  } else { T.vx*=.85; if(T.st==='driven'){ T.st='parked'; T.drv=-1; } }
  const py=moveBody(S,T,false);
  if(T.onGround&&py<T.y-4)fx('shake',2);
  if(T.onGround&&!isGap(S,T.x-14)&&!isGap(S,T.x+14))T.safeX=T.x;
  if(T.y>GROUND+20){ const d=T.drv>=0?S.players[T.drv]:null; T.st='gone'; fx('boom',T.x,GROUND,1);
    if(d){ d.tank=-1; d._T=null; d.x=T.safeX; d.y=GROUND-30; d.vy=-4; d.inv=100; } return; }
  if(drv){ T.x=clamp(T.x,S.cam.x+16,S.arenaR!=null?Math.min(S.cam.x+W-16,S.arenaR-12):S.cam.x+W-16); p.x=T.x; p.y=T.y; p.vx=T.vx; p.vy=T.vy; p.onGround=T.onGround; p.face=T.face; }
  else if(T.st==='parked'&&T.boardCd<=0) for(const q of S.players){
    if(q.st==='alive'&&q.tank<0&&!q.onGround&&Math.abs(q.x-T.x)<17&&q.y>T.y-30&&q.y<=T.y){ boardTank(S,q,i); break; } } }

/* ----------------------------- players ----------------------------- */
function respawnFromPit(S,p){
  let x=clamp(p.safeX,S.cam.x+14,S.cam.x+W-14);
  for(let k=0;k<200&&isGap(S,x);k++) x+=(k%2?-1:1)*k*2;             // nearest solid ground
  p.x=x; p.y=-12; p.vx=0; p.vy=0; p.inv=Math.max(p.inv,90); }
function updatePlayer(S,p){
  if(p.st==='gone')return;
  if(p.st==='ghost'){ p.ghostT++; p.y-=.35; p.x+=Math.sin(p.ghostT*.08)*.4;
    for(const q of S.players){ if(q===p||q.st!=='alive')continue; const qy=q.tank>=0?q.y-14:q.y-10;
      if(Math.abs(q.x-p.x)<13&&Math.abs(qy-p.y)<16){ p.st='alive'; p.hp=1; p.inv=120; p.vy=-2; p.bombs=Math.max(p.bombs,3); fx('revive',p.x,p.y,p.id); break; } }
    if(p.y<-18&&p.st==='ghost'){ p.st='gone'; } return; }
  if(p.tank>=0){ p.inv--; p.fireCd--; return; }
  const L=inp(p,B_L), R=inp(p,B_R), U=inp(p,B_U), D=inp(p,B_D), ice=S.L.ice;
  p.crouch=p.onGround&&D; const maxs=p.crouch?.9:2.1, acc=ice?.14:.45, fr=ice?.965:.7;
  if(L&&!R){ p.vx=Math.max(p.vx-acc,-maxs); p.face=-1; } else if(R&&!L){ p.vx=Math.min(p.vx+acc,maxs); p.face=1; } else p.vx*=fr;
  if(Math.abs(p.vx)>maxs)p.vx*=.8;
  if(U) p.aim=((L||R)&&p.weapon!=='pistol')?'diag':'up'; else if(D&&!p.onGround) p.aim='down'; else p.aim='fwd';
  if(tap(p,B_JUMP))p.jbuf=7;
  if(p.jbuf>0&&(p.onGround||p.coyote>0)){
    if(D&&p.onPlat){ p.dropT=12; p.y+=2; p.jbuf=0; }
    else { p.vy=-6.2; p.onGround=false; p.coyote=0; p.jbuf=0; fx('sfx','jump'); fx('dust',p.x,p.y); } }
  if(tap(p,B_FIRE))tryFire(S,p,true); else if(p.burst>0&&p.fireCd<=0){ p.burst--; tryFire(S,p,false); }
  if(tap(p,B_BOMB))throwBomb(S,p);
  const py=moveBody(S,p,p.dropT>0);
  if(p.onGround&&py<GROUND-4&&p.y>=GROUND)fx('dust',p.x,GROUND);
  if(p.onGround&&!p.onPlat) for(const c of S.L.conv) if(p.x>c.x&&p.x<c.x+c.w) p.x+=c.d*.6;
  if(p.onGround){ p.coyote=6; if(!isGap(S,p.x-10)&&!isGap(S,p.x+10))p.safeX=p.x; } else p.coyote--;
  if(Math.abs(p.vx)>.3&&p.onGround)p.runT++;
  p.jbuf--; p.fireCd--; p.inv--; p.dropT--; p.shootT--; p.knifeT--; p.recoil*=.6;
  if(p.y>H+12){ fx('sfx','fall');
    if(!S.god&&p.inv<=0){ p.hp--; p.hits++; S.stats.hits++; fx('hurt',p.x,H-4,p.id,p.hp); }
    if(p.hp<=0){ respawnFromPit(S,p); p.y=GROUND-12; downPlayer(S,p); } else respawnFromPit(S,p); }
}

/* ----------------------------- crates / POWs ----------------------------- */
function dropCrate(S,x,y,type){ S.crates.push({x,y,vy:-2.5,type:type||pick(['H','H','S','R','F','B','B','+']),life:900}); }
function getCrate(S,p,t){ fx('sfx','pickup');
  if(t==='+'){ p.hp=Math.min(p.hp+1,PHP); fx('callout','HEALTH!'); return; }
  if(t==='B'){ if(p.tank>=0){ const T=S.tanks[p.tank]; T.shells=Math.min(T.shells+10,99); fx('callout','CANNON!'); }
    else { p.bombs=Math.min(p.bombs+10,99); fx('callout','BOMB!'); } return; }
  if(p.weapon===t)p.ammo+=AMMO[t]; else { p.weapon=t; p.ammo=AMMO[t]; }
  fx('callout',{H:'HEAVY MACHINE GUN!',S:'SHOTGUN!',R:'ROCKET LAUNCHER!',F:'FLAME SHOT!'}[t]); }

/* ----------------------------- enemies ----------------------------- */
function makeEnemy(S,t,x,y,dir){ const d=ENEMY[t], m=S.L.dmul*(S.np>1?1.3:1);
  const e={id:S.eid++,t,x,y:y!=null?y:GROUND,w:d.w,h:d.h,hp:Math.ceil(d.hp*m),dir:dir||-1,tm:0,fireCd:ri(40,110),flash:0,walkT:0,
    vx:0,vy:0,dead:false,dying:false,onGround:false};
  if(t==='walker'){ e.spd=rnd(.45,.65); e.pause=0; e.aimT=0; e.swipe=0; e.swipeCd=0; }
  else if(t==='heavy'){ e.spd=.28; e.bN=0; e.bT=0; }
  else if(t==='drone'){ e.y=GROUND-rnd(52,70); e.bob=rnd(0,6); e.off=rnd(-50,50); }
  else if(t==='jumper'){ e.hopCd=ri(20,60); }
  else if(t==='turret'){ e.fireCd=ri(50,90); e.ang=Math.PI; e.bN=0; e.bT=0; }
  else if(t==='bike'){ e.spd=2.8; }
  else if(t==='bomber'){ e.y=GROUND-92; e.spd=1.1; e.dropCd=20; }
  else if(t==='shield'){ e.spd=.35; e.pause=0; e.aimT=0; e.swipe=0; e.swipeCd=0; e.fireCd=ri(120,200); }
  else if(t==='mine'){ e.spd=.75; e.arm=0; }
  else if(t==='pod'){ e.y=y!=null?y:-20; e.st='warn'; e.warnT=40; e.openT=30; }
  return e; }
function spawnWave(S,t){
  for(const s of t.e){ let x,y=null,dir=-1;
    if(s.ax!=null){ x=s.ax; if(s.ay!=null)y=s.ay; if(s.t==='pod')y=-24; }
    else if(s.off==='L'){ x=S.cam.x-14-rnd(0,24); dir=1;
      if(!ENEMY[s.t].air){ let blocked=false; for(let gx=x;gx<S.cam.x+60;gx+=4)if(isGap(S,gx)){ blocked=true; break; }
        if(blocked){ x=S.cam.x+W+14+rnd(0,20); dir=-1; } } }            // never strand a flanker behind a pit
    else x=S.cam.x+W+14+s.off;
    const e=makeEnemy(S,s.t,x,y,dir); S.enemies.push(e); t.group.push(e.id); } }
function groundWalk(S,e,v){ const nx=e.x+v; if(v!==0&&isGap(S,nx+sgn(v)*6))return false; e.x=nx; return true; }
function ebul(S,o){ S.eb.push(Object.assign({g:0,r:1,exp:0,life:200},o)); }
function updateEnemy(S,e){
  if(e.flash>0)e.flash--; e.tm++;
  if(e.dying){ e.vy+=.15; e.y+=e.vy; e.x+=e.dir*.6; e.spin=(e.spin||0)+.3; if(e.tm%4===0)fx('smoke',e.x,e.y);
    if(e.y>=GROUND-3){ e.dead=true; fx('boom',e.x,GROUND-4,0); fx('chunks',e.x,GROUND-4,6); if(RAND()<.12)dropCrate(S,e.x,GROUND-10); } return; }
  const P=tgt(S,e), vis=onScreen(S,e), dist=P?Math.abs(P.x-e.x):999, fm=S.L.fire;
  const offs=e.x>S.cam.x+W-12?-1:e.x<S.cam.x+12?1:0;      // ground units never loiter off-screen (soft-lock guard)
  switch(e.t){
  case 'walker': case 'shield': {
    if(P)e.dir=P.x<e.x?-1:1; if(e.swipeCd>0)e.swipeCd--;
    const mv=offs||(dist>(e.t==='shield'?24:40)?e.dir:0);
    if(e.pause>0&&!offs)e.pause--; else if(mv){ if(groundWalk(S,e,mv*e.spd*(offs?1.6:1)))e.walkT++; }
    if(vis&&P&&--e.fireCd<=0){ e.fireCd=ri(e.t==='shield'?150:90,e.t==='shield'?230:160)/fm; e.pause=24; e.aimT=22; }
    if(e.aimT>0){ e.aimT--; if(e.aimT===0){ ebul(S,{k:'bolt',x:e.x+e.dir*7,y:e.y-11,vx:e.dir*2.2,vy:0,life:170}); fx('sfx','laser'); } }
    if(P&&!(e.swipe>0)&&!(e.swipeCd>0)&&dist<13&&Math.abs(P.y-e.y)<14)e.swipe=18;
    if(e.swipe>0){ e.swipe--; if(e.swipe===0){ e.swipeCd=40; if(P&&Math.abs(P.x-e.x)<14&&Math.abs(P.y-e.y)<14){ fx('sfx','knife'); hurtPlayer(S,P); } } }
    e.vx=0; moveBody(S,e,true); break; }
  case 'heavy': {
    if(P)e.dir=P.x<e.x?-1:1; { const mv=offs||(dist>70?e.dir:0); if(mv&&groundWalk(S,e,mv*e.spd*(offs?2:1)))e.walkT++; }
    if(vis&&P&&--e.fireCd<=0){ e.fireCd=ri(100,160)/fm;
      if(RAND()<.5){ const dx=P.x-e.x, t=clamp(Math.abs(dx)/55,1,3.2); ebul(S,{k:'shell',x:e.x+e.dir*6,y:e.y-24,vx:sgn(dx)*t,vy:-3.6,g:.12,exp:16,r:2}); fx('sfx','shell'); }
      else { e.bN=3; e.bT=0; } }
    if(e.bN>0&&--e.bT<=0){ e.bN--; e.bT=8; ebul(S,{k:'bolt',x:e.x+e.dir*12,y:e.y-14,vx:e.dir*2.6,vy:0,life:170}); fx('sfx','laser'); }
    if(P&&dist<e.w/2&&P.y>e.y-e.h+4)hurtPlayer(S,P);
    e.vx=0; moveBody(S,e,true); break; }
  case 'drone': {
    e.bob+=.06; if(P){ let tx=clamp(P.x+e.off,S.cam.x+14,S.cam.x+W-14);          // stays on screen…
      for(const g of S.L.gaps) if(tx>g[0]-8&&tx<g[1]+8) tx=P.x<(g[0]+g[1])/2?g[0]-10:g[1]+10;   // …and never camps over a pit
      e.x+=clamp(tx-e.x,-.9,.9); e.dir=P.x<e.x?-1:1; }
    e.y=GROUND-62+Math.sin(e.bob)*6;
    if(vis&&P&&--e.fireCd<=0){ e.fireCd=ri(70,130)/fm; ebul(S,{k:'orb',x:e.x,y:e.y+4,vx:(P.x-e.x)*.008,vy:1.1,r:1.5}); fx('sfx','orb'); }
    break; }
  case 'jumper': {
    if(P)e.dir=P.x<e.x?-1:1;
    if(e.onGround){ e.vx=0; if(--e.hopCd<=0&&P&&(vis||offs)){ e.vy=-rnd(4.4,5.6); e.vx=(offs||e.dir)*rnd(1.4,2.1); e.hopCd=ri(36,70)/fm; e.onGround=false; fx('sfx','hop'); } }
    moveBody(S,e,false); if(P&&rectsOverlap([e.x-6,e.y-12,e.x+6,e.y],pBox(P)))hurtPlayer(S,P); break; }
  case 'turret': {
    if(P){ const a=Math.atan2((P.y-10)-(e.y-8),P.x-e.x); e.ang=a; e.dir=Math.cos(a)<0?-1:1; }
    if(vis&&P&&--e.fireCd<=0){ e.fireCd=ri(100,140)/fm; e.bN=3; e.bT=0; }
    if(e.bN>0&&--e.bT<=0){ e.bN--; e.bT=9; ebul(S,{k:'shot',x:e.x+Math.cos(e.ang)*8,y:e.y-8+Math.sin(e.ang)*8,vx:Math.cos(e.ang)*2.3,vy:Math.sin(e.ang)*2.3,r:1.5}); fx('sfx','laser'); }
    break; }
  case 'bike': {
    e.vx=e.dir*e.spd; e.walkT++; moveBody(S,e,true);
    if(P&&rectsOverlap([e.x-9,e.y-12,e.x+9,e.y],pBox(P)))hurtPlayer(S,P);
    if(e.y>H+10)e.dead=true; break; }
  case 'bomber': {
    e.x+=e.dir*e.spd; e.walkT++;
    if(P&&--e.dropCd<=0&&Math.abs(P.x-e.x)<70&&vis){ e.dropCd=34/fm; ebul(S,{k:'bomb',x:e.x,y:e.y+5,vx:e.dir*.6,vy:0,g:.16,exp:18,r:2}); fx('sfx','nade'); }
    if((e.dir<0&&e.x<S.cam.x-40)||(e.dir>0&&e.x>S.cam.x+W+40))e.dead=true; break; }
  case 'mine': {
    if(e.arm>0){ if(--e.arm===0){ e.dead=true; S.cause='blast:mine'; explode(S,e.x,e.y-3,20,4,true); S.cause=''; } break; }
    if(P){ e.dir=P.x<e.x?-1:1; if(dist>2)groundWalk(S,e,e.dir*e.spd); e.walkT++; if(dist<12&&Math.abs(P.y-e.y)<16){ e.arm=24; fx('sfx','arm'); } }
    e.vx=0; moveBody(S,e,true); break; }
  case 'pod': {
    if(e.st==='warn'){ if(--e.warnT<=0){ e.st='fall'; fx('sfx','pod'); } }
    else if(e.st==='fall'){ e.vy=Math.min(e.vy+.25,5); const py=e.y; e.y+=e.vy; const ty=landY(S,e.x,py,e.y,false);
      if(ty!==null){ e.y=ty; e.st='land'; fx('boom',e.x,ty-4,0); fx('shake',4); hurtRect(S,[e.x-8,ty-16,e.x+8,ty]); }
      else if(e.y>H+20)e.dead=true; }
    else if(--e.openT<=0){ e.dead=true; fx('sfx','pod'); for(const d of [-1,1]){ const w=makeEnemy(S,'walker',e.x+d*8,e.y,d); S.enemies.push(w);
        for(const t of S.trig) if(t.group.includes(e.id))t.group.push(w.id); } }
    break; }
  }
  if(e.y>H+12&&!ENEMY[e.t].air)e.dead=true;
  if(e.x<S.cam.x-90&&e.t!=='bomber')e.dead=true;
  /* soft-lock safety net: a unit that can't get on screen during a locked fight for 5s is retired */
  if(S.cam.lock!==null&&(e.x<S.cam.x-6||e.x>S.cam.x+W+6)){ if(++e.offT>300)e.dead=true; } else e.offT=0;
}

/* ----------------------------- hazards ----------------------------- */
function updateHazards(S){
  for(const h of S.hz){
    if(h.k==='crush'){ const t=(S.t+h.off)%h.per, up=h.per-70; let ph;
      if(t<up){ ph='up'; h.cy=12; } else if(t<up+30){ ph='warn'; h.cy=12; } else if(t<up+40){ ph='slam'; h.cy=lerp(12,GROUND,(t-up-30)/10); }
      else if(t<up+58){ ph='hold'; h.cy=GROUND; } else { ph='rise'; h.cy=lerp(GROUND,12,(t-up-58)/12); }
      if(ph==='hold'&&h.ph!=='hold'){ fx('shake',4); fx('sfx','slam'); fx('dust',h.x+h.w/2,GROUND); }
      h.ph=ph;
      if(ph==='slam'||ph==='hold'){ const r=[h.x,0,h.x+h.w,h.cy]; hurtRect(S,r);
        for(const e of S.enemies) if(!e.dead&&!ENEMY[e.t].air&&e.x>h.x&&e.x<h.x+h.w&&e.y-e.h<h.cy)killEnemy(S,e); } }
    else if(h.k==='icicle'){
      if(h.st==='hang'){ if(S.players.some(p=>p.st==='alive'&&Math.abs(p.x-h.x)<34)){ h.st='shake'; h.t=30; } }
      else if(h.st==='shake'){ if(--h.t<=0){ h.st='fall'; h.vy=0; } }
      else if(h.st==='fall'){ h.vy+=.35; h.y+=h.vy; hurtAt(S,h.x,h.y,3);
        if(h.y>=GROUND-2){ h.st='gone'; h.t=260; fx('shatter',h.x,GROUND-3); } }
      else if(--h.t<=0){ h.st='hang'; h.y=12; } }
    else if(h.k==='laser'){ const t=(S.t+h.off)%h.per; h.ph=t<h.per-90?'off':t<h.per-50?'warn':'on';
      if(h.ph==='on') for(const p of S.players) if(p.st==='alive'&&Math.abs(p.x-h.x)<4)hurtPlayer(S,p); } } }

/* ----------------------------- boss plumbing ----------------------------- */
function spawnBoss(S){ const B=BOSSES[S.L.boss]; const b=B.spawn(S); b.id=S.L.boss; b.flash=0; b.dieT=0; b.hb=[]; b.cr=[]; b.armor=[];
  b.maxhp=b.hp=Math.ceil(B.hp*(S.np>1?1.5:1)*(b.hpMul||1)); if(b.parts)for(const pt of b.parts){ pt.maxhp=pt.hp=Math.ceil(b.maxhp/b.parts.length); }
  S.boss=b; fx('music','boss'); fx('sfx','roar'); fx('callout',B.name||'BOSS'); }
function damageBoss(S,d,part){ const b=S.boss; if(!b||b.st==='dying'||b.st==='enter')return;
  if(b.pods&&part!=null&&part>=0){ const pd=b.pods[part]; if(pd&&pd.hp>0){ pd.hp-=d; pd.flash=3; if(pd.hp<=0){ fx('boom',pd.x,pd.y,1); S.stats.score+=800; } } return; }
  if(b.parts&&part!=null&&part>=0){ const pt=b.parts[part]; if(!pt||pt.hp<=0)return; pt.hp-=d; pt.flash=3;
    if(pt.hp<=0){ pt.hp=0; fx('boom',pt.x,pt.y,1); fx('chunks',pt.x,pt.y,14); }
    b.hp=b.parts.reduce((s,q)=>s+Math.max(0,q.hp),0); }
  else b.hp-=(part===-2?d*.35:d);                      // -2 = armoured body segment (serpent)
  b.flash=3; if(S.t%3===0)fx('sfx','bhit');
  if(b.hp<=0){ b.hp=0; b.st='dying'; b.tm=0; S.stats.score+=10000; fx('callout','DESTROYED!'); fx('music','stop'); } }
function bossHit(S,x,y){ const b=S.boss; if(!b||b.st==='dying')return null;
  for(const h of b.hb) if(x>h[0]&&x<h[2]&&y>h[1]&&y<h[3]) return {part:h[4]==null?-1:h[4]};
  for(const a of b.armor) if(x>a[0]&&x<a[2]&&y>a[1]&&y<a[3]) return {armor:true};
  return null; }
function updateBossCommon(S){ const b=S.boss; if(!b)return; if(b.flash>0)b.flash--;
  if(b.parts)for(const pt of b.parts)if(pt.flash>0)pt.flash--; if(b.pods)for(const pd of b.pods)if(pd.flash>0)pd.flash--;
  if(b.st==='dying'){ b.tm++; b.hb=[]; b.cr=[];
    if(b.tm%6===0){ fx('boom',b.cx+rnd(-24,24),b.cy+rnd(-20,20),RAND()<.3?1:0); fx('chunks',b.cx+rnd(-20,20),b.cy+rnd(-16,16),4); }
    if(b.tm===110){ fx('flash',24); fx('boom',b.cx,b.cy,1); fx('chunks',b.cx,b.cy,30); }
    if(b.tm>150){ S.boss=null; finishLevel(S); } return; }
  BOSSES[b.id].update(S,b);
  for(const r of b.cr) hurtRect(S,r); }

/* ----------------------------- results ----------------------------- */
function finishLevel(S){ S.phase='clear'; S.endT=0; fx('clear');
  const secs=S.stats.frames/60, par=S.L.par;
  const timePts=secs<=par?30:Math.max(0,30*(1-(secs-par)/par));
  const hitPts=Math.max(0,30-10*(S.stats.hits/S.np));
  const powPts=S.stats.powsTotal?20*S.stats.pows/S.stats.powsTotal:20*(S.checkpoint?0:1);
  const tryPts=S.retries===0?20:S.retries===1?10:0;
  const pts=Math.round(timePts+hitPts+powPts+tryPts);
  S.result={secs:Math.round(secs),hits:S.stats.hits,pows:S.stats.pows,powsTotal:S.stats.powsTotal,retries:S.retries,
    timePts:Math.round(timePts),hitPts:Math.round(hitPts),powPts:Math.round(powPts),tryPts,pts,grade:gradeOf(pts),score:S.stats.score}; }

/* ----------------------------- the step ----------------------------- */
function simStep(S,masks){
  S.t++;
  for(let i=0;i<S.players.length;i++){ const p=S.players[i], m=masks[i]|0; p.hit=m&~p.prev; p.in=m; p.prev=m;
    p._T=p.tank>=0?S.tanks[p.tank]:null; }
  if(S.phase!=='play'){ S.endT++; return; }
  if(S.hitstop>0){ S.hitstop--; return; }
  S.stats.frames++;

  for(let i=0;i<S.tanks.length;i++)updateTank(S,S.tanks[i],i);
  for(const p of S.players)updatePlayer(S,p);

  /* camera: forward only, keeps every living player on screen */
  const al=alivePlayers(S);
  if(al.length){ let mx=-1e9, mn=1e9; for(const p of al){ mx=Math.max(mx,p.x); mn=Math.min(mn,p.x); }
    let want=Math.min(mx-W*.42,mn-14); if(want>S.cam.x)S.cam.x+=(want-S.cam.x)*.18; }
  if(S.L.auto&&S.cam.lock===null&&!S.bossSeq)S.cam.x+=S.L.auto;
  S.cam.x=clamp(S.cam.x,0,S.cam.lock!==null?S.cam.lock:S.L.len-W);
  const right=S.arenaR!=null?Math.min(S.cam.x+W-6,S.arenaR):S.cam.x+W-6;
  for(const p of S.players){ if(p.st!=='alive'||p.tank>=0)continue; p.x=clamp(p.x,S.cam.x+6,right); }

  /* waves + locks */
  for(const t of S.trig){
    if(!t.fired&&S.cam.x+W>=t.x){ t.fired=true; spawnWave(S,t); if(t.lock)S.cam.lock=S.cam.x; }
    if(t.fired&&!t.cleared&&t.group.every(id=>!S.enemies.some(e=>e.id===id&&!e.dead))){
      t.cleared=true; if(t.lock&&!S.bossSeq){ S.cam.lock=null; S.goT=150; fx('go'); } } }
  if(!S.bossSeq&&S.cam.x>=S.L.len-W-2){ S.bossSeq=true; S.checkpoint=true; S.cam.lock=S.L.len-W; S.warnT=170; fx('warn'); fx('music','stop'); }
  if(S.warnT>0){ S.warnT--; if(S.warnT%40===0)fx('sfx','siren');
    if(S.warnT===90){ dropCrate(S,S.cam.x+W*.35,-10,pick(['H','R','S'])); dropCrate(S,S.cam.x+W*.55,-30,'B'); }
    if(S.warnT===0)spawnBoss(S); }
  if(S.goT>0)S.goT--;
  updateBossCommon(S);
  if(S.phase!=='play')return;
  updateHazards(S);

  /* player bullets */
  for(const b of S.pb){
    if(b.k==='r'){ b.sp=Math.min(6,b.sp*1.08); let best=null,bd=1e9;
      const cand=S.enemies.filter(e=>!e.dead&&!e.dying).map(e=>[e.x,ecy(e)]); if(S.boss&&S.boss.hb.length)cand.push([(S.boss.hb[0][0]+S.boss.hb[0][2])/2,(S.boss.hb[0][1]+S.boss.hb[0][3])/2]);
      for(const [ex,ey] of cand){ const d=Math.hypot(ex-b.x,ey-b.y), diff=((Math.atan2(ey-b.y,ex-b.x)-b.ang+Math.PI*3)%TAU)-Math.PI;
        if(Math.abs(diff)<1.1&&d<bd){ bd=d; best=diff; } }
      if(best!==null)b.ang+=clamp(best,-.07,.07); b.vx=Math.cos(b.ang)*b.sp; b.vy=Math.sin(b.ang)*b.sp; if(S.t%2===0)fx('trail',b.x,b.y); }
    if(b.k==='f'){ b.vy-=.02; b.vx*=.97; } if(b.k==='c')b.vy+=.08;
    b.x+=b.vx; b.y+=b.vy; b.life--;
    const boomy=b.k==='r'||b.k==='c', bR=b.k==='c'?32:24, bD=b.k==='c'?12:6;
    let done=false;
    for(const e of S.enemies){ if(e.dead||e.dying)continue; if(!eHit(e,b.x,b.y,b.k==='f'?3:0))continue;
      if(b.k==='f'){ if(!b.hs.includes(e.id)){ b.hs.push(e.id); damageEnemy(S,e,1,0); } continue; }
      if(boomy){ explode(S,b.x,b.y,bR,bD,false); b.life=0; done=true; break; }
      if(e.t==='shield'&&b.vx*e.dir<0&&Math.abs(b.vy)<2.5){ fx('clink',b.x,b.y); b.life=0; done=true; break; }
      damageEnemy(S,e,b.dmg,sgn(b.vx)*(b.k==='s'?2:.4)); fx('spark',b.x,b.y,'#fff',3);
      if(b.pierce>0)b.pierce--; else { b.life=0; done=true; break; } }
    if(!done&&b.life>0){ const bh=bossHit(S,b.x,b.y);
      if(bh){ if(bh.armor){ if(b.k!=='f'){ fx('clink',b.x,b.y); b.life=0; } }
        else if(b.k==='f'){ if(!b.hs.includes('B')){ b.hs.push('B'); damageBoss(S,1,bh.part); } }
        else if(boomy){ explode(S,b.x,b.y,bR,bD,false); b.life=0; }
        else { damageBoss(S,b.dmg,bh.part); fx('spark',b.x,b.y,'#fff',3); if(b.pierce>0)b.pierce--; else b.life=0; } } }
    if(boomy&&b.life>0&&(b.y>=GROUND-1&&!isGap(S,b.x)||b.life<=1)){ explode(S,b.x,Math.min(b.y,GROUND-2),bR,bD,false); b.life=0; }
    if(!boomy&&b.k!=='f'&&b.y>GROUND+1&&!isGap(S,b.x)){ b.life=0; fx('spark',b.x,GROUND,'#a98',2); }
    for(const pw of S.pows) if(pw.st==='tied'&&b.life>0&&Math.abs(b.x-pw.x)<5&&b.y>GROUND-16&&b.y<GROUND){ freePow(S,pw); if(b.k!=='f')b.life=0; }
    if(b.x<S.cam.x-20||b.x>S.cam.x+W+20||b.y<-30||b.y>H+10)b.life=0; }
  S.pb=S.pb.filter(b=>b.life>0);

  /* grenades: bounce once, then boom */
  for(const n of S.nades){ n.vy+=.3; n.x+=n.vx; n.y+=n.vy;
    let hit=S.enemies.some(e=>!e.dead&&!e.dying&&eHit(e,n.x,n.y,1))||!!(bossHit(S,n.x,n.y));
    if(n.y>=GROUND-1&&!isGap(S,n.x)){ n.y=GROUND-1; if(n.bounces++>=1)hit=true; else { n.vy=-2.2; n.vx*=.6; } }
    if(hit){ explode(S,n.x,n.y-3,26,8,false); n.done=true; }
    if(n.y>H+10)n.done=true; }
  S.nades=S.nades.filter(n=>!n.done&&n.x>S.cam.x-30&&n.x<S.cam.x+W+30);

  for(const e of S.enemies)if(!e.dead)updateEnemy(S,e);
  S.enemies=S.enemies.filter(e=>!e.dead);

  /* enemy fire */
  for(const b of S.eb){ b.vy+=b.g; b.x+=b.vx; b.y+=b.vy; b.life--;
    if(b.tx!=null&&b.k==='missile'&&b.y>=GROUND-2){ S.cause='blast:missile'; explode(S,b.x,GROUND-3,b.exp||16,3,true); S.cause=''; b.life=0; continue; }
    if(b.exp&&b.y>=GROUND-1&&!isGap(S,b.x)){ S.cause='blast:'+b.k; explode(S,b.x,GROUND-3,b.exp,3,true); S.cause=''; b.life=0; continue; }
    if(!b.exp&&(b.k==='orb'||b.k==='acid'||b.k==='shard'||b.k==='spark')&&b.y>=GROUND-1&&!isGap(S,b.x)){ fx('spark',b.x,GROUND-1,'#f6c',5); b.life=0; continue; }
    S.cause='shot:'+b.k; const hh=hurtAt(S,b.x,b.y,b.r); S.cause='';
    if(hh){ b.life=0; if(b.exp)explode(S,b.x,b.y,b.exp*.6,0,false); }
    if(b.x<S.cam.x-30||b.x>S.cam.x+W+30||b.y>H+20)b.life=0; }
  S.eb=S.eb.filter(b=>b.life>0);

  /* ground shockwaves (jump them) */
  for(const w of S.waves){ w.x+=w.dir*(w.spd||2.4); w.life--; if(S.t%2===0)fx('spark',w.x,GROUND-1,'#fa6',2);
    for(const p of S.players) if(p.st==='alive'&&p.onGround&&Math.abs(p.x-w.x)<6)hurtPlayer(S,p); }
  S.waves=S.waves.filter(w=>w.life>0&&w.x>S.cam.x-10&&w.x<S.cam.x+W+10);

  /* crates */
  for(const c of S.crates){ const py=c.y; c.vy+=.2; c.y+=c.vy;
    if(c.vy>0){ const ty=landY(S,c.x,py,c.y,false); if(ty!==null){ c.y=ty; c.vy=0; } } c.life--;
    for(const p of S.players) if(p.st==='alive'&&Math.abs(p.x-c.x)<9&&Math.abs((p.y-8)-(c.y-5))<14){ c.done=true; getCrate(S,p,c.type); break; }
    if(c.y>H+10)c.done=true; }
  S.crates=S.crates.filter(c=>!c.done&&c.life>0&&c.x>S.cam.x-20);

  /* POWs */
  for(const pw of S.pows){ pw.sway+=.05;
    if(pw.st==='tied'){ for(const p of S.players) if(p.st==='alive'&&Math.abs(p.x-pw.x)<10&&p.y>GROUND-20){ freePow(S,pw); break; } }
    else if(pw.st==='free'){ pw.t++; if(pw.t===40)dropCrate(S,pw.x+8,GROUND-14); if(pw.t>70){ pw.st='run'; pw.t=0; } }
    else if(pw.st==='run'){ pw.x-=1.6; pw.t++; } }
  S.pows=S.pows.filter(pw=>!(pw.st==='run'&&pw.x<S.cam.x-20));

  /* fail: nobody left standing */
  if(!S.players.some(p=>p.st==='alive')){ if(++S.failT>90){ S.phase='fail'; S.endT=0; S.progress=clamp(S.cam.x/(S.L.len-W),0,1); fx('fail'); } }
  else S.failT=0;
}
function freePow(S,pw){ if(pw.st!=='tied')return; pw.st='free'; pw.t=0; S.stats.pows++; S.stats.score+=1000; fx('pow',pw.x,GROUND-24); }
