'use strict';
/* BOSS ART — one draw function per boss. Reads boss state only. Every telegraph is drawn here. */
function marksGfx(b,t,col){ if(!b.marks||!b.marks.length)return; for(const mx of b.marks){ const x=Math.round(mx-camX); if(t%8<5){ g.strokeStyle=col||'#ff3a2a';
  g.beginPath(); g.moveTo(x-5,GROUND-6); g.lineTo(x+5,GROUND+2); g.moveTo(x+5,GROUND-6); g.lineTo(x-5,GROUND+2); g.stroke(); }
  g.fillStyle='rgba(255,40,40,.12)'; g.fillRect(x-1,0,2,GROUND); } }
const BOSS_GFX={
goliath(b,t,C){ const x=Math.round(b.x-camX), y=Math.round(b.y), lg=Math.round(Math.sin(b.legT*.1)*2);
  g.fillStyle=C('#3a3f48'); g.fillRect(x-20,y-14+lg,8,14-lg); g.fillRect(x+12,y-14-lg,8,14+lg); g.fillStyle=C('#5d6570'); g.fillRect(x-24,y-3,14,3); g.fillRect(x+10,y-3,14,3);
  g.fillStyle=C('#4a515c'); g.fillRect(x-24,y-38,48,24); g.fillStyle=C('#6b737e'); g.fillRect(x-24,y-38,48,3); g.fillStyle=C('#2e333b'); g.fillRect(x-24,y-17,48,3);
  for(let i=0;i<6;i++){ g.fillStyle=C(i%2?'#d9a21a':'#111'); g.fillRect(x-22+i*4,y-24,4,3); } g.fillStyle=C('#3a3f48'); for(let i=0;i<4;i++)g.fillRect(x+4+i*5,y-33,3,10);
  g.fillStyle=C('#5d6570'); g.fillRect(x-12,y-46,24,9); g.fillStyle=b.flash>0?'#fff':(Math.sin(t*.1)>0?'#ff3030':'#c01818'); g.fillRect(x-9,y-43,11,4);
  g.fillStyle=C('#3a3f48'); g.fillRect(x-40,y-38,18,7); g.fillStyle=C('#22262c'); g.fillRect(x-46,y-37,6,5); g.fillRect(x-30,y-10,8,6);
  if(b.st==='laserT'){ g.fillStyle=t%4<2?'#ff4040':'#ffb0b0'; g.fillRect(x-33,y-9,3,3); if(t%6<3){ g.fillStyle='rgba(255,40,40,.45)'; g.fillRect(0,GROUND-6,Math.max(0,x-30),1); } }
  if(b.laser){ const w=Math.max(0,x-30); g.fillStyle='#ff2a2a'; g.fillRect(0,GROUND-8,w,5); g.fillStyle='#ffe0e0'; g.fillRect(0,GROUND-7,w,2); } },
press(b,t,C){ const x=Math.round(b.x-camX)+(b.st==='slamT'?(t%4<2?1:-1):0), y=Math.round(b.y);
  g.fillStyle='#2a2626'; g.fillRect(x-3,0,6,y-30); g.fillStyle='#3a3436'; g.fillRect(x-30,0,60,6);
  g.fillStyle=C('#4a4446'); g.fillRect(x-26,y-30,52,30); g.fillStyle=C('#6a6266'); g.fillRect(x-26,y-30,52,3);
  for(let i=0;i<52;i+=6){ g.fillStyle=((i/6|0)%2)?'#d9a21a':'#1a1418'; g.fillRect(x-26+i,y-5,6,5); }
  g.fillStyle=b.flash>0?'#fff':'#ff6a1a'; g.fillRect(x-8,y-22,16,8); g.fillStyle='#ffe27a'; g.fillRect(x-5,y-20,10,3);
  if(b.arms>0){ for(const d of [-1,1]){ const ax=x+d*Math.round(40*b.arms); g.strokeStyle=C('#3a3436'); g.lineWidth=3; g.beginPath(); g.moveTo(x+d*24,y-15); g.lineTo(ax,GROUND-11); g.stroke(); g.lineWidth=1;
      g.fillStyle=C('#5d6570'); g.fillRect(ax-3,GROUND-14,6,6); g.fillStyle=t%6<3?'#ff3a2a':'#6a1a10'; g.fillRect(ax-1,GROUND-12,2,2); } }
  if(b.st==='slamT'){ g.fillStyle=`rgba(255,40,40,${.2+.2*Math.sin(t*.6)})`; g.fillRect(x-26,GROUND-3,52,3); txt('!',x,GROUND-14,'#ff3a2a',2,'c'); } },
hk(b,t,C){ const x=Math.round(b.x-camX), y=Math.round(b.y), f=b.dir||-1;
  g.fillStyle=C('#2e3238'); g.fillRect(x-24,y-6,48,12); g.fillRect(x-30,y-3,8,4); g.fillStyle=C('#4a5058'); g.fillRect(x-24,y-6,48,2);
  g.fillStyle=C('#1a1d22'); g.fillRect(x-14,y+6,4,3); g.fillRect(x+10,y+6,4,3); g.fillRect(x+18,y-4,10,3);
  g.fillStyle=b.flash>0?'#fff':'#ff3030'; g.fillRect(x-18,y-2,6,3); g.fillStyle='#ffd0c0'; g.fillRect(x-17,y-1,2,1);
  g.fillStyle='rgba(180,180,190,.5)'; const r=(t*3)%24; g.fillRect(x-12-r,y-9,24,1); g.fillRect(x+r-12,y-9,24,1);
  g.fillStyle='rgba(255,60,60,.06)'; g.beginPath(); g.moveTo(x-16,y+3); g.lineTo(x-28+Math.sin(t*.03)*20,GROUND); g.lineTo(x-4+Math.sin(t*.03)*20,GROUND); g.fill();
  marksGfx(b,t); },
serpent(b,t,C){ const tr=b.trail||[];
  for(let i=9;i>=1;i--){ const s=tr[i*6]; if(!s||s[1]>GROUND+2)continue; const x=Math.round(s[0]-camX), y=Math.round(s[1]);
    g.fillStyle=C(i%2?'#2a6a5a':'#1e5044'); circ(x,y,6-i*.2); g.fillStyle=C('#5ae0a0'); g.fillRect(x-1,y-5,2,2); }
  if(b.hy<GROUND+4){ const x=Math.round(b.hx-camX), y=Math.round(b.hy), prev=tr[3]||[b.hx+1,b.hy], d=b.hx>=prev[0]?1:-1;
    g.fillStyle=C('#2a7a66'); g.fillRect(x-10,y-7,20,14); g.fillStyle=C('#3a9a80'); g.fillRect(x-10,y-7,20,3);
    g.fillStyle=b.flash>0?'#fff':'#ffe23a'; g.fillRect(x+d*4-2,y-4,4,3); g.fillStyle='#111'; g.fillRect(x+d*5-1,y-3,1,2);
    g.fillStyle=C('#e0f0e0'); for(let k=0;k<3;k++)g.fillRect(x+d*9-(d>0?0:1),y+1+k*2,1,2); }
  else if(b.st==='under'||b.st==='enter'){ for(const px of b.pits){ const x=Math.round(px-camX); if(t%20<10){ g.fillStyle='rgba(120,255,220,.4)'; circ(x+Math.sin(t*.3)*6,GROUND+5,2); } } } },
spider(b,t,C){ const x=Math.round(b.x-camX), y=Math.round(b.y)+(b.st==='pounceT'?3:0), lt=b.legT*.15;
  for(let i=0;i<4;i++){ const lx=x-26+i*17, k=Math.sin(lt+i)*3; g.strokeStyle=C('#3a3f48'); g.lineWidth=3; g.beginPath(); g.moveTo(x-14+i*9,y-24); g.lineTo(lx,y-34-k); g.lineTo(lx+(i<2?-4:4),y); g.stroke(); }
  g.lineWidth=1; g.fillStyle=C('#5a4a2a'); g.fillRect(x-30,y-36,60,22); g.fillStyle=C('#7a6a3a'); g.fillRect(x-30,y-36,60,3); g.fillStyle=C('#3a2e1a'); g.fillRect(x-30,y-18,60,4);
  for(let i=0;i<8;i++){ g.fillStyle=C(i%2?'#d9a21a':'#1a1418'); g.fillRect(x-16+i*4,y-30,4,3); }
  for(let i=0;i<3;i++){ g.fillStyle=b.flash>0?'#fff':(t%30<15||i===1?'#ff3030':'#901010'); g.fillRect(x-8+i*6,y-26,4,3); }
  g.fillStyle=C('#2a2a30'); g.fillRect(x-4,y-42,8,6); g.fillRect(x-2,y-50,4,8); marksGfx(b,t);
  if(b.st==='pounceT'&&t%6<3)txt('!',x,y-58,'#ff3a2a',2,'c'); },
twins(b,t,C){ b.parts.forEach((q,i)=>{ if(q.hp<=0)return; const x=Math.round(q.x-camX), y=Math.round(q.y), fl=q.flash>0;
    g.fillStyle=fl?'#fff':i?'#3a2a5a':'#5a2a3a'; circ(x,y,9); g.fillStyle=fl?'#fff':i?'#6a4aa0':'#a04a6a'; circ(x,y-2,7);
    g.fillStyle='#111'; circ(x,y,4); g.fillStyle=fl?'#fff':(t%20<10?'#ff3a6a':'#ffb0c0'); circ(x,y,2);
    for(let k=0;k<3;k++){ const a=t*.08+k*TAU/3+i; g.fillStyle='#8a8aa0'; g.fillRect(x+Math.cos(a)*12|0,y+Math.sin(a)*12|0,2,2); } });
  if(b.beam){ const x=Math.round(b.beam.x-camX); if(b.beam.live){ g.fillStyle='#ff2a6a'; g.fillRect(x-3,24,7,GROUND-24); g.fillStyle='#ffe0ea'; g.fillRect(x-1,24,3,GROUND-24); }
    else if(t%6<3){ g.fillStyle='rgba(255,40,100,.5)'; g.fillRect(x,24,1,GROUND-24); } }
  if(b.link){ const [q0,q1]=b.parts, y=GROUND-14; if(b.link===2){ g.fillStyle='#ff2a6a'; g.fillRect(Math.round(q0.x-camX),y-2,Math.round(q1.x-q0.x),4); g.fillStyle='#fff'; g.fillRect(Math.round(q0.x-camX),y-1,Math.round(q1.x-q0.x),1); }
    else if(t%6<3){ g.fillStyle='rgba(255,40,100,.5)'; g.fillRect(Math.round(q0.x-camX),y,Math.round(q1.x-q0.x),1); txt('DUCK!',W/2,y-14,'#ff3a6a',1,'c'); } } },
frost(b,t,C){ const x=Math.round(b.x-camX), y=Math.round(b.y);
  g.fillStyle=C('#5a7a9a'); g.fillRect(x-20,y-24,14,24); g.fillRect(x+6,y-24,14,24); g.fillStyle=C('#8ab0d0'); g.fillRect(x-24,y-62,48,40); g.fillStyle=C('#c0e0f8'); g.fillRect(x-24,y-62,48,3);
  g.fillStyle=C('#7aa0c0'); g.fillRect(x-14,y-72,24,12); g.fillStyle=b.flash>0?'#fff':'#2af0ff'; g.fillRect(x-10,y-68,6,3);
  g.fillStyle=C('#6a90b0'); g.fillRect(x-34,y-50,10,6); g.fillRect(x-30,y-44,6,14);
  const pulse=.5+.5*Math.sin(t*.2); g.fillStyle=b.flash>0?'#fff':`rgb(${80+pulse*120|0},${200+pulse*55|0},255)`; g.fillRect(x-30,y-52,14,20); g.fillStyle='#e0ffff'; g.fillRect(x-26,y-47,6,8);
  for(const s of (b.spikes||[])){ const sx=Math.round(s.x-camX); if(s.t>=18){ if(t%4<2){ g.fillStyle='rgba(180,240,255,.6)'; g.fillRect(sx-4,GROUND-2,8,2); } }
    else { const h=Math.min(14,(18-s.t)*3); g.fillStyle='#bfe8ff'; g.beginPath(); g.moveTo(sx-5,GROUND); g.lineTo(sx,GROUND-h); g.lineTo(sx+5,GROUND); g.fill(); } }
  marksGfx(b,t,'#8ae0ff'); },
overmind(b,t,C){ const [a0,a1]=[S_L_len()-W,S_L_len()], wx=Math.round(a1-30-camX);
  g.fillStyle='#12040a'; g.fillRect(wx,0,W,GROUND); for(let yy=6;yy<GROUND;yy+=8){ g.fillStyle=(hash(yy)+(t>>2))%7?'#2a0812':'#ff2a3a'; g.fillRect(wx+4,yy,W,1); }
  g.fillStyle='#1c0610'; g.fillRect(wx-16,b.y-24-(0),18,48);
  for(let i=0;i<b.pods.length;i++){ const pd=b.pods[i]; if(pd.hp<=0){ g.fillStyle='#1a0a0a'; circ(Math.round(pd.x-camX),Math.round(pd.y),5); continue; }
    const x=Math.round(pd.x-camX), y=Math.round(pd.y); g.fillStyle=pd.flash>0?'#fff':'#4a1a24'; circ(x,y,7); g.fillStyle=pd.flash>0?'#fff':'#ff3a4a'; circ(x-2,y,3); g.fillStyle='#2a0a10'; g.fillRect(x-10,y-1,6,2); }
  const ex=Math.round(b.x-camX), ey=Math.round(b.y), op=b.eye;
  g.fillStyle='#2a0a14'; circ(ex,ey,14); g.fillStyle='#e8d0d4'; g.beginPath(); g.ellipse(ex,ey,11,Math.max(.5,11*op),0,0,TAU); g.fill();
  if(op>.2){ g.fillStyle=b.flash>0?'#fff':'#ff1a2a'; circ(ex-3,ey,5*op); g.fillStyle='#000'; circ(ex-3,ey,2*op); }
  g.fillStyle='#4a1a24'; g.fillRect(ex-12,ey-12,24,Math.round(12*(1-op))); g.fillRect(ex-12,ey+Math.round(12*op),24,Math.round(12*(1-op)));
  if(b.sweep){ const s=b.sweep; const sx=Math.round((s.live?s.x:S_L_len()-W+6)-camX); if(s.live){ g.strokeStyle='#ff2a3a'; g.lineWidth=3; g.beginPath(); g.moveTo(ex,ey); g.lineTo(sx,GROUND); g.stroke(); g.lineWidth=1; g.strokeStyle='#ffe0e0'; g.beginPath(); g.moveTo(ex,ey); g.lineTo(sx,GROUND); g.stroke(); }
    else if(s.t<40&&t%6<3){ g.strokeStyle='rgba(255,40,60,.5)'; g.beginPath(); g.moveTo(ex,ey); g.lineTo(sx,GROUND); g.stroke(); } }
  if(b.floor){ const mid=(a0+(a1-62))/2, x0=Math.round((b.floor.half?mid:a0)-camX), x1=Math.round((b.floor.half?a1-62:mid)-camX);
    if(b.floor.live){ g.fillStyle=t%3?'#ff2a3a':'#fff'; for(let x=x0;x<x1;x+=3)g.fillRect(x,GROUND-2-(hash(x+t)%4),1,3); g.fillStyle='rgba(255,40,60,.3)'; g.fillRect(x0,GROUND-6,x1-x0,6); }
    else if(t%8<4){ g.fillStyle='rgba(255,40,60,.35)'; g.fillRect(x0,GROUND-1,x1-x0,2); txt('MOVE!',(x0+x1)/2,GROUND-16,'#ff3a4a',1,'c'); } } },
};
let _SLEN=0; const S_L_len=()=>_SLEN;
function drawBossGfx(S,b,t){ _SLEN=S.L.len; const f=BOSS_GFX[b.id]; if(!f)return; const fl=b.flash>0&&b.id!=='twins'; f(b,t,c=>fl?'#fff':c); }
