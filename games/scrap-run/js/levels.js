'use strict';
/* =====================================================================
   LEVELS — pure data. Shared by the game and the sim harness.
   Wave spec strings:  type[:off|:L][@x,y]
     types  w walker · h heavy · d drone · j jumper · t turret · k bike · b bomber · s shield · m mine · p pod
     :36    spawn 36px past the right screen edge      :L  spawn behind (left edge)
     @x,y   absolute world position (turrets sit on platform tops; pods drop at x)
   RULE: an absolute spawn inside a LOCK wave must sit in [trigX-256, trigX-10] — otherwise the
         screen locks with an unreachable enemy (soft-lock). sim/run.js checks this.
   ===================================================================== */
const ETYPES={w:'walker',h:'heavy',d:'drone',j:'jumper',t:'turret',k:'bike',b:'bomber',s:'shield',m:'mine',p:'pod'};
function parseWave(spec){ return spec.trim().split(/\s+/).map(tok=>{
  const m=tok.match(/^([a-z])(?::(L|-?\d+))?(?:@(\d+)(?:,(\d+))?)?$/); if(!m) throw new Error('bad wave token '+tok);
  return {t:ETYPES[m[1]], off:m[2]==='L'?'L':(m[2]?+m[2]:0), ax:m[3]?+m[3]:null, ay:m[4]?+m[4]:null}; }); }
const G=GROUND;
function trg(x,spec,lock){ return {x,e:parseWave(spec),lock:!!lock}; }

const LEVELS=[
/* 1 ------------------------------------------------------------------ */
{ id:'street', name:'RUIN STREET', tag:'WHERE IT ALL FELL', theme:'city', len:3400, boss:'goliath', par:150, dmul:1, fire:1,
  pal:{sky:['#080a14','#161223','#3b1b1a','#5a2616'],far:'#1c1727',mid:'#2a2130',win:'#b8632a',gnd:'#231c22',gtop:'#3a2e36',fog:'rgba(90,38,22,.35)'},
  mus:{root:40,sd:.115}, pit:'void', gaps:[], conv:[], crush:[], ice:false, auto:0,
  plats:[{x:640,w:44,top:G-15,k:'car'},{x:1230,w:56,top:G-10,k:'rubble'},{x:1560,w:72,top:G-22,k:'bus'},
         {x:2150,w:44,top:G-15,k:'car'},{x:2480,w:26,top:G-24,k:'crates'},{x:2830,w:56,top:G-12,k:'rubble'}],
  trig:[trg(300,'w w:36'),trg(560,'w d:10 w:44',1),trg(860,'h:10 w:50 w:L',1),trg(1150,'d d:40 w:20'),
        trg(1400,'w w:24 w:48 d:30 w:L',1),trg(1750,'h d:20'),trg(2000,'w w:20 h:60 w:L w:L',1),
        trg(2350,'d d:30 d:60 w:10 w:40',1),trg(2700,'h h:60 w:30 w:L',1),trg(3000,'w w:15 w:30 d:20')],
  pows:[480,1050,1620,2250,2900], tanks:[1290] },
/* 2 ------------------------------------------------------------------ */
{ id:'factory', name:'SCRAP FACTORY', tag:'WHERE THEY ARE BORN', theme:'factory', len:3600, boss:'press', par:170, dmul:1.1, fire:1.05,
  pal:{sky:['#0b0908','#15100c','#241810','#3a200e'],far:'#1a1410',mid:'#2a1e16',win:'#ff8a2a',gnd:'#1e1a18',gtop:'#4a3a2a',fog:'rgba(255,120,30,.16)'},
  mus:{root:38,sd:.11}, pit:'lava', gaps:[[1180,1220],[2440,2480]], ice:false, auto:0,
  conv:[{x:420,w:170,d:-1},{x:1500,w:200,d:1},{x:2600,w:180,d:-1}],
  crush:[{x:820,w:26,per:150,off:0},{x:900,w:26,per:150,off:75},{x:1900,w:26,per:130,off:0},{x:1990,w:26,per:130,off:65},{x:3000,w:26,per:120,off:30}],
  plats:[{x:640,w:48,top:G-28,k:'girder'},{x:1120,w:44,top:G-30,k:'girder'},{x:1700,w:30,top:G-24,k:'crates'},
         {x:2200,w:56,top:G-32,k:'girder'},{x:2380,w:40,top:G-26,k:'girder'},{x:2800,w:30,top:G-24,k:'crates'}],
  trig:[trg(250,'w w:30'),trg(700,'w t@664,94 w:40',1),trg(800,'p@700 p@760'),trg(1060,'h:10 w:40 d:30',1),
        trg(1340,'s w:30 w:L',1),trg(1640,'p@1560 p@1620 d:20'),trg(2260,'h t@2228,90 s:40',1),
        trg(2560,'w w:20 d d:40'),trg(2900,'p@2780 p@2840 h:30 w:L',1),trg(3200,'s s:30 d:20 w:L',1)],
  pows:[470,1080,1760,2300,3050], tanks:[1440] },
/* 3 ------------------------------------------------------------------ */
{ id:'highway', name:'HIGHWAY 66', tag:'NO WAY BUT FORWARD', theme:'highway', len:4200, boss:'hk', par:190, dmul:1.2, fire:1.1,
  pal:{sky:['#1a0f2e','#4a1f3e','#b04a3a','#f08a3a'],far:'#3a1f3a',mid:'#2a1628',win:'#ffd08a',gnd:'#2a2528',gtop:'#5a5058',fog:'rgba(240,120,60,.2)'},
  mus:{root:43,sd:.1}, pit:'void', gaps:[[860,900],[1580,1620],[2360,2400],[3120,3160]], conv:[], crush:[], ice:false, auto:.55,
  plats:[{x:500,w:44,top:G-15,k:'car'},{x:1200,w:44,top:G-15,k:'car'},{x:1900,w:72,top:G-22,k:'bus'},
         {x:2700,w:44,top:G-15,k:'car'},{x:3400,w:44,top:G-15,k:'car'}],
  trig:[trg(300,'k'),trg(520,'w w:30 k:60'),trg(760,'b w:20'),trg(1000,'k k:50 w:20',1),trg(1300,'b d:30 w:10'),
        trg(1700,'h k:40 w:L',1),trg(2100,'b b:80 w:20 w:40'),trg(2500,'k k:30 k:60 d:20',1),trg(2900,'h s:30 b:60',1),
        trg(3300,'k w:20 w:40 d:20 b:50',1),trg(3700,'w w:20 k:40')],
  pows:[620,1400,2200,3000,3600], tanks:[360] },
/* 4 ------------------------------------------------------------------ */
{ id:'metro', name:'FLOODED METRO', tag:'SOMETHING MOVES BELOW', theme:'metro', len:3800, boss:'serpent', par:180, dmul:1.25, fire:1.1,
  pal:{sky:['#050b0c','#0a1618','#0f2224','#143034'],far:'#0e1c1e',mid:'#162a2c',win:'#5ae0d0',gnd:'#1a2426',gtop:'#3a5456',fog:'rgba(40,160,150,.12)'},
  mus:{root:36,sd:.12}, pit:'water', conv:[], crush:[], ice:false, auto:0,
  gaps:[[520,556],[900,940],[1300,1336],[1700,1744],[2100,2136],[2500,2540],[2900,2940],[3590,3630],[3714,3754]],
  plats:[{x:700,w:60,top:G-20,k:'train'},{x:1110,w:40,top:G-26,k:'girder'},{x:1500,w:60,top:G-20,k:'train'},
         {x:1900,w:40,top:G-28,k:'girder'},{x:2300,w:60,top:G-20,k:'train'},{x:2700,w:44,top:G-26,k:'girder'},{x:3150,w:60,top:G-20,k:'train'}],
  trig:[trg(300,'j j:30'),trg(800,'w t@730,102 j:20',1),trg(1000,'d d:30 j:20'),trg(1200,'j j:20 j:40 w:L',1),
        trg(1600,'h t@1530,102 d:30',1),trg(2000,'j j:20 d:10 d:40'),trg(2400,'s w:30 t@2330,102',1),
        trg(2650,'j j:15 j:30 h:50',1),trg(3050,'d d:20 d:40 j:10 j:30 w:L',1),trg(3350,'w w:20 s:40')],
  pows:[460,1060,1640,2440,3200], tanks:[] },
/* 5 ------------------------------------------------------------------ */
{ id:'desert', name:'DUNE ARRAY', tag:'THE SUN FEEDS THEM', theme:'desert', len:4000, boss:'spider', par:200, dmul:1.35, fire:1.15,
  pal:{sky:['#e89a50','#f4b870','#f0a050','#d88040'],far:'#c07848',mid:'#a86038',win:'#3a4a6a',gnd:'#b88a50',gtop:'#d8aa68',fog:'rgba(255,200,120,.22)'},
  mus:{root:41,sd:.105}, pit:'sand', gaps:[[1400,1436],[2800,2840]], conv:[], crush:[], ice:false, auto:0,
  plats:[{x:600,w:50,top:G-24,k:'solar'},{x:1100,w:50,top:G-30,k:'solar'},{x:1800,w:50,top:G-24,k:'solar'},
         {x:2400,w:72,top:G-22,k:'bus'},{x:3100,w:50,top:G-28,k:'solar'},{x:3500,w:44,top:G-15,k:'car'}],
  trig:[trg(300,'m m:20 w:40'),trg(600,'k w:30 m:50'),trg(900,'h m:20 m:40 w:L',1),trg(1250,'b k:30 w:20'),
        trg(1600,'h h:60 m:30',1),trg(2000,'k k:40 b:20 w:30'),trg(2300,'s s:30 m:20 m:40',1),trg(2700,'b b:60 w:20 k:40',1),
        trg(3100,'h m:10 m:30 m:50 d:20',1),trg(3500,'k k:25 k:50 w:30 w:L',1)],
  pows:[520,1200,2050,2600,3350], tanks:[1700] },
/* 6 ------------------------------------------------------------------ */
{ id:'skyline', name:'SKYLINE', tag:'MIND THE GAP', theme:'roof', len:4000, boss:'twins', par:200, dmul:1.45, fire:1.2,
  pal:{sky:['#03040a','#0a0c1c','#141830','#202040'],far:'#10122a',mid:'#181a34',win:'#ffe08a',gnd:'#22222e',gtop:'#44445a',fog:'rgba(80,90,200,.12)'},
  mus:{root:39,sd:.1}, pit:'void', conv:[], crush:[], ice:false, auto:0,
  gaps:[[480,520],[860,904],[1240,1280],[1600,1644],[1980,2024],[2360,2400],[2720,2764],[3100,3140],[3440,3480]],
  plats:[{x:650,w:30,top:G-22,k:'ac'},{x:1050,w:30,top:G-22,k:'ac'},{x:1420,w:40,top:G-34,k:'tower'},{x:1800,w:30,top:G-22,k:'ac'},
         {x:2160,w:40,top:G-34,k:'tower'},{x:2550,w:30,top:G-22,k:'ac'},{x:2900,w:40,top:G-34,k:'tower'},{x:3280,w:30,top:G-22,k:'ac'}],
  trig:[trg(300,'d d:30'),trg(600,'j j:20 d:40',1),trg(1000,'b w:20 w:40'),trg(1500,'d d:20 d:40 t@1440,88',1),
        trg(1700,'j j:20 b:40 w:L'),trg(2250,'h t@2180,88 d:30',1),trg(2450,'b b:50 d:20 d:40',1),
        trg(3000,'j j:15 j:30 t@2920,88 w:L',1),trg(3200,'s d:20 d:40 b:60',1),trg(3550,'w w:20 w:40 d:20 d:40')],
  pows:[700,1500,2250,2980,3620], tanks:[] },
/* 7 ------------------------------------------------------------------ */
{ id:'cryo', name:'CRYO VAULT', tag:'COLD STORAGE', theme:'ice', len:3800, boss:'frost', par:200, dmul:1.55, fire:1.25,
  pal:{sky:['#0a1628','#12243c','#1c3650','#284868'],far:'#1a3048',mid:'#24405c',win:'#8ae0ff',gnd:'#7ea6c0',gtop:'#e0f0ff',fog:'rgba(180,220,255,.14)'},
  mus:{root:37,sd:.115}, pit:'ice', gaps:[[1000,1036],[2200,2240],[3000,3036]], conv:[], crush:[], ice:true, auto:0,
  icicles:[620,700,1300,1380,1460,1900,2500,2580,2660,3200,3280],
  plats:[{x:800,w:40,top:G-20,k:'iceblock'},{x:1600,w:44,top:G-26,k:'iceblock'},{x:2400,w:40,top:G-22,k:'iceblock'},
         {x:2850,w:50,top:G-28,k:'iceblock'},{x:3300,w:40,top:G-20,k:'iceblock'}],
  trig:[trg(300,'s w:30'),trg(600,'w w:20 h:50',1),trg(950,'d d:30 s:20'),trg(1250,'s s:30 w:L w:L',1),
        trg(1650,'h t@1622,96 d:20',1),trg(2000,'j j:20 j:40 w:10'),trg(2350,'s h:40 d:20',1),
        trg(2950,'w w:15 w:30 t@2875,94 s:40',1),trg(3150,'h h:40 s:20 d:30',1),trg(3450,'s s:30 d:20 w:L')],
  pows:[520,1150,1800,2600,3380], tanks:[1100] },
/* 8 ------------------------------------------------------------------ */
{ id:'core', name:'THE CORE', tag:'IT KNOWS YOU ARE HERE', theme:'core', len:4200, boss:'overmind', par:240, dmul:1.7, fire:1.3,
  pal:{sky:['#050002','#0e0206','#1a040a','#2a0610'],far:'#16040a',mid:'#240812',win:'#ff2a3a',gnd:'#1a0c10',gtop:'#ff2a3a',fog:'rgba(255,30,60,.1)'},
  mus:{root:35,sd:.095}, pit:'void', gaps:[[1100,1140],[2300,2336],[3300,3340]], conv:[], crush:[], ice:false, auto:0,
  lasers:[{x:700,per:180,off:0},{x:1500,per:160,off:40},{x:1560,per:160,off:120},{x:2600,per:150,off:0},{x:2680,per:150,off:75},{x:3620,per:140,off:30}],
  plats:[{x:900,w:40,top:G-26,k:'rack'},{x:1300,w:50,top:G-30,k:'girder'},{x:1900,w:40,top:G-26,k:'rack'},
         {x:2500,w:50,top:G-30,k:'girder'},{x:3000,w:40,top:G-26,k:'rack'},{x:3450,w:50,top:G-28,k:'girder'}],
  trig:[trg(300,'w w:20 d:30'),trg(800,'p@660 p@720 d:20',1),trg(1000,'h s:30 t@920,96',1),trg(1350,'j j:20 b:40 d:20'),
        trg(1900,'p@1760 p@1820 h:40 w:L',1),trg(2100,'s s:30 d:20 d:40 b:50',1),trg(2450,'k k:30 w:20 j:40 m:20'),
        trg(3100,'h h:50 t@3020,96 p@2880',1),trg(3250,'d d:15 d:30 d:45 b:20 b:70',1),
        trg(3550,'s s:25 h:50 j:20 j:40 w:L w:L',1),trg(3900,'w w:15 d:20 m:30')],
  pows:[520,1250,2000,2700,3480], tanks:[2200] },
];
/* overworld map node positions (256x144 map screen) */
const MAP_NODES=[[28,112],[60,84],[96,108],[124,72],[156,100],[186,64],[212,98],[234,40]];
