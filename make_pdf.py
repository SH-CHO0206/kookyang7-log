"""Build the printable KOOK YANG 7 work log PDF.
Usage: python3 make_pdf.py <dir with index.html, analyze.js, data.json, basemap.json> <out.pdf> [FROM_DATE]
Page 1 is the cumulative summary of all days; detail pages follow for days on or after FROM_DATE (YYYY-MM-DD, KST).
Without FROM_DATE every day gets a detail page."""
import sys, os, asyncio
d, out = sys.argv[1], sys.argv[2]
from_date = sys.argv[3] if len(sys.argv) > 3 else '0000-00-00'
html = open(os.path.join(d, 'index.html')).read()
data = open(os.path.join(d, 'data.json')).read()
bmp = os.path.join(d, 'basemap.json')
bm = open(bmp).read() if os.path.exists(bmp) else 'null'
plp = os.path.join(d, 'pilot.json')
pl = open(plp).read() if os.path.exists(plp) else 'null'
ajs = open(os.path.join(d, 'analyze.js')).read()
html = html.replace('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap">', '')
html = html.replace('--f-ui:"IBM Plex Sans KR",', '--f-ui:"Noto Sans CJK KR","IBM Plex Sans KR",').replace('--f-data:"JetBrains Mono",', '--f-data:"DejaVu Sans Mono",')
html = html.replace('</style>', '''@page{size:A4 landscape;margin:12mm}
body{background:#fff}.wrap{padding:0;max-width:none;gap:12px}.ctl,.cal,.scale,#play{display:none}
table{min-width:0;font-size:11.5px}td,th{padding:5px 8px}.plate svg{max-height:88mm;width:auto;margin:0 auto}
.pagebreak{break-before:page}tr{break-inside:avoid}h1{font-size:22px}
</style>''', 1)
html = html.replace('<script src="./analyze.js"></script>', '<script>' + ajs + '</script>')
html = html.replace("Promise.all([fetch('./data.json',{cache:'no-store'}).then(r=>r.json()),fetch('./basemap.json').then(r=>r.ok?r.json():null).catch(()=>null),fetch('./pilot.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)])", "Promise.resolve([" + data + "," + bm + "," + pl + "])")
html = html.replace("pick(days[days.length-1]);", """const out=document.createElement('div');out.style.display='grid';out.style.gap='12px';
  const parts=['.plate','.legend','#logsec','#pilotsec','#notesec'].map(q=>document.querySelector(q));
  days.filter(dy=>dy>='""" + from_date + """').forEach((dy,i)=>{pick(dy);const c=LK.count(dy),x=LK.noteCount(dy);
    const sec=document.createElement('section');sec.style.display='grid';sec.style.gap='10px';sec.className='pagebreak';
    const h=document.createElement('h2');h.textContent=dy+' · '+(c===null?'도선 배정 대조 전':'배정 작업 '+c+'건 · 특이 사항 '+x+'건');sec.appendChild(h);
    parts.forEach((p,j)=>{const cp=p.cloneNode(true);cp.removeAttribute('id');if(j>=3&&c===null)return;sec.appendChild(cp)});out.appendChild(sec)});
  parts.forEach(p=>p.remove());document.querySelectorAll('.wrap > .note')[0].remove();
  const ss=document.getElementById('sumsec');ss.parentNode.removeChild(ss);const hd=document.querySelector('.wrap > header');hd.after(ss);ss.after(out);""")
tmp = os.path.abspath(out) + '.html'
open(tmp, 'w').write(html)
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(color_scheme='light', viewport={'width': 1100, 'height': 800})
        await pg.goto('file://' + tmp); await pg.wait_for_timeout(500)
        await pg.pdf(path=out, format='A4', landscape=True, print_background=True,
                     margin={'top': '12mm', 'bottom': '12mm', 'left': '12mm', 'right': '12mm'})
        await b.close()
asyncio.run(main())
os.remove(tmp)
print(out)
