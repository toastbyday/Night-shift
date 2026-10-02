"""Independent APK parser, signature and content-integrity verification."""
from pathlib import Path
import hashlib,struct,zlib,zipfile,base64,subprocess,tempfile
from loguru import logger
logger.remove()
from androguard.core.apk import APK
from androguard.core.dex import DEX
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding
root=Path(__file__).resolve().parents[1];path=root/'dist'/'Night-Shift-Android.apk';raw=path.read_bytes();apk=APK(str(path))
assert apk.is_valid_APK() and apk.get_package()=='com.nightshift.game'
assert apk.get_main_activity()=='com.nightshift.game.MainActivity'
assert apk.get_min_sdk_version()=='26' and apk.get_target_sdk_version()=='35'
assert not apk.get_permissions(),'offline package should request no permissions'
assert apk.is_signed_v2()
classes=[]
for dex in apk.get_all_dex():
 assert hashlib.sha1(dex[32:]).digest()==dex[12:32]
 assert zlib.adler32(dex[12:])&0xffffffff==struct.unpack_from('<I',dex,8)[0]
 classes.extend(DEX(dex).get_classes())
main=next(c for c in classes if c.get_name()=='Lcom/nightshift/game/MainActivity;')
assert{m.get_name()for m in main.get_methods()}=={'<init>','onCreate','onPause','onBackPressed'}
# Parse signed data independently with Androguard; verify RSA and content digest.
apk.parse_v2_signing_block();signer=apk._v2_signing_data[0];algorithm,signature=signer.signatures[0];assert algorithm==0x103
cert=x509.load_der_x509_certificate(signer.signed_data.certificates[0]);key=serialization.load_der_public_key(signer.public_key)
assert key.public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)==cert.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
key.verify(signature,signer.signed_data._bytes,padding.PKCS1v15(),hashes.SHA256())
eocd=raw.rfind(b'PK\x05\x06');cd=struct.unpack_from('<I',raw,eocd+16)[0];assert raw[cd-16:cd]==b'APK Sig Block 42'
block_size=struct.unpack_from('<Q',raw,cd-24)[0];block_start=cd-block_size-8;tail=bytearray(raw[eocd:]);struct.pack_into('<I',tail,16,block_start)
chunks=[]
for data in [raw[:block_start],raw[cd:eocd],bytes(tail)]:
 for offset in range(0,len(data),1024*1024):
  piece=data[offset:offset+1024*1024];chunks.append(hashlib.sha256(bytes([165])+struct.pack('<I',len(piece))+piece).digest())
calculated=hashlib.sha256(bytes([90])+struct.pack('<I',len(chunks))+b''.join(chunks)).digest()
assert calculated==signer.signed_data.digests[0][1]
with zipfile.ZipFile(path)as z:
 assert z.testzip()is None
 for f in ['index.html','style.css','engine.js','systems.js','game.js']:
  assert z.read('assets/'+f)==(root/'android/app/src/main/assets'/f).read_bytes(),'APK assets must match current source'
 # Android builds with minSdk 26 can use v2 only; verify v1 if present.
 if apk.is_signed_v1():
  with tempfile.TemporaryDirectory()as t:
   a=Path(t)/'sig.der';b=Path(t)/'content.sf';a.write_bytes(z.read('META-INF/CERT.RSA'));b.write_bytes(z.read('META-INF/CERT.SF'))
   result=subprocess.run(['openssl','cms','-verify','-binary','-inform','DER','-in',str(a),'-content',str(b),'-noverify','-out','/dev/null'],capture_output=True)
   assert result.returncode==0,result.stderr
print('PASS: Android manifest, DEX parse/checksums, ZIP CRC, bundled assets, v2 RSA signature and entire APK content digest.')
print('This integrity check is separate from tests/android_smoke.py, which installs and runs the app on Android.')
