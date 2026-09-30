'use strict';
/* =====================================================================
   MAIN — screens, input, save data, online glue, the 60 Hz loop.
   ===================================================================== */
const cv=document.getElementById('c'); renderInit(cv.getContext('2d')); buildSprites();
function fit(){ const B=document.body; B.classList.toggle('portrait',innerHeight>innerWidth); B.classList.toggle('landscape',innerHeight<=innerWidth);
  const box=document.getElementById('wrap'), bw=box.clientWidth||innerWidth, bh=box.clientHeight||innerHeight;
  let s=Math.min(bw/W,bh/H); if(s>=3)s=Math.floor(s); cv.style.width=Math.round(W*s)+'px'; cv.style.height=Math.round(H*s)+'px'; }
addEventListener('resize',fit); fit();

/* ---------------- save ---------------- */
const SAVE_KEY='scraprun_save_v1'; let SAVE={unlocked:1,best:{},seenEnd:false};
try{ const s=JSON.parse(localStorage.getItem(SAVE_KEY)); if(s&&s.unlocked)SAVE=Object.assign(SAVE,s); }catch(e){}
function saveGame(){ try{ localStorage.setItem(SAVE_KEY,JSON.stringify(SAVE)); }catch(e){} }

/* ---------------- input ---------------- */
const KB={}, KBP={}; let TYPING=false, CODE='';
const LAYOUT_SOLO={l:['KeyA','ArrowLeft'],r:['KeyD','ArrowRight'],u:['KeyW','ArrowUp'],d:['KeyS','ArrowDown'],
  fire:['KeyJ','KeyZ','ControlLeft','ControlRight'],jump:['KeyK','KeyX','Space','AltLeft'],bomb:['KeyL','KeyC']};
const LAYOUT_DUO=[{l:['KeyA'],r:['KeyD'],u:['KeyW'],d:['KeyS'],fire:['KeyF'],jump:['KeyG','Space'],bomb:['KeyH']},
  {l:['ArrowLeft'],r:['ArrowRight'],u:['ArrowUp'],d:['ArrowDown'],fire:['Comma','Numpad1'],jump:['Period','Numpad2'],bomb:['Slash','Numpad3']}];
/* ARCADE (?arcade in the URL) — Ultimarc I-PAC 2 keyboard encoder on the cabinet:
     P1 stick=arrows  B1 LCtrl=SHOOT  B2 LAlt=JUMP  B3 Space=BOMB  B4 LShift=BOMB  B5 Z=SHOOT  B6 X=JUMP  START=1  COIN=5
     P2 stick=R/F/D/G B1 A=SHOOT     B2 S=JUMP     B3 Q=BOMB     B4 W=BOMB      START=2  COIN=6 */
const ARCADE=/arcade/.test(location.search);
if(ARCADE){
  Object.assign(LAYOUT_SOLO,{l:['ArrowLeft'],r:['ArrowRight'],u:['ArrowUp'],d:['ArrowDown'],fire:['ControlLeft','KeyZ'],jump:['AltLeft','KeyX'],bomb:['Space','ShiftLeft']});
  LAYOUT_DUO[0]={l:['ArrowLeft'],r:['ArrowRight'],u:['ArrowUp'],d:['ArrowDown'],fire:['ControlLeft','KeyZ'],jump:['AltLeft','KeyX'],bomb:['Space','ShiftLeft']};
  LAYOUT_DUO[1]={l:['KeyD'],r:['KeyG'],u:['KeyR'],d:['KeyF'],fire:['KeyA'],jump:['KeyS'],bomb:['KeyQ','KeyW']}; }
const GAME_KEYS=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','AltLeft','ControlLeft','Slash','Enter','Escape']);
const COARSE=(()=>{ try{ return matchMedia('(pointer:coarse)').matches; }catch(e){ return false; } })();
addEventListener('keydown',e=>{ audioInit(); if(!COARSE&&!document.body.classList.contains('kb')){ document.body.classList.add('kb'); document.body.classList.remove('touch'); fit(); }
  if(TYPING){ if(/^Key[A-Z]$/.test(e.code)&&CODE.length<4){ CODE+=e.code[3]; SFX('sel'); } else if(e.code==='Backspace')CODE=CODE.slice(0,-1);
    else if(e.code==='Enter'&&CODE.length===4){ TYPING=false; netJoin(CODE); } else if(e.code==='Escape'){ TYPING=false; } e.preventDefault(); return; }
  if(!KB[e.code])KBP[e.code]=1; KB[e.code]=1; if(GAME_KEYS.has(e.code))e.preventDefault();
  if(e.code==='KeyM')toggleMute(); });
addEventListener('keyup',e=>{ KB[e.code]=0; });
addEventListener('blur',()=>{ for(const k in KB)KB[k]=0; });
/* a tap on the canvas = START/OK; TAPX/TAPY (game px) let menus pick the line / map node that was tapped */
let TAPX=-1, TAPY=-1;
cv.addEventListener('pointerdown',e=>{ audioInit(); KBP.Enter=1; const r=cv.getBoundingClientRect();
  if(r.width&&r.height){ TAPX=(e.clientX-r.left)*W/r.width; TAPY=(e.clientY-r.top)*H/r.height; } });
function tapRow(y0,step,n){ if(TAPY<0)return -1; const i=Math.floor((TAPY-y0)/step); return i>=0&&i<n?i:-1; }
/* the audio unlock gesture on touch screens is the finger LIFT, so wake the audio there too (capture: buttons stop propagation) */
addEventListener('pointerup',()=>audioInit(),true); addEventListener('touchend',()=>audioInit(),true);
const kAny=(list)=>list.some(c=>KB[c]||KBP[c]);
/* ---- touch controls (mobile): virtual d-pad + SHOOT/JUMP/BOMB + pause. Tap = one press (no auto-fire). ---- */
const TOUCH={l:0,r:0,u:0,d:0,fire:0,jump:0,bomb:0}; let TOUCHP={};
function touchOn(){ const B=document.body; if(ARCADE)return; if(!B.classList.contains('touch')){ B.classList.add('touch'); B.classList.remove('kb'); fit(); } }
addEventListener('touchstart',touchOn,{passive:true}); addEventListener('pointerdown',e=>{ if(e.pointerType==='touch')touchOn(); },true);
(function(){ const pad=document.getElementById('tpad'); if(!pad)return; const knob=pad.querySelector('.knob'); let pid=null;
  const set=e=>{ const r=pad.getBoundingClientRect(), R=r.width/2; let dx=e.clientX-(r.left+R), dy=e.clientY-(r.top+R); const m=Math.hypot(dx,dy);
    if(m>R){ dx*=R/m; dy*=R/m; } knob.style.transform=`translate(${dx*.6}px,${dy*.6}px)`; const dz=R*.3, was=Object.assign({},TOUCH);
    TOUCH.l=dx<-dz; TOUCH.r=dx>dz; TOUCH.u=dy<-dz; TOUCH.d=dy>dz; for(const k of ['l','r','u','d'])if(TOUCH[k]&&!was[k])TOUCHP[k]=1; };
  pad.addEventListener('pointerdown',e=>{ touchOn(); pid=e.pointerId; try{ pad.setPointerCapture(pid); }catch(_){ } set(e); audioInit(); e.preventDefault(); });
  pad.addEventListener('pointermove',e=>{ if(e.pointerId===pid)set(e); });
  const up=e=>{ if(e.pointerId!==pid)return; pid=null; TOUCH.l=TOUCH.r=TOUCH.u=TOUCH.d=0; knob.style.transform=''; };
  pad.addEventListener('pointerup',up); pad.addEventListener('pointercancel',up);
  [['tbFire','fire'],['tbJump','jump'],['tbBomb','bomb']].forEach(([id,k])=>{ const el=document.getElementById(id);
    el.addEventListener('pointerdown',e=>{ touchOn(); TOUCH[k]=1; TOUCHP[k]=1; el.classList.add('on'); try{ el.setPointerCapture(e.pointerId); }catch(_){ } audioInit(); e.preventDefault(); e.stopPropagation(); });
    const off=()=>{ TOUCH[k]=0; el.classList.remove('on'); }; el.addEventListener('pointerup',off); el.addEventListener('pointercancel',off); });
  document.getElementById('tbPause').addEventListener('pointerdown',e=>{ KBP.Escape=1; e.preventDefault(); e.stopPropagation(); });
  const mb=document.getElementById('tbMute'); if(mb)mb.addEventListener('pointerdown',e=>{ audioInit(); toggleMute(); e.preventDefault(); e.stopPropagation(); });
  muteLabel(); })();
/* phone put away / app switched (Instagram users do this constantly): pause the level and drop held touches,
   so nobody comes back to a dead run or a stick stuck held down */
function releaseTouch(){ for(const k in TOUCH)TOUCH[k]=0; TOUCHP={}; for(const k in KB)KB[k]=0;
  const kn=document.querySelector('#tpad .knob'); if(kn)kn.style.transform=''; document.querySelectorAll('#touch .tb.on').forEach(b=>b.classList.remove('on')); }
function autoPause(){ releaseTouch(); if(NET.role!=='guest'&&SCR==='level'&&S&&S.phase==='play'&&!PAUSED){ PAUSED=true; SEL=0; } }
document.addEventListener('visibilitychange',()=>{ if(document.hidden){ autoPause(); try{ if(AC)AC.suspend().catch(()=>{}); }catch(e){} } else audioInit(); });
addEventListener('pagehide',autoPause); addEventListener('blur',autoPause);
function touchMask(){ let m=0; const t=k=>TOUCH[k]||TOUCHP[k]; if(t('l'))m|=B_L; if(t('r'))m|=B_R; if(t('u'))m|=B_U; if(t('d'))m|=B_D;
  if(t('fire'))m|=B_FIRE; if(t('jump'))m|=B_JUMP; if(t('bomb'))m|=B_BOMB; return m; }
function maskFrom(L){ let m=0; if(kAny(L.l))m|=B_L; if(kAny(L.r))m|=B_R; if(kAny(L.u))m|=B_U; if(kAny(L.d))m|=B_D;
  if(kAny(L.fire))m|=B_FIRE; if(kAny(L.jump))m|=B_JUMP; if(kAny(L.bomb))m|=B_BOMB; return m; }
let PADS=[];
function padMask(i){ const gp=PADS[i]; if(!gp)return 0; const b=k=>gp.buttons[k]&&gp.buttons[k].pressed, ax=gp.axes||[]; let m=0;
  if((ax[0]||0)<-.5||b(14))m|=B_L; if((ax[0]||0)>.5||b(15))m|=B_R; if((ax[1]||0)<-.5||b(12))m|=B_U; if((ax[1]||0)>.5||b(13))m|=B_D;
  if(b(0))m|=B_JUMP; if(b(2)||b(3)||b(7))m|=B_FIRE; if(b(1)||b(6))m|=B_BOMB; if(b(9))m|=B_START; return m; }
function pollPads(){ try{ PADS=[...(navigator.getGamepads?navigator.getGamepads():[])].filter(Boolean); if(PADS.length)audioInit(); }catch(e){ PADS=[]; } }
/* masks for the local humans this frame */
function localMasks(np){
  if(np===2&&(MODE==='duo'||(ARCADE&&MODE==='solo2'))){ return [maskFrom(LAYOUT_DUO[0])|padMask(0)|touchMask(), maskFrom(LAYOUT_DUO[1])|padMask(1)]; }
  let m=maskFrom(LAYOUT_SOLO)|touchMask(); for(let i=0;i<PADS.length;i++)m|=padMask(i); return [m]; }
/* menu edges from everyone */
let MPREV=0, PADSTART_PREV=false;
function menuKeys(){ let m=maskFrom(LAYOUT_SOLO)|maskFrom(LAYOUT_DUO[0])|maskFrom(LAYOUT_DUO[1])|touchMask(); for(let i=0;i<PADS.length;i++)m|=padMask(i);
  const hit=m&~MPREV; MPREV=m; const ps=PADS.some(gp=>gp.buttons[9]&&gp.buttons[9].pressed), pst=ps&&!PADSTART_PREV; PADSTART_PREV=ps;
  return {up:!!(hit&B_U),down:!!(hit&B_D),left:!!(hit&B_L),right:!!(hit&B_R),ok:!!(hit&(B_FIRE|B_JUMP))||!!KBP.Enter||!!KBP.NumpadEnter||pst||(ARCADE&&(!!KBP.Digit1||!!KBP.Digit2)),
    back:!!KBP.Escape||!!KBP.Backspace||!!(hit&B_BOMB), pause:!!KBP.Escape||!!KBP.KeyP||pst||(ARCADE&&(!!KBP.Digit1||!!KBP.Digit2))}; }

/* ---------------- state ---------------- */
let SCR='title', MODE='solo', NP=1, S=null, LI=0, RETRIES=0, SEL=0, T=0, MSG='', MSGT=0;
let DEMO=null, DEMOMEM=[{},{}], RESULT=null, FAIL=null, PAUSED=false, NEWBEST=false, CLEARED_ALL=false;
let GUEST={view:null,scr:'wait',data:null,fx:[],lastMask:0,hits:0}, HOSTIN={mask:0,hits:0}, NETFX=[], P2BOT=false, BOTMEM={};
const TIPS=['CROUCH TO DUCK RED BOLTS - AND TO SHOOT MINES','HOLD UP TO SHOOT DRONES OVERHEAD','SHIELD BOTS: KNIFE THEM, BOMB THEM OR SHOOT THEIR BACK',
  'JUMP INTO THE RHINO TANK - DOWN + JUMP TO BAIL OUT','GLOWING WEAK POINTS: JUMP AND SHOOT THEM','RED X MARKS = INCOMING STRIKE. MOVE!',
  'CO-OP: TOUCH YOUR PARTNER\'S GHOST TO REVIVE THEM','TAP FIRE FAST - THERE IS NO AUTO-FIRE','FREE POWS FOR SUPPLIES AND A BETTER GRADE',
  'PITS COST A HEART - LOOK BEFORE YOU LEAP','BOSS FIGHTS HAVE A CHECKPOINT - RETRY FROM THE BOSS'];
function flash(m){ MSG=m; MSGT=180; }

/* ---------------- flow ---------------- */
function startLevel(i,fromBoss){ LI=i; resetFX(); FXQ.length=0; PAUSED=false; P2BOT=false; BOTMEM={};
  S=newSim({li:i,np:NP,seed:(Date.now()%1e9)|0,fromBoss:!!fromBoss,retries:RETRIES}); musicStart('stage',LEVELS[i].mus); SCR='level'; }
function toMap(){ SCR='map'; SEL=Math.min(SEL,SAVE.unlocked-1); musicStart('map',{root:40,sd:.16}); PAUSED=false; }
function obReport(score){ try{ const k='ob-scrap-run-best', b=+localStorage.getItem(k)||0; if(score>b)localStorage.setItem(k,String(score)); }catch(e){}
  try{ if(window.OB){ OB.submitScore('scrap-run',score); OB.gameOver('scrap-run'); } }catch(e){} }
function bestScore(){ try{ return +localStorage.getItem('ob-scrap-run-best')||0; }catch(e){ return 0; } }
function finishToGrade(){ obReport(S.stats.score); const r=S.result, L=LEVELS[LI], prev=SAVE.best[L.id];
  NEWBEST=!prev||r.pts>prev.pts; if(NEWBEST)SAVE.best[L.id]={grade:r.grade,pts:r.pts,score:r.score};
  if(LI+1>=SAVE.unlocked)SAVE.unlocked=Math.min(LEVELS.length,LI+2); CLEARED_ALL=LI===LEVELS.length-1&&!SAVE.seenEnd; saveGame();
  RESULT={r,L,t:0}; SCR='grade'; musicStop(); }

/* ---------------- per-screen update ---------------- */
function tick(){ T++; pollPads(); netTick(); const K=menuKeys();
  if(MSGT>0)MSGT--;
  if(NET.role==='guest'){ guestTick(K); endFrame(); return; }
  switch(SCR){
  case 'title': titleTick(K); break;
  case 'controls': if(K.ok||K.back){ SCR='title'; SFX('sel'); } break;
  case 'online': onlineTick(K); break;
  case 'map': mapTick(K); break;
  case 'level': levelTick(K); break;
  case 'fail': failTick(K); break;
  case 'grade': RESULT.t++; if(RESULT.t>70&&K.ok){ if(CLEARED_ALL){ SCR='ending'; SAVE.seenEnd=true; saveGame(); RESULT.t=0; } else toMap(); } break;
  case 'ending': RESULT.t++; if(RESULT.t>180&&K.ok)toMap(); break; }
  if(NET.role==='host')hostSend();
  endFrame(); }
function endFrame(){ for(const k in KBP)KBP[k]=0; TOUCHP={}; TAPX=TAPY=-1; stepFX(); }
const TITLE_ITEMS=['1 PLAYER','1P + BOT BUDDY','2 PLAYERS - SAME SCREEN','ONLINE CO-OP','CONTROLS'];
function titleTick(K){
  if(!DEMO||DEMO.phase!=='play'||DEMO.t>60*70){ DEMO=newSim({li:(T/3600|0)%3,np:2,seed:T+7,god:true}); DEMOMEM=[{},{}]; }
  simStep(DEMO,[botInput(DEMO,0,DEMOMEM[0]),botInput(DEMO,1,DEMOMEM[1])]); SILENT=true; consumeFX(FXQ,DEMO); SILENT=false; FXQ.length=0;
  if(K.up){ SEL=(SEL+TITLE_ITEMS.length-1)%TITLE_ITEMS.length; SFX('sel'); } if(K.down){ SEL=(SEL+1)%TITLE_ITEMS.length; SFX('sel'); }
  if(K.ok){ const ti=tapRow(74,11,TITLE_ITEMS.length); if(ti>=0)SEL=ti; }
  if(K.ok){ SFX('ok'); resetFX(); DEMO=null;
    if(SEL===0){ MODE='solo'; NP=1; toMap(); } else if(SEL===1){ MODE='bot'; NP=2; toMap(); } else if(SEL===2){ MODE='duo'; NP=2; toMap(); }
    else if(SEL===3){ SCR='online'; SEL=0; } else SCR='controls'; SEL=SCR==='map'?Math.max(0,SAVE.unlocked-1):SEL; } }
const ONLINE_ITEMS=['HOST A GAME','JOIN A GAME','BACK'];
function onlineTick(K){
  if(NET.role==='host'&&NET.ready){ MODE='online'; NP=2; SEL=Math.max(0,SAVE.unlocked-1); toMap(); flash('PLAYER 2 JOINED!'); return; }
  if(TYPING)return;
  if(K.up){ SEL=(SEL+2)%3; SFX('sel'); } if(K.down){ SEL=(SEL+1)%3; SFX('sel'); }
  if(K.back){ netReset(); SCR='title'; SEL=3; return; }
  if(K.ok){ const oi=tapRow(58,12,ONLINE_ITEMS.length); if(oi>=0)SEL=oi; }
  if(K.ok){ SFX('ok'); if(SEL===0)netHost(); else if(SEL===1){ netReset();
      // phones have no keyboard to type the room code on the canvas: ask with the system prompt instead
      if(document.body.classList.contains('touch')){ let c=''; try{ c=String(prompt('Enter the 4-letter room code')||''); }catch(e){}
        c=c.toUpperCase().replace(/[^A-Z]/g,'').slice(0,4); if(c.length===4)netJoin(c); else if(c)flash('ROOM CODES ARE 4 LETTERS'); }
      else { TYPING=true; CODE=''; } }
    else { netReset(); SCR='title'; SEL=3; } } }
function mapTick(K){ const n=SAVE.unlocked;
  if(K.left||K.up){ SEL=Math.max(0,SEL-1); SFX('sel'); } if(K.right||K.down){ SEL=Math.min(n-1,SEL+1); SFX('sel'); }
  if(K.back&&!KBP.Enter){ if(MODE==='online')netReset(); SCR='title'; SEL=0; musicStop(); return; }
  if(K.ok&&TAPX>=0){ // tapped a mission node? pick it (locked ones stay unpickable)
    let bi=-1, bd=16*16; for(let i=0;i<n;i++){ const dx=MAP_NODES[i][0]-TAPX, dy=MAP_NODES[i][1]-TAPY, d=dx*dx+dy*dy; if(d<bd){ bd=d; bi=i; } }
    if(bi>=0)SEL=bi; }
  if(K.ok){ SFX('ok'); RETRIES=0; startLevel(SEL,false); } }
function levelTick(K){
  if(K.pause&&S.phase==='play'){ PAUSED=!PAUSED; SEL=0; SFX('sel'); if(PAUSED)return; }
  if(PAUSED){ if(K.up)SEL=(SEL+2)%3; if(K.down)SEL=(SEL+1)%3;
    if(K.ok){ const pi=tapRow(58,12,3); if(pi>=0)SEL=pi; }
    if(K.ok){ PAUSED=false; if(SEL===1){ RETRIES++; startLevel(LI,false); } else if(SEL===2)toMap(); } return; }
  let masks=localMasks(NP);
  if(MODE==='bot')masks[1]=botInput(S,1,BOTMEM);
  if(MODE==='online'){ if(NET.ready){ masks[1]=HOSTIN.mask|HOSTIN.hits; HOSTIN.hits=0; }
    else { if(!P2BOT){ P2BOT=true; flash('P2 DISCONNECTED - BOT TAKES OVER'); } masks[1]=botInput(S,1,BOTMEM); } }
  simStep(S,masks); if(NET.role==='host')for(const f of FXQ)NETFX.push(f); consumeFX(FXQ,S); FXQ.length=0;
  if(S.phase==='clear'&&S.endT>150)finishToGrade();
  if(S.phase==='fail'&&S.endT>70){ obReport(S.stats.score); FAIL={progress:S.progress||0,cp:S.checkpoint,tip:TIPS[(T/7|0)%TIPS.length],t:0}; SCR='fail'; SEL=0; musicStop(); } }
function failItems(){ return FAIL.cp?['RETRY FROM BOSS','RETRY FROM START','WORLD MAP']:['RETRY','WORLD MAP']; }
function failTick(K){ FAIL.t++; const it=failItems(); if(FAIL.t<40)return;
  if(K.up){ SEL=(SEL+it.length-1)%it.length; SFX('sel'); } if(K.down){ SEL=(SEL+1)%it.length; SFX('sel'); }
  if(K.ok){ const fi=tapRow(92,11,it.length); if(fi>=0)SEL=fi; }
  if(K.ok){ SFX('ok'); const c=it[SEL]; RETRIES++; if(c==='RETRY FROM BOSS')startLevel(LI,true); else if(c==='WORLD MAP')toMap(); else startLevel(LI,false); } }

/* ---------------- online: host side ---------------- */
NET.onData=(d)=>{ if(!d)return;
  if(NET.role==='host'&&d.k==='i'){ HOSTIN.mask=d.m|0; HOSTIN.hits|=d.h|0; }
  if(NET.role==='guest'&&d.k==='s'){ GUEST.scr=d.scr; GUEST.data=d; if(d.snap){ try{ GUEST.view=unsnap(d.snap); }catch(e){} } if(d.fx)for(const f of d.fx)GUEST.fx.push(f); } };
function hostSend(){ if(!NET.ready||T%2)return; const msg={k:'s',scr:SCR,paused:PAUSED,sel:SEL,t:T};
  if(SCR==='level'&&S){ msg.snap=snapOf(S); msg.fx=NETFX; NETFX=[]; }
  else if(SCR==='map'){ msg.save=SAVE; }
  else if(SCR==='grade'){ msg.result=RESULT&&RESULT.r; msg.li=LI; msg.newbest=NEWBEST; }
  else if(SCR==='fail'){ msg.fail=FAIL; msg.items=failItems(); }
  netSend(msg); }
/* ---------------- online: guest side ---------------- */
function guestTick(K){
  const m=localMasks(1)[0]; GUEST.hits|=(m&~GUEST.lastMask); GUEST.lastMask=m;
  if(NET.ready){ netSend({k:'i',m,h:GUEST.hits}); GUEST.hits=0; }
  if(GUEST.fx.length){ consumeFX(GUEST.fx,GUEST.view); GUEST.fx=[]; }
  if(!NET.ready&&(NET.status==='HOST LEFT'||NET.status==='CONNECTION ERROR')){ if(K.ok||K.back){ netReset(); SCR='title'; SEL=3; GUEST={view:null,scr:'wait',data:null,fx:[],lastMask:0,hits:0}; } }
  if(!NET.ready&&K.back&&!TYPING){ netReset(); SCR='title'; SEL=3; } }

/* ======================= DRAWING ======================= */
function frame(){ document.body.classList.toggle('playing',SCR==='level'||NET.role==='guest'&&GUEST.scr==='level');
  g.setTransform(1,0,0,1,0,0); g.fillStyle='#000'; g.fillRect(0,0,W,H);
  if(NET.role==='guest'){ drawGuest(); return; }
  switch(SCR){
  case 'title': drawTitle(); break; case 'controls': drawControls(); break; case 'online': drawOnline(); break;
  case 'map': drawMap(SAVE,SEL); break;
  case 'level': renderLevel(S,T,netLabel()); if(PAUSED)drawPause(); break;
  case 'fail': renderLevel(S,T); drawFail(FAIL,failItems(),SEL); break;
  case 'grade': drawGrade(RESULT.r,RESULT.L,RESULT.t,NEWBEST); break;
  case 'ending': drawEnding(RESULT.t); break; }
  if(MSGT>0)txt(MSG,W/2,H-16,'#ffe27a',1,'c'); }
function netLabel(){ if(MODE!=='online')return ''; return NET.ready?`ONLINE · ${Math.round(NET.rtt)}MS`:'P2 BOT'; }
function drawGuest(){
  if(!NET.ready){ drawBackdrop(); txt('ONLINE CO-OP',W/2,26,'#ffe27a',2,'c','#7a1a00');
    if(TYPING||NET.status===''){ txt('ENTER ROOM CODE',W/2,58,'#fff',1,'c'); txt((CODE+'____').slice(0,4).split('').join(' '),W/2,72,'#ffe27a',3,'c'); txt('TYPE 4 LETTERS · ENTER TO JOIN · ESC BACK',W/2,106,'#8a90a8',1,'c'); }
    else { txt(NET.status,W/2,64,'#fff',1,'c'); txt('ESC TO GO BACK',W/2,106,'#8a90a8',1,'c'); } return; }
  const d=GUEST.data||{};
  if(GUEST.scr==='level'&&GUEST.view){ renderLevel(GUEST.view,T,`ONLINE · YOU ARE 2P · ${Math.round(NET.rtt)}MS`); if(d.paused){ drawPause(true); } }
  else if(GUEST.scr==='map'&&d.save)drawMap(d.save,d.sel,true);
  else if(GUEST.scr==='grade'&&d.result)drawGrade(d.result,LEVELS[d.li],60,d.newbest);
  else if(GUEST.scr==='fail'&&d.fail){ if(GUEST.view)renderLevel(GUEST.view,T); drawFail(d.fail,d.items||['RETRY'],d.sel,true); }
  else { drawBackdrop(); txt('CONNECTED!',W/2,56,'#6ad04a',2,'c'); txt('WAITING FOR THE HOST...',W/2,78,'#fff',1,'c'); } }
function drawBackdrop(){ const gr=g.createLinearGradient(0,0,0,H); gr.addColorStop(0,'#0a0c16'); gr.addColorStop(1,'#3a1a16'); g.fillStyle=gr; g.fillRect(0,0,W,H);
  g.fillStyle='#4a1c1c'; circ(200,40,17); g.fillStyle='#6e2a24'; circ(200,40,14); }
function drawLogo(y){ txt('SCRAP',W/2,y,'#ffb03a',4,'c','#5a1a00'); txt('RUN',W/2,y+24,'#e0e6ee',4,'c','#3a3f48'); }
function drawTitle(){
  if(DEMO){ renderLevel(DEMO,T,"",true); g.fillStyle='rgba(4,3,8,.62)'; g.fillRect(0,0,W,H); } else drawBackdrop();
  const y=12+Math.round(Math.sin(T*.05)*1.5); drawLogo(y); txt('HUMANITY VS THE MACHINES',W/2,y+49,'#ff5a4a',1,'c');
  TITLE_ITEMS.forEach((it,i)=>{ const yy=76+i*11, on=i===SEL; if(on){ g.fillStyle='rgba(255,196,58,.18)'; g.fillRect(W/2-66,yy-2,132,9); }
    txt((on?'> ':'')+it+(on?' <':''),W/2,yy,on?'#ffe27a':'#aab0c0',1,'c'); });
  const got=Object.keys(SAVE.best).length; txt(`MISSIONS ${got}/${LEVELS.length}   BEST ${bestScore()}`,W/2,H-8,'#6a7080',1,'c'); }
function drawControls(){ drawBackdrop(); txt('CONTROLS',W/2,8,'#ffe27a',2,'c','#7a1a00');
  const row=(y,k,a,col)=>{ txt(k,110,y,col||'#ffc43a',1,'r'); txt(a,118,y,'#cfe'); };
  txt('1 PLAYER (EITHER LAYOUT)',W/2,28,'#fff',1,'c');
  row(38,'WASD / ARROWS','MOVE · UP AIMS UP · DOWN CROUCH'); row(47,'J / Z','SHOOT (TAP IT!)'); row(56,'K / X / SPACE','JUMP'); row(65,'L / C','BOMB');
  txt('2 PLAYERS - SAME SCREEN',W/2,80,'#fff',1,'c');
  row(90,'P1: WASD','F SHOOT  G JUMP  H BOMB',PCOL[0]); row(99,'P2: ARROWS',', SHOOT  . JUMP  / BOMB',PCOL[1]);
  txt('GAMEPAD: A JUMP · X SHOOT · B BOMB · START PAUSE',W/2,113,'#8a90a8',1,'c');
  txt('TOUCH: STICK + SHOOT / JUMP / BOMB · DOWN+JUMP DROPS',W/2,122,'#8a90a8',1,'c'); txt('PRESS ANY BUTTON',W/2,134,T%40<26?'#fff':'#555',1,'c'); }
function drawOnline(){ drawBackdrop(); txt('ONLINE CO-OP',W/2,14,'#ffe27a',2,'c','#7a1a00'); txt('PLAY WITH A FRIEND ANYWHERE',W/2,32,'#cfe',1,'c');
  if(NET.role==='host'){ txt('ROOM CODE',W/2,50,'#fff',1,'c'); txt(NET.code?NET.code.split('').join(' '):'....',W/2,60,'#ffe27a',4,'c','#7a1a00');
    txt(NET.status,W/2,88,'#8a90a8',1,'c'); txt('YOUR FRIEND PICKS ONLINE > JOIN AND TYPES IT',W/2,100,'#6a7080',1,'c'); txt('ESC TO CANCEL',W/2,128,'#6a7080',1,'c'); return; }
  ONLINE_ITEMS.forEach((it,i)=>{ const on=i===SEL; txt((on?'> ':'')+it+(on?' <':''),W/2,60+i*12,on?'#ffe27a':'#aab0c0',1,'c'); });
  txt('HOST PLAYS 1P · FRIEND PLAYS 2P · NEEDS INTERNET',W/2,112,'#6a7080',1,'c'); }
function drawPause(guest){ g.fillStyle='rgba(0,0,0,.66)'; g.fillRect(0,0,W,H); txt('PAUSED',W/2,34,'#fff',2,'c');
  if(guest){ txt('THE HOST PAUSED THE GAME',W/2,64,'#cfe',1,'c'); return; }
  ['RESUME','RESTART LEVEL','WORLD MAP'].forEach((it,i)=>{ const on=i===SEL; txt((on?'> ':'')+it+(on?' <':''),W/2,60+i*12,on?'#ffe27a':'#aab0c0',1,'c'); });
  txt('WASD+JKL · ARROWS+ZXC · M MUTE',W/2,H-12,'#6a7080',1,'c'); }
function drawFail(F,items,sel,guest){ g.fillStyle='rgba(20,2,4,.72)'; g.fillRect(0,0,W,H); const k=Math.min(1,(F.t||40)/20);
  txt('YOU DIED!',W/2,18-(1-k)*20,'#ff3a3a',3,'c','#400');
  const bx=40, bw=W-80, by=52; g.fillStyle='#1a0a0a'; g.fillRect(bx-2,by-2,bw+4,9); g.fillStyle='#3a1a1a'; g.fillRect(bx,by,bw,5);
  g.fillStyle='#ffc43a'; g.fillRect(bx,by,Math.round(bw*F.progress),5); txt('START',bx,by+9,'#8a90a8',1,'l'); txt('BOSS',bx+bw,by+9,'#ff6a5a',1,'r');
  g.fillStyle='#fff'; g.fillRect(bx+Math.round(bw*F.progress)-1,by-4,3,13);
  txt(F.tip,W/2,74,'#cfe',1,'c');
  items.forEach((it,i)=>{ const on=i===sel; txt((on?'> ':'')+it+(on?' <':''),W/2,94+i*11,on?'#ffe27a':'#aab0c0',1,'c'); });
  if(guest)txt('HOST CHOOSES',W/2,H-8,'#6a7080',1,'c'); }
function drawGrade(r,L,t,nb){ drawBackdrop(); txt('RESULTS',W/2,8,'#ffe27a',2,'c','#7a1a00'); txt(L.name,W/2,26,'#cfe',1,'c');
  const lines=[['TIME',`${Math.floor(r.secs/60)}:${String(r.secs%60).padStart(2,'0')}  (PAR ${Math.floor(L.par/60)}:${String(L.par%60).padStart(2,'0')})`,r.timePts,30],
    ['HITS TAKEN',String(r.hits),r.hitPts,30],['POWS SAVED',`${r.pows}/${r.powsTotal}`,r.powPts,20],['RETRIES',String(r.retries),r.tryPts,20]];
  lines.forEach((l,i)=>{ if(t<10+i*12)return; const y=42+i*12; txt(l[0],36,y,'#aab0c0'); txt(l[1],150,y,'#fff',1,'r'); txt(`${l[2]}/${l[3]}`,176,y,'#ffc43a'); });
  if(t>62){ const s=Math.max(1,7-(t-62)*.5), col=r.grade[0]==='A'?'#ffe27a':r.grade[0]==='B'?'#6ad04a':r.grade[0]==='C'?'#5ab0ff':'#ff6a5a';
    txt(r.grade,212,72-s*2,col,Math.round(s*1.4)||1,'c','#000'); if(t>74){ txt('GRADE',212,98,'#aab0c0',1,'c'); if(nb&&T%40<26)txt('NEW BEST!',212,108,'#ffe27a',1,'c'); } }
  txt('SCORE '+r.score,36,98,'#cfe'); if(t>70)txt('PRESS START',W/2,H-10,T%40<26?'#fff':'#555',1,'c'); }
function drawEnding(t){ drawBackdrop(); const a=Math.min(1,t/60); g.globalAlpha=a;
  txt('THE OVERMIND',W/2,24,'#ff5a4a',2,'c','#400'); txt('IS SCRAP.',W/2,40,'#ffe27a',2,'c','#7a1a00');
  txt('THE MACHINES GO QUIET.',W/2,64,'#cfe',1,'c'); txt('HUMANITY TAKES BACK THE WORLD.',W/2,74,'#cfe',1,'c');
  const gs=LEVELS.map(L=>(SAVE.best[L.id]||{}).grade||'-').join(' '); txt('GRADES  '+gs,W/2,96,'#ffc43a',1,'c');
  txt('THANKS FOR PLAYING · OUTPOST BOYZ',W/2,112,'#8a90a8',1,'c'); g.globalAlpha=1; if(t>180)txt('PRESS START',W/2,H-10,T%40<26?'#fff':'#555',1,'c'); }

/* ---------------- world map (Cuphead-style overworld) ---------------- */
const MAP_ICON={
  city:(x,y,c)=>{ g.fillStyle=c; g.fillRect(x-5,y-8,4,8); g.fillRect(x,y-11,5,11); g.fillStyle='#000'; g.fillRect(x+1,y-9,1,1); g.fillRect(x+3,y-6,1,1); },
  factory:(x,y,c)=>{ g.fillStyle=c; g.fillRect(x-6,y-6,12,6); g.fillRect(x+2,y-12,3,6); g.fillStyle='#888'; circ(x+4,y-14+Math.sin(T*.1),2); },
  highway:(x,y,c)=>{ g.fillStyle=c; g.fillRect(x-1,y-12,2,12); g.fillRect(x-5,y-12,10,5); g.fillStyle='#000'; txt('66',x,y-11,'#000',1,'c',''); },
  metro:(x,y,c)=>{ g.fillStyle=c; g.beginPath(); g.arc(x,y,7,Math.PI,0); g.fill(); txt('M',x,y-6,'#000',1,'c',''); },
  desert:(x,y,c)=>{ g.fillStyle=c; circ(x+3,y-9,3); g.fillStyle='#c08040'; g.beginPath(); g.ellipse(x,y-1,8,3,0,Math.PI,0); g.fill(); },
  roof:(x,y,c)=>{ g.fillStyle=c; g.fillRect(x-4,y-8,8,8); g.fillRect(x-1,y-14,2,6); if(T%40<20){ g.fillStyle='#f33'; g.fillRect(x-1,y-15,2,1); } },
  ice:(x,y,c)=>{ g.fillStyle=c; for(let a=0;a<3;a++){ g.save(); g.translate(x,y-6); g.rotate(a*Math.PI/3); g.fillRect(-6,-1,12,2); g.restore(); } },
  core:(x,y,c)=>{ g.fillStyle='#2a0a14'; circ(x,y-6,7); g.fillStyle=c; circ(x,y-6,4); g.fillStyle='#000'; circ(x,y-6,1.5); } };
function drawMap(save,sel,guest){ const gr=g.createLinearGradient(0,0,0,H); gr.addColorStop(0,'#1e1a24'); gr.addColorStop(1,'#3a2a1c'); g.fillStyle=gr; g.fillRect(0,0,W,H);
  for(let i=0;i<140;i++){ const h=hash(i*7919), x=h%W, y=(h>>>9)%H; g.fillStyle=['#2a2230','#3a2e24','#241e2a','#4a3a2a'][h%4]; g.fillRect(x,y,1+(h>>>20)%3,1); }
  for(let i=0;i<9;i++){ const h=hash(i*31337), x=h%W, y=30+(h>>>9)%100; g.fillStyle='rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x,y,8+(h>>>14)%10,3,0,0,TAU); g.fill(); }
  txt('WORLD MAP',W/2,4,'#ffe27a',2,'c','#7a1a00');
  for(let i=0;i<MAP_NODES.length-1;i++){ const [x0,y0]=MAP_NODES[i], [x1,y1]=MAP_NODES[i+1], open=i+1<save.unlocked;
    for(let k=0;k<=12;k++){ if(!open&&k%2)continue; const x=lerp(x0,x1,k/12), y=lerp(y0,y1,k/12)+Math.sin(k/12*Math.PI)*4; g.fillStyle=open?'#c8a878':'#4a4038'; g.fillRect(Math.round(x),Math.round(y),2,2); } }
  LEVELS.forEach((L,i)=>{ const [x,y]=MAP_NODES[i], locked=i>=save.unlocked, b=save.best[L.id], on=i===sel;
    g.fillStyle='rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(x,y+2,10,3,0,0,TAU); g.fill();
    g.fillStyle=locked?'#3a3438':on?'#ffe27a':'#8a7a5a'; circ(x,y,8); g.fillStyle=locked?'#241e22':'#1a1410'; circ(x,y,6);
    if(locked){ g.fillStyle='#6a6068'; g.fillRect(x-3,y-2,6,5); g.strokeStyle='#6a6068'; g.beginPath(); g.arc(x,y-2,2,Math.PI,0); g.stroke(); }
    else MAP_ICON[L.theme](x,y+4,L.pal.win);
    if(b)txt(b.grade,x+9,y-12,b.grade[0]==='A'?'#ffe27a':'#cfe',1,'c');
    txt(String(i+1),x-10,y-12,locked?'#4a4048':'#aab0c0',1,'c'); });
  const [cx,cy]=MAP_NODES[sel]; const by=cy-20+Math.round(Math.sin(T*.15)*2);
  g.fillStyle=PPAL[0].h; g.fillRect(cx-4,by,8,2); g.fillStyle=PPAL[0].s; g.fillRect(cx-3,by+2,6,5); g.fillStyle='#101010'; g.fillRect(cx+1,by+3,1,1); g.fillStyle=PPAL[0].a; g.fillRect(cx-4,by-2,8,2);
  const L=LEVELS[sel], b=save.best[L.id]; g.fillStyle='rgba(0,0,0,.72)'; g.fillRect(8,H-30,W-16,26); g.fillStyle=L.pal.win; g.fillRect(8,H-30,3,26);
  txt(`${sel+1}. ${L.name}`,16,H-27,'#ffe27a'); txt(L.tag,16,H-19,'#aab0c0');
  txt(b?`BEST ${b.grade}  ${b.score}`:'NOT CLEARED',W-14,H-27,b?'#6ad04a':'#6a7080',1,'r');
  txt(guest?'HOST PICKS THE MISSION':'START = GO · ESC = BACK',W-14,H-19,T%40<26?'#fff':'#777',1,'r'); }

/* ---------------- loop ---------------- */
let last=performance.now(), acc=0;
function loop(now){ acc+=Math.min(100,now-last); last=now; let n=0;
  while(acc>=1000/60&&n<4){ tick(); acc-=1000/60; n++; } frame(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
/* dev/test hook */
window.SR={get S(){return S;},get scr(){return SCR;},get net(){return NET;},step:(n)=>{ for(let i=0;i<(n||1);i++)tick(); frame(); },
  start:(i,np,mode)=>{ NP=np||1; MODE=mode||(NP===2?'bot':'solo'); RETRIES=0; startLevel(i||0,false); },
  warpBoss:()=>{ if(S){ S.cam.x=S.L.len-W-40; for(const t of S.trig){ t.fired=true; t.cleared=true; } S.enemies=[]; S.players.forEach((p,i)=>{ p.x=S.cam.x+40+i*16; p.y=GROUND; }); } },
  god:(on)=>{ if(S)S.god=on!==false; }, unlockAll:()=>{ SAVE.unlocked=LEVELS.length; saveGame(); } };
/* the site's "◂ OUTPOST BOYZ" home button only makes sense on outpostboyz.com/games/… */
{ const hb=document.querySelector('.home-btn'); if(hb&&(ARCADE||!/\/games\//.test(location.pathname)))hb.remove(); }
/* phones/tablets: show the touch controls straight away */
try{ if(matchMedia('(pointer:coarse)').matches&&!ARCADE)touchOn(); }catch(e){}
