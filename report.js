// 매일 보고용 요약 — 페이지·PDF와 같은 기준(도선 배정 기록)으로 센다.
// 사용법: node report.js <W 폴더> <시작 epoch초> <끝 epoch초>
//   W 에 analyze.js, data.json, pilot.json 이 있어야 한다. 결과 JSON 을 출력한다.
const path = require('path');
const [W, A, B] = process.argv.slice(2);
const K = require(path.resolve(W, 'analyze.js'));
const d = require(path.resolve(W, 'data.json'));
let pl = null; try { pl = require(path.resolve(W, 'pilot.json')); } catch (e) {}
d.points.sort((a, b) => a[0] - b[0]);
const ev = K.analyze(d.points, d.snapshots), L = K.link(ev, pl);
const t0 = +A, t1 = +B, inR = t => t >= t0 && t < t1;
const span = i => K.kst(ev[i].t0, false) + '~' + K.kst(ev[i].t1, false);
const pick = a => ({ no: a.no || null, date: a.date, pob: a.pob, ship: a.ship, route: a.route, role: a.role, status: a.status,
  verdict: a.verdict, ais: a.ais, ais_segments: a.evs.map(span) });
const asg = L.all.filter(a => inR(a.t));
const last = d.points[d.points.length - 1];
const month = K.kstDay(t1 - 1).slice(0, 7);
const coveredDays = Object.keys(L.covered).sort();
const days = [...new Set(d.points.map(p => K.kstDay(p[0])))];
const lastEv = ev[ev.length - 1];
console.log(JSON.stringify({
  range: K.kst(t0) + ' ~ ' + K.kst(t1) + ' KST',
  assignments: asg.filter(a => !a.cancel).map(pick),
  cancelled: asg.filter(a => a.cancel).map(pick),
  notes: L.notes.filter(n => inR(n.t0)).map(n => ({ day: n.day, time: K.kst(n.t0, false) + '~' + K.kst(n.t1, false), text: n.text, context: n.context })),
  uncovered_days_in_range: [...new Set(ev.filter(e => inR(e.t0)).map(e => e.day))].filter(x => !L.covered[x]),
  totals: {
    days_logged: days.length,
    covered_from: coveredDays[0] || null, covered_to: coveredDays[coveredDays.length - 1] || null,
    assignments_total: L.asg.length,
    assignments_this_month: L.asg.filter(a => a.date.startsWith(month)).length,
    notes_total: L.notes.length,
    notes_this_month: L.notes.filter(n => n.day.startsWith(month)).length
  },
  now: { time: K.kst(last[0]) + ' KST', sog_kn: last[3], lat: last[2], lon: last[1],
    state: lastEv ? lastEv.text : null, at_home_berth: !!(L.home && K.dist(L.home.lat, L.home.lon, last[2], last[1]) < 600) }
}, null, 1));
