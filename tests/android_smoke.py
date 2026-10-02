"""Install/launch the Gradle APK on Android and test actual touch-to-game input."""
import subprocess,time,json,urllib.request,re,os,sys,traceback
from pathlib import Path
import websocket
out=Path('android-evidence');out.mkdir(exist_ok=True)
def adb(*args,check=True):
 p=subprocess.run(['adb',*args],capture_output=True,text=True,timeout=90)
 if check and p.returncode:raise RuntimeError(p.stdout+p.stderr)
 return p.stdout+p.stderr
old=adb('install','-r','dist/Night-Shift-Android.apk',check=False)
(out/'old-apk-install.txt').write_text(old)
adb('uninstall','com.nightshift.game',check=False)
result=adb('install','-r','android/app/build/outputs/apk/debug/app-debug.apk')
assert 'Success' in result,result
(out/'new-apk-install.txt').write_text(result)
adb('shell','settings','put','secure','immersive_mode_confirmations','confirmed')
adb('logcat','-c');adb('shell','am','start','-W','-n','com.nightshift.game/.MainActivity')
ws=None
for _ in range(40):
 try:
  pid=adb('shell','pidof','com.nightshift.game').strip();assert pid
  adb('forward','tcp:9222','localabstract:webview_devtools_remote_'+pid)
  targets=json.load(urllib.request.urlopen('http://127.0.0.1:9222/json',timeout=3))
  target=next(x for x in targets if x.get('type')=='page')
  ws=websocket.create_connection(target['webSocketDebuggerUrl'],timeout=15,suppress_origin=True);break
 except Exception:time.sleep(1)
assert ws,'WebView debugger never became ready'
seq=0
def evaluate(expr):
 global seq
 seq+=1;ws.send(json.dumps({'id':seq,'method':'Runtime.evaluate','params':{'expression':expr,'returnByValue':True}}))
 while True:
  r=json.loads(ws.recv())
  if r.get('id')==seq:
   assert not r.get('error'),r
   result=r['result'];assert not result.get('exceptionDetails'),result
   return result['result'].get('value')
for _ in range(30):
 if evaluate('Boolean(window.game && game.mode==="menu")'):break
 time.sleep(1)
assert evaluate('Boolean(window.game && game.mode==="menu")'),'Game menu did not initialize'
def screenshot(name):
 data=subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=30);(out/name).write_bytes(data)
def tap(selector):
 r=evaluate('(()=>{const r=document.querySelector('+json.dumps(selector)+').getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()')
 adb('shell','input','tap',str(round(r['x'])),str(round(r['y'])))
 time.sleep(.5)
def on_error(kind,value,tb):
 try:
  screenshot('failure.png')
  (out/'logcat.txt').write_text(adb('logcat','-d'))
  (out/'failure-state.json').write_text(json.dumps(evaluate('({mode:game.mode,flashlight:game.player.flashlight,overlay:game.ui.overlay,dpr:devicePixelRatio,width:innerWidth,height:innerHeight})')))
 except Exception:pass
 traceback.print_exception(kind,value,tb)
sys.excepthook=on_error
screenshot('menu.png');tap('#menuButtons .primary');time.sleep(3)
assert evaluate('game.mode')=='playing','Actual New Turn button did not start'
before=evaluate('({x:game.player.x,z:game.player.z})')
r=evaluate('(()=>{const r=document.querySelector("#joystick").getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio,h:r.height*devicePixelRatio}})()')
adb('shell','input','swipe',str(round(r['x'])),str(round(r['y'])),str(round(r['x'])),str(round(r['y']-r['h']*.35)),'900');time.sleep(.5)
after=evaluate('({x:game.player.x,z:game.player.z})')
assert abs(after['x']-before['x'])+abs(after['z']-before['z'])>.1,'Touch joystick did not move player'
tap('#flash');assert evaluate('game.player.flashlight')is True,'Flashlight button failed'
tap('#phone');assert evaluate('game.ui.overlay')is True,'Phone button failed'
tap('#closePhone button');assert evaluate('game.ui.overlay')is False
screenshot('playing.png')
tap('#pause');assert evaluate('game.mode')=='paused';assert evaluate('Boolean(game.save.data.active)')
logs=adb('logcat','-d');(out/'logcat.txt').write_text(logs)
assert 'FATAL EXCEPTION' not in logs,'Native crash in logcat'
state=evaluate('({mode:game.mode,clock:game.night.clock(),webgl:!!game.renderer.gl,drawCalls:game.renderer.drawCalls,save:!!game.save.data.active})')
(out/'result.json').write_text(json.dumps({'installed':True,'menu':True,'newTurnTouch':True,'joystickTouch':True,'flashlightTouch':True,'phoneTouch':True,'paused':True,'state':state},indent=2))
print('PASS: Android installation, menu, actual touchscreen start, joystick, flashlight, phone, pause and save.',state)
ws.close()
