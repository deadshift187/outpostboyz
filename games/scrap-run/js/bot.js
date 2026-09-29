'use strict';
/* =====================================================================
   BOT — a scripted "decent player". Used by the sim harness (difficulty +
   soft-lock testing) and by the title-screen attract demo.
   botInput(S, pid, mem) -> input mask. mem = per-bot scratch object.
   It only reads what's on screen: bullets, telegraphs, hazards, pits.
   ===================================================================== */
function botInput(S,pid,mem){
  const p=S.players[pid]; if(!p||S.phase!=='play')return 0;
  mem.t=(mem.t||0)+1; mem.bombT=(mem.bombT||0)-1;
  if(p.st!=='alive')return 0;
  const cam=S.cam.x, T=p.tank>=0?S.tanks[p.tank]:null, px=p.x, py=p.y, onG=p.onGround;
  let want=null;            // desired x
  let jump=false, crouch=false, up=false, fire=false, bomb=false, avoid=0;
  const hold=(dir)=>{ want=px+dir*40; };

  /* ---------- threats: predict enemy bullets for ~24 frames ---------- */
  const box=(yoff)=>[px-5,py-(T?22:18)+yoff,px+5,py];
  for(const b of S.eb){ if(Math.abs(b.x-px)>90)continue;
    let x=b.x,y=b.y,vx=b.vx,vy=b.vy; const g=b.g||0, r=(b.r||1)+2+(b.exp?b.exp*.5:0);
    const horizon=(vy>.3||g)?60:26;
    for(let k=1;k<=horizon;k++){ vy+=g; x+=vx; y+=vy;
      if(b.exp&&y>=GROUND-1){ if(Math.abs(x-px)<b.exp+4){ avoid+=sgn(px-x)*3; } break; }
      const bx=box(0); if(x>bx[0]-r&&x<bx[2]+r&&y>bx[1]-r&&y<bx[3]+r){
        if(Math.abs(vy)<.6&&!g){                         // flat shot
          if(y>py-10.5&&onG&&k<10&&!T) jump=true;           // low -> jump
          else if(y<=py-10.5&&onG&&!T) crouch=true;        // chest -> crouch
          else if(k<10) jump=true; }
        else avoid+=sgn(px-x||1)*2;                        // falling / arcing -> sidestep
        break; } } }
  for(const w of S.waves){ const d=(w.x-px)*-w.dir; if(d>0&&d<16&&onG)jump=true; }
  for(const e of S.enemies){ if(e.dead||e.dying)continue; const d=e.x-px;
    if(e.t==='bike'&&Math.abs(d)<34&&sgn(d)===-sgn(e.dir)&&onG)jump=true;
    if(e.t==='mine'&&e.arm>0&&Math.abs(d)<22)avoid+=sgn(-d||1)*3;
    if(e.t==='pod'&&(e.st==='fall'||e.st==='warn')&&Math.abs(d)<16)avoid+=sgn(-d||1)*3; }

  /* ---------- hazards ---------- */
  for(const h of S.hz){
    if(h.k==='crush'){ const t=(S.t+h.off)%h.per, upT=h.per-70, danger=t>=upT-24, under=px>h.x-6&&px<h.x+h.w+6, ahead=h.x-px>0&&h.x-px<22;
      if(danger&&under)avoid+=(px<h.x+h.w/2?-4:4); if(danger&&ahead)mem.wait=6; }
    else if(h.k==='laser'){ const t=(S.t+h.off)%h.per, danger=t>=h.per-100, near=Math.abs(h.x-px)<9, ahead=h.x-px>0&&h.x-px<24;
      if(danger&&near)avoid+=(px<h.x?-4:4); if(danger&&ahead)mem.wait=6; }
    else if(h.k==='icicle'&&(h.st==='shake'||h.st==='fall')&&Math.abs(h.x-px)<9)avoid+=(px<h.x?-3:3); }

  /* ---------- boss-specific reads ---------- */
  const B=S.boss;
  if(B&&B.st!=='dying'){
    if(B.id==='goliath'&&B.st==='laserT'&&B.tm>=39&&px<B.x-20&&onG)jump=true;
    if(B.id==='goliath'&&B.st==='laser'&&px<B.x-20&&onG)jump=true;
    if(B.id==='press'&&(B.st==='slamT'||B.st==='slamD')&&Math.abs(px-B.x)<34)avoid+=(px<B.x?-4:4);
    if((B.id==='hk'||B.id==='spider'||B.id==='frost')&&B.marks&&B.marks.length){ let c=0; for(const mx of B.marks) if(Math.abs(mx-px)<24)c+=(px<mx?-1:1);
      if(c)avoid+=sgn(c)*4; else if(B.marks.some(mx=>Math.abs(mx-px)<24))avoid+=4; }
    if(B.id==='spider'&&B.st==='pounceT'&&Math.abs(px-B.x)<60)avoid+=(px<B.x?-3:3);
    if(B.id==='twins'){ if(B.beam&&Math.abs(B.beam.x-px)<24)avoid+=(px<B.beam.x?-4:4); if(B.link){ crouch=true; } }
    if(B.id==='frost'){ for(const s of B.spikes) if(s.x<px+14&&s.x>px-4&&s.t>12&&onG)jump=true;
      if(B.marks&&B.marks.length) for(const mx of B.marks) if(Math.abs(mx-px)<12)avoid+=(px<mx?-3:3); }
    if(B.id==='overmind'){ const s=B.sweep; if(s&&s.live&&Math.abs(s.x-px)<14&&onG)jump=true;
      if(s&&!s.live&&s.t>30&&s.t<=40&&px<S.cam.x+30&&onG)jump=true;
      if(B.floor){ const a0=S.L.len-W, mid=(a0+S.arenaR)/2, bad=B.floor.half?px>mid:px<mid; if(bad)avoid+=B.floor.half?-4:4; } }
    if(B.id==='serpent'&&B.hy<GROUND&&Math.abs(B.hx-px)<22)avoid+=(px<B.hx?-3:3); }

  /* ---------- targeting ---------- */
  let tx=null,ty=null,best=1e9,tE=null;
  for(const e of S.enemies){ if(e.dead||e.dying||e.x<cam-2||e.x>cam+W+18)continue; const d=Math.abs(e.x-px)+(ENEMY[e.t].air?15:0);
    if(d<best){ best=d; tx=e.x; ty=ecy(e); tE=e; } }
  if(B&&B.hb&&B.hb.length&&(tx===null||best>70)){ let hb=B.hb[0], bd=1e9;
    for(const h of B.hb){ const d=Math.abs((h[0]+h[2])/2-px); if(d<bd){ bd=d; hb=h; } }
    tx=(hb[0]+hb[2])/2; ty=(hb[1]+hb[3])/2; tE=null; }

  /* ---------- tanks / crates / partner ---------- */
  if(!T&&tx===null) for(const tk of S.tanks){ if(tk.st==='parked'&&tk.boardCd<=0&&Math.abs(tk.x-px)<70){ want=tk.x; if(Math.abs(tk.x-px)<14&&onG)jump=true; } }
  for(const c of S.crates) if(Math.abs(c.x-px)<60&&c.vy===0&&tx===null)want=c.x;
  for(const q of S.players) if(q!==p&&q.st==='ghost'&&Math.abs(q.x-px)<120){ want=q.x; if(Math.abs(q.x-px)<10&&onG&&q.y>py-60)jump=true; }

  /* ---------- movement plan ---------- */
  const arena=S.bossSeq, locked=S.cam.lock!==null;
  if(want===null){
    if(tx!==null){ const dx=tx-px, air=ty<py-30;
      if(air){ const ux=tx-p.face*2, falling=S.eb.some(b=>b.vy>.3&&b.y<py-20&&Math.abs(b.x-ux)<16);
        if(!falling&&Math.abs(ux-px)>3)want=ux; else if(falling)want=ux+(px<ux?-26:26); }      // get the MUZZLE under flyers (unless an orb is coming)
      else { const keep=T?(tE&&(tE.t==='shield'||tE.t==='walker'||tE.t==='jumper')?0:60):(tE&&tE.t==='shield'?6:tE&&tE.t==='heavy'?70:46);     // shields: close in and knife
        if(keep>20&&Math.abs(dx)<keep-10)want=px-sgn(dx)*20; else if(Math.abs(dx)>keep+(keep>20?30:4))want=tx-sgn(dx)*keep; } }
    else if(!locked&&!arena)want=px+60;
    else if(arena)want=S.cam.x+W*.35; }
  if(tx!==null&&ty>py+6&&(T?T.onGround&&T.y<GROUND:p.onPlat)){            // target below us: get off this platform
    for(const pl of S.L.plats) if(px>pl.x-2&&px<pl.x+pl.w+2&&Math.abs(pl.top-py)<2){ const m=T?20:8, lo=S.cam.x+(T?16:6), hi=S.cam.x+W-(T?16:6);
      const L_=pl.x-m, R_=pl.x+pl.w+m; want=(tx<pl.x+pl.w/2&&L_>lo)||R_>hi?L_:R_; break; } }     // off the reachable end
  if(mem.wait>0){ mem.wait--; if(want!==null&&want>px)want=px; }
  if(avoid){ const lo=S.cam.x+10, hi=(S.arenaR!=null?Math.min(S.arenaR,S.cam.x+W-8):S.cam.x+W-8)-2;
    want=px+avoid*12; if(want>hi&&px>hi-14)want=px-Math.abs(avoid)*12; else if(want<lo&&px<lo+14)want=px+Math.abs(avoid)*12; }   // cornered: dodge the other way
  if(want!==null&&isGap(S,want)&&!(want>px+30&&!avoid)){                // never *stand* in a pit (crossing one is fine)
    for(const g of S.L.gaps) if(want>g[0]&&want<g[1]){ want=px<(g[0]+g[1])/2?g[0]-6:g[1]+6; break; } }

  let dir=0; if(want!==null&&Math.abs(want-px)>3)dir=sgn(want-px);
  if(mem.backT>0){ mem.backT--; dir=mem.backDir; }                   // run-up for a gap
  /* never walk into a pit; jump the ones ahead (with a run-up if too slow) */
  if(dir!==0&&onG&&!(mem.backT>0)){ const edge=px+dir*(T?3:9);            // bodies fall when their CENTRE is over a pit
    if(isGap(S,edge)||(!T&&isGap(S,edge+dir*6))){
      let far=edge; for(let k=0;k<70&&(isGap(S,far+dir*6)||isGap(S,far));k++)far+=dir*2;
      const width=Math.abs(far-px), maxW=T?48:62, fast=Math.abs(p.vx)>(T?1.4:1.6)&&sgn(p.vx)===dir;
      if(width<maxW&&fast)jump=true;
      else if(width<maxW){ mem.backT=S.L.ice?22:12; mem.backDir=-dir; dir=-dir; }
      else dir=0; } }
  if(!onG){ /* keep momentum over pits */ const below=isGap(S,px); if(below&&dir===0)dir=p.face; }
  /* look before you step: would moving this way walk us into a bullet in the next ~16 frames? */
  const wlo=S.cam.x+(T?16:6), whi=S.arenaR!=null?Math.min(S.arenaR,S.cam.x+W-(T?16:6)):S.cam.x+W-(T?16:6);
  const safe=(d)=>{ for(const b of S.eb){ if(Math.abs(b.x-px)>70)continue; let x=b.x,y=b.y,vx=b.vx,vy=b.vy; const g=b.g||0, r=(b.r||1)+3;
      for(let k=1;k<=16;k++){ vy+=g; x+=vx; y+=vy; const bx=clamp(px+d*(T?1.4:2)*k,wlo,whi);        // walls stop you
        if(x>bx-5-r&&x<bx+5+r&&y>py-(T?22:18)-r&&y<py+r)return false; } } return true; };
  if(onG&&!jump&&!(mem.backT>0)&&!safe(dir)){ if(dir!==0&&safe(0))dir=0; else if(safe(-(dir||p.face)))dir=-(dir||p.face); else if(!T)jump=true; }

  /* ---------- aim + fire ---------- */
  let faceDir=dir;
  if(tx!==null){ const dx=tx-px, dy=ty-(py-12);
    if(T){ const want=clamp(Math.atan2(-(ty-(py-19)),Math.max(1,Math.abs(dx))),0,Math.PI/2); up=T.aim<want-.04;   // swing the vulcan to the target's angle
      if(sgn(dx)!==T.face&&Math.abs(dx)>6&&dir===0)faceDir=sgn(dx); }
    else if(dy<-22&&Math.abs(dx)<Math.max(18,-dy*.35))up=true;
    else if(dy<-22&&p.weapon!=='pistol'&&Math.abs(Math.abs(dx)-Math.abs(dy))<30){ up=true; if(dir===0)faceDir=sgn(dx); }
    if(!up&&sgn(dx)!==p.face&&dir===0)faceDir=sgn(dx);
    if(Math.abs(dy)<60||up)fire=(mem.t%2===0);
    if((!tE||tE.t==='turret')&&!up&&dy<-10&&dy>-66&&Math.abs(dx)<120&&onG&&!T&&mem.t%30===0){ jump=true; if(dir===0)faceDir=sgn(dx); }  // hop-and-shoot anything perched above the line of fire
    if(!T&&p.bombs>2&&mem.bombT<=0&&tE&&(tE.t==='heavy'||tE.t==='shield'||tE.t==='turret')&&Math.abs(dx)<80&&Math.abs(dx)>24&&sgn(dx)===p.face){ bomb=true; mem.bombT=70; }
    if(T&&tE&&!ENEMY[tE.t].air&&Math.abs(dx)<120&&sgn(dx)===p.face&&mem.t%24===0)bomb=true; }
  if(tE&&tE.t==='mine'&&onG&&!T&&Math.abs(tx-px)<120&&!jump){ crouch=true; if(sgn(tx-px)!==p.face)faceDir=sgn(tx-px); want=null; }
  if(crouch)up=false;
  let drop=false;
  if(tE&&!T&&p.onPlat&&!ENEMY[tE.t].air&&tE.t!=='turret'&&ty>py-6&&Math.abs(tx-px)<110&&mem.t%20===0)drop=true;  // target below: drop through the platform

  let m=0;
  if(faceDir<0)m|=B_L; else if(faceDir>0)m|=B_R;
  if(up)m|=B_U; if(crouch&&!jump)m|=B_D;
  if(fire)m|=B_FIRE;
  if(jump&&(mem.t%2===0||!mem.lastJump))m|=B_JUMP; mem.lastJump=!!(m&B_JUMP);
  if(drop&&!jump){ m|=B_D|B_JUMP; m&=~B_U; }
  if(bomb)m|=B_BOMB;
  return m;
}
