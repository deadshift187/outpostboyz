'use strict';
/* =====================================================================
   NET — online co-op over WebRTC (PeerJS, loaded on demand from cdnjs).
   HOST runs the only simulation. GUEST sends its buttons every frame and
   draws the host's snapshots (~30/s) + replays the host's FX events.
   Rooms are 4-letter codes. If the guest drops mid-level, a bot takes P2.
   ===================================================================== */
const NET={role:null,peer:null,conn:null,code:'',status:'',ready:false,lastRx:0,onData:null,rtt:0,pingT:0};
const CODE_CH='ABCDEFGHJKLMNPQRSTUVWXYZ';
function netLoadLib(){ return new Promise((res,rej)=>{ if(window.Peer)return res(); const s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js'; s.onload=()=>res(); s.onerror=()=>rej(new Error('could not load PeerJS')); document.head.appendChild(s); }); }
function netReset(){ try{ if(NET.conn)NET.conn.close(); }catch(e){} try{ if(NET.peer)NET.peer.destroy(); }catch(e){}
  Object.assign(NET,{role:null,peer:null,conn:null,code:'',status:'',ready:false,lastRx:0}); }
function newCode(){ let c=''; for(let i=0;i<4;i++)c+=CODE_CH[Math.floor(Math.random()*CODE_CH.length)]; return c; }
function netBind(c){ NET.conn=c;
  c.on('open',()=>{ NET.ready=true; NET.status='CONNECTED'; NET.lastRx=performance.now(); SFX('ok'); });
  c.on('data',d=>{ NET.lastRx=performance.now(); if(d&&d.k==='ping'){ netSend({k:'pong',t:d.t}); return; } if(d&&d.k==='pong'){ NET.rtt=performance.now()-d.t; return; } if(NET.onData)NET.onData(d); });
  c.on('close',()=>{ NET.ready=false; NET.status=NET.role==='host'?'PLAYER 2 LEFT':'HOST LEFT'; });
  c.on('error',()=>{ NET.ready=false; NET.status='CONNECTION ERROR'; }); }
async function netHost(){ netReset(); NET.role='host'; NET.status='STARTING...';
  try{ await netLoadLib(); }catch(e){ NET.status='NO INTERNET?'; return; }
  const tryOpen=(n)=>{ NET.code=newCode(); const peer=new Peer('scraprun-'+NET.code.toLowerCase(),{debug:0}); NET.peer=peer;
    peer.on('open',()=>{ NET.status='SHARE CODE: '+NET.code; });
    peer.on('connection',c=>{ if(NET.conn&&NET.ready){ c.close(); return; } netBind(c); });
    peer.on('error',e=>{ if(e.type==='unavailable-id'&&n<5){ peer.destroy(); tryOpen(n+1); } else NET.status='ERROR: '+String(e.type||e).toUpperCase(); }); };
  tryOpen(0); }
async function netJoin(code){ netReset(); NET.role='guest'; NET.code=code; NET.status='CONNECTING...';
  try{ await netLoadLib(); }catch(e){ NET.status='NO INTERNET?'; return; }
  const peer=new Peer({debug:0}); NET.peer=peer;
  peer.on('open',()=>{ netBind(peer.connect('scraprun-'+code.toLowerCase(),{reliable:true})); });
  peer.on('error',e=>{ NET.status=e.type==='peer-unavailable'?'NO ROOM '+code:'ERROR: '+String(e.type||e).toUpperCase(); });
  setTimeout(()=>{ if(!NET.ready&&NET.role==='guest'&&NET.status==='CONNECTING...')NET.status='NO ROOM '+code+'?'; },9000); }
function netSend(o){ if(NET.conn&&NET.ready)try{ NET.conn.send(o); }catch(e){} }
function netTick(){ if(NET.ready&&performance.now()-NET.pingT>1000){ NET.pingT=performance.now(); netSend({k:'ping',t:NET.pingT}); } }
/* compact snapshot: drop sim-only refs, round floats */
const SNAP_SKIP={L:1,trig:1,_T:1,hs:1,group:1,cause:1};
function snapOf(S){ return JSON.stringify(S,(k,v)=>SNAP_SKIP[k]?undefined:(typeof v==='number'?(Number.isInteger(v)?v:Math.round(v*10)/10):v)); }
function unsnap(str){ const S=JSON.parse(str); S.L=LEVELS[S.li]; return S; }
