"""Bundle the offline browser build and source project (no signing keys)."""
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1];assets=root/'android/app/src/main/assets';html=(assets/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+(assets/'style.css').read_text()+'</style>')
for file in ['engine.js','systems.js','game.js']:
    html=html.replace(f'<script src="{file}"></script>','<script>'+(assets/file).read_text().replace('</script','<\\/script')+'</script>')
(root/'dist'/'Night-Shift.html').write_text(html)
with zipfile.ZipFile(root/'dist'/'Night-Shift-Projeto.zip','w',zipfile.ZIP_DEFLATED)as z:
    for p in sorted(root.rglob('*')):
        if not p.is_file()or 'dist' in p.relative_to(root).parts or '__pycache__'in p.parts or p.name=='world.json':continue
        z.write(p,'night-shift/'+str(p.relative_to(root)))
    z.write(root/'dist'/'Night-Shift-Preview.png','night-shift/preview.png')
print('Packaged offline HTML and project ZIP.')
