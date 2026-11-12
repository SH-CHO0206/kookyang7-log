"""Build the printable KOOK YANG 7 work-log PDF for one week (Mon–Sun) or one month.
Usage: python3 make_pdf.py <dir with index.html, analyze.js, data.json, basemap.json, pilot.json> <out.pdf> <week|month> <YYYY-MM-DD>
  The date picks the period (the week or month containing it) and is also the last day included, so a daily
  run passes today (week to date) and a closed week/month passes its last day (Sunday / month end).
Page 1 is the period report (daily totals, assignments numbered per month as YYYY-MM #n, special notes);
a detail page (map, log, pilot comparison, special notes) follows for every logged day in the period up to the date."""
import sys, os, asyncio, json
d, out, mode, day = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
assert mode in ('week', 'month'), 'mode must be week or month'
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
.tbl{overflow:visible}h2,h3{break-after:avoid}.sumsec,.secgrid{display:block}.sumsec>*,.secgrid>*{margin-bottom:10px}.perhead{margin-bottom:8px}table.pertbl{min-width:0}
</style>''', 1)
html = html.replace('<script src="./analyze.js"></script>', '<script>window.KY7_PRINT=' + json.dumps({'mode': mode, 'day': day, 'upto': day}) + '</script><script>' + ajs + '</script>')
html = html.replace("Promise.all([fetch('./data.json',{cache:'no-store'}).then(r=>r.json()),fetch('./basemap.json').then(r=>r.ok?r.json():null).catch(()=>null),fetch('./pilot.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)])", "Promise.resolve([" + data + "," + bm + "," + pl + "])")
html = html.replace("<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});</script>", '')
tmp = os.path.abspath(out) + '.html'
open(tmp, 'w').write(html)
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(color_scheme='light', viewport={'width': 1100, 'height': 800})
        await pg.goto('file://' + tmp)
        await pg.wait_for_selector('body[data-ready="1"]', timeout=60000)
        await pg.pdf(path=out, format='A4', landscape=True, print_background=True,
                     margin={'top': '12mm', 'bottom': '12mm', 'left': '12mm', 'right': '12mm'})
        await b.close()
asyncio.run(main())
os.remove(tmp)
print(out)
