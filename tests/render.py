"""Independent EGL/GL render of real generated world geometry; no device FPS claim."""
import json,re
from pathlib import Path
import numpy as np
import moderngl
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[1]
s=(root/'android/app/src/main/assets/engine.js').read_text()
vert=re.search(r'const vert=`(.*?)`;',s,re.S).group(1)
frag=re.search(r'const frag=`(.*?)`;',s,re.S).group(1)
vert='#version 330\n'+vert.replace('attribute ','in ').replace('varying ','out ')
frag='#version 330\nout vec4 outputColor;\n'+frag.replace('precision mediump float;','').replace('varying ','in ').replace('gl_FragColor','outputColor')
ctx=moderngl.create_standalone_context(backend='egl')
program=ctx.program(vertex_shader=vert,fragment_shader=frag)
d=json.loads((root/'tests/world.json').read_text());data=np.array(d['vertices'],dtype=np.float32)
vbo=ctx.buffer(data.tobytes());vao=ctx.vertex_array(program,[(vbo,'3f 3f 3f 1f','p','n','c','m')])
# matrices are serialized as column-major arrays
v=np.array(d['view'],np.float32).reshape((4,4),order='F');p=np.array(d['projection'],np.float32).reshape((4,4),order='F');program['vp'].write((p@v).astype('f4').tobytes(order='F'))
program['eye'].value=(7,1.7,-6);program['torch'].value=(7,1.6,-6);program['look'].value=(-.638,0,.77);program['power'].value=1;program['battery'].value=0;program['dawn'].value=0
program['lamps'].write(np.array([-6,3,-4,1,6,3,-4,1,-5,3,4,1,5,3,4,1,-7,3,12,.7,7,3,12,.7],dtype='f4').tobytes())
fbo=ctx.simple_framebuffer((1280,720));fbo.use();ctx.enable(moderngl.DEPTH_TEST);fbo.clear(.025,.04,.06,1);vao.render()
# Render the actual world signs using the same single atlas layout.
sp=ctx.program(vertex_shader="#version 330\nin vec3 pos;in vec2 uv;uniform mat4 vp;out vec2 UV;void main(){UV=uv;gl_Position=vp*vec4(pos,1.);}",fragment_shader="#version 330\nin vec2 UV;uniform sampler2D atlas;out vec4 color;void main(){vec2 uv=UV;if(!gl_FrontFacing){float col=floor(UV.x*2.);uv.x=(col+1.-fract(UV.x*2.))*.5;}color=texture(atlas,uv);}")
atlas=Image.new('RGBA',(1024,1024),(18,40,43,255));ad=ImageDraw.Draw(atlas)
try:font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',23)
except OSError:font=ImageFont.load_default()
vertices=[]
for i,label in enumerate(d['labels']):
 ax=(i%2)*512;ay=(i//2)*64;ad.text((ax+256,ay+32),label['text'],font=font,anchor='mm',fill=label['color'])
 w=5.5 if '24 HORAS' in label['text'] else 2.8;h=.36;co=np.cos(label['yaw']);si=np.sin(label['yaw']);points=[(-w/2,-h/2,0,1),(w/2,-h/2,1,1),(w/2,h/2,1,0),(-w/2,h/2,0,0)]
 for j in [0,1,2,0,2,3]:
  x,y,u,vv=points[j];vertices.extend([label['x']+x*co,label['y']+y,label['z']-x*si,(ax+u*512)/1024,(ay+vv*64)/1024])
texture=ctx.texture((1024,1024),4,atlas.tobytes());texture.filter=(moderngl.LINEAR,moderngl.LINEAR);texture.use(0);sp['atlas'].value=0;sp['vp'].write((p@v).astype('f4').tobytes(order='F'));sb=ctx.buffer(np.array(vertices,dtype='f4').tobytes());sv=ctx.vertex_array(sp,[(sb,'3f 2f','pos','uv')]);sv.render()
im=Image.frombytes('RGB',(1280,720),fbo.read(components=3)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
# Minimal caption marks this as an offscreen capture, not an Android screenshot.
draw=ImageDraw.Draw(im);draw.rectangle((20,20,500,88),fill=(8,17,23));draw.text((35,33),'NIGHT SHIFT / MERCADO 24H',fill=(203,226,209));draw.text((35,57),'Captura offscreen do cenario real - versao 0.1',fill=(137,163,172))
im.save(root/'dist'/'Night-Shift-Preview.png')
a=np.asarray(im);assert a.std()>10,'render should contain visible geometry'
print('PASS: GLSL compiled and world rendered using EGL.',ctx.info['GL_RENDERER'], 'Pixel std:',a.std())
