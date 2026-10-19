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
  var api = { analyze: analyze, kst: kst, kstDay: kstDay, dist: dist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KY7 = api;
})(this);
