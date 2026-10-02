const fs=require('fs'),vm=require('vm'),assert=require('assert');
class Element{constructor(){this.style={};this.classList={add(){},remove(){},toggle(){}};this.clientWidth=1280;this.clientHeight=720;this.children=[];this.value='';this.textContent='';}set innerHTML(s){this.html=s;this.firstElementChild=new Element();}get innerHTML(){return this.html||'';}addEventListener(){}setPointerCapture(){}appendChild(e){this.children.push(e);}append(e){this.children.push(e);}querySelector(id){return elements[id]??=new Element();}getBoundingClientRect(){return{left:36,top:300,width:138,height:138};}}
const elements={},storage={data:{},getItem(k){return this.data[k]||null;},setItem(k,v){this.data[k]=v;}};
global.window=global;global.NIGHT_SHIFT_TEST=true;global.document={getElementById:id=>elements[id]??=new Element(),createElement:()=>new Element(),addEventListener(){},documentElement:{},hidden:false};global.addEventListener=()=>{};global.localStorage=storage;
const base=__dirname+'/../android/app/src/main/assets/';for(const file of ['engine.js','systems.js','game.js'])vm.runInThisContext(fs.readFileSync(base+file,'utf8'),{filename:file});
const renderer={uploadWorld(){},draw(){},canvas:new Element()};const make=()=>new NS.GameManager({storage,renderer,manual:true});
let g=make();g.start();assert.equal(g.mode,'playing');assert(!g.world.collision(0,-5.5),'spawn must be walkable');assert(g.world.collision(-5,0),'shelves collide');assert(g.world.collision(0,-8),'front door closed');g.world.get('front').open=true;g.world.update(1);assert(!g.world.collision(0,-8),'front door opens');assert(!g.world.collision(-1.5,15),'rear door approach');
// Touch inputs, cancellation, rotation, motion and stamina.
g.controls.joyMove({clientX:105,clientY:320});assert(g.controls.move.y<0);g.controls.look(100,50);assert(g.player.yaw>Math.PI);assert(g.player.pitch<0);g.controls.clear();g.controls.keys.add('KeyW');const before={x:g.player.x,z:g.player.z};g.player.update(.1);assert(NS.distance(g.player,before)>0);g.controls.clear();
// Interactions update their actual task and carrying conditions.
g.interaction.target=g.world.get('stock');g.interaction.interact();for(let i=0;i<31;i++)g.interaction.update(.1);assert(g.tasks.isDone('stock'));
g.interaction.target=g.world.get('clean');g.interaction.interact();for(let i=0;i<41;i++)g.interaction.update(.1);assert(g.tasks.isDone('clean'));
g.interaction.target=g.world.get('box');g.interaction.interact();assert(g.inventory.has('caixa'));g.interaction.target=g.world.get('delivery');g.interaction.interact();for(let i=0;i<21;i++)g.interaction.update(.1);assert(g.tasks.isDone('box'));assert(!g.inventory.has('caixa'));
g.interaction.target=g.world.get('rear');g.interaction.interact();for(let i=0;i<21;i++)g.interaction.update(.1);assert(g.tasks.isDone('rear'));assert(g.world.get('rear').locked);
// Power puzzle and reporting validate state rather than awarding free bonuses.
g.anomalies.trigger('power_cut');assert(!g.power.on);assert(!g.cameras.available);g.power.switches=[false,false,false];assert(!g.power.repair());g.power.switches=[true,false,true];assert(g.power.repair());assert(g.cameras.available);g.anomalies.trigger('moved');assert(g.world.get('odd').active);assert(!g.anomalies.report('pessoa','Depósito'));assert(g.anomalies.report('objeto','Corredores'));assert.equal(g.anomalies.correct,1);assert(!g.world.get('odd').active);
// Progress survives reconstruction, paused time does not advance.
g.night.elapsed=300;g.night.hour=2.5;g.save.checkpoint(g);const resumed=make();resumed.start(resumed.save.data.active);assert.equal(resumed.night.elapsed,300);assert(resumed.tasks.isDone('box'));resumed.pause();resumed.tick(.1);assert.equal(resumed.night.elapsed,300);resumed.resume();assert.equal(resumed.mode,'playing');
// Watcher freezing and hiding give an actual survival strategy; exposure loses.
resumed.entity.state='hunting';resumed.entity.x=4;resumed.entity.z=5;resumed.entity.timer=28;resumed.player.hidden=true;resumed.player.flashlight=false;for(let i=0;i<60;i++)resumed.entity.update(.1);assert.equal(resumed.entity.state,'gone');resumed.player.hidden=false;resumed.entity.state='hunting';resumed.entity.x=resumed.player.x;resumed.entity.z=resumed.player.z;resumed.entity.timer=28;resumed.entity.update(.1);assert.equal(resumed.mode,'results');assert.equal(resumed.save.data.money,0);
// Full normal night schedules randomized events and completes exactly once.
g=make();g.start();g.tasks.done=['stock','clean','box','camera','rear'];g.player.hidden=true;g.player.flashlight=false;let events=0;g.bus.on('anomaly',()=>events++);for(let i=0;i<7300;i++)g.tick(.1);assert.equal(g.mode,'results');assert.equal(g.night.clock(),'06:00');assert(events>=3,'procedural events should occur');assert(g.save.data.money>=115);assert.equal(g.save.data.completed,1);const pay=g.save.data.money;g.finish('won');assert.equal(g.save.data.money,pay,'no duplicate payout');assert.equal(g.save.data.active,null);
// Missing tasks produce a different outcome. Difficulty and library gating.
g=make();g.start();g.night.elapsed=g.night.duration-.05;g.tick(.1);assert.equal(g.mode,'results');assert.equal(g.save.data.completed,1);assert.equal(g.save.data.money,pay);g.save.data.settings.difficulty='Pesadelo';g.start();assert.equal(g.night.duration,1080);g.power.fail();g.power.switches=[true,false,true];assert(!g.power.repair());g.inventory.add('fusível');assert(g.power.repair());assert(!g.inventory.has('fusível'));
assert.equal(new Set(NS.ANOMALIES.map(a=>a.id)).size,NS.ANOMALIES.length);for(const a of NS.ANOMALIES)assert(a.from<a.to&&a.chance>0&&a.maps.includes('Mercado'));
// All core interactables can be targeted from a collision-free position.
g=make();g.start();for(const door of g.world.doors){door.open=true;door.angle=1.45;}
for(const id of ['stock','clean','box','delivery','camera','breaker','locker','battery1','battery2','fuse','clue','rear']){
 const o=g.world.get(id);let found=false;
 for(let angle=0;angle<Math.PI*2&&!found;angle+=.15)for(let range=.8;range<2.5&&!found;range+=.3){
  const x=o.x+Math.cos(angle)*range,z=o.z+Math.sin(angle)*range;if(g.world.collision(x,z))continue;
  Object.assign(g.player,{x,z,yaw:Math.atan2(o.x-x,-(o.z-z))});g.interaction.update(.1);if(g.interaction.target?.id===id)found=true;
 }
 assert(found,'must be able to target '+id);
}
// Export real world geometry for an independent offscreen renderer.
const world=new NS.World(12),data=[];for(const c of world.chunks.values())data.push(...c.geo.data);const geo=new NS.Geometry();world.dynamicGeometry(geo,g,false);data.push(...geo.data);fs.writeFileSync(__dirname+'/world.json',JSON.stringify({vertices:data,view:Array.from(NS.Mat.view({x:7,y:1.7,z:-6},-2.45,0)),projection:Array.from(NS.Mat.perspective(1.18,1280/720,.07,60)),labels:world.labels}));
console.log('PASS: collisions, doors, touch, tasks, carrying, power, reports, save, pause, entity, full night, payout, failure, difficulty.');console.log('Generated',data.length/10,'vertices. Events in full night:',events);
