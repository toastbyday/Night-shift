'use strict';
// Small offline WebGL renderer. Static meshes are chunked and shared; no external assets.
const NS = window.NS = {};
NS.clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
NS.rng=seed=>{let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};};
NS.distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
NS.escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
NS.Mat={
 multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;},
 perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),o=new Float32Array(16);o[0]=f/aspect;o[5]=f;o[10]=(far+near)/(near-far);o[11]=-1;o[14]=2*far*near/(near-far);return o;},
 view(p,yaw,pitch){const f=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)],r=[Math.cos(yaw),0,Math.sin(yaw)],u=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch)],dot=(v)=>v[0]*p.x+v[1]*p.y+v[2]*p.z;return new Float32Array([r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,-dot(r),-dot(u),dot(f),1]);}
};
NS.Geometry=class{
 constructor(){this.data=[];}
 box(x,y,z,w,h,d,color,material=0,yaw=0){
  const a=w/2,b=h/2,c=d/2,faces=[[[1,0,0],[[a,-b,-c],[a,b,-c],[a,b,c],[a,-b,c]]],[[-1,0,0],[[-a,-b,c],[-a,b,c],[-a,b,-c],[-a,-b,-c]]],[[0,1,0],[[-a,b,-c],[-a,b,c],[a,b,c],[a,b,-c]]],[[0,-1,0],[[-a,-b,c],[-a,-b,-c],[a,-b,-c],[a,-b,c]]],[[0,0,1],[[a,-b,c],[a,b,c],[-a,b,c],[-a,-b,c]]],[[0,0,-1],[[-a,-b,-c],[-a,b,-c],[a,b,-c],[a,-b,-c]]]];
  const co=Math.cos(yaw),si=Math.sin(yaw);
  for(const [n,v]of faces)for(const i of [0,1,2,0,2,3]){const p=v[i];this.data.push(x+p[0]*co+p[2]*si,y+p[1],z-p[0]*si+p[2]*co,n[0]*co+n[2]*si,n[1],-n[0]*si+n[2]*co,...color,material);}
 }
};
NS.Renderer=class{
 constructor(canvas){
  this.canvas=canvas;const gl=this.gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});if(!gl)throw Error('Este dispositivo não oferece WebGL. Atualize o Android System WebView.');
  const vert=`attribute vec3 p;attribute vec3 n;attribute vec3 c;attribute float m;uniform mat4 vp;varying vec3 P,N,C;varying float M;void main(){P=p;N=n;C=c;M=m;gl_Position=vp*vec4(p,1.);}`;
  const frag=`precision mediump float;varying vec3 P,N,C;varying float M;uniform vec3 eye,torch,look;uniform float power,battery,time,dawn;uniform vec4 lamps[6];float noise(vec3 p){return fract(sin(dot(floor(p*18.),vec3(13.17,71.31,31.91)))*41731.1);}void main(){float base=.22+dawn*.23;vec3 light=vec3(base*.66,base*.78,base);for(int i=0;i<6;i++){vec3 v=lamps[i].xyz-P;float ds=dot(v,v);light+=vec3(.58,.68,.59)*max(.0,dot(normalize(v),N))*(6.8/(1.+ds))*power*lamps[i].w;}vec3 tv=torch-P;float td=length(tv);float cone=smoothstep(.86,.97,dot(normalize(P-torch),look));light+=vec3(.93,.92,.70)*cone*max(.12,dot(normalize(tv),N))*6./(1.+td*td*.24)*battery;vec3 col=C*light;if(M>1.5)col=C*(.7+power*.4);float detail=.95+noise(P)*.10;if(M>.5&&M<1.5){vec2 tile=fract(P.xz*.7);detail*=mix(.73,1.,step(.025,min(tile.x,tile.y)));}col*=detail;float fog=1.-exp(-length(P-eye)*.039);col=mix(col,vec3(.025,.042,.057)+dawn*vec3(.15,.19,.23),fog);gl_FragColor=vec4(pow(col,vec3(.85)),1.);}`;
  const shader=(t,s)=>{const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
  this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vert));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,frag));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.useProgram(this.program);
  this.loc={};for(const u of ['vp','eye','torch','look','power','battery','time','dawn','lamps'])this.loc[u]=gl.getUniformLocation(this.program,u);this.attrs=['p','n','c','m'].map(a=>gl.getAttribLocation(this.program,a));this.dynamic=gl.createBuffer();this.dynamicGeo=new NS.Geometry();this.dynamicData=new Float32Array(16384);gl.bindBuffer(gl.ARRAY_BUFFER,this.dynamic);gl.bufferData(gl.ARRAY_BUFFER,this.dynamicData.byteLength,gl.DYNAMIC_DRAW);this.chunks=[];gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);this.drawCalls=0;this.lost=false;
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;window.dispatchEvent(new Event('renderer-lost'));});canvas.addEventListener('webglcontextrestored',()=>location.reload());
 }
 uploadWorld(world){const gl=this.gl;this.chunks.forEach(c=>gl.deleteBuffer(c.buffer));this.chunks=[];for(const c of world.chunks.values()){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(c.geo.data),gl.STATIC_DRAW);this.chunks.push({buffer,count:c.geo.data.length/10,x:c.x,z:c.z});}this.uploadSigns(world);}

 uploadSigns(world){
  const gl=this.gl;if(!this.signProgram){
   const compile=(type,text)=>{const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
   this.signProgram=gl.createProgram();gl.attachShader(this.signProgram,compile(gl.VERTEX_SHADER,'attribute vec3 pos;attribute vec2 uv;uniform mat4 vp;varying vec2 UV;void main(){UV=uv;gl_Position=vp*vec4(pos,1.);}'));gl.attachShader(this.signProgram,compile(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 UV;uniform sampler2D atlas;void main(){vec2 uv=UV;if(!gl_FrontFacing){float col=floor(UV.x*2.);uv.x=(col+1.-fract(UV.x*2.))*.5;}gl_FragColor=texture2D(atlas,uv);}'));gl.linkProgram(this.signProgram);this.signBuffer=gl.createBuffer();this.signTexture=gl.createTexture();this.signPos=gl.getAttribLocation(this.signProgram,'pos');this.signUv=gl.getAttribLocation(this.signProgram,'uv');this.signVp=gl.getUniformLocation(this.signProgram,'vp');this.signAtlas=gl.getUniformLocation(this.signProgram,'atlas');
  }
  const atlas=document.createElement('canvas');atlas.width=1024;atlas.height=1024;const ctx=atlas.getContext('2d'),data=[];ctx.fillStyle='#12282b';ctx.fillRect(0,0,1024,1024);ctx.font='bold 23px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  world.labels.forEach((s,i)=>{const ax=(i%2)*512,ay=Math.floor(i/2)*64;ctx.fillStyle=s.color;ctx.fillText(s.text,ax+256,ay+32,490);const w=s.text.includes('24 HORAS')?5.5:2.8,h=.36,co=Math.cos(s.yaw),si=Math.sin(s.yaw),v=[[-w/2,-h/2,0,1],[w/2,-h/2,1,1],[w/2,h/2,1,0],[-w/2,h/2,0,0]];for(const j of[0,1,2,0,2,3]){const p=v[j];data.push(s.x+p[0]*co,s.y+p[1],s.z-p[0]*si,(ax+p[2]*512)/1024,(ay+p[3]*64)/1024);}});
  gl.bindBuffer(gl.ARRAY_BUFFER,this.signBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);this.signCount=data.length/5;gl.bindTexture(gl.TEXTURE_2D,this.signTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 }
 drawSigns(matrix){const gl=this.gl;gl.useProgram(this.signProgram);gl.uniformMatrix4fv(this.signVp,false,matrix);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.signTexture);gl.uniform1i(this.signAtlas,0);gl.bindBuffer(gl.ARRAY_BUFFER,this.signBuffer);for(const a of this.attrs)gl.disableVertexAttribArray(a);gl.enableVertexAttribArray(this.signPos);gl.enableVertexAttribArray(this.signUv);gl.vertexAttribPointer(this.signPos,3,gl.FLOAT,false,20,0);gl.vertexAttribPointer(this.signUv,2,gl.FLOAT,false,20,12);gl.drawArrays(gl.TRIANGLES,0,this.signCount);gl.disableVertexAttribArray(this.signPos);gl.disableVertexAttribArray(this.signUv);this.drawCalls++;}
 attributes(){const gl=this.gl;[3,3,3,1].forEach((size,i)=>{gl.enableVertexAttribArray(this.attrs[i]);gl.vertexAttribPointer(this.attrs[i],size,gl.FLOAT,false,40,[0,12,24,36][i]);});}
 draw(game,view,canvasCamera=false){if(this.lost)return;const gl=this.gl,settings=game.save.data.settings,scale=settings.resolution,w=Math.max(240,Math.floor(this.canvas.clientWidth*scale)),h=Math.max(140,Math.floor(this.canvas.clientHeight*scale));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}gl.viewport(0,0,w,h);gl.clearColor(.025,.04,.06,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
 const dawn=NS.clamp((game.night.hour-5.65)/.35,0,1),eye={x:view.x,y:view.y,z:view.z};gl.uniformMatrix4fv(this.loc.vp,false,NS.Mat.multiply(NS.Mat.perspective(1.18,w/h,.07,settings.distance),NS.Mat.view(eye,view.yaw,view.pitch||0)));gl.uniform3f(this.loc.eye,eye.x,eye.y,eye.z);gl.uniform3f(this.loc.torch,eye.x,eye.y-.1,eye.z);gl.uniform3f(this.loc.look,Math.sin(view.yaw)*Math.cos(view.pitch||0),Math.sin(view.pitch||0),-Math.cos(view.yaw)*Math.cos(view.pitch||0));gl.uniform1f(this.loc.power,game.power.on?game.power.flicker:0);gl.uniform1f(this.loc.battery,!canvasCamera&&game.player.flashlight&&game.inventory.battery>0?1:0);gl.uniform1f(this.loc.time,game.night.elapsed);gl.uniform1f(this.loc.dawn,dawn);gl.uniform4fv(this.loc.lamps,new Float32Array([-6,3,-4,1,6,3,-4,1,-5,3,4,1,5,3,4,1,-7,3,12,.7,7,3,12,.7]));
 this.drawCalls=0;for(const c of this.chunks){if(Math.hypot(c.x-eye.x,c.z-eye.z)>settings.distance+6)continue;const dx=c.x-eye.x,dz=c.z-eye.z;if(dx*Math.sin(view.yaw)-dz*Math.cos(view.yaw)<-7)continue;gl.bindBuffer(gl.ARRAY_BUFFER,c.buffer);this.attributes();gl.drawArrays(gl.TRIANGLES,0,c.count);this.drawCalls++;}
 const geo=this.dynamicGeo;geo.data.length=0;game.world.dynamicGeometry(geo,game,canvasCamera);gl.bindBuffer(gl.ARRAY_BUFFER,this.dynamic);if(geo.data.length>this.dynamicData.length){this.dynamicData=new Float32Array(geo.data.length*2);gl.bufferData(gl.ARRAY_BUFFER,this.dynamicData.byteLength,gl.DYNAMIC_DRAW);}this.dynamicData.set(geo.data);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.dynamicData.subarray(0,geo.data.length));this.attributes();gl.drawArrays(gl.TRIANGLES,0,geo.data.length/10);this.drawCalls++;this.drawSigns(NS.Mat.multiply(NS.Mat.perspective(1.18,w/h,.07,settings.distance),NS.Mat.view(eye,view.yaw,view.pitch||0)));
 }
};
NS.World=class{
 constructor(seed=12){this.chunks=new Map();this.colliders=[];this.objects=[];this.doors=[];this.labels=[];this.rng=NS.rng(seed);this.build();}
 box(x,y,z,w,h,d,c,solid=false,mat=0){const key=`${Math.floor(x/8)},${Math.floor(z/8)}`;if(!this.chunks.has(key))this.chunks.set(key,{x:Math.floor(x/8)*8+4,z:Math.floor(z/8)*8+4,geo:new NS.Geometry()});this.chunks.get(key).geo.box(x,y,z,w,h,d,c,mat);if(solid)this.colliders.push({x,z,w,d});}
 object(id,name,x,z,type,y=1){const o={id,name,x,z,y,type,active:true};this.objects.push(o);return o;}
 door(id,name,x,z,yaw=0){const d={id,name,x,z,y:1.3,type:'door',active:true,open:false,locked:false,yaw,angle:0};this.objects.push(d);this.doors.push(d);return d;}
 wall(x,z,w,d){this.box(x,1.8,z,w,3.6,d,[.28,.35,.35],true);this.box(x,.15,z,w,.3,d+.02,[.08,.13,.15]);}
 sign(text,x,y,z,yaw=0,color='#ccded2'){this.labels.push({text,x,y,z,yaw,color});}
 build(){
  this.box(0,-.17,-3,30,.3,42,[.09,.12,.13],false,1);this.box(0,-.02,4,20,.06,24,[.40,.46,.44],false,1);this.box(0,3.65,4,20,.15,24,[.20,.25,.26]);
  this.wall(-10,4,.35,24);this.wall(10,4,.35,24);this.wall(-6.25,16,7.5,.35);this.wall(4.75,16,10.5,.35);
  // Front windows and proper openings. Opaque tinted panes avoid transparency cost.
  for(const x of [-6,6]){this.box(x,.45,-8,8,.9,.3,[.14,.22,.25],true);this.box(x,2,-8,8,2.2,.14,[.055,.12,.17],true);this.box(x,3.4,-8,8,.4,.3,[.24,.30,.3],true);for(let i=-3;i<=3;i+=2)this.box(x+i,2,-8,.07,2.6,.2,[.35,.46,.43]);}
  this.door('front','Entrada principal',0,-8);
  this.box(0,3.7,-8.3,8,.8,.6,[.06,.22,.21]);this.sign('MERCADO • 24 HORAS',0,3.7,-8.64,0);
  // Back strip: stock / washroom / staff / office and surveillance desk.
  for(const seg of [[-9,2],[-3.5,3],[3.5,3],[9,2]])this.wall(seg[0],8,seg[1],.25);
  this.door('stockDoor','Depósito',-6.7,8);this.door('staffDoor','Funcionários',0,8);this.door('officeDoor','Escritório / CFTV',6.7,8);
  this.wall(-3.2,12,.2,8);this.wall(3.2,12,.2,8);this.wall(0,12.8,2,.2);this.door('bathDoor','Banheiro',1.7,12.8);
  this.sign('DEPÓSITO',-6.7,2.8,7.8);this.sign('FUNCIONÁRIOS',0,2.8,7.8);this.sign('ESCRITÓRIO • CFTV',6.7,2.8,7.8);this.sign('BANHEIRO',1.7,2.8,12.6);
  // Shelves: single batch for hundreds of varied product meshes.
  const colors=[[.34,.52,.42],[.69,.36,.26],[.61,.55,.28],[.25,.38,.55],[.69,.65,.51]];
  for(const x of [-5,0,5])for(const z of [0,4]){
   this.box(x,.95,z,1.1,1.9,2.5,[.17,.22,.24],true);for(const y of [.42,1.0,1.58]){this.box(x,y,z,1.25,.07,2.7,[.51,.56,.54]);for(const side of [-1,1])for(let j=0;j<7;j++){const c=colors[Math.floor(this.rng()*colors.length)];this.box(x+side*.45,y+.19,z-1.03+j*.34,.24,.32,.25,c);this.box(x+side*.6,y+.02,z-1.03+j*.34,.03,.07,.15,[.83,.81,.66]);}}}
  this.sign('01 / BEBIDAS',-5,2.25,0);this.sign('02 / MERCEARIA',0,2.25,0);this.sign('03 / LIMPEZA',5,2.25,4);
  for(let x=-8.8;x<=8.8;x+=4.4){this.box(x,3.4,-3,2.7,.08,.5,[.68,.77,.68],false,2);this.box(x,3.4,5,2.7,.08,.5,[.68,.77,.68],false,2);}
  for(const z of [-4,0,4]){this.box(-9.1,1.2,z,1.5,2.4,2.5,[.12,.21,.23],true);this.box(-8.32,1.25,z,.02,1.8,2.15,[.17,.34,.35]);for(let j=0;j<4;j++)this.box(-8.28,1.0+j*.3,z,.04,.08,2,[.46,.61,.58]);}
  // Checkout / terminal.
  this.box(5,.65,-5.3,3,1.3,1.4,[.29,.32,.29],true);this.box(5,1.33,-5.3,3.2,.12,1.55,[.12,.16,.17]);this.box(5.7,1.65,-5.3,.65,.48,.10,[.17,.48,.39],false,2);this.sign('CAIXA',5.3,2.8,-6.4);
  this.box(7, .7,13,4,1.4,1,[.22,.25,.26],true);this.box(7,1.7,13,.9,.7,.14,[.14,.38,.29],false,2);this.sign('SEGURANÇA / CAM 01—05',7,2.6,13.2);
  this.box(-1,1.1,10.4,1.2,2.2,1,[.18,.24,.27],true);this.box(1.8,.55,15,1.4,1.1,.8,[.65,.70,.69],true);
  for(let j=0;j<5;j++){const x=-8.5+(j%2)*1.3,z=11+Math.floor(j/2)*1.3;this.box(x,.45,z,1.05,.9,1,[.36,.27,.18],true);this.box(x,.91,z,.08,.02,1,[.61,.50,.32]);}
  this.door('rear','Porta dos fundos',-1.5,16);
  this.object('stock','Organizar bebidas',-4.2,0,'task',1.3);this.object('clean','Limpar corredor 4',3,3,'task',.12);this.object('box','Pegar caixa do depósito',-5,10.5,'box',.4);this.object('delivery','Entregar caixa no balcão',3.1,-5.3,'delivery');this.object('camera','Terminal de segurança',7,12.2,'camera',1.6);this.object('trash','Área de lixo',-4,18.2,'trash',.6);this.box(-4,.7,18.2,2,1.4,1.5,[.1,.22,.17],true);
  this.object('breaker','Quadro elétrico',8.9,10,'power',1.6);this.box(9.75,1.6,10,.2,.9,.8,[.22,.26,.25]);this.object('locker','Armário / esconderijo',-.2,10.4,'hide');this.sign('ARMÁRIO',-1.1,1.7,10.5);
  this.object('battery1','Bateria',8.2,13.9,'battery',.9);this.object('battery2','Bateria',-8.5,14.4,'battery',.9);this.object('fuse','Fusível',1.8,14,'fuse',.9);this.object('clue','Ler registro antigo',6,14,'clue',1.2);this.object('customer','Atender cliente',4,-6.5,'customer',1.4).active=false;this.object('odd','Produto fora do lugar',2,5.8,'anomaly',.6).active=false;
  // Parking and dim exterior, vehicles, bollards, road.
  for(let x=-10;x<11;x+=4){this.box(x,.005,-14,.08,.012,6,[.54,.56,.44]);this.box(x,1.2,-9,.16,2.4,.16,[.29,.34,.31],true);}
  for(const x of [-7,7]){this.box(x,.55,-16,2,1.1,4,[.12,.2,.24],true);this.box(x,1.35,-16,1.7,.7,2.2,[.07,.12,.15]);for(const dx of [-.9,.9])for(const dz of [-1.3,1.3])this.box(x+dx,.35,-16+dz,.25,.55,.55,[.03,.04,.045]);}
  this.box(0,-.01,-22,34,.05,5,[.07,.085,.1]);this.box(0,.005,-22,30,.01,.12,[.6,.58,.4]);for(let i=0;i<9;i++){const x=-15+i*4;this.box(x,1,-24,.4,2,.4,[.09,.14,.15]);this.box(x,3,-24,2,3,2,[.04,.10,.105]);}
  this.wall(-14,-3,.3,38);this.wall(14,-3,.3,38);this.wall(0,-25,28,.3);this.wall(0,21,28,.3);
 }
 dynamicGeometry(g,game,camera){
  for(const d of this.doors){const a=d.yaw+d.angle;g.box(d.x+Math.sin(d.angle)*.9,1.3,d.z-Math.sin(d.angle)*.9,2,2.6,.16,[.21,.31,.30],0,a);g.box(d.x+Math.cos(d.angle)*.65,1.22,d.z-.15,.13,.1,.15,[.72,.71,.49],2,a);}
  for(const o of this.objects){if(!o.active)continue;if(o.type==='battery'||o.type==='fuse')g.box(o.x,o.y,o.z,.18,.15,.3,o.type==='battery'?[.49,.58,.32]:[.35,.52,.6],2);if(o.type==='box'&&!game.inventory.has('caixa'))g.box(o.x,.45,o.z,.8,.9,.8,[.51,.38,.24]);if(o.id==='clean'&&!game.tasks.isDone('clean'))g.box(o.x,.015,o.z,1.2,.012,.7,[.1,.19,.18]);if(o.type==='clue')g.box(o.x,o.y,o.z,.35,.025,.5,[.65,.64,.48]);if(o.type==='anomaly')g.box(o.x,o.y,o.z,.25,.9,.25,[.66,.23,.17]);if(o.type==='customer')this.person(g,o.x,o.z,[.31,.37,.36]);}
  if(game.entity.state!=='gone'&&(!game.entity.cameraOnly||camera))this.person(g,game.entity.x,game.entity.z,[.015,.025,.027],true);
  if(camera&&game.anomalies.active.some(a=>a.id==='camera_figure'))this.person(g,-2,3,[.02,.03,.03],true);
  if(game.anomalies.active.some(a=>a.id==='new_door'))g.box(9.82,1.3,3,.10,2.6,1.5,[.10,.10,.095]);
  if(game.anomalies.active.some(a=>a.id==='duplicate'))g.box(5,.5,6,.9,1,.9,[.43,.33,.2]);
  if(game.inventory.has('caixa')&&!camera)g.box(game.player.x+Math.sin(game.player.yaw)*.65,.8,game.player.z-Math.cos(game.player.yaw)*.65,.55,.5,.55,[.35,.27,.18],0,-game.player.yaw);
 }
 person(g,x,z,c,watcher=false){g.box(x,1.22,z,.55,1.05,.30,c);g.box(x,1.92,z,.35,.43,.32,watcher?[.055,.065,.061]:[.49,.43,.34]);g.box(x-.17,.4,z,.15,.8,.18,c);g.box(x+.17,.4,z,.15,.8,.18,c);g.box(x-.36,1.1,z,.14,.9,.16,c);g.box(x+.36,1.1,z,.14,.9,.16,c);if(watcher){g.box(x-.08,1.97,z-.17,.045,.035,.02,[.73,.76,.58],2);g.box(x+.08,1.97,z-.17,.045,.035,.02,[.73,.76,.58],2);}}
 collision(x,z,r=.25){for(const b of this.colliders)if(x+r>b.x-b.w/2&&x-r<b.x+b.w/2&&z+r>b.z-b.d/2&&z-r<b.z+b.d/2)return true;for(const d of this.doors)if(d.angle<.8&&Math.abs(x-d.x)<1+r&&Math.abs(z-d.z)<.15+r)return true;return false;}
 move(p,dx,dz,r=.25){if(!this.collision(p.x+dx,p.z,r))p.x+=dx;if(!this.collision(p.x,p.z+dz,r))p.z+=dz;}
 clearLine(a,b){const d=NS.distance(a,b),steps=Math.ceil(d/.25);for(let i=1;i<steps;i++)if(this.collision(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps,.01))return false;return true;}
 get(id){return this.objects.find(o=>o.id===id);}
 update(dt){for(const d of this.doors)d.angle+=( (d.open?1.45:0)-d.angle)*Math.min(1,dt*8);}
};
