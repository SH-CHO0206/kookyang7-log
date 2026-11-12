// 보고 요약 — 페이지·PDF와 같은 기준(도선 배정 기록)으로 센다. 작업 번호는 매달 1번부터(label "YYYY-MM #n").
// 사용법:
//   일일(19:30 마감): node report.js <W 폴더> <시작 epoch초> <끝 epoch초>
//   주간/월간:        node report.js <W 폴더> week|month <YYYY-MM-DD>   (그 날짜가 든 월~일 주 또는 달, 그 날짜까지)
//   W 에 analyze.js, data.json, pilot.json 이 있어야 한다. 결과 JSON 을 출력한다.
const path = require('path');
const [W, A, B] = process.argv.slice(2);
const K = require(path.resolve(W, 'analyze.js'));
const d = require(path.resolve(W, 'data.json'));
let pl = null; try { pl = require(path.resolve(W, 'pilot.json')); } catch (e) {}
d.points.sort((a, b) => a[0] - b[0]);
const ev = K.analyze(d.points, d.snapshots), L = K.link(ev, pl);
const day0 = s => Date.parse(s + 'T00:00:00+09:00') / 1000;
let t0, t1, per = null;
if (A === 'week' || A === 'month') { per = K.period(A, B); t0 = day0(per.from); t1 = day0(K.addDays(B, 1)); }
else { t0 = +A; t1 = +B; }
const inR = t => t >= t0 && t < t1;
const span = i => K.kst(ev[i].t0, false) + '~' + K.kst(ev[i].t1, false);
const pick = a => ({ label: a.cancel ? null : a.label, no: a.cancel ? null : a.no, date: a.date, pob: a.pob, ship: a.ship, route: a.route,
  role: a.role, status: a.status, verdict: a.verdict, ais: a.ais, ais_segments: a.evs.map(span) });
const asg = per ? L.all.filter(a => K.inPeriod(per, a.date) && a.date <= B) : L.all.filter(a => inR(a.t));
const notes = per ? L.notes.filter(n => K.inPeriod(per, n.day) && n.day <= B) : L.notes.filter(n => inR(n.t0));
const last = d.points[d.points.length - 1];
const refDay = per ? B : K.kstDay(t1 - 1);
const wk = K.period('week', refDay), mo = K.period('month', refDay);
const sumP = p => {
  const days = [...new Set(d.points.map(x => K.kstDay(x[0])))].filter(x => K.inPeriod(p, x) && x <= refDay);
  const cov = days.filter(x => L.covered[x]);
  return { period: p.title, from: p.from, to: p.to, upto: refDay,
    assignments: L.asg.filter(a => K.inPeriod(p, a.date) && a.date <= refDay).length,
    notes: L.notes.filter(n => K.inPeriod(p, n.day) && n.day <= refDay).length,
    days_logged: days.length, days_uncovered: days.filter(x => !L.covered[x]) };
};
const coveredDays = Object.keys(L.covered).sort();
const lastEv = ev[ev.length - 1];
console.log(JSON.stringify({
  mode: per ? per.mode : 'day',
  range: per ? per.title + ' (' + B + '까지)' : K.kst(t0) + ' ~ ' + K.kst(t1) + ' KST',
  assignments: asg.filter(a => !a.cancel).map(pick),
  cancelled: asg.filter(a => a.cancel).map(pick),
  notes: notes.map(n => ({ day: n.day, time: K.kst(n.t0, false) + '~' + K.kst(n.t1, false), text: n.text, context: n.context })),
  uncovered_days_in_range: per ? sumP(per).days_uncovered
    : [...new Set(ev.filter(e => inR(e.t0)).map(e => e.day))].filter(x => !L.covered[x]),
  totals: {
    covered_from: coveredDays[0] || null, covered_to: coveredDays[coveredDays.length - 1] || null,
    week: sumP(wk), month: sumP(mo)
  },
  now: { time: K.kst(last[0]) + ' KST', sog_kn: last[3], lat: last[2], lon: last[1],
    state: lastEv ? lastEv.text : null, at_home_berth: !!(L.home && K.dist(L.home.lat, L.home.lon, last[2], last[1]) < 600) }
}, null, 1));
