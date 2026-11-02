/* KOOK YANG 7 track analyzer — shared by the page (window.KY7) and scheduled runs (node). */
(function (root) {
  var R = 6371000;
  function dist(la1, lo1, la2, lo2) {
    var p = Math.PI / 180, x = (lo2 - lo1) * p * Math.cos((la1 + la2) / 2 * p), y = (la2 - la1) * p;
    return Math.sqrt(x * x + y * y) * R;
  }
  function kst(t, withDate) {
    var d = new Date((t + 9 * 3600) * 1000), p = function (n) { return String(n).padStart(2, '0'); };
    var hm = p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
    return withDate === false ? hm : p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + hm;
  }
  function kstDay(t) { var d = new Date((t + 9 * 3600) * 1000); return d.toISOString().slice(0, 10); }

  // points: [[ts, lon, lat, sogKnots, cog], ...]; snapshots: [{ts, ships:[[name,type,len,lat,lon],...]}]
  function analyze(points, snapshots) {
    var P = points.slice().sort(function (a, b) { return a[0] - b[0]; });
    var groups = [], cur = null;
    P.forEach(function (p) {
      var slow = p[3] < 3;
      var last = cur && cur.pts[cur.pts.length - 1];
      if (cur && cur.slow === slow && (p[0] - last[0] < 1800 || dist(last[2], last[1], p[2], p[1]) < 150)) cur.pts.push(p);
      else { cur = { slow: slow, pts: [p] }; groups.push(cur); }
    });
    // fold very short fast blips (1 point, < 3 min) between slow groups
    for (var i = 1; i < groups.length - 1; i++) {
      var g = groups[i];
      if (!g.slow && g.pts.length === 1 && groups[i - 1].slow && groups[i + 1].slow &&
          groups[i + 1].pts[0][0] - groups[i - 1].pts[groups[i - 1].pts.length - 1][0] < 240) {
        groups[i - 1].pts = groups[i - 1].pts.concat(g.pts, groups[i + 1].pts);
        groups.splice(i, 2); i--;
      }
    }
    var moored = [];
    var ev = groups.map(function (g) {
      var a = g.pts[0], b = g.pts[g.pts.length - 1];
      var la = 0, lo = 0, smax = 0, ssum = 0;
      g.pts.forEach(function (p) { la += p[2]; lo += p[1]; smax = Math.max(smax, p[3]); ssum += p[3]; });
      la /= g.pts.length; lo /= g.pts.length;
      var span = 0; g.pts.forEach(function (p) { span = Math.max(span, dist(la, lo, p[2], p[1])); });
      var e = { t0: a[0], t1: b[0], dur: (b[0] - a[0]) / 60, lat: la, lon: lo, span: span,
                vmax: smax, vavg: ssum / g.pts.length, slow: g.slow };
      if (g.slow && e.dur >= 60) { e.kind = 'moored'; moored.push(e); }
      else if (g.slow) e.kind = 'slow';
      else e.kind = 'move';
      return e;
    });
    ev.forEach(function (e) {
      if (e.kind !== 'slow') return;
      if (e.dur < 3) { e.kind = 'move'; return; }
      var nearBerth = moored.some(function (m) { return dist(m.lat, m.lon, e.lat, e.lon) < 300; });
      if (nearBerth && e.span < 200) { e.kind = 'shift'; return; }
      e.kind = 'work';
      // nearest snapshot in time
      var snap = null, best = Infinity;
      (snapshots || []).forEach(function (s) { var d = Math.abs(s.ts - e.t1); if (d < best) { best = d; snap = s; } });
      e.snapTs = snap ? snap.ts : null;
      e.near = snap ? snap.ships.map(function (s) {
        return { name: s[0], type: s[1], len: s[2], lat: s[3], lon: s[4], d: Math.round(dist(e.lat, e.lon, s[3], s[4])) };
      }).filter(function (s) { return s.d <= 500; }).sort(function (x, y) { return x.d - y.d; }).slice(0, 3) : [];
      // course steadiness for escort pattern
      var pts = P.filter(function (p) { return p[0] >= e.t0 && p[0] <= e.t1 && p[3] >= 1.5; });
      var steady = false;
      if (pts.length >= 4) {
        var sx = 0, sy = 0; pts.forEach(function (p) { sx += Math.cos(p[4] * Math.PI / 180); sy += Math.sin(p[4] * Math.PI / 180); });
        steady = Math.sqrt(sx * sx + sy * sy) / pts.length > 0.95;
      }
      e.steady = steady;
      var close = e.near.length && e.near[0].d <= 250;
      e.level = (close && e.dur >= 8) || steady ? 'high' : 'mid';
      var desc = steady ? '일정 침로 ' + e.vavg.toFixed(1) + ' kn 저속 항해 (동행·예인 패턴)'
               : e.vmax < 0.8 ? Math.round(e.dur) + '분 정지'
               : '저속 기동 (최대 ' + e.vmax.toFixed(1) + ' kn), ' + Math.round(e.dur) + '분';
      e.text = desc;
    });
    // describe moves & moored
    ev.forEach(function (e, i) {
      if (e.kind === 'move') {
        var prev = ev[i - 1], next = ev[i + 1];
        var berth = function (x) { return x && (x.kind === 'moored' || x.kind === 'shift'); };
        var from = berth(prev), to = berth(next);
        e.text = (from && to && e.dur < 10 ? '계류 위치 이동, ' : from ? '출항, ' : to ? '복귀, ' : '이동, ') + e.vmax.toFixed(1) + ' kn까지';
      } else if (e.kind === 'moored') e.text = '계류·대기 ' + (e.dur >= 120 ? (e.dur / 60).toFixed(1) + '시간' : Math.round(e.dur) + '분');
      else if (e.kind === 'shift') e.text = '계류지 안 위치 조정';
    });
    var n = 0; ev.forEach(function (e) { e.day = kstDay(e.t0); e.s = kst(e.t0); e.e = kst(e.t1, false); if (e.kind === 'work') e.no = ++n; });
    return ev;
  }
  // Tie AIS events to pilot assignments (pilot.json). Counts and the orange cumulative numbers come only from
  // assignments; AIS movement on compared days that no assignment explains is flagged red as a special note.
  //  - assignment ranges = the "HH:MM~HH:MM" spans written in each non-cancelled assignment's AIS text
  //  - an outing (sortie) runs from leaving the home berth to returning; legs and waits inside an outing that
  //    served an assignment stay normal; work-like segments no assignment covers are red; an outing with no
  //    assignment at all is red end to end (unless it is only a short berth shift under 500 m)
  function link(ev, pl) {
    var cl = [];
    ev.forEach(function (e) {
      if (e.kind !== 'moored') return;
      var c = cl.filter(function (c) { return dist(c.lat, c.lon, e.lat, e.lon) < 400; })[0];
      if (!c) { c = { lat: e.lat, lon: e.lon, h: 0 }; cl.push(c); }
      c.h += e.dur;
    });
    cl.sort(function (a, b) { return b.h - a.h; });
    var home = cl[0] || null;
    var atHome = function (e) { return home && (e.kind === 'moored' || e.kind === 'shift') && dist(home.lat, home.lon, e.lat, e.lon) < 600; };
    var covered = {}; ((pl && pl.covered) || []).forEach(function (d) { covered[d] = 1; });
    var day0 = function (d) { return Date.parse(d + 'T00:00:00+09:00') / 1000; };
    var hm = function (s) { var m = /(\d{1,2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 3600 + (+m[2]) * 60 : 0; };
    var all = ((pl && pl.assignments) || []).map(function (a) {
      var o = {}; for (var k in a) o[k] = a[k]; o.t = day0(a.date) + hm(a.pob); o.cancel = /취소/.test(a.status || ''); o.ranges = []; o.evs = []; return o;
    }).sort(function (x, y) { return x.t - y.t; });
    var asg = all.filter(function (a) { return !a.cancel; });
    asg.forEach(function (a, i) {
      a.no = i + 1;
      if (/^(불일치|판정)/.test(a.verdict || '')) return;
      var re = /(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/g, m, b = day0(a.date);
      while ((m = re.exec(a.ais || ''))) {
        var r0 = b + (+m[1]) * 3600 + (+m[2]) * 60, r1 = b + (+m[3]) * 3600 + (+m[4]) * 60;
        if (r1 < r0) r1 += 86400;
        if (r1 - r0 > 12 * 3600 || Math.abs(r0 - a.t) > 8 * 3600) continue;
        a.ranges.push([r0, r1 + 59]);
      }
    });
    var info = ev.map(function () { return { asg: null, red: false }; });
    ev.forEach(function (e, i) {
      var cand = e.kind === 'work' || ((e.kind === 'moored' || e.kind === 'shift') && !atHome(e));
      if (!cand) return;
      var best = null, bo = 0;
      asg.forEach(function (a) {
        a.ranges.forEach(function (r) {
          var o = Math.min(e.t1, r[1]) - Math.max(e.t0, r[0]);
          if (o >= Math.min(60, Math.max(1, (e.t1 - e.t0) * 0.5)) && o > bo) { bo = o; best = a; }
        });
      });
      if (best) { info[i].asg = best.no; best.evs.push(i); }
    });
    // outings
    var sorties = [], cur = null;
    ev.forEach(function (e, i) {
      if (atHome(e)) { cur = null; return; }
      if (!cur) { cur = { idx: [] }; sorties.push(cur); }
      cur.idx.push(i); info[i].sortie = sorties.length - 1;
    });
    var notes = [];
    sorties.forEach(function (s) {
      var es = s.idx.map(function (i) { return ev[i]; });
      if (!es.some(function (e) { return covered[e.day]; })) return;
      var hasAsg = s.idx.some(function (i) { return info[i].asg; });
      var hasWork = es.some(function (e) { return e.kind === 'work'; });
      var far = home ? Math.max.apply(null, es.map(function (e) { return dist(home.lat, home.lon, e.lat, e.lon) + e.span; })) : 0;
      var red = [];
      if (!hasAsg && (hasWork || far > 500)) red = s.idx.slice();
      else s.idx.forEach(function (i) { if (ev[i].kind === 'work' && !info[i].asg) red.push(i); });
      if (!red.length) return;
      red.forEach(function (i) { info[i].red = true; });
      var re = red.map(function (i) { return ev[i]; }), t0 = re[0].t0, t1 = re[re.length - 1].t1;
      var parts = re.filter(function (e) { return e.kind === 'work'; }).map(function (e) { return kst(e.t0, false) + '~' + kst(e.t1, false) + ' ' + e.text; });
      var text = hasAsg ? parts.join(', ') : kst(es[0].t0, false) + ' 출항 ~ ' + kst(es[es.length - 1].t1, false) + ' 복귀' + (parts.length ? ' · ' + parts.join(', ') : ' · 이동만');
      var ctx;
      if (hasAsg) {
        var ns = []; s.idx.forEach(function (i) { var n = info[i].asg; if (n && ns.indexOf(n) < 0) ns.push(n); });
        ctx = '배정 작업 ' + ns.map(function (n) { return '#' + n + ' ' + asg[n - 1].ship; }).join(', ') + ' 출동 중 배정 외 기동';
      } else {
        var cx = all.filter(function (a) { return a.cancel && a.t >= t0 - 7200 && a.t <= t1 + 7200; });
        ctx = cx.length ? '배정 없는 출동 — 취소된 배정 ' + cx.map(function (a) { return a.ship + ' (POB ' + a.pob + ')'; }).join(', ') + ' 시간대' : '배정 없는 출동';
      }
      notes.push({ day: kstDay(t0), t0: t0, t1: t1, text: text, context: ctx, idx: red, lat: re[0].lat, lon: re[0].lon,
        whole: !hasAsg });
    });
    return { home: home, covered: covered, all: all, asg: asg, info: info, notes: notes,
      count: function (d) { return covered[d] ? asg.filter(function (a) { return a.date === d; }).length : null; },
      noteCount: function (d) { return covered[d] ? notes.filter(function (n) { return n.day === d; }).length : null; } };
  }
  var api = { analyze: analyze, link: link, kst: kst, kstDay: kstDay, dist: dist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KY7 = api;
})(this);
