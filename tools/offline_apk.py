"""SDK-free DEVELOPMENT packager for this fixed, tiny native WebView host.
Produces DEX 035, binary AndroidManifest and JAR/v1 and APK/v2 signatures using cryptography.
The standard Gradle pipeline is the supported release path; this packager is for
this 0.1 build only, with target API 35 (development distribution only).
No general Java compiler is claimed. Instructions match MainActivity.java.
"""
from pathlib import Path
import struct, hashlib, zlib, zipfile, base64, datetime, json
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.serialization import pkcs7
U=lambda n:struct.pack('<I',n)
H=lambda n:struct.pack('<H',n)

def leb(n):
    out=bytearray()
    while n>=128:out.append((n&127)|128);n>>=7
    out.append(n);return bytes(out)

C='Lcom/nightshift/game/MainActivity;'; A='Landroid/app/Activity;'; W='Landroid/webkit/WebView;'; S='Landroid/webkit/WebSettings;'; V='Landroid/view/View;'; WIN='Landroid/view/Window;'; CTX='Landroid/content/Context;'; B='Landroid/os/Bundle;'; STR='Ljava/lang/String;'; CB='Landroid/webkit/ValueCallback;'
PAUSE="if(window.game && game.mode==='playing')game.pause();"
BACK="if(window.game){if(game.mode==='playing')game.pause();else if(game.mode==='paused')game.ui.menu();}"
URL='file:///android_asset/index.html'

def dex():
    methods=[]
    def m(cls,name,ret,*args):
        t=(cls,name,ret,args)
        if t not in methods:methods.append(t)
        return t
    init=m(C,'<init>','V');on=m(C,'onCreate','V',B);pause=m(C,'onPause','V');back=m(C,'onBackPressed','V')
    ai=m(A,'<init>','V');ao=m(A,'onCreate','V',B);ap=m(A,'onPause','V');wc=m(W,'<init>','V',CTX);gs=m(W,'getSettings',S)
    booleans=[m(S,n,'V','Z') for n in ['setJavaScriptEnabled','setDomStorageEnabled','setAllowFileAccess','setAllowFileAccessFromFileURLs','setAllowUniversalAccessFromFileURLs','setMediaPlaybackRequiresUserGesture']]
    bg=m(W,'setBackgroundColor','V','I');gw=m(A,'getWindow',WIN);sf=m(WIN,'setFlags','V','I','I');dv=m(WIN,'getDecorView',V);vis=m(V,'setSystemUiVisibility','V','I');content=m(A,'setContentView','V',V);load=m(W,'loadUrl','V',STR);ev=m(W,'evaluateJavascript','V',STR,CB)
    types=set([C,A,W,S,V,WIN,CTX,B,STR,CB,'V','I','Z'])
    def shorty(ret,args):return('L' if ret.startswith('L')else ret)+''.join('L'if a.startswith('L')else a for a in args)
    strings=sorted(types|{t[1] for t in methods}|{shorty(t[2],t[3])for t in methods}|{'web','MainActivity.java',URL,PAUSE,BACK})
    si={s:i for i,s in enumerate(strings)};types=sorted(types,key=si.get);ti={s:i for i,s in enumerate(types)}
    protos=sorted(set((t[2],t[3])for t in methods),key=lambda p:(ti[p[0]],tuple(ti[x]for x in p[1])))
    pi={p:i for i,p in enumerate(protos)};methods.sort(key=lambda t:(ti[t[0]],si[t[1]],pi[(t[2],t[3])]))
    mi={t:i for i,t in enumerate(methods)}
    offsets={};pos=112
    for name,size,count in [('str',4,len(strings)),('type',4,len(types)),('proto',12,len(protos)),('field',8,1),('method',8,len(methods)),('class',32,1)]:offsets[name]=pos;pos+=size*count
    dataoff=(pos+3)&~3;buf=bytearray(dataoff);str_offsets=[]
    for s in strings:str_offsets.append(len(buf));buf+=leb(len(s))+s.encode()+b'\0'
    def align():
        while len(buf)%4:buf.append(0)
    lists={};list_offsets=[]
    for _,args in protos:
        if args and args not in lists:
            align();lists[args]=len(buf);list_offsets.append(len(buf));buf.extend(U(len(args))+b''.join(H(ti[a])for a in args));align()
    def invoke(op,method,regs):
        assert len(regs)<=5 and all(r<16 for r in regs)
        padded=regs+[0]*(5-len(regs));return[op|(len(regs)<<12)|(padded[4]<<8),mi[method],sum(padded[i]<<(4*i)for i in range(4))]
    codes={}
    def code(method,regs,ins,outs,words):
        align();codes[method]=len(buf);buf.extend(struct.pack('<HHHHII',regs,ins,outs,0,0,len(words)));buf.extend(b''.join(H(w)for w in words))
    code(init,1,1,1,invoke(0x70,ai,[0])+[0x000e])
    words=invoke(0x6f,ao,[4,5])+[0x0022,ti[W]]+invoke(0x70,wc,[0,4])+[0x405b,0]+invoke(0x6e,gs,[0])+[0x010c,0x1212]
    for meth in booleans[:3]:words+=invoke(0x6e,meth,[1,2])
    words+=[0x0212]
    for meth in booleans[3:]:words+=invoke(0x6e,meth,[1,2])
    words+=[0x0214,0x0b10,0xff07]+invoke(0x6e,bg,[0,2])+invoke(0x6e,gw,[4])+[0x010c,0x0213,1152]+invoke(0x6e,sf,[1,2,2])+invoke(0x6e,dv,[1])+[0x010c,0x0213,5894]+invoke(0x6e,vis,[1,2])+invoke(0x6e,content,[4,0])+[0x011a,si[URL]]+invoke(0x6e,load,[0,1])+[0x000e]
    code(on,6,2,3,words)
    code(pause,3,1,3,invoke(0x6f,ap,[2])+[0x2054,0,0x011a,si[PAUSE],0x0212]+invoke(0x6e,ev,[0,1,2])+[0x000e])
    code(back,3,1,3,[0x2054,0,0x011a,si[BACK],0x0212]+invoke(0x6e,ev,[0,1,2])+[0x000e])
    classdata=len(buf);buf+=leb(0)+leb(1)+leb(1)+leb(3)+leb(0)+leb(2) # field private
    buf+=leb(mi[init])+leb(0x10001)+leb(codes[init])
    prev=0
    for method in sorted([on,pause,back],key=mi.get):
        buf+=leb(mi[method]-prev)+leb(4 if method==pause else 1)+leb(codes[method]);prev=mi[method]
    align();mapoff=len(buf)
    entries=[(0,1,0),(1,len(strings),offsets['str']),(2,len(types),offsets['type']),(3,len(protos),offsets['proto']),(4,1,offsets['field']),(5,len(methods),offsets['method']),(6,1,offsets['class']),(0x2002,len(strings),str_offsets[0]),(0x1001,len(lists),min(list_offsets)),(0x2001,len(codes),min(codes.values())),(0x2000,1,classdata),(0x1000,1,mapoff)]
    entries.sort(key=lambda t:t[2]);buf+=U(len(entries))+b''.join(struct.pack('<HHII',t,0,n,o)for t,n,o in entries)
    for i,off in enumerate(str_offsets):buf[offsets['str']+i*4:offsets['str']+i*4+4]=U(off)
    for i,t in enumerate(types):buf[offsets['type']+i*4:offsets['type']+i*4+4]=U(si[t])
    for i,(ret,args)in enumerate(protos):buf[offsets['proto']+i*12:offsets['proto']+(i+1)*12]=struct.pack('<III',si[shorty(ret,args)],ti[ret],lists.get(args,0))
    buf[offsets['field']:offsets['field']+8]=struct.pack('<HHI',ti[C],ti[W],si['web'])
    for i,t in enumerate(methods):buf[offsets['method']+i*8:offsets['method']+(i+1)*8]=struct.pack('<HHI',ti[t[0]],pi[(t[2],t[3])],si[t[1]])
    buf[offsets['class']:offsets['class']+32]=struct.pack('<IIIIIIII',ti[C],17,ti[A],0,si['MainActivity.java'],0,classdata,0)
    buf[:8]=b'dex\n035\0';buf[32:112]=struct.pack('<20I',len(buf),112,0x12345678,0,0,mapoff,len(strings),offsets['str'],len(types),offsets['type'],len(protos),offsets['proto'],1,offsets['field'],len(methods),offsets['method'],1,offsets['class'],len(buf)-dataoff,dataoff)
    buf[12:32]=hashlib.sha1(buf[32:]).digest();buf[8:12]=U(zlib.adler32(buf[12:])&0xffffffff);return bytes(buf)


def manifest():
    resource={'versionCode':0x0101021b,'versionName':0x0101021c,'minSdkVersion':0x0101020c,'targetSdkVersion':0x01010270,'label':0x01010001,'name':0x01010003,'exported':0x01010010,'hardwareAccelerated':0x010102d3,'screenOrientation':0x0101001e,'configChanges':0x0101001f,'theme':0x01010000,'usesCleartextTraffic':0x010104ec}
    strings=list(resource)+['android','http://schemas.android.com/apk/res/android','manifest','package','com.nightshift.game','0.1.0','uses-sdk','application','Night Shift','activity','com.nightshift.game.MainActivity','intent-filter','action','android.intent.action.MAIN','category','android.intent.category.LAUNCHER']
    si={s:i for i,s in enumerate(strings)};ns=si['http://schemas.android.com/apk/res/android'];absent=0xffffffff
    raw=bytearray();offs=[]
    for s in strings:
        offs.append(len(raw));b=s.encode();assert len(b)<128;raw+=bytes([len(s),len(b)])+b+b'\0'
    while len(raw)%4:raw.append(0)
    pool=struct.pack('<HHIIIIII',1,28,28+4*len(strings)+len(raw),len(strings),0,0x100,28+4*len(strings),0)+b''.join(U(o)for o in offs)+raw
    resmap=struct.pack('<HHI',0x180,8,8+4*len(resource))+b''.join(U(v)for v in resource.values())
    def chunk(t,body):return struct.pack('<HHIII',t,16,16+len(body),1,absent)+body
    body=pool+resmap+chunk(0x100,U(si['android'])+U(ns))
    def start(name,attrs=[]):
        nonlocal body
        data=U(absent)+U(si[name])+struct.pack('<HHHHHH',20,20,len(attrs),0,0,0)
        for name,kind,value in attrs:
            namespace=absent if name=='package'else ns
            typ={'string':3,'int':16,'bool':18,'ref':1}[kind];val=si[value]if kind=='string'else value
            data+=U(namespace)+U(si[name])+U(si[value]if kind=='string'else absent)+struct.pack('<HBBI',8,0,typ,val)
        body+=chunk(0x102,data)
    def end(name):
        nonlocal body
        body+=chunk(0x103,U(absent)+U(si[name]))
    start('manifest',[('package','string','com.nightshift.game'),('versionCode','int',1),('versionName','string','0.1.0')]);start('uses-sdk',[('minSdkVersion','int',26),('targetSdkVersion','int',35)]);end('uses-sdk');start('application',[('label','string','Night Shift'),('theme','ref',0x0103000b),('hardwareAccelerated','bool',1),('usesCleartextTraffic','bool',0)]);start('activity',[('name','string','com.nightshift.game.MainActivity'),('screenOrientation','int',0),('configChanges','int',0x4a0),('exported','bool',1)]);start('intent-filter');start('action',[('name','string','android.intent.action.MAIN')]);end('action');start('category',[('name','string','android.intent.category.LAUNCHER')]);end('category');end('intent-filter');end('activity');end('application');end('manifest');body+=chunk(0x101,U(si['android'])+U(ns));return struct.pack('<HHI',3,8,8+len(body))+body

def v2_sign(apk,key,cert):
    # AOSP APK signature scheme v2: digest all ZIP sections, then insert signing block.
    eocd=apk.rfind(b'PK\x05\x06');cd=struct.unpack_from('<I',apk,eocd+16)[0]
    chunk_digests=[]
    for section in (apk[:cd],apk[cd:eocd],apk[eocd:]):
        for i in range(0,len(section),1048576):
            part=section[i:i+1048576];chunk_digests.append(hashlib.sha256(b'\xa5'+U(len(part))+part).digest())
    content_digest=hashlib.sha256(b'\x5a'+U(len(chunk_digests))+b''.join(chunk_digests)).digest()
    lp=lambda b:U(len(b))+b
    algorithm=0x0103
    signed=lp(lp(U(algorithm)+lp(content_digest)))+lp(lp(cert.public_bytes(serialization.Encoding.DER)))+lp(b'')
    sig=key.sign(signed,padding.PKCS1v15(),hashes.SHA256())
    public=key.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
    signer=lp(signed)+lp(lp(U(algorithm)+lp(sig)))+lp(public)
    value=lp(lp(signer));pair=struct.pack('<Q',4+len(value))+U(0x7109871a)+value
    size=len(pair)+24;block=struct.pack('<Q',size)+pair+struct.pack('<Q',size)+b'APK Sig Block 42'
    tail=bytearray(apk[eocd:]);struct.pack_into('<I',tail,16,cd+len(block))
    return apk[:cd]+block+apk[cd:eocd]+tail

def digest(b):return base64.b64encode(hashlib.sha256(b).digest()).decode()
def main():
    root=Path(__file__).resolve().parents[1];out=root/'dist'/'Night-Shift-Android.apk';out.parent.mkdir(exist_ok=True);assets=root/'android/app/src/main/assets'
    entries={'AndroidManifest.xml':manifest(),'classes.dex':dex()}
    entries.update({'assets/'+p.name:p.read_bytes()for p in sorted(assets.iterdir())if p.is_file()})
    mf=b'Manifest-Version: 1.0\r\nCreated-By: Night Shift development packager\r\n\r\n';sections=[]
    for name,data in entries.items():
        section=f'Name: {name}\r\nSHA-256-Digest: {digest(data)}\r\n\r\n'.encode();mf+=section;sections.append((name,section))
    sf=f'Signature-Version: 1.0\r\nCreated-By: Night Shift development packager\r\nSHA-256-Digest-Manifest: {digest(mf)}\r\nX-Android-APK-Signed: 2\r\n\r\n'.encode()
    for name,section in sections:sf+=f'Name: {name}\r\nSHA-256-Digest: {digest(section)}\r\n\r\n'.encode()
    # Development signing material remains outside the deliverable source tree.
    keypath=root.parent/'nightshift-development-key.pem';certpath=root.parent/'nightshift-development-cert.pem'
    if keypath.exists():key=serialization.load_pem_private_key(keypath.read_bytes(),None);cert=x509.load_pem_x509_certificate(certpath.read_bytes())
    else:
        key=rsa.generate_private_key(public_exponent=65537,key_size=2048);name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Night Shift Development')]);now=datetime.datetime.now(datetime.timezone.utc)
        cert=x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(days=1)).not_valid_after(now+datetime.timedelta(days=3650)).sign(key,hashes.SHA256())
        keypath.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()));keypath.chmod(0o600);certpath.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    signature=pkcs7.PKCS7SignatureBuilder().set_data(sf).add_signer(cert,key,hashes.SHA256()).sign(serialization.Encoding.DER,[pkcs7.PKCS7Options.DetachedSignature,pkcs7.PKCS7Options.Binary])
    entries.update({'META-INF/MANIFEST.MF':mf,'META-INF/CERT.SF':sf,'META-INF/CERT.RSA':signature})
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED)as z:
        for name,data in entries.items():z.writestr(name,data)
    out.write_bytes(v2_sign(out.read_bytes(),key,cert))
    print(json.dumps({'apk':str(out),'size':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'note':'development target35 v1+v2 signature; not tested on hardware'}))
if __name__=='__main__':main()
