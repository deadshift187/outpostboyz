'use strict';
/* =====================================================================
   BOSSES — sim logic only (drawing lives in render.js).
   Each boss: spawn(S) -> b (x,y,st,tm...),  update(S,b) sets:
     b.hb    = vulnerable rects [x0,y0,x1,y1,partTag]
     b.cr    = contact-damage rects
     b.armor = bullet-blocking rects (shots clink off)
     b.cx/cy = centre (death explosions)
   Every attack is TELEGRAPHED (shake / warning line / marks) before it can hurt — hard but fair.
   ===================================================================== */
const arenaOf=S=>[S.L.len-W,S.L.len];
function bTarget(S,b){ let best=null,bd=1e9; for(const p of S.players){ if(p.st!=='alive')continue; const d=Math.abs(p.x-b.x); if(d<bd){bd=d;best=p;} }
  return best||{x:(S.L.len-W/2),y:GROUND}; }
function shoot(S,o){ S.eb.push(Object.assign({g:0,r:1.5,exp:0,life:240},o)); }
function aimShot(S,x,y,P,sp,k,spread){ const a=Math.atan2((P.y-10)-y,P.x-x)+(spread||0); shoot(S,{k:k||'shot',x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp}); }
const enraged=b=>b.hp<b.maxhp*.5;

const BOSSES={
/* 1. GOLIATH — walking siege mech: cannon volley, ground laser (jump), stomp shockwaves (jump) */
goliath:{ name:'GOLIATH', hp:170,
  spawn(S){ const [a0,a1]=arenaOf(S); return {x:a1+50,y:GROUND,st:'enter',tm:0,atk:0,vy:0,legT:0,shots:0,laser:0}; },
  update(S,b){ const [a0,a1]=arenaOf(S), P=bTarget(S,b), f=enraged(b)?1.4:1;
    b.cx=b.x; b.cy=b.y-24; b.hb=[[b.x-27,b.y-46,b.x+27,b.y]]; b.cr=b.st==='enter'?[]:[[b.x-23,b.y-40,b.x+23,b.y]]; b.laser=0;
    if(b.st==='enter'){ b.x-=.8; b.legT+=.8; if(S.t%24===0)fx('shake',3); if(b.x<=a1-44){ b.st='idle'; b.tm=60; } }
    else if(b.st==='idle'){ const tx=clamp(P.x+70,a0+50,a1-34), dx=clamp(tx-b.x,-.6*f,.6*f); b.x+=dx; b.legT+=Math.abs(dx);
      if(--b.tm<=0){ b.st=['volley','laserT','stomp'][(b.atk++ + (RAND()<.3?1:0))%3]; b.tm=0; b.shots=0; } }
    else if(b.st==='volley'){ b.tm++; const n=enraged(b)?5:3;
      if(b.tm%14===0&&b.shots<n){ b.shots++; const cx=b.x-44, cy=b.y-35, dx=P.x-cx, t=clamp(Math.abs(dx)/60+rnd(-.3,.3),1.2,4);
        shoot(S,{k:'shell',x:cx,y:cy,vx:sgn(dx)*t,vy:-3.8+rnd(-.4,.4),g:.12,exp:16,r:2}); fx('sfx','shell'); }
      if(b.tm>14*n+30){ b.st='idle'; b.tm=Math.round(ri(40,70)/f); } }
    else if(b.st==='laserT'){ b.tm++; if(b.tm===1)fx('sfx','siren'); if(b.tm>42){ b.st='laser'; b.tm=0; fx('sfx','laser'); } }
    else if(b.st==='laser'){ b.tm++; b.laser=1; fx('shake',1.5);
      for(const p of S.players) if(p.st==='alive'&&p.x<b.x-20&&p.y>GROUND-9)hurtPlayer(S,p);
      if(b.tm>22){ b.st='idle'; b.tm=Math.round(ri(50,80)/f); } }
    else if(b.st==='stomp'){ if(b.tm===0){ b.vy=-5.5; b.tm=1; } b.vy+=.3; b.y+=b.vy;
      if(b.y>=GROUND&&b.vy>0){ b.y=GROUND; b.vy=0; fx('shake',10); fx('sfx','slam'); fx('dust',b.x-20,GROUND); fx('dust',b.x+20,GROUND);
        S.waves.push({x:b.x-26,dir:-1,life:140},{x:b.x+26,dir:1,life:60});
        if(enraged(b)&&S.enemies.length<3)S.enemies.push(makeEnemy(S,'drone',S.cam.x+W+10));
        b.st='idle'; b.tm=Math.round(ri(50,80)/f); } } } },

/* 2. THE PRESS — ceiling crusher: telegraphed slam (get out from under), spark rain, arm bolts at chest height (crouch) */
press:{ name:'THE PRESS', hp:180,
  spawn(S){ const [a0,a1]=arenaOf(S); return {x:(a0+a1)/2,y:-12,rest:GROUND-78,st:'enter',tm:0,atk:0,arms:0,slams:0}; },
  update(S,b){ const [a0,a1]=arenaOf(S), P=bTarget(S,b), f=enraged(b)?1.5:1;
    b.cx=b.x; b.cy=b.y-15; b.hb=[[b.x-26,b.y-30,b.x+26,b.y]]; b.cr=[[b.x-24,b.y-28,b.x+24,b.y]];
    if(b.arms>0&&b.st!=='arms')b.arms=Math.max(0,b.arms-.08);
    if(b.st==='enter'){ b.y+=1.2; if(b.y>=b.rest){ b.y=b.rest; b.st='idle'; b.tm=60; } }
    else if(b.st==='idle'){ const tx=clamp(P.x,a0+34,a1-34); b.x+=clamp(tx-b.x,-.8*f,.8*f);
      if(--b.tm<=0){ b.st=['slamT','sparks','arms'][b.atk++%3]; b.tm=0; b.slams=enraged(b)?2:1; } }
    else if(b.st==='slamT'){ b.tm++; if(b.tm<14)b.x+=clamp(P.x-b.x,-1.2,1.2); if(b.tm===1)fx('sfx','siren'); if(b.tm>36/f*1.2){ b.st='slamD'; b.tm=0; } }
    else if(b.st==='slamD'){ b.y+=8; if(b.y>=GROUND){ b.y=GROUND; b.st='slamH'; b.tm=0; fx('shake',9); fx('sfx','slam'); fx('dust',b.x-20,GROUND); fx('dust',b.x+20,GROUND);
        if(enraged(b))S.waves.push({x:b.x-28,dir:-1,life:90},{x:b.x+28,dir:1,life:90}); } }
    else if(b.st==='slamH'){ if(++b.tm>34){ b.st='slamU'; } }
    else if(b.st==='slamU'){ b.y-=2.2; if(b.y<=b.rest){ b.y=b.rest; if(--b.slams>0){ b.st='slamT'; b.tm=0; } else { b.st='idle'; b.tm=Math.round(ri(40,60)/f); } } }
    else if(b.st==='sparks'){ b.tm++; if(b.tm%Math.round(10/f)===0){ for(const d of [-1,1])
        shoot(S,{k:'spark',x:b.x+d*24,y:b.y-6,vx:d*rnd(.2,1.1),vy:-1.2,g:.07,r:1.5}); fx('sfx','orb'); }
      if(b.tm>70){ b.st='idle'; b.tm=Math.round(50/f); } }
    else if(b.st==='arms'){ b.tm++; b.arms=Math.min(1,b.tm/15);
      if(b.tm===30||b.tm===52||(enraged(b)&&b.tm===74)){ for(const d of [-1,1]){ const ax=b.x+d*40;
          shoot(S,{k:'bolt',x:ax,y:GROUND-11,vx:d*2.4,vy:0}); shoot(S,{k:'bolt',x:ax,y:GROUND-11,vx:-d*2.4,vy:0}); } fx('sfx','laser'); }
      if(b.tm>95){ b.st='idle'; b.tm=Math.round(55/f); } } } },

/* 3. HUNTER-KILLER — gunship: aimed bursts, marked missile strikes, trooper drop, low bomb run (enraged) */
hk:{ name:'HUNTER-KILLER', hp:200,
  spawn(S){ const [a0,a1]=arenaOf(S); return {x:a1+60,y:30,st:'enter',tm:0,atk:0,bob:0,marks:[],dir:-1}; },
  update(S,b){ const [a0,a1]=arenaOf(S), P=bTarget(S,b), f=enraged(b)?1.35:1;
    b.bob+=.05; b.cx=b.x; b.cy=b.y; b.hb=[[b.x-25,b.y-9,b.x+25,b.y+9]]; b.cr=[[b.x-22,b.y-7,b.x+22,b.y+7]];
    if(b.st==='enter'){ b.x-=1.5; if(b.x<=a1-70){ b.st='idle'; b.tm=60; } }
    else if(b.st==='idle'){ const side=P.x<(a0+a1)/2?1:-1, tx=clamp(P.x+side*50,a0+30,a1-30);
      b.x+=clamp(tx-b.x,-1.1,1.1); b.y=30+Math.sin(b.bob)*4;
      if(--b.tm<=0){ const seq=enraged(b)?['gun','missiles','bombrun','drop']:['gun','missiles','drop']; b.st=seq[b.atk++%seq.length]; b.tm=0; } }
    else if(b.st==='gun'){ b.tm++; const w=b.tm%34; if(w>=6&&w<=22&&w%4===2){ aimShot(S,b.x-10,b.y+6,P,2.7,'shot',rnd(-.08,.08)); fx('sfx','hmg'); }
      if(b.tm>34*(enraged(b)?4:3)){ b.st='idle'; b.tm=Math.round(55/f); } }
    else if(b.st==='missiles'){ b.tm++;
      if(b.tm===1){ b.marks=[-36,-12,12,36].map(o=>clamp(P.x+o,a0+8,a1-8)); fx('sfx','siren'); }
      if(b.tm===50)for(const mx of b.marks)shoot(S,{k:'missile',x:mx,y:-12,vx:0,vy:3.6,exp:16,r:2,tx:mx});
      if(b.tm>80){ b.marks=[]; b.st='idle'; b.tm=Math.round(40/f); } }
    else if(b.st==='drop'){ b.tm++; if(b.tm<30)b.y+=1.1; if(b.tm===34&&S.enemies.length<4)for(const d of [-1,1]){ const e=makeEnemy(S,'walker',b.x+d*10,b.y+8,d); e.y=b.y+8; S.enemies.push(e); }
      if(b.tm>34)b.y-=1.1; if(b.tm>64){ b.y=30; b.st='idle'; b.tm=Math.round(60/f); } }
    else if(b.st==='bombrun'){ b.tm++;
      if(b.tm===1){ b.dir=b.x>(a0+a1)/2?-1:1; }
      if(b.tm<40){ b.x+=clamp((b.dir<0?a1+30:a0-30)-b.x,-2,2); b.y+=clamp(GROUND-58-b.y,-1.5,1.5); }
      else { b.x+=b.dir*1.9; if(b.tm%14===0){ shoot(S,{k:'bomb',x:b.x,y:b.y+6,vx:b.dir*.5,vy:0,g:.16,exp:18,r:2}); fx('sfx','nade'); }
        if((b.dir>0&&b.x>a1+30)||(b.dir<0&&b.x<a0-30)){ b.y=30; b.x=b.dir>0?a1-40:a0+40; b.st='idle'; b.tm=50; } } } } },

/* 4. SERPENT — leaps pit-to-pit (only the head can be hurt), spits acid, rises and sprays */
serpent:{ name:'THE SERPENT', hp:160,
  spawn(S){ const [a0]=arenaOf(S), pits=S.L.gaps.filter(g=>g[0]>=a0).map(g=>(g[0]+g[1])/2);
    return {x:pits[0],y:GROUND+30,pits,st:'enter',tm:80,atk:0,hx:pits[0],hy:GROUND+30,trail:[],from:0,to:1,T:0,spat:0}; },
  update(S,b){ const P=bTarget(S,b), f=enraged(b)?1.4:1, up=b.hy<GROUND+2;
    b.x=b.hx; b.y=b.hy; b.cx=b.hx; b.cy=b.hy;
    b.hb=up?[[b.hx-12,b.hy-10,b.hx+12,b.hy+10]]:[]; b.cr=[];
    if(up)b.cr.push([b.hx-7,b.hy-6,b.hx+7,b.hy+6]);
    b.trail.unshift([b.hx,b.hy]); if(b.trail.length>64)b.trail.pop();
    for(let i=1;i<=9;i++){ const s=b.trail[i*6]; if(s&&s[1]<GROUND-2){ b.cr.push([s[0]-5,s[1]-5,s[0]+5,s[1]+5]); b.hb.push([s[0]-6,s[1]-6,s[0]+6,s[1]+6,-2]); } }   // body: 35% damage
    const spit=(n)=>{ for(let i=0;i<n;i++){ const a=Math.atan2((P.y-10)-b.hy,P.x-b.hx)+(i-(n-1)/2)*.28;
        shoot(S,{k:'acid',x:b.hx,y:b.hy,vx:Math.cos(a)*2.4,vy:Math.sin(a)*2.4-1,g:.07,r:2}); } fx('sfx','spit'); };
    if(b.st==='enter'||b.st==='under'){ b.hy=GROUND+30; if(--b.tm<=0){
        const near=Math.abs(P.x-b.pits[0])<Math.abs(P.x-b.pits[1])?0:1;
        if(b.atk++%2===1){ b.st='rise'; b.from=near; b.hx=b.pits[near]; b.tm=0; } else { b.st='arc'; b.from=b.atk%2; b.to=1-b.from; b.T=0; b.spat=0; } } }
    else if(b.st==='arc'){ b.T+=1/(90/f); const T=Math.min(1,b.T), x0=b.pits[b.from], x1=b.pits[b.to];
      b.hx=lerp(x0,x1,T); b.hy=GROUND+26-(GROUND+26-(GROUND-88))*4*T*(1-T);
      if(!b.spat&&T>.45){ b.spat=1; spit(enraged(b)?5:3); }
      if(T>=1){ b.st='under'; b.tm=Math.round(ri(24,40)/f); fx('splash',b.hx,GROUND); } }
    else if(b.st==='rise'){ b.tm++; if(b.tm<20)b.hy=lerp(GROUND+26,GROUND-54,b.tm/20); else if(b.tm<90)b.hy=GROUND-54+Math.sin(b.tm*.12)*3;
      else b.hy=lerp(GROUND-54,GROUND+30,(b.tm-90)/16);
      if(b.tm===34||b.tm===66||(enraged(b)&&b.tm===50))spit(enraged(b)?5:3);
      if(b.tm===1)fx('splash',b.hx,GROUND); if(b.tm>106){ b.st='under'; b.tm=Math.round(26/f); } } } },

/* 5. SPIDER TANK — lays crawler mines, marked artillery, pounces (shockwaves) */
spider:{ name:'SPIDER TANK', hp:220,
  spawn(S){ const [a0,a1]=arenaOf(S); return {x:a1+50,y:GROUND,st:'enter',tm:0,atk:0,legT:0,vy:0,vx:0,marks:[]}; },
  update(S,b){ const [a0,a1]=arenaOf(S), P=bTarget(S,b), f=enraged(b)?1.35:1;
    b.cx=b.x; b.cy=b.y-24; b.hb=[[b.x-30,b.y-36,b.x+30,b.y-14]]; b.cr=b.st==='enter'?[]:[[b.x-28,b.y-34,b.x+28,b.y-4]];
    if(b.st==='enter'){ b.x-=.9; b.legT+=.9; if(b.x<=a1-60){ b.st='idle'; b.tm=50; } }
    else if(b.st==='idle'){ const tx=clamp(P.x+(P.x<b.x?66:-66),a0+36,a1-36), dx=clamp(tx-b.x,-.55*f,.55*f); b.x+=dx; b.legT+=Math.abs(dx);
      if(--b.tm<=0){ b.st=['mines','arty','pounceT'][b.atk++%3]; b.tm=0; } }
    else if(b.st==='mines'){ b.tm++; if(b.tm%18===0&&b.tm<=54){ const e=makeEnemy(S,'mine',b.x,GROUND); e.hp=2; S.enemies.push(e); fx('sfx','pod'); }
      if(b.tm>70){ b.st='idle'; b.tm=Math.round(50/f); } }
    else if(b.st==='arty'){ b.tm++;
      if(b.tm===1){ const n=enraged(b)?6:5; b.marks=[]; for(let i=0;i<n;i++)b.marks.push(clamp(i===0?P.x:rnd(a0+10,a1-10),a0+8,a1-8)); fx('sfx','siren'); }
      if(b.tm===46)for(const mx of b.marks)shoot(S,{k:'missile',x:mx,y:-14,vx:0,vy:4,exp:18,r:2,tx:mx});
      if(b.tm>78){ b.marks=[]; b.st='idle'; b.tm=Math.round(45/f); } }
    else if(b.st==='pounceT'){ b.tm++; if(b.tm>30/f*1.1){ b.st='pounce'; b.vy=-7; b.vx=clamp((P.x-b.x)/33,-2.6,2.6); fx('sfx','jump'); } }
    else if(b.st==='pounce'){ b.vy+=.42; b.x=clamp(b.x+b.vx,a0+30,a1-30); b.y+=b.vy;
      if(b.y>=GROUND&&b.vy>0){ b.y=GROUND; fx('shake',10); fx('sfx','slam'); S.waves.push({x:b.x-30,dir:-1,life:100},{x:b.x+30,dir:1,life:100});
        b.st='idle'; b.tm=Math.round(55/f); } } } },

/* 6. TWIN SENTINELS — two orbs: sweeping sky-beam, spread fire, and a chest-high link beam (crouch!) */
twins:{ name:'TWIN SENTINELS', hp:230,
  spawn(S){ const [a0,a1]=arenaOf(S);
    return {x:(a0+a1)/2,y:40,st:'enter',tm:0,atk:0,beam:null,link:0,
      parts:[{x:a0-20,y:30,tx:a0+70,ty:44,flash:0},{x:a1+20,y:30,tx:a1-70,ty:44,flash:0}]}; },
  update(S,b){ const [a0,a1]=arenaOf(S), P=bTarget(S,b), alive=b.parts.filter(q=>q.hp>0), f=alive.length===1?1.5:1;
    b.hb=[]; b.cr=[]; b.cx=alive[0]?alive[0].x:b.x; b.cy=alive[0]?alive[0].y:b.y;
    for(let i=0;i<b.parts.length;i++){ const q=b.parts[i]; if(q.hp<=0)continue;
      q.x+=clamp(q.tx-q.x,-1.4*f,1.4*f); q.y+=clamp(q.ty-q.y,-1.4*f,1.4*f);
      b.hb.push([q.x-9,q.y-9,q.x+9,q.y+9,i]); b.cr.push([q.x-7,q.y-7,q.x+7,q.y+7]); }
    b.link=0;
    if(b.st==='enter'){ if(++b.tm>70){ b.st='idle'; b.tm=40; } }
    else if(b.st==='idle'){ alive.forEach((q,i)=>{ if(S.t%80===i*40){ q.tx=rnd(a0+30,a1-30); q.ty=rnd(28,62); } });
      if(--b.tm<=0){ const seq=alive.length===2?['beam','spread','link']:['beam','spread']; b.st=seq[b.atk++%seq.length]; b.tm=0;
        b.who=alive.length===2?b.atk%2:b.parts.indexOf(alive[0]); } }
    else if(b.st==='beam'){ b.tm++; const q=b.parts[b.who]; if(!q||q.hp<=0){ b.st='idle'; b.tm=20; return; }
      if(b.tm<30){ q.tx=clamp(P.x,a0+14,a1-14); q.ty=22; }
      else if(b.tm<70){ q.tx=q.x; b.beam={x:q.x,live:0}; }
      else if(b.tm<150){ q.tx=q.x+clamp(P.x-q.x,-.9*f,.9*f); b.beam={x:q.x,live:1};
        for(const p of S.players) if(p.st==='alive'&&Math.abs(p.x-q.x)<5)hurtPlayer(S,p); }
      else { b.beam=null; b.st='idle'; b.tm=Math.round(40/f); } }
    else if(b.st==='spread'){ b.tm++; const q=b.parts[b.who]; if(!q||q.hp<=0){ b.st='idle'; b.tm=20; return; }
      if(b.tm%Math.round(30/f)===0){ const n=5; for(let i=0;i<n;i++){ const a=Math.atan2((P.y-10)-q.y,P.x-q.x)+(i-2)*.22;
          shoot(S,{k:'orb2',x:q.x,y:q.y,vx:Math.cos(a)*2.1,vy:Math.sin(a)*2.1,r:2}); } fx('sfx','orb'); }
      if(b.tm>95){ b.st='idle'; b.tm=Math.round(40/f); } }
    else if(b.st==='link'){ b.tm++; const [q0,q1]=b.parts;
      q0.tx=a0+14; q1.tx=a1-14; q0.ty=q1.ty=GROUND-14;
      if(b.tm>40&&b.tm<75)b.link=1;
      else if(b.tm>=75&&b.tm<135){ b.link=2; for(const p of S.players) if(p.st==='alive'&&rectsOverlap(pBox(p),[a0,GROUND-16,a1,GROUND-12]))hurtPlayer(S,p); }
      else if(b.tm>=135){ q0.ty=q1.ty=40; b.st='idle'; b.tm=50; } } } },

/* 7. FROST TITAN — armoured (hit the glowing core), shard fans, ground spike wave (jump), icicle rain */
frost:{ name:'FROST TITAN', hp:240,
  spawn(S){ const [a0,a1]=arenaOf(S); return {x:a1+40,y:GROUND,st:'enter',tm:0,atk:0,spikes:[],marks:[]}; },
  update(S,b){ const [a0,a1]=arenaOf(S), P=bTarget(S,b), f=enraged(b)?1.35:1;
    b.cx=b.x; b.cy=b.y-30; S.arenaR=b.x-30;
    /* the glowing core juts out FRONT of the armour (jump + shoot it); legs and back plate clink */
    b.hb=[[b.x-30,b.y-52,b.x-16,b.y-32]]; b.armor=[[b.x-16,b.y-62,b.x+24,b.y],[b.x-26,b.y-30,b.x-16,b.y]]; b.cr=[[b.x-24,b.y-58,b.x+22,b.y]];
    for(const s of b.spikes){ s.t--; if(s.t<18&&s.t>0) for(const p of S.players) if(p.st==='alive'&&p.onGround&&Math.abs(p.x-s.x)<6)hurtPlayer(S,p); }
    b.spikes=b.spikes.filter(s=>s.t>0);
    if(b.st==='enter'){ b.x-=.7; if(S.t%20===0)fx('shake',3); if(b.x<=a1-40){ b.st='idle'; b.tm=50; } }
    else if(b.st==='idle'){ if(--b.tm<=0){ b.st=['shards','spikes','icicles'][b.atk++%3]; b.tm=0; } }
    else if(b.st==='shards'){ b.tm++; if(b.tm===24||b.tm===54||(enraged(b)&&b.tm===84)){
        const x0=b.x-22, y0=b.y-42, g=.09, T=44, off=(b.tm===54?14:0);             // alternate volleys shift the gaps
        for(let tx=b.x-50-off;tx>a0+4;tx-=30){ shoot(S,{k:'shard',x:x0,y:y0,vx:(tx-x0)/T,vy:(GROUND-y0-.5*g*T*T)/T,g,r:1.5}); } fx('sfx','shard'); }
      if(b.tm>100){ b.st='idle'; b.tm=Math.round(40/f); } }
    else if(b.st==='spikes'){ b.tm++; if(b.tm===1)fx('sfx','siren');
      if(b.tm>30&&(b.tm-30)%Math.round(5/f)===0){ const k=(b.tm-30)/Math.round(5/f), sx=b.x-34-k*12; if(sx>a0)b.spikes.push({x:sx,t:26}); if(S.t%2)fx('sfx','shard'); }
      if(b.tm>30+Math.round(5/f)*22){ b.st='idle'; b.tm=Math.round(45/f); } }
    else if(b.st==='icicles'){ b.tm++;
      if(b.tm===1){ b.marks=[]; const n=enraged(b)?5:4; for(let k=0;k<60&&b.marks.length<n;k++){ const mx=b.marks.length===0?clamp(P.x,a0+8,b.x-34):rnd(a0+8,b.x-34);
          if(b.marks.every(m=>Math.abs(m-mx)>=30))b.marks.push(mx); } fx('sfx','siren'); }
      if(b.tm===44)for(const mx of b.marks)shoot(S,{k:'icicle',x:mx,y:-10,vx:0,vy:3.4,g:.12,r:2});
      if(b.tm>80){ b.marks=[]; b.st='idle'; b.tm=Math.round(40/f); } } } },

/* 8. THE OVERMIND — wall-mounted AI: turret pods, eye opens (only then hittable), sweeping eye laser,
      bullet rings, electrified floor halves — three phases */
overmind:{ name:'THE OVERMIND', hp:250,
  spawn(S){ const [a0,a1]=arenaOf(S);
    /* eye + turret pods sit on the FACE of the wall (reachable); the wall behind them is armour */
    return {x:a1-42,y:GROUND-58,st:'enter',tm:0,atk:0,eye:0,phase:1,sweep:null,floor:null,
      pods:[{x:a1-38,y:26,hp:26,flash:0},{x:a1-38,y:GROUND-22,hp:26,flash:0},{x:a1-38,y:GROUND-90,hp:26,flash:0},{x:a1-38,y:GROUND-8,hp:26,flash:0}],podT:0,floorT:0,spawnT:0}; },
  update(S,b){ const [a0,a1]=arenaOf(S), P=bTarget(S,b);
    S.arenaR=a1-62; b.cx=b.x; b.cy=b.y;
    b.phase=b.hp>b.maxhp*.66?1:b.hp>b.maxhp*.33?2:3; const f=b.phase===3?1.4:1;
    b.armor=[[a1-30,0,a1,GROUND]]; b.hb=[]; b.cr=[];
    if(b.eye>.7)b.hb.push([b.x-11,b.y-11,b.x+11,b.y+11,-1]); else b.armor.push([b.x-11,b.y-11,b.x+11,b.y+11]);   // closed lid clinks
    b.pods.forEach((pd,i)=>{ if(pd.hp>0)b.hb.push([pd.x-7,pd.y-7,pd.x+7,pd.y+7,i]); });
    if(b.st==='enter'){ if(++b.tm>60){ b.st='fight'; b.tm=0; } return; }
    b.tm++;
    /* eye: opens on a rhythm; opens more as phases advance */
    const cyc=b.phase===1?180:b.phase===2?150:130, open=b.phase===1?110:b.phase===2?100:90, c=b.tm%cyc;
    b.eye=c<open?Math.min(1,b.eye+.08):Math.max(0,b.eye-.08);
    /* pods fire in sequence */
    const live=b.pods.filter(pd=>pd.hp>0);
    if(live.length&&++b.podT>=Math.round((S.np>1?40:54)/f)){ b.podT=0; const pd=live[(b.tm/54|0)%live.length]; aimShot(S,pd.x-6,pd.y,P,2.3,'shot'); fx('sfx','laser'); }
    if(b.phase>=2){ if(c===open+10&&!b.sweep)b.sweep={t:0};
      if(b.tm%Math.round(110/f)===0){ for(let i=0;i<12;i++){ const a=i*TAU/12+b.tm*.01; shoot(S,{k:'orb2',x:b.x,y:b.y,vx:Math.cos(a)*1.6,vy:Math.sin(a)*1.6,r:2}); } fx('sfx','orb'); } }
    if(b.sweep){ const s=b.sweep; s.t++;
      if(s.t>40&&s.t<120){ s.x=lerp(a0+6,a1-70,(s.t-40)/80); s.live=1;
        for(const p of S.players){ if(p.st!=='alive')continue; const q=pBox(p); if(segDist((q[0]+q[2])/2,(q[1]+q[3])/2,b.x,b.y,s.x,GROUND)<5)hurtPlayer(S,p); } }
      else { s.live=0; s.x=a0+6; }
      if(s.t>=120)b.sweep=null; }
    if(b.phase===3){ b.floorT++; const ft=b.floorT%220;
      b.floor=ft<50?{half:(b.floorT/220|0)%2,live:0}:ft<110?{half:(b.floorT/220|0)%2,live:1}:null;
      if(b.floor&&b.floor.live){ const mid=(a0+S.arenaR)/2, x0=b.floor.half?mid:a0, x1=b.floor.half?S.arenaR:mid;
        for(const p of S.players) if(p.st==='alive'&&p.onGround&&p.x>x0&&p.x<x1)hurtPlayer(S,p); }
      if(++b.spawnT>=260){ b.spawnT=0; if(S.enemies.length<3)S.enemies.push(makeEnemy(S,'drone',S.cam.x-10,null,1)); } }
    else b.floor=null; } },
};
