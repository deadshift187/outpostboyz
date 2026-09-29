'use strict';
/* =====================================================================
   RENDER — draws a sim state S (local sim OR an online snapshot). Never mutates S.
   Owns: pixel font, sprites, particles, screen shake, callouts, HUD, overlays.
   FX events from the sim arrive via consumeFX(events).
   ===================================================================== */
let g=null, camX=0; function renderInit(ctx){ g=ctx; g.imageSmoothingEnabled=false; }
const cr=(a,b)=>a+Math.random()*(b-a), cpick=a=>a[Math.floor(Math.random()*a.length)];

/* ---------------- pixel font 3x5 ---------------- */
const FONT={'0':'111101101101111','1':'010110010010111','2':'111001111100111','3':'111001111001111','4':'101101111001001',
'5':'111100111001111','6':'111100111101111','7':'111001001010010','8':'111101111101111','9':'111101111001111',
A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',
F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',
K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',O:'010101101101010',
P:'110101110100100',Q:'010101101110011',R:'110101110101101',S:'011100010001110',T:'111010010010010',
U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',
Z:'111001010100111','!':'010010010000010','.':'000000000000010',':':'000010000010000','-':'000000111000000',
'=':'000111000111000','+':'000010111010000','?':'111001011000010','/':'001001010100100',"'":'010010000000000',
'>':'100010001010100','<':'001010100010001',' ':'000000000000000','%':'101001010100101','#':'101111101111101',
'(':'010100100100010',')':'010001001001010',',':'000000000010100','*':'000101010101000','♥':'000101111111010'};
function textW(s,sc){ let w=0; for(const ch of String(s))w+=(ch==='∞'?7:4)*sc; return w-sc; }
function txt(s,x,y,col,sc,align,sh){ col=col||'#fff'; sc=sc||1; if(sh===undefined)sh='#000';
  s=String(s).toUpperCase(); const tw=textW(s,sc); if(align==='c')x-=tw/2; else if(align==='r')x-=tw; x=Math.round(x); y=Math.round(y);
  const draw=(ox,oy,c)=>{ g.fillStyle=c; let cx=x+ox;
    for(const ch of s){ if(ch==='∞'){ const inf=['010010','101101','010010']; for(let r=0;r<3;r++)for(let q=0;q<6;q++)if(inf[r][q]==='1')g.fillRect(cx+q*sc,y+oy+(r+1)*sc,sc,sc); cx+=7*sc; continue; }
      const gl=FONT[ch]||FONT['?']; for(let r=0;r<5;r++)for(let q=0;q<3;q++)if(gl[r*3+q]==='1')g.fillRect(cx+q*sc,y+oy+r*sc,sc,sc); cx+=4*sc; } };
  if(sh)draw(sc,sc,sh); draw(0,0,col); }
function circ(x,y,r){ g.beginPath(); g.arc(x,y,Math.max(.5,r),0,TAU); g.fill(); }

/* ---------------- sprites ---------------- */
function mk(rows,pal){ const h=rows.length, w=Math.max(...rows.map(r=>r.length));
  const make=(flip,white)=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){ const ch=rows[yy][xx]; if(!ch||ch==='.')continue; x.fillStyle=white?'#fff':pal[ch]; x.fillRect(flip?w-1-xx:xx,yy,1,1); } return c; };
  return {w,h,r:make(false,false),l:make(true,false),rw:make(false,true),lw:make(true,true)}; }
function spr(s,x,y,face,white){ g.drawImage(white?(face<0?s.lw:s.rw):(face<0?s.l:s.r),Math.round(x-s.w/2-camX),Math.round(y-s.h)); }
const UP=['.....aaaa.......','....aaaaaa......','....hhhhhhh.....','..hhssssss......','...h.ssskss.....','.....sssss......',
 '.....SSSS.......','...vvvvvvv......','..vvbbvvvvv.....','..vbbbvvvvv.....','..vbbbVVvvv.....','..vvvvVVvvv.....','...vvvvvvv......'];
const LEG_IDLE=['...ppppppp......','...ppp.ppp......','...ppp.ppp......','...PPp.PPp......','...ppp.ppp......','..oooo.oooo.....','..oooo.oooo.....'];
const LEG_RA=['...ppppppp......','...ppp..ppp.....','..ppp....ppp....','..PP......PPp...','.ooo.......ooo..','.ooo........oo..','................'];
const LEG_RB=['...ppppppp......','....pppppp......','.....pppp.......','.....PpPp.......','....ooo.oo......','....ooo.oo......','................'];
const LEG_J=['...ppppppp......','..pppppppp......','..ppp..ppp......','.oooo..oooo.....','.ooo....ooo.....','................','................'];
const LEG_C=['..pppppppp......','.ooopppppooo....','.ooo.....ooo....'];
const sh1=r=>r.map(x=>('.'+x).slice(0,16));
function playerSet(pal){ return { idle:mk(sh1(UP.concat(LEG_IDLE)),pal), runA:mk(sh1(UP.concat(LEG_RA)),pal), runB:mk(sh1(UP.concat(LEG_RB)),pal),
  jump:mk(sh1(UP.concat(LEG_J)),pal), crouch:mk(sh1(UP.slice(0,12).concat(LEG_C)),pal) }; }
let PSP=null, WK1,WK2,HV,DR,POW_T,POW_F;
const PPAL=[{k:'#101010',s:'#e9b98b',S:'#b98458',h:'#d02a2a',a:'#3b2616',v:'#5f7a36',V:'#465b27',b:'#c8b07a',p:'#3c5a88',P:'#2b4266',o:'#2a1d12'},
            {k:'#101010',s:'#8d5a3a',S:'#6a4028',h:'#2a7ae0',a:'#140e0a',v:'#b0894a',V:'#8a6a34',b:'#e0d0a0',p:'#3a3a40',P:'#26262c',o:'#1a1410'}];
const PCOL=['#ff5a4a','#5ab0ff'];
function buildSprites(){
  PSP=PPAL.map(playerSet);
  const WP={m:'#9aa3ad',d:'#5d6570',r:'#ff2a2a',R:'#ffb0a0',w:'#cfd6df',k:'#111',y:'#d9a21a'}, WP2={m:'#7a828d',d:'#474d56',r:'#ff2a2a',R:'#ffb0a0',w:'#cfd6df',k:'#111',y:'#d9a21a'};
  const WB=['...mmmmmmm....','..mmmmmmmmm...','..mdddmdddm...','..mdrRmdRrm...','..mmmmmmmmm...','...wkwkwkw....','....mmmmm.....',
    '...dmmmmmd....','..ddmdmdmdd...','..d.dmdmd.d...','..m..mmmm.m...','.....dmdm.....','.....mmmm.....'];
  WK1=mk(WB.concat(['....dd..dd....','....mm..mm....','....mm..mm....','....dd..dd....','...mmm..mmm...','...ddd..ddd...']),WP);
  WK2=mk(WB.concat(['.....dd.dd....','....mm...mm...','...mm.....mm..','...dd.....dd..','..mmm....mmm..','..ddd....ddd..']),WP);
  HV=mk(['........mmmmmmmm........','.......mddddddddm.......','.......mdrrRRrrdm.......','.......mddddddddm.......',
    '....yyymmmmmmmmmmyyy....','...ymmmmddddddddmmmmy...','..dmmmmdmmmmmmmmdmmmmd..','..dmmmdmmmmmmmmmmdmmmd..',
    '..dmmmdmmyyyyyymmdmmmd..','..ddmmdmmykkkkymmdmmdd..','...dmmdmmyyyyyymmdmmd...','...dmmdmmmmmmmmmmdmmd...',
    '....ddddmmmmmmmmdddd....','.......dmmmmmmmmd.......','.......dddddddddd.......','......mmm......mmm......',
    '......mdm......mdm......','......mmm......mmm......','.....mmmm......mmmm.....','.....dddd......dddd.....',
    '....mmmmm......mmmmm....','....ddddd......ddddd....','...mmmmmm......mmmmmm...','...dddddd......dddddd...'],WP2);
  DR=mk(['....dddddddd....','..dmmmmmmmmmmd..','.dmmmmrRRrmmmmd.','dmmmmmrRRrmmmmmd','.dmmmmmmmmmmmmd.','..dddddddddddd..','...k...kk...k...'],WP);
  const PW={s:'#e9b98b',S:'#b98458',a:'#7a5a3a',u:'#e2dcc4',r:'#8a6a3a',k:'#101010'};
  POW_T=mk(['....aaaa....','...aaaaaa...','...ssssss...','...sksskS...','...aaaaaa...','....aaaa....','..rssssssr..',
    '..srrrrrrs..','...ssssss...','...uuuuuu...','...uuuuuu...','...ss..ss...','...ss..ss...','...ss..ss...','..sss..sss..'],PW);
  POW_F=mk(['....aaaa....','...aaaaaa.s.','...ssssss.s.','...sksskSs..','...aaaaaas...','....aaaa....','...ssssss...',
    '..ssssssss..','...ssssss...','...uuuuuu...','...uuuuuu...','...ss..ss...','...ss..ss...','...ss..ss...','..sss..sss..'],PW); }

/* ---------------- particles, shake, overlays state ---------------- */
let PARTS=[], FLOATS=[], SHAKE=0, FLASH=0, CALLOUT=null, BANNER=null, GO_T=0, WARN_T=0, DEATHCARD=null, BGP=[];
function resetFX(){ PARTS=[]; FLOATS=[]; SHAKE=0; FLASH=0; CALLOUT=null; BANNER=null; GO_T=0; WARN_T=0; BGP=[]; }
function pSpark(x,y,n,col,spd,life){ for(let i=0;i<n;i++){ const a=cr(0,TAU), s=cr(spd*.3,spd); PARTS.push({k:'p',x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-.8,life:cr(life*.5,life),col,g:.14,sz:Math.random()<.3?2:1}); } }
function pChunks(x,y,n,cols){ for(let i=0;i<n;i++)PARTS.push({k:'chunk',x,y,vx:cr(-2.5,2.5),vy:cr(-4,-1),life:cr(60,120),w:1+(Math.random()*3|0),h:1+(Math.random()*2|0),col:cpick(cols||['#9aa3ad','#5d6570','#3d434c','#c33']),g:.18}); }
function pDust(x,y){ for(let i=0;i<5;i++)PARTS.push({k:'p',x:x+cr(-4,4),y,vx:cr(-.8,.8),vy:cr(-.8,-.2),life:cr(10,18),col:'#6a5e54',g:.05,sz:1}); }
function pBoom(x,y,big){ SHAKE=Math.max(SHAKE,big?9:5); PARTS.push({k:'flash',x,y,life:big?10:7,max:big?10:7,r:big?26:16});
  for(let i=0;i<(big?12:7);i++)PARTS.push({k:'fire',x:x+cr(-6,6),y:y+cr(-6,6),vx:cr(-1.4,1.4),vy:cr(-1.8,.4),r:cr(3,big?8:5),life:cr(14,26),g:-.02});
  pSpark(x,y,big?22:12,'#ffcf5a',big?4:3,24); for(let i=0;i<(big?6:3);i++)PARTS.push({k:'smoke',x,y,vx:cr(-.4,.4),vy:cr(-.9,-.3),r:cr(2,5),life:cr(40,70)}); }
function consumeFX(list,S){
  for(const e of list){ const t=e[0];
    switch(t){
    case 'intro': BANNER={a:e[1],b:e[2],t:0}; audioSay(e[1]); break;
    case 'sfx': SFX(e[1]); break;
    case 'music': if(e[1]==='boss')musicStart('boss',S&&S.L?S.L.mus:null); else if(e[1]==='stop')musicStop(); break;
    case 'boom': pBoom(e[1],e[2],e[3]); SFX(e[3]?'boomBig':'boom'); break;
    case 'spark': pSpark(e[1],e[2],e[4]||6,e[3]||'#fff',3,14); break;
    case 'chunks': pChunks(e[1],e[2],e[3]); break;
    case 'dust': pDust(e[1],e[2]); break;
    case 'smoke': PARTS.push({k:'smoke',x:e[1],y:e[2],vx:0,vy:-.3,r:2,life:30}); break;
    case 'casing': PARTS.push({k:'casing',x:e[1],y:e[2],vx:e[3]*cr(.5,1.5),vy:cr(-2.5,-1.5),life:50,g:.2}); break;
    case 'trail': PARTS.push({k:'smoke',x:e[1],y:e[2],vx:0,vy:-.1,r:1.5,life:26}); break;
    case 'shake': SHAKE=Math.max(SHAKE,e[1]); break;
    case 'flash': FLASH=e[1]; break;
    case 'hurt': SHAKE=Math.max(SHAKE,8); pSpark(e[1],e[2],16,'#f55',3.5,24); SFX('hurt'); break;
    case 'down': pSpark(e[1],e[2],24,'#fff',3,30); SFX('die'); CALLOUT={text:(e[3]?'P2':'P1')+' DOWN!',t:0,col:PCOL[e[3]]}; break;
    case 'revive': pSpark(e[1],e[2],20,'#ffe27a',3,24); SFX('revive'); CALLOUT={text:'REVIVED!',t:0}; break;
    case 'kill': { const [_,ty,x,y,pts]=e; if(pts>=300)FLOATS.push({x,y:y-8,t:String(pts),col:'#ffe27a',life:45});
      if(ty==='walker'||ty==='shield'){ PARTS.push({k:'skull',x,y:y-6,vx:cr(-1.5,1.5),vy:cr(-4,-2.5),life:160,g:.2}); pChunks(x,y,8); }
      else pChunks(x,y,ty==='heavy'||ty==='pod'?16:6); break; }
    case 'ehit': pSpark(e[1],e[2],3,'#aee',2.5,10); SFX('ehit'); break;
    case 'knife': pSpark(e[1],e[2],6,'#fff',2.5,10); SFX('knife'); break;
    case 'clink': pSpark(e[1],e[2],4,'#ffe27a',2,8); SFX('clink'); break;
    case 'pow': FLOATS.push({x:e[1],y:e[2],t:'THANK YOU!',col:'#e8dcc4',life:60}); SFX('pow'); break;
    case 'callout': CALLOUT={text:e[1],t:0}; SFX('pickup'); audioSay(e[1].replace(/!/g,'')); break;
    case 'go': GO_T=150; break;
    case 'warn': WARN_T=170; break;
    case 'shatter': pSpark(e[1],e[2],12,'#d8f0ff',2.5,20); SFX('shard'); break;
    case 'splash': pSpark(e[1],e[2],16,'#7ae0d8',3,20); SFX('splash'); break;
    case 'clear': SFX('clear'); break;
    case 'fail': SFX('die'); break; } } }
function stepFX(){ SHAKE*=.85; if(SHAKE<.3)SHAKE=0; if(FLASH>0)FLASH--; if(GO_T>0)GO_T--; if(WARN_T>0)WARN_T--;
  if(CALLOUT&&++CALLOUT.t>95)CALLOUT=null; if(BANNER&&++BANNER.t>200)BANNER=null;
  for(const p of PARTS){ p.life--; if(p.k==='flash')continue;
    if(p.k==='smoke'){ p.x+=p.vx; p.y+=p.vy; p.r+=.05; continue; } if(p.k==='fire'){ p.x+=p.vx; p.y+=p.vy; p.vy+=(p.g||0); p.r*=.95; continue; }
    p.vy+=(p.g!==undefined?p.g:.15); p.x+=p.vx; p.y+=p.vy; if(p.y>GROUND){ p.y=GROUND; p.vy*=-.35; p.vx*=.7; if(Math.abs(p.vy)<.6)p.vy=0; } }
  PARTS=PARTS.filter(p=>p.life>0); if(PARTS.length>900)PARTS.splice(0,PARTS.length-900);
  for(const f of FLOATS){ f.life--; f.y-=.35; } FLOATS=FLOATS.filter(f=>f.life>0);
  for(const p of BGP){ p.y+=p.vy; p.x+=p.vx; p.life--; } BGP=BGP.filter(p=>p.life>0); }

/* ======================= BACKGROUNDS (one per theme) ======================= */
const BGC={};                                             // per-level cached procedural layout
function bgLayout(L){ if(BGC[L.id])return BGC[L.id]; const R=mulberry(hash(L.len+L.id.length*977)); const o={far:[],mid:[],deco:[],front:[],stars:[]};
  let x=-40; while(x<L.len*.2+W+80){ const w=10+R()*28|0; o.far.push({x,w,h:20+R()*55|0,s:R()*1e9|0,br:R()<.4}); x+=w+(R()*6|0); }
  x=-60; while(x<L.len*.45+W+80){ const w=24+R()*46|0; o.mid.push({x,w,h:26+R()*50|0,s:R()*1e9|0,smoke:R()<.25,holes:R()*3|0}); x+=w+8+(R()*30|0); }
  x=90; while(x<L.len-120){ o.deco.push({x,s:R()*1e9|0,r:R()}); x+=70+(R()*120|0); }
  x=0; while(x<L.len*1.3+W){ o.front.push({x,w:14+R()*30|0,h:4+R()*8|0}); x+=40+(R()*80|0); }
  for(let i=0;i<50;i++)o.stars.push({x:R()*W|0,y:R()*60|0,c:R()<.3?'#8a90a8':'#4a4e62',p:R()*90|0});
  return BGC[L.id]=o; }
function skyGrad(L){ const gr=g.createLinearGradient(0,0,0,GROUND); const s=L.pal.sky; s.forEach((c,i)=>gr.addColorStop(i/(s.length-1),c)); return gr; }
function drawBackground(S,t){ const L=S.L, B=bgLayout(L), P=L.pal, SKY=skyGrad(L);
  g.fillStyle=SKY; g.fillRect(0,0,W,GROUND);
  const th=L.theme;
  if(th==='city'||th==='roof'||th==='core'||th==='metro'||th==='ice'||th==='factory')for(const s of B.stars){ if(th!=='city'&&th!=='roof')break; if((t+s.p)%150<140){ g.fillStyle=s.c; g.fillRect(s.x,s.y,1,1); } }
  if(th==='city'){ g.fillStyle='#4a1c1c'; circ(200,40,17); g.fillStyle='#6e2a24'; circ(200,40,14); g.fillStyle='#823428'; circ(197,37,9); }
  if(th==='roof'){ g.fillStyle='#d8d4c0'; circ(60,34,13); g.fillStyle='#b8b4a0'; circ(56,31,3); circ(64,38,2); }
  if(th==='highway'){ g.fillStyle='#ffd070'; circ(180,70,22); g.fillStyle='rgba(255,220,140,.25)'; circ(180,70,30);
    for(let i=0;i<3;i++){ g.fillStyle=['#5a2a4a','#4a2240','#3a1a34'][i]; g.beginPath(); g.moveTo(0,GROUND);
      for(let x=0;x<=W;x+=8)g.lineTo(x,GROUND-26-i*-6-Math.sin((x+camX*(.05+i*.04))*.03+i)*10-Math.sin((x+camX*(.05+i*.04))*.011+i*2)*14); g.lineTo(W,GROUND); g.fill(); } }
  if(th==='desert'){ g.fillStyle='#fff4c0'; circ(60,30,16); g.fillStyle='rgba(255,240,180,.3)'; circ(60,30,24);
    for(let i=0;i<3;i++){ g.fillStyle=['#e0a860','#d09450','#c08040'][i]; g.beginPath(); g.moveTo(0,GROUND);
      for(let x=0;x<=W;x+=6)g.lineTo(x,GROUND-10-i*-4-18+i*4-Math.sin((x+camX*(.06+i*.06))*.02+i)*9); g.lineTo(W,GROUND); g.fill(); } }
  /* far layer */
  if(th==='city'||th==='roof'||th==='highway'||th==='desert'){
    for(const b of B.far){ const x=Math.round(b.x-camX*.15); if(x>W||x+b.w<0)continue; const top=GROUND-18-b.h*(th==='desert'?.5:1);
      g.fillStyle=P.far; g.fillRect(x,top,b.w,GROUND-top);
      if(th!=='desert')for(let wy=top+4;wy<GROUND-20;wy+=5)for(let wx=2;wx<b.w-2;wx+=4){ const h=hash(b.s+wx*7+wy*13); if(h%(th==='roof'?5:11)===0){ g.fillStyle=h%3?'#3a2238':P.win; g.fillRect(x+wx,wy,1,2); } } } }
  if(th==='factory'||th==='metro'||th==='ice'||th==='core'){                // interiors: back wall
    const pw=th==='metro'?12:16; for(let i=-1;i<W/pw+2;i++){ const x=Math.round(i*pw-(camX*.3)%pw);
      g.fillStyle=i%2?P.far:P.mid; g.fillRect(x,0,pw,GROUND);
      if(th==='metro'){ g.fillStyle='rgba(120,200,190,.06)'; for(let y=6;y<GROUND;y+=8)g.fillRect(x,y,pw-1,1); }
      if(th==='factory'){ g.fillStyle='#3a2e24'; g.fillRect(x+2,10,1,1); g.fillRect(x+pw-3,10,1,1); g.fillRect(x+2,GROUND-30,1,1); }
      if(th==='core'){ const h=hash(i+Math.floor(camX*.3/pw)); if(h%3===0){ g.fillStyle=`rgba(255,40,60,${.15+.15*Math.sin(t*.05+h)})`; g.fillRect(x+pw/2|0,0,1,GROUND); g.fillRect(x,((h>>>4)%80)+10,pw,1); } } } }
  /* mid layer */
  for(const b of B.mid){ const x=Math.round(b.x-camX*.4); if(x>W+10||x+b.w<-10)continue; const top=GROUND-8-b.h;
    if(th==='city'||th==='roof'){ g.fillStyle=P.mid; g.fillRect(x,top,b.w,b.h+8); g.fillStyle='rgba(255,255,255,.05)'; g.fillRect(x,top,b.w,2);
      for(let wy=top+5;wy<GROUND-12;wy+=7)for(let wx=3;wx<b.w-4;wx+=6){ const h=hash(b.s^(wx*31+wy*17)); g.fillStyle=h%9===0?P.win:(h%4===0?'#140f18':'#1f1826'); g.fillRect(x+wx,wy,3,4); }
      if(th==='roof'&&b.h>40){ g.fillStyle='#2a2a3a'; g.fillRect(x+b.w/2-4|0,top-10,8,10); g.fillRect(x+b.w/2|0,top-18,1,8); if(t%60<30){ g.fillStyle='#f33'; g.fillRect(x+b.w/2|0,top-19,1,1); } }
      for(let i=0;i<b.holes&&th==='city';i++){ const h=hash(b.s+i*99); g.fillStyle=SKY; g.fillRect(x+(h%Math.max(1,b.w-10)),top+((h>>>8)%10),6+(h>>>16)%6,4+(h>>>20)%5); }
      if(b.smoke&&th==='city'&&Math.random()<.08)BGP.push({x:b.x+b.w/2+cr(-4,4),y:top,vx:cr(-.05,.15),vy:-.25,r:cr(2,4),life:cr(80,140),par:.4}); }
    else if(th==='highway'){ if(b.s%3)continue; g.fillStyle=P.mid; g.fillRect(x,GROUND-66,10,66); g.fillRect(x-30,GROUND-70,b.w+40,6); g.fillStyle='#5a3a4a'; g.fillRect(x-30,GROUND-70,b.w+40,1); }
    else if(th==='desert'){ if(b.s%2)continue; g.fillStyle='#2a3a5a'; for(let k=0;k<3;k++){ g.save(); g.translate(x+k*14,GROUND-14); g.transform(1,0,-.5,1,0,0); g.fillRect(0,-10,12,8); g.restore(); }
      g.fillStyle='#5a4a3a'; g.fillRect(x+4,GROUND-8,1,8); g.fillRect(x+30,GROUND-8,1,8); }
    else if(th==='factory'){ if(b.s%2)continue; g.fillStyle='#120e0c'; g.fillRect(x,top,b.w,GROUND-top); g.fillStyle=`rgba(255,${120+40*Math.sin(t*.1+b.s)|0},30,.5)`; g.fillRect(x+4,top+8,b.w-8,6);
      g.fillStyle='#241c16'; circ(x+b.w/2,top-6,10); g.fillStyle='#120e0c'; circ(x+b.w/2,top-6,4); }
    else if(th==='metro'){ if(b.s%3)continue; g.fillStyle='#0a1416'; g.beginPath(); g.arc(x+b.w/2,GROUND,b.w/2+6,Math.PI,0); g.fill(); }
    else if(th==='ice'){ if(b.s%2)continue; g.fillStyle='#16304a'; g.fillRect(x,top+10,16,GROUND-top-10); g.fillStyle='rgba(160,220,255,.25)'; g.fillRect(x+2,top+14,12,GROUND-top-24);
      g.fillStyle='rgba(20,40,60,.8)'; g.fillRect(x+5,top+20,6,14); circ(x+8,top+18,3); }
    else if(th==='core'){ if(b.s%2)continue; g.fillStyle='#10060a'; g.fillRect(x,top,18,GROUND-top); for(let yy=top+4;yy<GROUND-4;yy+=5){ g.fillStyle=(hash(b.s+yy)+t>>3)%4?'#3a0a14':'#ff3040'; g.fillRect(x+3,yy,2,1); g.fillStyle='#1c0a10'; g.fillRect(x+7,yy,9,3); } } }
  for(const p of BGP){ g.globalAlpha=Math.min(.6,p.life/140); g.fillStyle='#28222c'; circ(p.x-camX*(p.par||.4),p.y,p.r+=.03); } g.globalAlpha=1;
  /* ceilings for interiors */
  if(th==='factory'||th==='metro'||th==='ice'||th==='core'){ g.fillStyle=th==='ice'?'#1a3048':'#0c0a0a'; g.fillRect(0,0,W,10);
    g.fillStyle=th==='factory'?'#d9a21a':th==='core'?'#ff2a3a':th==='ice'?'#8ae0ff':'#3a5456'; for(let x=-(camX%24);x<W;x+=24)g.fillRect(x,9,12,1);
    if(th==='factory')for(let x=-(Math.floor(camX*.9)%60);x<W;x+=60){ g.fillStyle='#3a3230'; g.fillRect(x+30,10,1,18+((x/60|0)%3)*6); } }
  if(th==='ice')for(let i=0;i<14;i++){ const sx=((i*53+t*.4-camX*.5)%W+W)%W, sy=((i*37+t*.6)%GROUND); g.fillStyle='#d8f0ff'; g.fillRect(sx|0,sy|0,1,1); }
  const hz=g.createLinearGradient(0,GROUND-30,0,GROUND); hz.addColorStop(0,'rgba(0,0,0,0)'); hz.addColorStop(1,P.fog); g.fillStyle=hz; g.fillRect(0,GROUND-30,W,30); }

/* ======================= GROUND, PITS, PLATFORMS, HAZARDS ======================= */
function drawGround(S,t){ const L=S.L, P=L.pal;
  g.fillStyle=P.gnd; g.fillRect(0,GROUND,W,H-GROUND); g.fillStyle=P.gtop; g.fillRect(0,GROUND,W,1);
  g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(0,GROUND+1,W,2);
  const off=Math.floor(camX);
  if(L.theme==='highway'||L.theme==='city'){ g.fillStyle=L.theme==='highway'?'#d9c060':'#4a3d2a'; for(let x=-(off%40);x<W;x+=40)g.fillRect(x,GROUND+10,14,1); }
  if(L.theme==='roof'){ g.fillStyle='#2e2e3c'; for(let x=-(off%18);x<W;x+=18)g.fillRect(x,GROUND+3,1,H); }
  if(L.theme==='ice'){ g.fillStyle='rgba(255,255,255,.35)'; for(let x=-(off%30);x<W;x+=30)g.fillRect(x+4,GROUND+2,10,1); }
  for(let i=Math.floor(camX/23)-1;i<(camX+W)/23+1;i++){ const h=hash(i); if(h%3)continue; g.fillStyle='rgba(0,0,0,.3)'; g.fillRect(Math.round(i*23-camX)+(h>>>4)%10,GROUND+4+(h>>>8)%12,(h>>>12)%5+2,1); }
  /* pits */
  for(const gp of L.gaps){ const x0=Math.round(gp[0]-camX), x1=Math.round(gp[1]-camX); if(x1<-4||x0>W+4)continue; const w=x1-x0;
    if(L.pit==='lava'){ const gr=g.createLinearGradient(0,GROUND,0,H); gr.addColorStop(0,'#ffcf3a'); gr.addColorStop(.3,'#ff6a1a'); gr.addColorStop(1,'#6a1004');
      g.fillStyle=gr; g.fillRect(x0,GROUND+4,w,H); g.fillStyle='#1a0a04'; g.fillRect(x0,GROUND,w,4);
      for(let k=0;k<3;k++){ const bx=x0+((t*.7+k*17)%Math.max(1,w)); g.fillStyle='#ffe27a'; circ(bx,GROUND+6+Math.sin(t*.2+k)*1.5,1.5); }
      g.fillStyle='rgba(255,120,30,.12)'; g.fillRect(x0-6,GROUND-30,w+12,30); }
    else if(L.pit==='water'){ g.fillStyle='#062024'; g.fillRect(x0,GROUND,w,H); g.fillStyle='#0f4a50'; g.fillRect(x0,GROUND+6,w,H);
      g.fillStyle='#5ae0d0'; for(let x=x0;x<x1;x+=4)g.fillRect(x,GROUND+6+Math.round(Math.sin(t*.1+x*.4)),2,1); }
    else if(L.pit==='sand'){ g.fillStyle='#3a2410'; g.fillRect(x0,GROUND,w,H); g.fillStyle='#6a4420'; for(let k=0;k<5;k++){ const a=t*.05+k; g.fillRect(x0+w/2+Math.cos(a)*w*.3|0,GROUND+8+Math.sin(a)*4|0,2,1); } }
    else if(L.pit==='ice'){ g.fillStyle='#04101c'; g.fillRect(x0,GROUND,w,H); g.fillStyle='#8ae0ff'; g.fillRect(x0,GROUND,1,H); g.fillRect(x1-1,GROUND,1,H); }
    else { const gr=g.createLinearGradient(0,GROUND,0,H); gr.addColorStop(0,'#000'); gr.addColorStop(1,L.theme==='roof'?'#1a1a30':'#000'); g.fillStyle=gr; g.fillRect(x0,GROUND,w,H);
      if(L.theme==='roof'){ for(let k=0;k<4;k++){ g.fillStyle=k%2?'#ffe08a':'#6a6aa0'; g.fillRect(x0+4+((k*13)%Math.max(1,w-8)),GROUND+14+k*2,1,1); } } }
    g.fillStyle=P.gtop; g.fillRect(x0-1,GROUND,1,6); g.fillRect(x1,GROUND,1,6); }
  /* conveyors */
  for(const c of L.conv){ const x=Math.round(c.x-camX); if(x>W||x+c.w<0)continue; g.fillStyle='#2a2a2e'; g.fillRect(x,GROUND-2,c.w,4);
    g.fillStyle='#d9a21a'; const o=((t*.6*c.d)%8+8)%8; for(let k=-8;k<c.w;k+=8)if(k+o>=0&&k+o<c.w)g.fillRect(x+k+o,GROUND-2,3,1);
    g.fillStyle='#555'; circ(x+2,GROUND,2); circ(x+c.w-2,GROUND,2); txt(c.d>0?'>>':'<<',x+c.w/2,GROUND+5,'#6a6a70',1,'c',''); }
  /* platforms */
  for(const p of L.plats){ const x=Math.round(p.x-camX); if(x+p.w<-10||x>W+10)continue; drawPlat(p,x,t); } }
function drawPlat(p,x,t){ const top=p.top, h=GROUND-top;
  switch(p.k){
  case 'car': g.fillStyle='#3a2a2c'; g.fillRect(x,top+4,p.w,h-7); g.fillRect(x+8,top,p.w-16,5); g.fillStyle='#5a4448'; g.fillRect(x+8,top,p.w-16,1); g.fillRect(x,top+4,p.w,1);
    g.fillStyle='#140f12'; g.fillRect(x+10,top+1,8,3); g.fillRect(x+p.w-18,top+1,8,3); g.fillStyle='#0c0a0c'; circ(x+8,GROUND-3,3.5); circ(x+p.w-8,GROUND-3,3.5); break;
  case 'bus': g.fillStyle='#6a4a1a'; g.fillRect(x,top,p.w,h-4); g.fillStyle='#8a6a2a'; g.fillRect(x,top,p.w,2); g.fillStyle='#1a1410';
    for(let i=4;i<p.w-6;i+=9)g.fillRect(x+i,top+4,6,6); g.fillStyle='#3a2a12'; g.fillRect(x,top+13,p.w,2); g.fillStyle='#0c0a0c'; circ(x+10,GROUND-3,3.5); circ(x+p.w-10,GROUND-3,3.5); break;
  case 'crates': for(let r=0;r<Math.ceil(h/12);r++){ const cy=GROUND-(r+1)*12, cw=r?p.w-6:p.w, cx=x+(r?3:0); g.fillStyle='#4a3a26'; g.fillRect(cx,cy,cw,12);
      g.fillStyle='#6a5236'; g.fillRect(cx,cy,cw,1); g.fillStyle='#2e2416'; g.fillRect(cx+1,cy+5,cw-2,1); g.fillRect(cx+Math.floor(cw/2),cy+1,1,11); } break;
  case 'girder': g.fillStyle='#3a3036'; g.fillRect(x,top,p.w,4); g.fillStyle='#8a5a2a'; g.fillRect(x,top,p.w,1);
    g.fillStyle='#2a2226'; for(let i=0;i<p.w-4;i+=8){ g.fillRect(x+i+2,top+4,1,4); g.fillRect(x+i+6,top+4,1,4); } g.fillStyle='#1c1618'; g.fillRect(x+4,top+4,2,h-4); g.fillRect(x+p.w-6,top+4,2,h-4); break;
  case 'train': g.fillStyle='#1e3a3c'; g.fillRect(x,top,p.w,h-4); g.fillStyle='#3a6a6c'; g.fillRect(x,top,p.w,2); g.fillStyle='#0a1a1c';
    for(let i=5;i<p.w-8;i+=10)g.fillRect(x+i,top+5,6,5); g.fillStyle='#d9a21a'; g.fillRect(x,top+12,p.w,1); g.fillStyle='#0a0a0a'; circ(x+8,GROUND-3,3); circ(x+p.w-8,GROUND-3,3); break;
  case 'solar': g.fillStyle='#5a4a3a'; g.fillRect(x+p.w/2-1|0,top,2,h); g.fillStyle='#1e2a4a'; g.fillRect(x,top,p.w,4); g.fillStyle='#4a6aa0'; for(let i=0;i<p.w;i+=6)g.fillRect(x+i,top+1,5,1); break;
  case 'ac': g.fillStyle='#5a5a66'; g.fillRect(x,top,p.w,h); g.fillStyle='#7a7a86'; g.fillRect(x,top,p.w,2); g.fillStyle='#2a2a30'; circ(x+p.w/2,top+h/2,Math.min(p.w,h)/3);
    g.fillStyle='#5a5a66'; g.fillRect(x+p.w/2-1+Math.round(Math.cos(t*.3)*3),top+h/2-1,2,2); break;
  case 'tower': g.fillStyle='#4a3a2a'; g.fillRect(x+4,top+14,2,h-14); g.fillRect(x+p.w-6,top+14,2,h-14); g.fillStyle='#6a4a30'; g.fillRect(x,top,p.w,14); g.fillStyle='#8a6a40'; g.fillRect(x,top,p.w,2);
    g.fillStyle='#4a3020'; for(let i=3;i<p.w;i+=5)g.fillRect(x+i,top+2,1,12); break;
  case 'iceblock': g.fillStyle='#6ab0d8'; g.fillRect(x,top,p.w,h); g.fillStyle='#d8f0ff'; g.fillRect(x,top,p.w,2); g.fillStyle='rgba(255,255,255,.3)'; g.fillRect(x+3,top+4,2,h-8); g.fillRect(x+p.w-8,top+6,4,2); break;
  case 'rack': g.fillStyle='#16080c'; g.fillRect(x,top,p.w,h); g.fillStyle='#3a1018'; g.fillRect(x,top,p.w,2);
    for(let yy=top+4;yy<GROUND-2;yy+=4){ g.fillStyle='#240c12'; g.fillRect(x+2,yy,p.w-4,3); g.fillStyle=((hash(p.x+yy)+(t>>3))%5)?'#4a1018':'#ff3040'; g.fillRect(x+4,yy+1,1,1); } break;
  default: g.fillStyle='#3e3642'; g.fillRect(x,top,p.w,h); g.fillStyle='#5a5060'; g.fillRect(x,top,p.w,2); g.fillStyle='#2a242e'; g.fillRect(x+6,top+5,p.w-14,2);
    g.fillStyle='#6a4a32'; g.fillRect(x+10,top-4,1,4); g.fillRect(x+p.w-12,top-3,1,3); } }
function drawDeco(S,t){ const L=S.L, B=bgLayout(L);
  for(const d of B.deco){ const x=Math.round(d.x-camX); if(x<-60||x>W+60)continue; if(isGapR(L,d.x)||isGapR(L,d.x+30))continue; const h=d.s, r=d.r;
    switch(L.theme){
    case 'city': case 'highway':
      if(r<.35){ g.fillStyle='#2e2226'; g.fillRect(x,GROUND-10,36,7); g.fillRect(x+8,GROUND-15,18,5); g.fillStyle='#0c0a0c'; circ(x+7,GROUND-3,3); circ(x+28,GROUND-3,3);
        if(h%2){ g.fillStyle=t%8<4?'#ffb03a':'#ff6a1a'; g.fillRect(x+12,GROUND-17-(t%6<3?1:0),3,2); g.fillRect(x+15,GROUND-18,2,3); } }
      else if(r<.55){ g.fillStyle='#1c1720'; g.fillRect(x,GROUND-42,2,42); g.fillRect(x,GROUND-42,9,2); if(h%3===0&&(t+h)%90<60){ g.fillStyle='rgba(255,200,120,.07)'; g.beginPath(); g.moveTo(x+9,GROUND-40); g.lineTo(x+1,GROUND); g.lineTo(x+19,GROUND); g.fill(); } }
      else if(r<.75){ for(let i=0;i<7;i++){ const sx=x+(i%4)*6+(i>3?3:0), sy=GROUND-4-(i>3?4:0)-(i>5?4:0); g.fillStyle='#bdb6a8'; g.fillRect(sx,sy,5,4); g.fillStyle='#1a1418'; g.fillRect(sx+1,sy+1,1,1); g.fillRect(sx+3,sy+1,1,1); } }
      else { g.fillStyle='#4a4450'; g.fillRect(x,GROUND-9,28,9); for(let i=0;i<7;i++){ g.fillStyle=i%2?'#d9a21a':'#1a1418'; g.fillRect(x+i*4,GROUND-7,4,2); } } break;
    case 'factory': if(r<.5){ g.fillStyle='#2a2420'; g.fillRect(x,GROUND-14,10,14); g.fillStyle='#d9a21a'; g.fillRect(x,GROUND-14,10,2); g.fillStyle='#1a1410'; g.fillRect(x+2,GROUND-10,6,8); }
      else { g.fillStyle='#3a3a40'; g.fillRect(x,GROUND-6,20,6); g.fillStyle='#5a5a60'; circ(x+5,GROUND-8,3); circ(x+14,GROUND-8,4); } break;
    case 'metro': if(r<.5){ g.fillStyle='#223436'; g.fillRect(x,GROUND-20,3,20); g.fillStyle=(t+h)%70<50?'#bfffe0':'#305048'; g.fillRect(x-2,GROUND-22,7,2); }
      else { g.fillStyle='#2a3a3c'; g.fillRect(x,GROUND-8,24,8); txt('EXIT',x+12,GROUND-7,'#5ae0d0',1,'c',''); } break;
    case 'desert': if(r<.5){ g.fillStyle='#6a5a3a'; g.fillRect(x,GROUND-16,2,16); g.fillRect(x-4,GROUND-12,4,2); g.fillRect(x+2,GROUND-10,4,2); }
      else { for(let i=0;i<4;i++){ g.fillStyle='#e8e0cc'; g.fillRect(x+i*5,GROUND-3-(i%2)*2,4,3); } } break;
    case 'roof': if(r<.5){ g.fillStyle='#3a3a4a'; g.fillRect(x,GROUND-12,2,12); g.fillRect(x-3,GROUND-12,8,1); if(t%50<25){ g.fillStyle='#f33'; g.fillRect(x,GROUND-13,2,1); } }
      else { g.fillStyle='#2a2a38'; g.fillRect(x,GROUND-5,16,5); } break;
    case 'ice': g.fillStyle='#a8d8f0'; g.beginPath(); g.moveTo(x,GROUND); g.lineTo(x+4,GROUND-10-(h%8)); g.lineTo(x+8,GROUND); g.fill(); break;
    case 'core': g.fillStyle='#240812'; g.fillRect(x,GROUND-4,24,4); g.fillStyle=(t+h)%40<20?'#ff3040':'#5a0a14'; g.fillRect(x+2,GROUND-3,20,1); break; } } }
function isGapR(L,x){ for(const gp of L.gaps)if(x>gp[0]-4&&x<gp[1]+4)return true; return false; }
function drawHazards(S,t){
  for(const h of S.hz){
    if(h.k==='crush'){ const x=Math.round(h.x-camX); if(x>W||x+h.w<0)continue; const cy=Math.round(h.cy)+(h.ph==='warn'?(t%4<2?1:-1):0);
      g.fillStyle='#2a2626'; g.fillRect(x+h.w/2-2,0,4,cy); g.fillStyle='#4a4446'; g.fillRect(x,cy-14,h.w,14); g.fillStyle='#6a6266'; g.fillRect(x,cy-14,h.w,2);
      for(let i=0;i<h.w;i+=6){ g.fillStyle=((i/6|0)%2)?'#d9a21a':'#1a1418'; g.fillRect(x+i,cy-4,6,4); }
      if(h.ph==='warn'||h.ph==='up'&&false){ g.fillStyle=`rgba(255,40,40,${.25+.2*Math.sin(t*.5)})`; g.fillRect(x,GROUND-2,h.w,2); } }
    else if(h.k==='icicle'){ if(h.st==='gone')continue; const x=Math.round(h.x-camX)+(h.st==='shake'?(t%4<2?1:-1):0), y=Math.round(h.y);
      g.fillStyle='#bfe8ff'; g.beginPath(); g.moveTo(x-3,y-8); g.lineTo(x+3,y-8); g.lineTo(x,y+6); g.fill(); g.fillStyle='#fff'; g.fillRect(x-1,y-7,1,6); }
    else if(h.k==='laser'){ const x=Math.round(h.x-camX); if(x<-4||x>W+4)continue; g.fillStyle='#2a0a10'; g.fillRect(x-3,4,7,6); g.fillRect(x-3,GROUND-4,7,4);
      if(h.ph==='warn'&&t%6<3){ g.fillStyle='rgba(255,40,60,.5)'; g.fillRect(x,10,1,GROUND-14); }
      if(h.ph==='on'){ g.fillStyle='#ff2a3a'; g.fillRect(x-2,10,5,GROUND-14); g.fillStyle='#ffe0e0'; g.fillRect(x,10,1,GROUND-14); } } } }

/* ======================= ENTITIES ======================= */
function drawPlayer(S,p,t){
  if(p.st==='gone')return;
  if(p.st==='ghost'){ const x=Math.round(p.x-camX), y=Math.round(p.y); g.globalAlpha=.55+.2*Math.sin(t*.2); spr(PSP[p.id].jump,p.x,p.y+10,p.face,true); g.globalAlpha=1;
    g.fillStyle='#ffe27a'; g.fillRect(x-4,y-14,8,1); if(S.np>1&&t%40<26)txt('REVIVE!',x,y-22,PCOL[p.id],1,'c'); return; }
  if(p.tank>=0)return;
  if(p.inv>0&&t%4<2)return;
  const P=PSP[p.id], s=p.crouch?P.crouch:!p.onGround?P.jump:Math.abs(p.vx)>.3?((Math.floor(p.runT/6)%2)?P.runA:P.runB):P.idle;
  spr(s,p.x-p.face*p.recoil,p.y,p.face);
  const GL={pistol:[7,'#5b5f66','#9aa0a8'],H:[10,'#3d4148','#80868f'],S:[10,'#4b3a2a','#8b6a4a'],R:[11,'#3f5a2e','#7a9a5a'],F:[10,'#6a3a2a','#c96a3a']}[p.weapon];
  const [dx,dy]=p.aim==='up'?[0,-1]:p.aim==='diag'?[p.face*.7071,-.7071]:p.aim==='down'?[0,1]:[p.face,0];
  const sx=p.x+p.face*2-p.face*p.recoil, sy=p.y-(p.crouch?5:12);
  for(let i=0;i<GL[0];i++){ const x=Math.round(sx+dx*i-camX), y=Math.round(sy+dy*i); g.fillStyle=GL[1]; g.fillRect(x,y,2,2); g.fillStyle=GL[2]; g.fillRect(x,y,1,1); }
  g.fillStyle=PPAL[p.id].s; g.fillRect(Math.round(sx-camX)-1,Math.round(sy)+1,2,2);
  if(p.shootT>0&&p.weapon!=='F'){ const mx=Math.round(sx+dx*(GL[0]+1)-camX), my=Math.round(sy+dy*(GL[0]+1)), r=p.weapon==='S'?4:p.weapon==='H'?3:2;
    g.fillStyle='#fff6c0'; g.fillRect(mx-r+1,my,r*2-1,1); g.fillRect(mx,my-r+1,1,r*2-1); g.fillStyle='#ffb03a'; g.fillRect(mx-1,my-1,2,2); }
  if(p.knifeT>0){ const kx=Math.round(p.x+p.face*8-camX), ky=Math.round(p.y-15), a=8-p.knifeT; g.fillStyle='#fff';
    for(let i=0;i<6;i++)g.fillRect(kx+p.face*i,ky+Math.round(a*1.3)+i-2,1,1); }
  if(S.np>1){ g.fillStyle=PCOL[p.id]; const x=Math.round(p.x-camX); g.fillRect(x-1,Math.round(p.y)-26,3,1); g.fillRect(x,Math.round(p.y)-25,1,1); } }
function drawTank(S,T,i,t){ if(T.st==='gone')return; g.globalAlpha=(T.inv>0&&T.st==='driven'&&t%6<3)?.45:1;
  const f=T.face, x=Math.round(T.x-camX-f*T.recoil), y=Math.round(T.y), fl=T.flash>0, C=c=>fl?'#fff':c;
  g.fillStyle=C('#1e1c1a'); g.fillRect(x-15,y-7,30,7); g.fillStyle=C('#3a3632'); const o=((Math.floor(T.tread)%4)+4)%4;
  for(let k=-14+o;k<14;k+=4){ g.fillRect(x+k,y-7,2,1); g.fillRect(x+k,y-1,2,1); } g.fillStyle=C('#4a4640'); for(let k=-10;k<=10;k+=5)g.fillRect(x+k-1,y-5,3,3);
  g.fillStyle=C('#5a6a34'); g.fillRect(x-14,y-14,28,7); g.fillStyle=C('#72843f'); g.fillRect(x-14,y-14,28,2); g.fillStyle=C('#3e4a22'); g.fillRect(x-14,y-9,28,2);
  for(let k=0;k<4;k++){ g.fillStyle=C(k%2?'#d9a21a':'#1a1418'); g.fillRect(x+(f>0?-12:4)+k*2,y-12,2,2); }
  g.fillStyle=C('#5a6a34'); g.fillRect(x-8,y-20,16,6); g.fillStyle=C('#72843f'); g.fillRect(x-7,y-21,14,2);
  g.fillStyle=C('#3a3f30'); g.fillRect(f>0?x+8:x-20,y-17,12,3); g.fillStyle=C('#22261c'); g.fillRect(f>0?x+19:x-22,y-18,3,5);
  const dx=Math.cos(T.aim)*f, dy=-Math.sin(T.aim); g.fillStyle=C('#8a8f96'); for(let k=0;k<10;k++)g.fillRect(Math.round(x+dx*k),Math.round(y-19+dy*k),2,2);
  if(T.shootT>0){ const mx=Math.round(x+dx*11), my=Math.round(y-19+dy*11); g.fillStyle='#fff6c0'; g.fillRect(mx-2,my,5,1); g.fillRect(mx,my-2,1,5); }
  if(T.st==='driven'&&T.drv>=0){ const pal=PPAL[T.drv], hx=x-f*3-3; g.fillStyle=pal.a; g.fillRect(hx,y-27,6,2); g.fillStyle=pal.h; g.fillRect(hx,y-25,6,1);
    g.fillStyle=pal.s; g.fillRect(hx+1,y-24,4,3); g.fillStyle='#101010'; g.fillRect(hx+(f>0?4:1),y-23,1,1); }
  else if(T.st==='parked'&&t%50<32){ txt('IN!',x,y-36,'#ffe27a',1,'c'); g.fillStyle='#ffe27a'; g.fillRect(x-2,y-29,5,1); g.fillRect(x-1,y-28,3,1); g.fillRect(x,y-27,1,1); }
  if(T.st==='dying'&&t%8<4){ g.fillStyle='rgba(255,60,30,.35)'; g.fillRect(x-15,y-22,30,22); } g.globalAlpha=1; }
function drawEnemy(S,e,t){ const fl=e.flash>0, x=Math.round(e.x-camX), y=Math.round(e.y), d=e.dir, C=c=>fl?'#fff':c;
  switch(e.t){
  case 'walker': case 'shield':
    spr((Math.floor(e.walkT/8)%2)?WK1:WK2,e.x,e.y,d,fl); { const ax=Math.round(e.x-camX+d*4), ay=y-12; g.fillStyle=C('#5d6570'); g.fillRect(d>0?ax:ax-5,ay,6,2);
      if(e.aimT>0&&t%4<2){ g.fillStyle='#ff3a3a'; g.fillRect(d>0?ax+6:ax-7,ay,2,2); }
      if(e.swipe>0){ g.fillStyle='#fff'; g.fillRect(d>0?ax+2:ax-6,ay-4+Math.round((18-e.swipe)/3),4,1); } }
    if(e.t==='shield'){ const sx=x+d*7; g.fillStyle=C('#6a7078'); g.fillRect(d>0?sx:sx-3,y-18,4,17); g.fillStyle=C('#9aa3ad'); g.fillRect(d>0?sx:sx-3,y-18,4,1);
      g.fillStyle=C('#d9a21a'); g.fillRect(d>0?sx+1:sx-2,y-12,2,5); } break;
  case 'heavy': spr(HV,e.x,e.y+(Math.sin(e.walkT*.2)>0?1:0),d,fl); if(e.fireCd<15&&t%4<2){ g.fillStyle='#ff5a3a'; g.fillRect(x+d*10,y-15,2,2); } break;
  case 'drone': if(e.dying){ g.save(); g.translate(x,y); g.rotate(e.spin||0); g.drawImage(fl?DR.rw:DR.r,-DR.w/2,-DR.h/2); g.restore(); break; }
    spr(DR,e.x,e.y+4,d,fl); g.fillStyle=t%4<2?'#6af':'#fff'; g.fillRect(x-5,y+4,2,1+t%3); g.fillRect(x+3,y+4,2,1+(t+1)%3); break;
  case 'jumper': { const sq=e.onGround?1:0; g.fillStyle=C('#5a8a4a'); g.fillRect(x-6,y-10+sq,12,8-sq); g.fillStyle=C('#7aaa5a'); g.fillRect(x-5,y-12+sq,10,3);
      g.fillStyle=fl?'#fff':'#ff3a2a'; g.fillRect(x-4,y-11+sq,2,2); g.fillRect(x+2,y-11+sq,2,2); g.fillStyle=C('#3a5a2a');
      if(e.onGround){ g.fillRect(x-7,y-3,3,3); g.fillRect(x+4,y-3,3,3); } else { g.fillRect(x-7,y-2,2,4); g.fillRect(x+5,y-2,2,4); } break; }
  case 'turret': { g.fillStyle=C('#3a3f48'); g.fillRect(x-7,y-5,14,5); g.fillStyle=C('#5d6570'); g.beginPath(); g.arc(x,y-5,6,Math.PI,0); g.fill();
      const a=e.ang, bx=x+Math.cos(a)*9, by=y-8+Math.sin(a)*9; g.strokeStyle=C('#22262c'); g.lineWidth=3; g.beginPath(); g.moveTo(x,y-8); g.lineTo(bx,by); g.stroke(); g.lineWidth=1;
      g.fillStyle=(e.fireCd<20&&t%4<2)||e.bN>0?'#ff4a2a':'#6a1a10'; g.fillRect(x-1,y-9,2,2); break; }
  case 'bike': { const wob=(e.walkT%6<3)?0:1; g.fillStyle='#111'; circ(x-6,y-3,3); circ(x+6,y-3,3); g.fillStyle='#555'; circ(x-6,y-3,1); circ(x+6,y-3,1);
      g.fillStyle=C('#7a2a2a'); g.fillRect(x-7,y-8,14,4); g.fillStyle=C('#9aa3ad'); g.fillRect(x-2,y-14-wob,6,6); g.fillStyle='#ff2a2a'; g.fillRect(x+(d>0?2:-1),y-12-wob,2,1);
      g.fillStyle='rgba(255,160,60,.6)'; g.fillRect(d>0?x-10:x+8,y-6,2,1); break; }
  case 'bomber': if(e.dying){ g.save(); g.translate(x,y); g.rotate(e.spin||0); g.fillStyle='#fff'; g.fillRect(-11,-3,22,5); g.restore(); break; }
    g.fillStyle=C('#4a4450'); g.fillRect(x-11,y-2,22,4); g.fillRect(x-4,y-5,8,3); g.fillStyle=C('#6a6470'); g.fillRect(x-11,y-2,22,1);
    g.fillStyle=t%6<3?'#ff3a2a':'#6a1a10'; g.fillRect(x-1,y+2,2,1); g.fillStyle='#aaa'; g.fillRect(x+(d>0?10:-12),y-3+(t%2),2,5); break;
  case 'mine': { const armed=e.arm>0, lit=armed?(t%4<2):(t%30<6); g.fillStyle=C('#3a3f48'); g.beginPath(); g.arc(x,y-2,4,Math.PI,0); g.fill();
      g.fillStyle=lit?'#ff3a2a':'#6a1a10'; g.fillRect(x-1,y-5,2,1); g.fillStyle=C('#22262c'); const k=(e.walkT>>2)%2; g.fillRect(x-5,y-1+k,2,1); g.fillRect(x+3,y-k,2,1); break; }
  case 'pod': if(e.st==='warn'){ const gy=podLandY(S,e.x); if(t%8<5){ g.strokeStyle='#ff3a2a'; g.beginPath(); g.ellipse(x,gy-1,7,2,0,0,TAU); g.stroke(); txt('!',x,gy-10,'#ff3a2a',1,'c'); } break; }
    g.fillStyle=C('#5a5060'); g.fillRect(x-7,y-16,14,16); g.fillStyle=C('#7a7080'); g.fillRect(x-7,y-16,14,2); g.fillStyle=C('#d9a21a'); g.fillRect(x-7,y-8,14,2);
    g.fillStyle=e.st==='land'&&t%6<3?'#ff3a2a':'#2a2630'; g.fillRect(x-3,y-13,6,3); if(e.st==='fall'){ g.fillStyle='rgba(255,160,60,.6)'; g.fillRect(x-3,y-20,6,4); } break; } }
function podLandY(S,x){ for(const p of S.L.plats)if(x>p.x&&x<p.x+p.w)return p.top; return GROUND; }
function drawPows(S,t){ for(const p of S.pows){ if(p.x<camX-20||p.x>camX+W+20)continue;
  if(p.st==='tied'){ g.fillStyle='#4a3522'; g.fillRect(Math.round(p.x-camX)+5,GROUND-19,2,19); spr(POW_T,p.x+Math.round(Math.sin(p.sway)*.6),p.y,1); if(t%50<28)txt('HELP!',p.x-camX,GROUND-27,'#fff',1,'c'); }
  else if(p.st==='free')spr(POW_F,p.x,p.y,1); else spr(POW_T,p.x,p.y-(Math.floor(p.t/5)%2),-1); } }
function drawCrates(S,t){ const COL={H:'#ff5a3a',S:'#ffb03a',R:'#6ad04a',F:'#ff3a8a',B:'#ffe27a','+':'#ff5a8a'};
  for(const c of S.crates){ if(c.life<120&&t%6<3)continue; const x=Math.round(c.x-camX), y=Math.round(c.y)-Math.round(Math.abs(Math.sin(t*.1))*1.5);
    g.fillStyle='#2a1d12'; g.fillRect(x-6,y-11,12,11); g.fillStyle=c.type==='+'?'#5a2a3a':'#6a4a2a'; g.fillRect(x-5,y-10,10,9); g.fillStyle='#8a6a3a'; g.fillRect(x-5,y-10,10,1);
    txt(c.type==='+'?'♥':c.type,x,y-8,COL[c.type],1,'c','#000'); } }
function drawBullets(S,t){
  for(const b of S.pb){ const x=Math.round(b.x-camX), y=Math.round(b.y);
    if(b.k==='b'){ g.fillStyle='#ffe27a'; g.fillRect(x-1,y,3,1); }
    else if(b.k==='h'){ g.fillStyle='#f9a33a'; g.fillRect(x-Math.round(b.vx)-1,y-Math.round(b.vy),2,1); g.fillStyle='#fff6c0'; g.fillRect(x-1,y,3,1); }
    else if(b.k==='s'){ g.fillStyle=b.life%2?'#ffd070':'#fff'; g.fillRect(x,y,2,2); }
    else if(b.k==='r'){ const cx=Math.cos(b.ang), cy=Math.sin(b.ang); g.fillStyle=t%2?'#ffb03a':'#fff2a0'; g.fillRect(Math.round(x-cx*5),Math.round(y-cy*5),2,2);
      g.fillStyle='#3f5a2e'; for(let i=0;i<4;i++)g.fillRect(Math.round(x-cx*i),Math.round(y-cy*i),2,2); }
    else if(b.k==='c'){ g.fillStyle='#2a2a2a'; g.fillRect(x-2,y-1,4,3); g.fillStyle='#ffb03a'; g.fillRect(b.vx>0?x-4:x+2,y,2,1); }
    else if(b.k==='f'){ const k=1-b.life/b.max; g.globalAlpha=Math.max(.15,1-k*.9); g.fillStyle=k<.3?'#fff2a0':k<.6?'#ff9a2a':'#c0301a'; circ(x,y,2+k*5); g.globalAlpha=1; } }
  for(const b of S.eb){ const x=Math.round(b.x-camX), y=Math.round(b.y);
    switch(b.k){
    case 'bolt': g.fillStyle='#ff3a3a'; g.fillRect(x-2,y-1,5,2); g.fillStyle='#ffd0d0'; g.fillRect(x-1,y-1,3,1); break;
    case 'orb': g.fillStyle=t%4<2?'#ff5ad0':'#fff'; g.fillRect(x-1,y-1,3,3); break;
    case 'orb2': g.fillStyle=t%4<2?'#ff4a6a':'#ffd0d8'; circ(x,y,2); break;
    case 'shot': g.fillStyle=t%4<2?'#ffe27a':'#ff7a3a'; g.fillRect(x-1,y-1,3,3); break;
    case 'acid': g.fillStyle='#8aff5a'; circ(x,y,2); g.fillStyle='#d0ffb0'; g.fillRect(x-1,y-1,1,1); break;
    case 'shard': g.fillStyle='#d8f0ff'; g.save(); g.translate(x,y); g.rotate(Math.atan2(b.vy,b.vx)); g.fillRect(-3,-1,6,2); g.restore(); break;
    case 'icicle': g.fillStyle='#bfe8ff'; g.beginPath(); g.moveTo(x-3,y-8); g.lineTo(x+3,y-8); g.lineTo(x,y+4); g.fill(); break;
    case 'spark': g.fillStyle=t%3?'#ffcf5a':'#fff'; g.fillRect(x-1,y-1,2,2); break;
    case 'missile': g.fillStyle='#3a3f48'; g.fillRect(x-1,y-6,3,7); g.fillStyle='#ff3a2a'; g.fillRect(x-1,y,3,2); g.fillStyle=t%2?'#ffb03a':'#fff2a0'; g.fillRect(x-1,y-9,3,3); break;
    case 'bomb': g.fillStyle='#2a2a30'; circ(x,y,2.5); g.fillStyle=t%6<3?'#ff4a2a':'#6a1a10'; g.fillRect(x,y-3,1,1); break;
    default: g.fillStyle='#2a2a30'; g.fillRect(x-2,y-2,4,4); g.fillStyle=t%6<3?'#ff4a2a':'#6a1a10'; g.fillRect(x-1,y-1,2,2); } }
  for(const w of S.waves){ g.fillStyle=t%4<2?'#ffb060':'#ff6030'; g.fillRect(Math.round(w.x-camX)-3,GROUND-4,6,4); }
  for(const n of S.nades){ const x=Math.round(n.x-camX), y=Math.round(n.y); g.fillStyle='#3a5a22'; g.fillRect(x-1,y-2,3,3); if(t%6<3){ g.fillStyle='#ff4'; g.fillRect(x,y-3,1,1); } } }
function drawParticles(){
  for(const p of PARTS){ const x=Math.round(p.x-camX), y=Math.round(p.y);
    if(p.k==='flash'){ g.globalAlpha=p.life/p.max; g.fillStyle='#fff8d0'; circ(x,y,p.r*(1.2-p.life/p.max*.5)); g.globalAlpha=1; continue; }
    if(p.k==='fire'){ g.fillStyle=p.r>5?'#fff2a0':p.r>3?'#ff9a2a':'#d0401a'; circ(x,y,p.r); continue; }
    if(p.k==='smoke'){ g.globalAlpha=Math.min(.55,p.life/60); g.fillStyle='#3a3440'; circ(x,y,p.r); g.globalAlpha=1; continue; }
    if(p.k==='chunk'){ g.fillStyle=p.col; g.fillRect(x,y,p.w,p.h); continue; }
    if(p.k==='skull'){ g.fillStyle='#d8dde4'; g.fillRect(x-2,y-2,5,4); g.fillStyle='#111'; g.fillRect(x-1,y-1,1,1); g.fillRect(x+1,y-1,1,1); continue; }
    if(p.k==='casing'){ g.fillStyle='#d9a21a'; g.fillRect(x,y,2,1); continue; }
    g.globalAlpha=Math.min(1,p.life/10); g.fillStyle=p.col; g.fillRect(x,y,p.sz,p.sz); g.globalAlpha=1; }
  for(const f of FLOATS)txt(f.t,f.x-camX,f.y,f.col,1,'c'); }
function drawFront(S){ const B=bgLayout(S.L); g.fillStyle='rgba(8,6,10,.9)'; for(const f of B.front){ const x=Math.round(f.x-camX*1.3); if(x>W||x+f.w<0)continue;
  g.fillRect(x,H-f.h,f.w,f.h); g.fillRect(x+3,H-f.h-2,Math.max(1,f.w-6),2); } }

/* ======================= HUD + OVERLAYS ======================= */
function drawHUD(S,t,net){
  const hud=(p,right)=>{ const X=right?W-4:4, al=right?'r':'l', col=PCOL[p.id];
    txt((p.id?'2P':'1P'),right?X:X,3,col,1,al);
    for(let i=0;i<PHP;i++){ const hx=right?X-14-i*8:X+14+i*8; g.fillStyle=i<p.hp?'#ff3a4a':'#3a1418'; g.fillRect(hx-(right?5:0),3,5,5); g.fillStyle='rgba(0,0,0,.4)'; g.fillRect(hx-(right?5:0),7,5,1);
      if(i<p.hp&&p.hp===1&&t%20<10){ g.fillStyle='#fff'; g.fillRect(hx-(right?5:0),3,5,1); } }
    const T=p.tank>=0?S.tanks[p.tank]:null;
    const arms=T?'∞':p.ammo<0?'∞':String(p.ammo), bombs=T?T.shells:p.bombs, wn=T?'RHINO':{pistol:'',H:'H.MG',S:'SHOTGUN',R:'ROCKET',F:'FLAME'}[p.weapon];
    g.fillStyle='rgba(0,0,0,.5)'; g.fillRect(right?X-60:X-1,10,61,15);
    txt('ARMS',right?X-57:X+1,11,'#ffc43a'); txt('BOMB',right?X-26:X+31,11,T?'#9ad04a':'#ffc43a');
    txt(arms,right?X-57:X+1,18,'#fff'); txt(String(bombs),right?X-26:X+31,18,'#fff');
    if(wn&&!T)txt(wn,right?X:X,27,'#ffe27a',1,al);
    if(T){ for(let i=0;i<T.maxhp;i++){ g.fillStyle=i<T.hp?'#6ad04a':'#1a2a12'; g.fillRect((right?X-60:X)+i*6,27,5,3); } }
    if(p.st==='ghost')txt('GHOST',right?X:X,27,col,1,al); if(p.st==='gone')txt('OUT',right?X:X,27,'#888',1,al); };
  hud(S.players[0],false); if(S.players[1])hud(S.players[1],true);
  txt(String(S.stats.score).padStart(7,'0'),W/2,3,'#fff',1,'c');
  if(S.boss&&S.boss.st!=='dying'&&S.boss.maxhp){ const b=S.boss; g.fillStyle='#000'; g.fillRect(W/2-51,11,102,5); g.fillStyle='#5a0a0a'; g.fillRect(W/2-50,12,100,3);
    g.fillStyle=b.flash>0?'#fff':'#ff3a2a'; g.fillRect(W/2-50,12,Math.round(100*b.hp/b.maxhp),3); txt((BOSSES[b.id]||{}).name||'',W/2,18,'#ff6a5a',1,'c'); }
  else { const pr=clamp(S.cam.x/(S.L.len-W),0,1); g.fillStyle='rgba(0,0,0,.5)'; g.fillRect(W/2-30,12,60,3); g.fillStyle='#ffc43a'; g.fillRect(W/2-30,12,Math.round(60*pr),3); g.fillStyle='#fff'; g.fillRect(W/2+30,11,1,5); }
  if(net)txt(net,W/2,H-7,'#8a90a8',1,'c'); }
function drawOverlays(S,t){
  if(BANNER){ const k=BANNER.t; if(k<120){ const a=Math.min(1,k/10,(120-k)/10); g.globalAlpha=a; g.fillStyle='rgba(0,0,0,.6)'; g.fillRect(0,34,W,40);
      txt(BANNER.a,W/2,40,'#ffe27a',2,'c','#7a1a00'); txt(BANNER.b,W/2,58,'#e0e6ee',1,'c'); g.globalAlpha=1; }
    else if(k<200){ const a=k<160?'READY?':'GO!'; txt(a,W/2,50,k<160?'#fff':'#ffe27a',3,'c','#7a1a00'); } }
  if(CALLOUT){ const sc=textW(CALLOUT.text,2)<W-8?2:1; txt(CALLOUT.text,W/2,76,CALLOUT.col||(t%8<4?'#fff':'#ffc43a'),sc,'c','#000'); }
  if(GO_T>0&&t%30<18&&!S.bossSeq){ txt('GO!',W-34,56,'#fff',2,'c','#a00'); txt('>>',W-14,59,'#ffe27a',1,'c'); }
  if(WARN_T>0&&t%20<12){ g.fillStyle='rgba(180,0,0,.18)'; g.fillRect(0,0,W,H); txt('WARNING!',W/2,50,'#ff3a3a',3,'c','#300'); txt('MASSIVE MACHINE APPROACHING',W/2,74,'#fff',1,'c'); }
  if(FLASH>0){ g.fillStyle='rgba(255,255,255,'+(FLASH/24)+')'; g.fillRect(0,0,W,H); } }

/* ======================= main entry ======================= */
function renderLevel(S,t,net,demo){
  camX=S.cam.x; g.save(); if(SHAKE>0)g.translate(Math.round(cr(-SHAKE,SHAKE)),Math.round(cr(-SHAKE,SHAKE)));
  drawBackground(S,t); drawDeco(S,t); drawGround(S,t); drawHazards(S,t); drawPows(S,t); drawCrates(S,t);
  for(let i=0;i<S.tanks.length;i++)drawTank(S,S.tanks[i],i,t);
  for(const e of S.enemies)drawEnemy(S,e,t);
  if(S.boss)drawBossGfx(S,S.boss,t);
  for(const p of S.players)drawPlayer(S,p,t);
  drawBullets(S,t); drawParticles(); drawFront(S); g.restore();
  if(demo)return; drawHUD(S,t,net); drawOverlays(S,t); }
