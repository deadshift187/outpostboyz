'use strict';
/* =====================================================================
   AUDIO — synth SFX, per-level chiptune (stage + boss), announcer voice.
   All generated with WebAudio (no files). Silent until the first input.
   ===================================================================== */
let AC=null, sfxG=null, musG=null, MUTED=false, NB=null, SILENT=false;   // SILENT = attract demo
try{ MUTED=localStorage.getItem('scraprun_mute')==='1'; }catch(e){}
/* Called from every input. Browsers only unlock audio on certain gestures (Android Chrome: pointerUP/touchend for
   touch, not pointerdown), so a context made on the first touch-down starts 'suspended' - keep nudging it awake. */
function audioInit(){ if(AC){ if(AC.state==='suspended'&&!document.hidden)try{ AC.resume().catch(()=>{}); }catch(e){} return; }
  try{ AC=new (window.AudioContext||window.webkitAudioContext)();
  const m=AC.createGain(); m.gain.value=.6; m.connect(AC.destination); sfxG=AC.createGain(); sfxG.connect(m); musG=AC.createGain(); musG.gain.value=MUTED?0:.18; musG.connect(m);
  if(MUTED)sfxG.gain.value=0;
  NB=AC.createBuffer(1,AC.sampleRate,AC.sampleRate); const c=NB.getChannelData(0); for(let i=0;i<c.length;i++)c[i]=Math.random()*2-1;
  if(AC.state==='suspended')AC.resume().catch(()=>{}); }catch(e){ AC=null; } }
function muteLabel(){ const b=document.getElementById('tbMute'); if(b)b.classList.toggle('off',MUTED); }
function toggleMute(){ MUTED=!MUTED; try{ localStorage.setItem('scraprun_mute',MUTED?'1':'0'); }catch(e){} if(musG)musG.gain.value=MUTED?0:.18; if(sfxG)sfxG.gain.value=MUTED?0:1; if(MUTED)try{ speechSynthesis.cancel(); }catch(e){} muteLabel(); }
function tone(f,d,type,v,slide,dest,when){ if(!AC)return; const t=when||AC.currentTime, o=AC.createOscillator(), ga=AC.createGain();
  o.type=type||'square'; o.frequency.setValueAtTime(f,t); if(slide&&slide!==1)o.frequency.exponentialRampToValueAtTime(Math.max(20,f*slide),t+d);
  ga.gain.setValueAtTime(v||.1,t); ga.gain.exponentialRampToValueAtTime(.0001,t+d); o.connect(ga).connect(dest||sfxG); o.start(t); o.stop(t+d+.02); }
function noise(d,v,freq,type,dest,when){ if(!AC)return; const t=when||AC.currentTime, n=AC.createBufferSource(); n.buffer=NB;
  const f=AC.createBiquadFilter(); f.type=type||'lowpass'; f.frequency.value=freq||1600; const ga=AC.createGain();
  ga.gain.setValueAtTime(v||.2,t); ga.gain.exponentialRampToValueAtTime(.0001,t+d); n.connect(f).connect(ga).connect(dest||sfxG); n.start(t,Math.random()*.5); n.stop(t+d+.02); }
const SFXT={
  pistol(){tone(880,.05,'square',.06,.35);noise(.04,.07,3000,'highpass');}, hmg(){tone(430,.04,'square',.05,.5);noise(.05,.09,2400);},
  shot(){noise(.25,.35,900);tone(120,.2,'sawtooth',.12,.4);}, rocket(){noise(.3,.12,700,'bandpass');tone(300,.25,'sawtooth',.05,.3);},
  flame(){noise(.09,.07,1200,'bandpass');}, knife(){noise(.07,.18,5000,'highpass');tone(1400,.05,'triangle',.05,.6);},
  boom(){noise(.35,.3,800);tone(100,.3,'sawtooth',.16,.35);}, boomBig(){noise(.6,.45,500);tone(70,.5,'sawtooth',.16,.35);},
  laser(){tone(1200,.18,'sawtooth',.05,.15);}, shell(){tone(160,.15,'square',.07,.6);noise(.1,.08,600);}, orb(){tone(600,.1,'triangle',.06,1.6);},
  ehit(){noise(.05,.1,2500);tone(300,.04,'square',.04,.6);}, bhit(){tone(90,.06,'square',.06,.7);}, jump(){tone(260,.12,'square',.05,1.9);},
  pickup(){tone(660,.07,'square',.08,1.5);setTimeout(()=>tone(990,.1,'square',.08,1.4),70);}, pow(){tone(520,.08,'triangle',.08,1.3);setTimeout(()=>tone(780,.12,'triangle',.08,1.2),90);},
  die(){tone(500,.6,'square',.1,.1);noise(.4,.2,900);}, hurt(){tone(220,.2,'sawtooth',.12,.4);noise(.12,.18,1400);}, nade(){tone(220,.15,'triangle',.07,1.5);},
  siren(){tone(700,.35,'square',.07,1.4);setTimeout(()=>tone(980,.35,'square',.07,.7),350);}, roar(){tone(60,.8,'sawtooth',.18,.6);noise(.6,.2,300);},
  clink(){tone(1800,.03,'square',.03,.8);}, revive(){[523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,.12,'triangle',.08),i*70));},
  hop(){tone(340,.08,'square',.04,1.6);}, arm(){tone(1500,.05,'square',.05);}, pod(){noise(.2,.12,600,'bandpass');}, slam(){noise(.4,.35,300);tone(55,.4,'sawtooth',.16,.5);},
  spit(){noise(.12,.1,1800,'bandpass');}, shard(){tone(2200,.06,'triangle',.04,.5);}, splash(){noise(.3,.2,1200,'bandpass');}, fall(){tone(600,.4,'square',.07,.2);},
  clear(){[523,659,784,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,.16,'square',.07),i*110));}, sel(){tone(760,.04,'square',.05);}, ok(){tone(520,.06,'square',.06,1.5);} };
function SFX(n){ if(!AC||MUTED||SILENT)return; const f=SFXT[n]; if(f)f(); }
function audioSay(t){ try{ if(!window.speechSynthesis||MUTED||SILENT||!t)return; speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); u.pitch=.4; u.rate=1.05; u.volume=.9;
  const v=speechSynthesis.getVoices().find(v=>/^en/i.test(v.lang)&&/male|david|daniel|fred|alex|guy/i.test(v.name)); if(v)u.voice=v; speechSynthesis.speak(u); }catch(e){} }
/* ---- chiptune sequencer ---- */
const midi=n=>440*Math.pow(2,(n-69)/12);
const BASS_A=[0,0,12,0,3,0,5,7,0,0,12,0,10,8,7,5], BASS_B=[-2,-2,10,-2,1,-2,3,5,-4,-4,8,-4,3,5,7,8];
const LEAD=[24,0,27,0,29,0,31,29,27,0,24,0,22,0,24,0, 24,0,27,0,29,0,31,34,36,0,34,0,31,0,29,0];
const BOSS_BASS=[0,12,0,12,3,15,3,15,5,17,5,17,6,18,7,19], MAP_BASS=[0,7,12,7,5,12,17,12,3,10,15,10,5,12,17,19];
let musStep=0, musNext=0, musOn=false, musMode='stage', musTimer=null, musRoot=40, musSd=.115;
function musicStart(mode,mus){ if(!AC||SILENT)return; musMode=mode; musOn=true; musStep=0; musNext=AC.currentTime+.05; if(mus){ musRoot=mus.root; musSd=mus.sd; }
  if(!musTimer)musTimer=setInterval(musTick,25); }
function musicStop(){ musOn=false; }
function musTick(){ if(!AC||!musOn)return; const sd=musMode==='boss'?musSd*.88:musMode==='map'?.16:musSd;
  while(musNext<AC.currentTime+.12){ const s=musStep%16, bar=Math.floor(musStep/16)%4;
    const bass=musMode==='boss'?BOSS_BASS:musMode==='map'?MAP_BASS:(bar<2?BASS_A:BASS_B), r=musRoot;
    tone(midi(r+bass[s]),sd*.9,musMode==='map'?'triangle':'sawtooth',.2,1,musG,musNext);
    if(musMode!=='map'){ if(s%4===0){ const o=AC.createOscillator(),ga=AC.createGain(); o.type='sine'; o.frequency.setValueAtTime(140,musNext); o.frequency.exponentialRampToValueAtTime(40,musNext+.12);
        ga.gain.setValueAtTime(.5,musNext); ga.gain.exponentialRampToValueAtTime(.0001,musNext+.14); o.connect(ga).connect(musG); o.start(musNext); o.stop(musNext+.16); }
      if(s%8===4)noise(.12,.22,1800,'bandpass',musG,musNext); if(s%2===1)noise(.03,.07,7000,'highpass',musG,musNext); }
    if(musMode==='stage'){ const ln=LEAD[musStep%32]; if(ln)tone(midi(r+ln),sd*1.6,'square',.06,1,musG,musNext); }
    if(musMode==='map'&&s%4===2)tone(midi(r+24+bass[s]),sd*1.2,'square',.035,1,musG,musNext);
    musNext+=sd; musStep++; } }
