'use strict';
// Domain systems use an event bus and local snapshots. No accounts, network or analytics.
NS.EventBus=class{constructor(){this.handlers={};}on(id,fn){(this.handlers[id]??=[]).push(fn);}emit(id,data){for(const fn of this.handlers[id]||[])fn(data);}};
NS.SaveSystem=class{
 constructor(storage=localStorage){this.storage=storage;this.error='';this.data=this.defaults();let loaded=false;for(const key of ['nightshift-v1','nightshift-backup']){try{const raw=storage.getItem(key);if(!raw)continue;const d=JSON.parse(raw);if(d.version!==1)continue;this.data={...this.data,...d,settings:{...this.data.settings,...d.settings}};this.data.money=Math.max(0,Number(this.data.money)||0);this.data.night=NS.clamp(Number(this.data.night)||1,1,999);loaded=true;break;}catch(e){this.error='Save inválido. Tentando recuperar o backup.';}}if(loaded)this.error='';

 const s=this.data.settings;s.sensitivity=NS.clamp(Number(s.sensitivity)||1,.3,2.5);s.buttonSize=NS.clamp(Number(s.buttonSize)||1,.75,1.4);s.opacity=NS.clamp(Number(s.opacity)||.8,.3,1);s.resolution=NS.clamp(Number(s.resolution)||.85,.5,1);s.distance=NS.clamp(Number(s.distance)||40,20,60);s.fps=[30,60].includes(Number(s.fps))?Number(s.fps):30;
 }
 defaults(){return{version:1,money:0,xp:0,night:1,completed:0,unlocked:['Mercado'],cosmetics:[],endings:[],clues:[],active:null,settings:{quality:'Médio',resolution:.85,distance:40,fps:30,sensitivity:1,buttonSize:1,opacity:.8,volume:.65,difficulty:'Normal'}};}
 write(){try{const old=this.storage.getItem('nightshift-v1');if(old)this.storage.setItem('nightshift-backup',old);this.storage.setItem('nightshift-v1',JSON.stringify(this.data));return true;}catch(e){this.error='Não foi possível salvar: confira o espaço disponível.';return false;}}
 checkpoint(g){if(g.mode!=='playing')return;this.data.active={seed:g.seed,night:g.currentNight,difficulty:g.difficulty,elapsed:g.night.elapsed,tasks:g.tasks.done,inventory:g.inventory.snapshot(),player:{x:g.player.x,z:g.player.z,yaw:g.player.yaw,pitch:g.player.pitch,flashlight:g.player.flashlight},doors:g.world.doors.map(d=>({id:d.id,open:d.open,locked:d.locked})),objects:g.world.objects.filter(o=>['battery','fuse','clue'].includes(o.type)).map(o=>({id:o.id,active:o.active})),anomalies:g.anomalies.snapshot(),entity:g.entity.snapshot(),power:{on:g.power.on,failures:g.power.failures},messages:g.messages,clue:g.clueFound};if(!this.write())g.ui.toast(this.error);}
};
NS.NightManager=class{
 constructor(g){this.g=g;this.elapsed=0;this.duration={Normal:720,'Difícil':900,Pesadelo:1080}[g.difficulty]||720;this.hour=0;this.lastHour=-1;}
 update(dt){this.elapsed=Math.min(this.duration,this.elapsed+dt);this.hour=this.elapsed/this.duration*6;const h=Math.floor(this.hour);if(h!==this.lastHour){this.lastHour=h;this.g.bus.emit('hour',h);}if(this.elapsed>=this.duration)this.g.finish(this.g.tasks.allDone()?'won':'unfinished');}
 clock(){const min=Math.floor(this.hour*60);return`${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;}
};
NS.InventorySystem=class{
 constructor(g){this.g=g;this.items=['chave','cartão','ferramentas'];this.battery=g.difficulty==='Normal'?100:80;this.max=6;}
 has(id){return this.items.includes(id);}
 add(id){if(this.items.length>=this.max){this.g.ui.toast('Mochila cheia. Use uma bateria para liberar espaço.');return false;}this.items.push(id);return true;}
 remove(id){const i=this.items.indexOf(id);if(i<0)return false;this.items.splice(i,1);return true;}
 use(id){if(id==='bateria'&&this.remove(id)){this.battery=Math.min(100,this.battery+65);this.g.ui.toast('Bateria substituída.');}else this.g.ui.toast('Este item é usado automaticamente na interação correta.');}
 update(dt){if(this.g.player.flashlight){this.battery=Math.max(0,this.battery-dt*.065);if(this.battery===0)this.g.player.flashlight=false;}}
 snapshot(){return{items:[...this.items],battery:this.battery};}
};
NS.TaskManager=class{
 constructor(g){this.g=g;this.done=[];this.order=['stock','clean','box','camera','rear'].sort(()=>g.random()-.5);this.catalog={stock:{name:'Organizar bebidas',hint:'Corredor 01. Aproxime-se da lateral da prateleira.',duration:3},clean:{name:'Limpar corredor 4',hint:'Mancha no chão entre os corredores 02 e 03.',duration:4},box:{name:'Levar caixa ao balcão',hint:'Pegue a caixa no depósito e entregue no caixa.',duration:2},camera:{name:'Verificar câmera 3',hint:'Use o terminal do escritório ou o celular.',duration:1},rear:{name:'Trancar porta dos fundos',hint:'Porta atrás da sala de funcionários. Feche antes de trancar.',duration:2}};}
 isDone(id){return this.done.includes(id);}
 complete(id){if(this.isDone(id))return;this.done.push(id);this.g.audio.effect('done');this.g.ui.toast('✓ '+this.catalog[id].name);this.g.bus.emit('task',id);this.g.save.checkpoint(this.g);}
 allDone(){return this.done.length===5;}
};
NS.PowerSystem=class{
 constructor(g){this.g=g;this.on=true;this.flicker=1;this.failures=0;this.switches=[false,false,false];this.target=[true,false,true];}
 fail(){if(!this.on)return;this.on=false;this.failures++;this.switches=Array.from({length:3},()=>this.g.random()>.5);if(this.switches.every((s,i)=>s===this.target[i]))this.switches[0]=!this.switches[0];this.g.ui.toast('A energia caiu. Quadro elétrico no escritório.');this.g.audio.effect('power');}
 toggle(i){this.switches[i]=!this.switches[i];}
 repair(){if(!this.switches.every((s,i)=>s===this.target[i])){this.g.ui.toast('A sequência deve ser: ligado / desligado / ligado.');return false;}if(this.g.difficulty==='Pesadelo'&&!this.g.inventory.has('fusível')){this.g.ui.toast('Encontre o fusível no banheiro.');return false;}if(this.g.difficulty==='Pesadelo')this.g.inventory.remove('fusível');this.on=true;this.g.anomalies.resolve('power_cut');this.g.ui.toast('Energia restabelecida.');return true;}
 update(){this.flicker=this.g.anomalies.active.some(a=>a.id==='flicker')?(.55+Math.random()*.45):1;}
};
NS.ANOMALIES=[
 {id:'moved',name:'Produto deslocado',category:'objeto',level:1,chance:1,from:1,to:5.6,maps:['Mercado'],danger:0,zone:'Corredores',condition:'none',duration:80},
 {id:'duplicate',name:'Caixa duplicada',category:'objeto',level:1,chance:.8,from:1,to:5.8,maps:['Mercado'],danger:0,zone:'Corredores',condition:'none',duration:95},
 {id:'flicker',name:'Lâmpadas oscilando',category:'iluminação',level:1,chance:1,from:1,to:6,maps:['Mercado'],danger:0,zone:'Corredores',condition:'power',duration:38},
 {id:'open_door',name:'Porta se abre sozinha',category:'porta',level:1,chance:1,from:1.4,to:5.6,maps:['Mercado'],danger:0,zone:'Depósito',condition:'none',duration:80},
 {id:'footsteps',name:'Passos no depósito',category:'som',level:1,chance:1.2,from:2,to:6,maps:['Mercado'],danger:1,zone:'Depósito',condition:'none',duration:28},
 {id:'phone',name:'Telefone sem linha',category:'som',level:1,chance:.9,from:1.5,to:5.5,maps:['Mercado'],danger:0,zone:'Escritório',condition:'none',duration:35},
 {id:'power_cut',name:'Falha elétrica',category:'iluminação',level:1,chance:.7,from:2.4,to:5.7,maps:['Mercado'],danger:1,zone:'Escritório',condition:'power',duration:180},
 {id:'camera_figure',name:'Figura apenas no CFTV',category:'pessoa',level:1,chance:1,from:1.2,to:5.9,maps:['Mercado'],danger:0,zone:'Corredores',condition:'power',duration:75},
 {id:'camera_fail',name:'Câmera sem sinal',category:'câmera',level:1,chance:.8,from:2,to:5.7,maps:['Mercado'],danger:0,zone:'Escritório',condition:'power',duration:55},
 {id:'staring',name:'Cliente imóvel',category:'pessoa',level:1,chance:1,from:1,to:5.8,maps:['Mercado'],danger:0,zone:'Caixa',condition:'none',duration:80},
 {id:'new_door',name:'Porta onde havia parede',category:'porta',level:2,chance:.9,from:2,to:5.6,maps:['Mercado'],danger:1,zone:'Corredores',condition:'none',duration:80},
 {id:'wrong_clock',name:'Horário impossível',category:'outra',level:2,chance:.7,from:2,to:5.6,maps:['Mercado'],danger:0,zone:'Caixa',condition:'none',duration:40},
 {id:'knocking',name:'Batidas nos fundos',category:'som',level:1,chance:.9,from:2.5,to:6,maps:['Mercado'],danger:1,zone:'Fundos',condition:'none',duration:35},
 {id:'whisper',name:'Voz sem origem',category:'som',level:2,chance:.8,from:3,to:6,maps:['Mercado'],danger:1,zone:'Funcionários',condition:'none',duration:30},
 {id:'vanish',name:'Cliente desaparece',category:'pessoa',level:2,chance:.7,from:1.5,to:5.9,maps:['Mercado'],danger:0,zone:'Caixa',condition:'none',duration:50},
 {id:'locked',name:'Depósito trancado',category:'porta',level:3,chance:.7,from:3,to:5.7,maps:['Mercado'],danger:1,zone:'Depósito',condition:'none',duration:20}
];
NS.AnomalyManager=class{
 constructor(g){this.g=g;this.active=[];this.used=[];this.correct=0;this.found=0;this.reports=0;this.next=70+g.random()*25;this.library=NS.ANOMALIES;}
 update(dt){for(const a of [...this.active]){a.remaining-=dt;const observable=NS.distance(this.g.player,this.zonePoint(a.zone))<5||a.category==='iluminação';if(observable&&a.id!=='camera_figure')this.discover(a);if(a.remaining<=0)this.resolve(a.id);}
 this.next-=dt;if(this.next>0||this.g.night.hour<1)return;const limit={Normal:7,'Difícil':10,Pesadelo:13}[this.g.difficulty];if(this.used.length>=limit)return;
 const pool=this.library.filter(a=>a.level<=this.g.currentNight&&a.from<=this.g.night.hour&&a.to>=this.g.night.hour&&!this.used.includes(a.id)&&a.maps.includes('Mercado')&&(a.condition!=='power'||this.g.power.on));if(this.active.length<3&&pool.length){let r=this.g.random()*pool.reduce((s,a)=>s+a.chance,0),pick=pool[pool.length-1];for(const a of pool){r-=a.chance;if(r<=0){pick=a;break;}}this.trigger(pick.id);}
 this.next=({Normal:75,'Difícil':55,Pesadelo:42}[this.g.difficulty])*(.7+this.g.random()*.6);
 }
 zonePoint(zone){return{Corredores:{x:2,z:3},Depósito:{x:-7,z:12},Escritório:{x:7,z:12},Caixa:{x:4,z:-5},Funcionários:{x:0,z:10},Fundos:{x:-2,z:18}}[zone];}
 trigger(id){const def=this.library.find(a=>a.id===id);if(!def||this.active.some(a=>a.id===id))return false;const a={...def,remaining:def.duration,seen:false};this.active.push(a);if(!this.used.includes(id))this.used.push(id);const g=this.g;
 if(id==='moved')g.world.get('odd').active=true;
 if(id==='open_door')g.world.get('stockDoor').open=true;
 if(id==='power_cut')g.power.fail();
 if(id==='staring'||id==='vanish')g.world.get('customer').active=true;
 if(id==='locked'){g.world.get('stockDoor').open=false;g.world.get('stockDoor').locked=true;}
 if(['footsteps','knocking','whisper','phone'].includes(id)){const p=this.zonePoint(a.zone);g.audio.effect(id,p);g.ui.toast({footsteps:'Passos vêm do depósito.',knocking:'Três batidas na porta dos fundos.',whisper:'Uma voz baixa na sala dos funcionários.',phone:'O telefone do escritório está tocando.'}[id]);}
 if(id==='wrong_clock')g.ui.toast('O visor do caixa marca 03:77.');
 g.bus.emit('anomaly',a);return true;
 }
 discover(a){if(a&&!a.seen){a.seen=true;this.found++;}}
 resolve(id){const a=this.active.find(a=>a.id===id);if(!a)return;this.active=this.active.filter(a=>a.id!==id);if(id==='moved')this.g.world.get('odd').active=false;if(id==='staring'||id==='vanish')this.g.world.get('customer').active=false;if(id==='locked')this.g.world.get('stockDoor').locked=false;}
 report(category,zone){this.reports++;const a=this.active.find(a=>a.category===category&&a.zone===zone);if(a){this.discover(a);this.correct++;this.resolve(a.id);this.g.ui.toast('Ocorrência confirmada. Bônus registrado.');this.g.audio.effect('done');}else this.g.ui.toast('Nenhuma ocorrência compatível. Observe categoria e local.');this.g.save.checkpoint(this.g);return!!a;}
 snapshot(){return{active:this.active.map(a=>({...a})),used:[...this.used],correct:this.correct,found:this.found,reports:this.reports,next:this.next};}
};
NS.EntityAI=class{
 constructor(g){this.g=g;this.x=-2;this.z=-13;this.state='gone';this.timer=50;this.cameraOnly=false;this.hunts=0;this.calm=0;this.path=[];this.pathClock=0;}
 update(dt){const g=this.g,p=g.player;this.timer-=dt;if(this.state==='gone'){if(this.timer<=0&&g.night.hour>=1.2){this.spawn();}return;}
 const d=NS.distance(this,p),angle=Math.atan2(this.x-p.x,-(this.z-p.z)),delta=Math.atan2(Math.sin(angle-p.yaw),Math.cos(angle-p.yaw)),seen=!g.ui.cameraOpen&&Math.abs(delta)<.57&&d<23&&g.world.clearLine(p,this)&&!this.cameraOnly;
 if(this.state==='watching'){if(seen&&this.timer>8)this.timer=Math.min(this.timer,8);if(this.timer<=0){if(g.night.hour>=3&&g.random()<.5){this.state='silent';this.timer=35;this.cameraOnly=false;}else this.disappear();}return;}
 if(this.state==='silent'){if(!seen&&!p.hidden)this.approach(dt,.63);if(d<3.5){if(g.night.hour>=4&&this.hunts<(g.difficulty==='Normal'?2:3)){this.state='hunting';this.timer=28;this.hunts++;g.audio.effect('danger');g.ui.toast('Apague a luz. Fique imóvel longe dele ou use o armário.');}else this.disappear();}if(this.timer<=0)this.disappear();return;}
 if(this.state==='hunting'){
  if(!p.flashlight&&(p.hidden||p.moving<.05&&d>2))this.calm+=dt;else this.calm=0;
  if(this.calm>5){this.disappear();g.ui.toast('Os passos pararam.');return;}
  if(!p.hidden)this.approach(dt,g.difficulty==='Normal'?2.5:2.8);
  if(!p.hidden&&d<.7)g.finish('lost');if(this.timer<=0)this.disappear();
 }
 }
 spawn(){const points=[{x:-2,z:-13},{x:8,z:6},{x:2,z:6},{x:-7,z:7},{x:7,z:10}].filter(p=>NS.distance(p,this.g.player)>5&&!this.g.world.collision(p.x,p.z));const p=points[Math.floor(this.g.random()*points.length)]||{x:-2,z:-13};this.x=p.x;this.z=p.z;this.state='watching';this.cameraOnly=this.g.random()<.2;this.timer=18+this.g.random()*22;this.calm=0;}
 disappear(){this.state='gone';this.timer=45+this.g.random()*60;this.path=[];this.calm=0;}
 approach(dt,speed){this.pathClock-=dt;const target=this.g.player;if(this.g.world.clearLine(this,target))this.path=[{x:target.x,z:target.z}];else if(this.pathClock<=0){this.path=this.findPath(target);this.pathClock=1.5;}if(!this.path.length)return;const p=this.path[0],d=NS.distance(this,p);if(d<.2){this.path.shift();return;}const step=Math.min(d,dt*speed);this.g.world.move(this,(p.x-this.x)/d*step,(p.z-this.z)/d*step,.23);}
 findPath(target){
 const step=.75,key=(x,z)=>`${x},${z}`,sx=Math.round(this.x/step),sz=Math.round(this.z/step),tx=Math.round(target.x/step),tz=Math.round(target.z/step),start=key(sx,sz),queue=[[sx,sz]],prev=new Map([[start,null]]);let end=null;
 for(let i=0;i<queue.length&&i<2600;i++){const [x,z]=queue[i];if(Math.abs(x-tx)+Math.abs(z-tz)<=1){end=key(x,z);break;}for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,zz=z+dz,k=key(xx,zz);if(xx<-18||xx>18||zz<-32||zz>27||prev.has(k)||this.g.world.collision(xx*step,zz*step,.24))continue;prev.set(k,key(x,z));queue.push([xx,zz]);}}
 if(!end)return[];const path=[];for(let k=end;k&&k!==start;k=prev.get(k)){const[x,z]=k.split(',').map(Number);path.push({x:x*step,z:z*step});}return path.reverse();
 }
 snapshot(){return{x:this.x,z:this.z,state:this.state,timer:this.timer,cameraOnly:this.cameraOnly,hunts:this.hunts,calm:this.calm};}
};
NS.PlayerController=class{
 constructor(g){this.g=g;this.x=0;this.z=-5.5;this.y=1.65;this.yaw=Math.PI;this.pitch=0;this.flashlight=false;this.hidden=false;this.stamina=100;this.moving=0;this.stepTimer=0;}
 update(dt){const c=this.g.controls;let dx=c.move.x,dz=c.move.y;if(c.keys.has('KeyW'))dz=-1;if(c.keys.has('KeyS'))dz=1;if(c.keys.has('KeyA'))dx=-1;if(c.keys.has('KeyD'))dx=1;const len=Math.hypot(dx,dz);if(len>1){dx/=len;dz/=len;}this.moving=this.hidden||this.g.interaction.work?0:Math.min(1,len);const run=(c.running||c.keys.has('ShiftLeft'))&&this.stamina>5&&this.moving>0;const speed=run?3.9:2.25;this.stamina=NS.clamp(this.stamina+dt*(run?-13:9),0,100);if(this.moving){this.g.world.move(this,(dx*Math.cos(this.yaw)-dz*Math.sin(this.yaw))*dt*speed,(dx*Math.sin(this.yaw)+dz*Math.cos(this.yaw))*dt*speed);this.stepTimer-=dt;if(this.stepTimer<=0){this.g.audio.effect('step');this.stepTimer=run?.28:.48;}}this.y=this.hidden?1.1:1.65+Math.sin(this.g.night.elapsed*10)*this.moving*.025;}
 view(){return{x:this.x,y:this.y,z:this.z,yaw:this.yaw,pitch:this.pitch};}
};
NS.InteractionSystem=class{
 constructor(g){this.g=g;this.target=null;this.work=null;this.feedback=0;}
 update(dt){if(this.work){this.work.left-=dt;if(this.work.left<=0){const id=this.work.id;this.work=null;this.g.tasks.complete(id);}return;}
 const p=this.g.player;this.target=null;let closest=2.6;for(const o of this.g.world.objects){if(!o.active)continue;if(o.type==='task'&&this.g.tasks.isDone(o.id))continue;if(o.type==='box'&&(this.g.inventory.has('caixa')||this.g.tasks.isDone('box')))continue;const dist=NS.distance(p,o);if(dist>closest)continue;const angle=Math.atan2(o.x-p.x,-(o.z-p.z)),delta=Math.atan2(Math.sin(angle-p.yaw),Math.cos(angle-p.yaw));if(Math.abs(delta)>.65&&dist>.65)continue;if(!this.g.world.clearLine(p,{x:o.x+(p.x-o.x)*.13,z:o.z+(p.z-o.z)*.13})&&o.type!=='door')continue;closest=dist;this.target=o;}
 }
 interact(){const g=this.g;if(g.player.hidden){g.player.hidden=false;g.ui.toast('Você saiu do armário.');return;}if(this.work)return;const o=this.target;if(!o){g.ui.toast('Aproxime-se e olhe para um objeto.');return;}g.audio.effect('click');this.feedback=.3;
 if(o.type==='door'){if(o.id==='rear'&&!g.tasks.isDone('rear')){if(o.open){o.open=false;g.ui.toast('Porta fechada. Toque novamente para trancar.');}else{this.begin('rear');o.locked=true;}return;}if(o.locked){g.ui.toast('Porta trancada.');return;}o.open=!o.open;g.audio.effect('door');}
 else if(o.type==='task')this.begin(o.id);
 else if(o.type==='box'){if(g.inventory.add('caixa')){g.ui.toast('Caixa na mochila. Leve ao balcão do caixa.');if(g.currentNight>1&&g.random()<.5)g.anomalies.trigger('locked');}}
 else if(o.type==='delivery'){if(g.inventory.remove('caixa'))this.begin('box');else g.ui.toast('Pegue a caixa marcada no depósito.');}
 else if(o.type==='camera')g.ui.phone('Câmeras');
 else if(o.type==='battery'){if(g.inventory.add('bateria')){o.active=false;g.ui.toast('Bateria guardada na mochila.');}}
 else if(o.type==='fuse'){if(g.inventory.add('fusível')){o.active=false;g.ui.toast('Fusível guardado.');}}
 else if(o.type==='power'){if(g.power.on)g.ui.toast('A energia está normal.');else g.ui.breaker();}
 else if(o.type==='hide'){g.player.hidden=true;g.player.flashlight=false;g.ui.toast('Escondido. Apague a luz e espere os passos cessarem. USAR para sair.');}
 else if(o.type==='clue'){g.clueFound=true;o.active=false;g.ui.document();}
 else if(o.type==='anomaly')g.ui.phone('Relatório');
 else if(o.type==='customer'){g.ui.toast(g.anomalies.active.some(a=>a.id==='staring')?'Ele não responde. Só acompanha seus movimentos.':'“Você vende lembranças de quem ainda não nasceu?”');for(const a of g.anomalies.active.filter(a=>a.zone==='Caixa'))g.anomalies.discover(a);}
 else g.ui.toast('Nada fora do comum aqui.');
 }
 begin(id){if(this.g.tasks.isDone(id))return;this.work={id,left:this.g.tasks.catalog[id].duration,total:this.g.tasks.catalog[id].duration};this.g.ui.toast('Trabalhando… permaneça aqui.');}
};
NS.CameraSystem=class{
 constructor(g){this.g=g;this.index=0;this.timer=0;this.views=[{name:'CAM 01 — Entrada',x:8,y:3.2,z:-7,yaw:-2.3,pitch:-.35},{name:'CAM 02 — Caixa',x:8,y:3.1,z:-2,yaw:-.8,pitch:-.45},{name:'CAM 03 — Corredores',x:8,y:3.15,z:7,yaw:-.9,pitch:-.33},{name:'CAM 04 — Depósito',x:-9,y:3.15,z:15,yaw:.65,pitch:-.4},{name:'CAM 05 — Fundos',x:3,y:3.1,z:20,yaw:-.9,pitch:-.4}];this.copy=null;}
 get available(){return this.g.power.on&&!this.g.anomalies.active.some(a=>a.id==='camera_fail');}
 update(dt){if(!this.g.ui.cameraOpen)return;this.timer-=dt;if(this.timer>0)return;this.timer=.18;const canvas=document.getElementById('feed');if(!canvas)return;const ctx=canvas.getContext('2d');canvas.width=600;canvas.height=300;if(!this.available){ctx.fillStyle='#0c1517';ctx.fillRect(0,0,600,300);ctx.fillStyle='#aab4af';ctx.font='20px monospace';ctx.fillText('SEM SINAL',220,155);return;}this.g.renderer.draw(this.g,this.views[this.index],true);ctx.drawImage(this.g.renderer.canvas,0,0,600,300);if(this.index===2){this.g.tasks.complete('camera');this.g.anomalies.discover(this.g.anomalies.active.find(a=>a.id==='camera_figure'));}this.g.renderer.draw(this.g,this.g.player.view());}
};
NS.AudioManager=class{
 constructor(g){this.g=g;this.ctx=null;this.enabled=false;this.ambient=null;this.step=0;}
 unlock(){try{if(!this.ctx){this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.connect(this.ctx.destination);this.master.gain.value=this.g.save.data.settings.volume;const size=this.ctx.sampleRate*2,b=this.ctx.createBuffer(1,size,this.ctx.sampleRate),data=b.getChannelData(0);let v=0;for(let i=0;i<size;i++){v=(v+(Math.random()*2-1)*.02)/1.02;data[i]=v*3;}const s=this.ctx.createBufferSource();s.buffer=b;s.loop=true;const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=240;const gain=this.ctx.createGain();gain.gain.value=.12;s.connect(filter);filter.connect(gain);gain.connect(this.master);s.start();this.ambient=gain;}this.ctx.resume();this.enabled=true;}catch(e){this.enabled=false;}}
 effect(kind,pos){if(!this.ctx||!this.enabled)return;const t=this.ctx.currentTime,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.type=['door','step','power','knocking'].includes(kind)?'triangle':'sine';const config={click:[600,.06,.06],done:[740,.35,.06],step:[90,.10,.05],door:[65,.35,.13],power:[35,.6,.17],danger:[48,1.3,.16],phone:[780,.9,.08],footsteps:[100,1,.09],knocking:[80,.8,.16],whisper:[180,1.8,.035]}[kind]||[100,.3,.05];osc.frequency.setValueAtTime(config[0],t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,config[0]*.6),t+config[1]);let vol=config[2];if(pos)vol*=NS.clamp(5/(1+NS.distance(pos,this.g.player)),.15,1);gain.gain.setValueAtTime(vol,t);gain.gain.exponentialRampToValueAtTime(.0001,t+config[1]);osc.connect(gain);if(pos&&this.ctx.createStereoPanner){const pan=this.ctx.createStereoPanner(),p=this.g.player;pan.pan.value=NS.clamp(((pos.x-p.x)*Math.cos(p.yaw)+(pos.z-p.z)*Math.sin(p.yaw))/10,-1,1);gain.connect(pan);pan.connect(this.master);}else gain.connect(this.master);osc.start();osc.stop(t+config[1]);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
 update(){if(this.master)this.master.gain.value=this.g.save.data.settings.volume;if(this.ambient)this.ambient.gain.value=this.g.mode==='playing'?(this.g.power.on?.15:.08):.04;}
 suspend(){if(this.ctx)this.ctx.suspend();}
};
NS.TouchControls=class{
 constructor(g){this.g=g;this.move={x:0,y:0};this.running=false;this.keys=new Set();this.joyId=null;this.lookId=null;this.drag=null;this.bind();}
 clear(){this.move={x:0,y:0};this.running=false;this.keys.clear();this.joyId=null;this.lookId=null;this.drag=null;document.getElementById('stick').style.transform='';}
 bind(){const joy=document.getElementById('joystick'),stick=document.getElementById('stick'),world=document.getElementById('world');joy.addEventListener('pointerdown',e=>{if(this.g.mode!=='playing')return;this.joyId=e.pointerId;joy.setPointerCapture(e.pointerId);this.joyMove(e);});joy.addEventListener('pointermove',e=>{if(this.joyId===e.pointerId)this.joyMove(e);});const release=e=>{if(e.pointerId===this.joyId){this.joyId=null;this.move={x:0,y:0};stick.style.transform='';}};joy.addEventListener('pointerup',release);joy.addEventListener('pointercancel',release);
 world.addEventListener('pointerdown',e=>{if(this.g.mode!=='playing'||this.g.ui.overlay)return;this.lookId=e.pointerId;this.drag={x:e.clientX,y:e.clientY};world.setPointerCapture(e.pointerId);});world.addEventListener('pointermove',e=>{if(e.pointerId!==this.lookId||!this.drag)return;this.look(e.clientX-this.drag.x,e.clientY-this.drag.y);this.drag={x:e.clientX,y:e.clientY};});const lookRelease=e=>{if(e.pointerId===this.lookId){this.lookId=null;this.drag=null;}};world.addEventListener('pointerup',lookRelease);world.addEventListener('pointercancel',lookRelease);
 const run=document.getElementById('run');run.addEventListener('pointerdown',e=>{this.running=true;run.setPointerCapture(e.pointerId);});for(const name of ['pointerup','pointercancel','lostpointercapture'])run.addEventListener(name,()=>this.running=false);
 document.getElementById('interact').onclick=()=>this.g.interaction.interact();document.getElementById('flash').onclick=()=>{if(this.g.inventory.battery>0)this.g.player.flashlight=!this.g.player.flashlight;else this.g.ui.toast('Use uma bateria na mochila.');};document.getElementById('phone').onclick=()=>this.g.ui.phone();document.getElementById('bag').onclick=()=>this.g.ui.inventory();document.getElementById('pause').onclick=()=>this.g.pause();
 window.addEventListener('keydown',e=>{if(e.repeat)return;if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();this.keys.add(e.code);if(this.g.mode==='playing'&&!this.g.ui.overlay){if(e.code==='KeyE')this.g.interaction.interact();if(e.code==='KeyF')document.getElementById('flash').click();if(e.code==='KeyP')this.g.ui.phone();if(e.code==='KeyI')this.g.ui.inventory();}if(e.code==='Escape'){if(this.g.ui.overlay&&this.g.mode==='playing')this.g.ui.close();else if(this.g.mode==='playing')this.g.pause();else if(this.g.mode==='paused')this.g.resume();}});window.addEventListener('keyup',e=>this.keys.delete(e.code));window.addEventListener('blur',()=>{this.clear();if(this.g.mode==='playing')this.g.pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){this.clear();if(this.g.mode==='playing')this.g.pause();this.g.audio.suspend();}});
 }
 joyMove(e){const r=document.getElementById('joystick').getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,d=Math.hypot(x,y),limit=r.width*.33,f=d>limit?limit/d:1;this.move={x:x*f/limit,y:y*f/limit};document.getElementById('stick').style.transform=`translate(${x*f}px,${y*f}px)`;}
 look(dx,dy){const s=.004*this.g.save.data.settings.sensitivity;this.g.player.yaw+=dx*s;this.g.player.pitch=NS.clamp(this.g.player.pitch-dy*s,-1.25,1.25);}
};
