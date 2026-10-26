# 도선 배정 대조 자동 갱신
# 사용법: python3 pilot_update.py <W 폴더> <대시보드.xlsx>
#   W 에 data.json, analyze.js 가 있어야 하고, pilot.json 이 있으면 이어서 누적한다.
#   시트의 "N월D일_예선작업_상세일지" 탭 중 아직 대조하지 않은 날(covered 에 없는 날)만 처리하고,
#   이미 사람이 확인한 날의 판정은 건드리지 않는다. 결과를 W/pilot.json 에 쓰고 새로 대조한 내용을 출력한다.
import sys, os, re, json, subprocess, datetime as dt
import openpyxl

TUG = '국양7호'
KST = dt.timezone(dt.timedelta(hours=9))
W, XLSX = sys.argv[1], sys.argv[2]

ev = json.loads(subprocess.check_output(['node', '-e', '''
const K=require(process.argv[1]),d=require(process.argv[2]);d.points.sort((a,b)=>a[0]-b[0]);
console.log(JSON.stringify({ev:K.analyze(d.points,d.snapshots),pts:d.points.map(p=>p[0])}))''',
    os.path.abspath(os.path.join(W, 'analyze.js')), os.path.abspath(os.path.join(W, 'data.json'))]))
EV, PTS = ev['ev'], ev['pts']
LAST = PTS[-1] if PTS else 0

pp = os.path.join(W, 'pilot.json')
PL = json.load(open(pp)) if os.path.exists(pp) else {
    'source': '대산항 예인선 MMSI 및 일일 작업 현황 대시보드 (원출처: 대산항도선사회 도선예보현황)',
    'basis': '19:30 마감 (전일 19:30 ~ 당일 19:30)', 'covered': [], 'assignments': [], 'extras': []}

hm = lambda t: dt.datetime.fromtimestamp(t, KST).strftime('%H:%M')

def to_date(v, year):
    if isinstance(v, dt.datetime): return v.date()
    if isinstance(v, dt.date): return v
    m = re.search(r'(\d{4})[-./](\d{1,2})[-./](\d{1,2})', str(v or ''))
    if m: return dt.date(int(m[1]), int(m[2]), int(m[3]))
    m = re.search(r'(\d{1,2})[/.월]\s*(\d{1,2})', str(v or ''))
    return dt.date(year, int(m[1]), int(m[2])) if m else None

def to_time(v):
    if isinstance(v, dt.datetime): return v.time()
    if isinstance(v, dt.time): return v
    m = re.search(r'(\d{1,2}):(\d{2})', str(v or ''))
    return dt.time(int(m[1]), int(m[2])) if m else None

def overlap(a0, a1):
    return [e for e in EV if e['t1'] >= a0 and e['t0'] <= a1]

def _unused(es):
    out = []
    for e in es:
        if e['kind'] == 'work': out.append(f"{hm(e['t0'])}~{hm(e['t1'])} 저속 기동")
        elif e['kind'] == 'move' and ('출항' in e['text'] or '복귀' in e['text']):
            out.append(f"{hm(e['t0'])} {'출항' if '출항' in e['text'] else '복귀'}")
        elif e['kind'] == 'moored': out.append(f"{hm(e['t0'])}~{hm(e['t1'])} 계류지 정박")
    return ', '.join(out) or '해당 시간 기동 기록 없음'

wb = openpyxl.load_workbook(XLSX, data_only=True)
year = dt.datetime.now(KST).year
new_rows, new_extras, done = [], [], []
for ws in wb:
    m = re.match(r'(\d{1,2})월\s*(\d{1,2})일_예선작업', ws.title)
    if not m: continue
    cyc = dt.date(year, int(m[1]), int(m[2]))
    if cyc.isoformat() in PL['covered']: continue
    c_end = dt.datetime.combine(cyc, dt.time(19, 30), KST).timestamp()
    c_beg = c_end - 86400
    if LAST < c_end - 1800:   # AIS 가 그날 마감 시각까지 아직 안 쌓였으면 다음에 처리
        print(f'{cyc} 보류: AIS 수집이 {hm(LAST)}까지라 19:30 마감 전'); continue
    rows = list(ws.iter_rows(values_only=True))
    hi = next((i for i, r in enumerate(rows) if r and '본선명' in [str(c).strip() if c else '' for c in r]), None)
    if hi is None: continue
    H = [str(c).strip() if c else '' for c in rows[hi]]
    col = lambda *names: next((H.index(n) for n in names if n in H), None)
    cD, cS, cP, cN = col('일자'), col('진행상태'), col('POB 시각'), col('본선명')
    cF, cT = col('출발지(FROM)'), col('도착지(TO)')
    cTug = [col('배정 예인선 1'), col('배정 예인선 2'), col('배정 예인선 3')]
    mine = []
    for r in rows[hi + 1:]:
        if not r or cN is None or not r[cN]: continue
        tugs = [str(r[c] or '').replace(' ', '') if c is not None else '' for c in cTug]
        if TUG not in tugs: continue
        d, t = to_date(r[cD], year) if cD is not None else cyc, to_time(r[cP])
        if not d or not t: continue
        mine.append((dt.datetime.combine(d, t, KST).timestamp(), d, t, r, tugs))
    # 이 주기의 국양7호 저속 기동(작업 후보)을 가장 가까운 '취소 아닌' 배정에 붙인다 (POB -90분 ~ +120분)
    work = [e for e in EV if e['kind'] == 'work' and c_beg - 3 * 3600 <= e['t0'] < c_end + 3 * 3600]
    live = [m for m in mine if '취소' not in str(m[3][cS] or '')]
    own = {id(m): [] for m in mine}
    left = []
    for e in work:
        cands = [m for m in live if m[0] - 90 * 60 <= e['t0'] <= m[0] + 120 * 60]
        if cands: own[id(min(cands, key=lambda m: abs(e['t0'] - m[0])))].append(e)
        elif c_beg <= e['t0'] < c_end: left.append(e)
    for pob, d, t, r, tugs in mine:
        status = str(r[cS] or '').strip()
        a0, a1 = pob - 90 * 60, pob + 120 * 60
        es, cancel = own[id(next(m for m in mine if m[3] is r))], '취소' in status
        if cancel:
            stray = [e for e in work if a0 <= e['t0'] <= a1]
            loose = [e for e in stray if e in left]
            es = stray
            verdict = ('확인 필요 (취소인데 출동)' if loose else
                       '일치 (취소 부합, 같은 시간 다른 배정 수행)' if stray else '일치 (취소 부합)')
        elif pob > LAST: verdict = '판정 보류 (AIS 수집 전)'
        elif not any(a0 <= p <= a1 for p in PTS): verdict = '판정 불가 (AIS 공백)'
        elif es: verdict = '일치'
        elif any(e['kind'] == 'move' and '출항' in e['text'] for e in overlap(a0, pob + 1800)): verdict = '확인 필요 (출항 후 현장 정지, 저속 기동 없음)'
        elif any(e['kind'] == 'move' for e in overlap(a0, a1)): verdict = '확인 필요 (이동만 확인)'
        else: verdict = '불일치'
        if es:
            b0, b1 = es[0]['t0'] - 3600, es[-1]['t1'] + 1800
            txt = [f"{hm(e['t0'])} {'출항' if '출항' in e['text'] else '복귀'}" for e in overlap(b0, b1)
                   if e['kind'] == 'move' and ('출항' in e['text'] or '복귀' in e['text']) and b0 <= e['t0'] <= b1]
            txt += [f"{hm(e['t0'])}~{hm(e['t1'])} 저속 기동" for e in es]
            ais = ', '.join(sorted(txt))
        elif verdict.startswith('확인 필요'):
            ais = ' / '.join(f"{hm(max(e['t0'],a0))}~{hm(min(e['t1'],a1))} {'정지' if e['kind']=='moored' else e['text']}" for e in overlap(a0, a1))
        else:
            n = sum(1 for p in PTS if a0 <= p <= a1)
            ais = f"POB 전후 계류지 정박 (위치 {n}회 수신)" if n else 'POB 전후 AIS 수신 없음'
        new_rows.append({'date': d.isoformat(), 'pob': t.strftime('%H:%M'), 'ship': str(r[cN]).strip(),
            'route': f"{r[cF] or ''}→{r[cT] or ''}", 'role': tugs.index(TUG) + 1, 'status': status,
            'ais': ais, 'verdict': verdict, 'auto': True})
    for e in left:
        new_extras.append({'date': e['day'], 'time': f"{hm(e['t0'])}~{hm(e['t1'])}", 'ais': e['text'],
            'context': '국양7호 배정 시각 범위 밖'})
    done.append(cyc.isoformat())

key = lambda a: (a['date'], a['pob'], a['ship'])
have = {key(a) for a in PL['assignments']}
PL['assignments'] += [a for a in new_rows if key(a) not in have]
PL['assignments'].sort(key=key, reverse=True)
PL['extras'] += new_extras
PL['extras'].sort(key=lambda x: (x['date'], x['time']), reverse=True)
PL['covered'] = sorted(set(PL['covered']) | set(done))
if done: PL['checked'] = dt.datetime.now(KST).strftime('%Y-%m-%d')
json.dump(PL, open(pp, 'w'), ensure_ascii=False, indent=1)
print(json.dumps({'new_days': done, 'assignments': new_rows, 'extras': new_extras}, ensure_ascii=False, indent=1))
