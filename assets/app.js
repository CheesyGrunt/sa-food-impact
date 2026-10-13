(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return n == null ? '-' : Math.round(n).toLocaleString('en-US'); };
  var money = function (n) { return n == null ? '-' : '$' + Math.round(n).toLocaleString('en-US'); };
  var pct = function (a, b) { return b ? Math.round(a / b * 100) + '%' : '0%'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var PROG = { mvfd: 'MVFD', pantry: 'Pantry' };
  var S;

  function niceDate(iso) { if (!iso) return '-'; var p = iso.split('-'); return +p[1] + '/' + +p[2] + '/' + p[0]; }

  fetch('data/summary.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (s) { S = s; render(); })
    .catch(function () { $('kpis').innerHTML = '<div class="card empty" style="grid-column:1/-1">No data yet. Head to <a href="kitchens.html">the Kitchens</a> to load this year\'s reports.</div>'; });

  function render() {
    var T = S.totals;
    $('yr').textContent = S.year;
    $('updated').textContent = new Date(S.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

    // KPIs
    var k = [
      ['Unique clients', fmt(T.uniqueClients), fmt(T.mvfdClients) + ' MVFD &middot; ' + fmt(T.pantryClients) + ' pantry', 'feature'],
      ['Attended both', fmt(T.bothClients), pct(T.bothClients, T.uniqueClients) + ' of all clients', 'feature'],
      ['Total visits', fmt(T.totalVisits), fmt(T.mvfdVisits) + ' MVFD &middot; ' + fmt(T.pantryVisits) + ' pantry'],
      ['Service sessions', fmt(T.mvfdSessions + T.pantrySessions), fmt(T.mvfdSessions) + ' MVFD &middot; ' + fmt(T.pantrySessions) + ' pantry'],
      ['Pounds of food', fmt(T.pounds), fmt(T.mvfdPounds) + ' MVFD &middot; ' + fmt(T.pantryPounds) + ' pantry', 'feature'],
      ['Value of food', money(T.value), money(T.mvfdValue) + ' MVFD &middot; ' + money(T.pantryValue) + ' pantry', 'feature'],
      T.inKind == null
        ? ['Value of in-kind', 'Awaiting report', 'Add the in-kind report in the Kitchens', 'pending']
        : ['Value of in-kind', money(T.inKind), esc(T.inKindSource || '')],
      ['Sessions pending', fmt(T.pendingSessions), 'attendance in, pounds/value not yet reported']
    ];
    $('kpis').innerHTML = k.map(function (x) {
      return '<div class="card kpi ' + (x[3] || '') + '"><div class="label">' + x[0] + '</div><div class="value">' + x[1] + '</div><div class="note">' + x[2] + '</div></div>';
    }).join('');

    // overlap
    var o = S.overlap, tot = o.both + o.mvfdOnly + o.pantryOnly;
    var parts = [['MVFD only', o.mvfdOnly, 'var(--mvfd)'], ['Both', o.both, 'var(--both)'], ['Pantry only', o.pantryOnly, 'var(--pantry)']];
    $('overlapBar').innerHTML = parts.map(function (p) { return '<div style="flex:' + p[1] + ';background:' + p[2] + '" title="' + p[0] + ': ' + fmt(p[1]) + '">' + (p[1] / tot > .09 ? fmt(p[1]) : '') + '</div>'; }).join('');
    $('overlapLegend').innerHTML = parts.map(function (p) { return '<span><i style="background:' + p[2] + '"></i>' + p[0] + ' <b class="mono">' + fmt(p[1]) + '</b> (' + pct(p[1], tot) + ')</span>'; }).join('');

    // frequency + status
    $('freq').innerHTML = hbars(S.frequency.map(function (f) { return [f.bucket, f.count]; }), true);
    $('status').innerHTML = hbars(S.status.map(function (f) { return [f.status, f.count]; }));

    monthChart();
    siteTable();
    sessions();
    households();
    community();
    notes();
  }

  function hbars(rows, gold) {
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
    var sum = rows.reduce(function (a, r) { return a + r[1]; }, 0);
    return rows.map(function (r) {
      return '<div class="hbar"><span>' + esc(r[0]) + '</span><div class="track"><div class="fill' + (gold ? ' gold' : '') + '" style="width:' + (r[1] / max * 100) + '%"></div></div><span class="n">' + fmt(r[1]) + ' <span style="color:var(--gray)">' + pct(r[1], sum) + '</span></span></div>';
    }).join('');
  }

  // ---- month chart (grouped bars, SVG) ----
  function monthChart() {
    var M = S.months; if (!M.length) { $('monthChart').innerHTML = '<p class="empty">No sessions yet.</p>'; return; }
    var W = 1000, H = 300, pl = 48, pr = 10, pt = 14, pb = 28;
    var max = Math.max.apply(null, M.map(function (m) { return Math.max(m.mvfdVisits, m.pantryVisits); }));
    var step = Math.pow(10, Math.floor(Math.log10(max))); var top = Math.ceil(max / step) * step; if (top / step < 4) { step /= 2; top = Math.ceil(max / step) * step; }
    var y = function (v) { return pt + (H - pt - pb) * (1 - v / top); };
    var bw = (W - pl - pr) / M.length;
    var g = '';
    for (var v = 0; v <= top; v += step) g += '<line class="grid-line" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (pl - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmt(v) + '</text>';
    M.forEach(function (m, i) {
      var x0 = pl + i * bw, w = Math.min(28, bw * .32), gap = 3, cx = x0 + bw / 2;
      var tip = esc(m.month + ' ' + S.year) + '|MVFD: ' + fmt(m.mvfdVisits) + ' visits, ' + fmt(m.mvfdPounds) + ' lbs, ' + money(m.mvfdValue) + '|Pantry: ' + fmt(m.pantryVisits) + ' visits, ' + fmt(m.pantryPounds) + ' lbs, ' + money(m.pantryValue);
      g += '<g data-tip="' + tip + '"><rect x="' + x0 + '" y="' + pt + '" width="' + bw + '" height="' + (H - pt - pb) + '" fill="transparent"/>';
      g += '<rect x="' + (cx - w - gap / 2) + '" y="' + y(m.mvfdVisits) + '" width="' + w + '" height="' + (y(0) - y(m.mvfdVisits)) + '" rx="3" fill="var(--mvfd)"/>';
      g += '<rect x="' + (cx + gap / 2) + '" y="' + y(m.pantryVisits) + '" width="' + w + '" height="' + (y(0) - y(m.pantryVisits)) + '" rx="3" fill="var(--pantry)"/></g>';
      g += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + m.month + '</text>';
    });
    $('monthChart').innerHTML = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Visits by month">' + g + '</svg>';
    wireTips($('monthChart'));
  }
  function wireTips(el) {
    var tip = $('tip');
    el.querySelectorAll('[data-tip]').forEach(function (n) {
      function show(e) { var p = e.touches ? e.touches[0] : e; tip.innerHTML = n.getAttribute('data-tip').split('|').map(function (l, i) { return i ? l : '<b>' + l + '</b>'; }).join('<br>'); tip.style.opacity = 1; tip.style.left = Math.min(p.clientX + 14, innerWidth - 270) + 'px'; tip.style.top = (p.clientY + 14) + 'px'; }
      n.addEventListener('mousemove', show); n.addEventListener('touchstart', show, { passive: true });
      n.addEventListener('mouseleave', function () { tip.style.opacity = 0; });
    });
  }

  function siteTable() {
    var R = S.sites, t = { ms: 0, ps: 0, mv: 0, pv: 0, c: 0, lb: 0, v: 0 };
    var body = R.map(function (r) {
      t.ms += r.mvfdSessions; t.ps += r.pantrySessions; t.mv += r.mvfdVisits; t.pv += r.pantryVisits; t.lb += r.pounds; t.v += r.value;
      return '<tr><td>' + esc(r.site) + '</td><td class="num mono">' + fmt(r.mvfdSessions) + '</td><td class="num mono">' + fmt(r.pantrySessions) + '</td><td class="num mono">' + fmt(r.mvfdVisits) + '</td><td class="num mono">' + fmt(r.pantryVisits) + '</td><td class="num mono">' + fmt(r.clients) + '</td><td class="num mono">' + fmt(r.pounds) + '</td><td class="num mono">' + money(r.value) + '</td></tr>';
    }).join('');
    $('siteTable').innerHTML = '<thead><tr><th>Site</th><th class="num">MVFD sessions</th><th class="num">Pantry sessions</th><th class="num">MVFD visits</th><th class="num">Pantry visits</th><th class="num">Unique clients</th><th class="num">Pounds</th><th class="num">Food value</th></tr></thead><tbody>' + body +
      '</tbody><tfoot><tr><td>All sites</td><td class="num mono">' + fmt(t.ms) + '</td><td class="num mono">' + fmt(t.ps) + '</td><td class="num mono">' + fmt(t.mv) + '</td><td class="num mono">' + fmt(t.pv) + '</td><td class="num mono">' + fmt(S.totals.uniqueClients) + '</td><td class="num mono">' + fmt(t.lb) + '</td><td class="num mono">' + money(t.v) + '</td></tr></tfoot>';
  }

  // ---- sessions ----
  var sf = { prog: 'all', site: '', status: '' };
  function sessions() {
    var sites = S.sites.map(function (s) { return s.site; }).sort();
    $('sessSite').innerHTML = '<option value="">All sites</option>' + sites.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    seg('sessProg', function (v) { sf.prog = v; drawSessions(); });
    $('sessSite').onchange = function () { sf.site = this.value; drawSessions(); };
    $('sessStatus').onchange = function () { sf.status = this.value; drawSessions(); };
    drawSessions();
  }
  function drawSessions() {
    var rows = S.sessions.filter(function (s) { return (sf.prog === 'all' || s.program === sf.prog) && (!sf.site || s.site === sf.site) && (!sf.status || s.status === sf.status); });
    var t = { a: 0, lb: 0, v: 0 };
    var body = rows.map(function (s) {
      t.a += s.attendees; t.lb += s.pounds || 0; t.v += s.value || 0;
      var tag = s.status === 'pending' ? '<span class="pill pending">pending</span>' : s.status === 'zero' ? '<span class="pill zero">$0 / 0 lbs</span>' : '';
      return '<tr><td class="mono">' + niceDate(s.date) + '</td><td><span class="pill ' + s.program + '">' + PROG[s.program] + '</span></td><td>' + esc(s.site) + '</td><td class="num mono">' + fmt(s.attendees) + '</td><td class="num mono">' + (s.pounds == null ? '' : fmt(s.pounds)) + '</td><td class="num mono">' + (s.value == null ? '' : money(s.value)) + '</td><td>' + tag + '</td></tr>';
    }).join('');
    $('sessTable').innerHTML = '<thead><tr><th>Date</th><th>Program</th><th>Site</th><th class="num">Attended</th><th class="num">Pounds</th><th class="num">Food value</th><th></th></tr></thead><tbody>' + (body || '<tr><td colspan="7" class="empty">Nothing matches.</td></tr>') +
      '</tbody><tfoot><tr><td colspan="3">' + fmt(rows.length) + ' sessions</td><td class="num mono">' + fmt(t.a) + '</td><td class="num mono">' + fmt(t.lb) + '</td><td class="num mono">' + money(t.v) + '</td><td></td></tr></tfoot>';
  }
  function seg(id, cb) {
    var el = $(id);
    el.querySelectorAll('button').forEach(function (b) { b.onclick = function () { el.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); cb(b.dataset.v); }; });
  }

  function households() {
    var D = S.demographics;
    if (!D) { $('hh').innerHTML = '<p class="empty">Load the MVFD Stats report to see households.</p>'; $('eth').innerHTML = $('race').innerHTML = '<p class="empty">No data.</p>'; return; }
    var counted = D.households - D.flagged;
    $('hhLede').innerHTML = 'From the MVFD Stats report, one household per client (latest record). <b class="mono">' + fmt(D.households) + '</b> households; people totals use the <b class="mono">' + fmt(counted) + '</b> with a clean household count.';
    $('hh').innerHTML =
      '<div class="grid g2" style="margin-bottom:14px"><div><div class="kicker">People in those homes</div><div class="mono" style="font-size:28px;font-weight:600">' + fmt(D.individuals) + '</div></div>' +
      '<div><div class="kicker">Avg household</div><div class="mono" style="font-size:28px;font-weight:600">' + (counted ? (D.individuals / counted).toFixed(1) : '-') + '</div></div></div>' +
      hbars([['Children 0-17', D.age0_17], ['Adults 18-59', D.age18_59], ['Seniors 60+', D.age60]], true) +
      '<div style="height:10px"></div>' +
      hbars([['Female', D.female], ['Male', D.male]]) +
      '<div style="height:10px"></div>' +
      hbars([['Veterans', D.veterans], ['Retired military', D.retired], ['Active duty', D.active], ['Guard/Reserve', D.guard]]);
    var ob = function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); };
    $('eth').innerHTML = hbars(ob(D.ethnicity), true);
    $('race').innerHTML = hbars(ob(D.race));
  }

  function community() {
    var C = S.community;
    if (!C) { $('csKpis').innerHTML = '<div class="card empty" style="grid-column:1/-1">Load the Community Support report to fill this in.</div>'; return; }
    $('csLede').textContent = 'Numbers reported by hand each month by site coordinators and reps (' + C.entries + ' entries this year).';
    var cols = C.columns.filter(function (c) { return C.totals[c] > 0; });
    var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
    $('csKpis').innerHTML = cols.slice().sort(function (a, b) { return C.totals[b] - C.totals[a]; }).map(function (c) {
      return '<div class="card kpi"><div class="label">' + esc(cap(c)) + '</div><div class="value">' + fmt(C.totals[c]) + '</div></div>';
    }).join('');
    $('csTable').innerHTML = '<thead><tr><th>Month</th>' + cols.map(function (c) { return '<th class="num">' + esc(cap(c)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      C.byMonth.map(function (m) { return '<tr><td>' + m.month + '</td>' + cols.map(function (c) { return '<td class="num mono">' + fmt(m[c] || 0) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody><tfoot><tr><td>Total</td>' + cols.map(function (c) { return '<td class="num mono">' + fmt(C.totals[c]) + '</td>'; }).join('') + '</tr></tfoot>';
  }

  function notes() {
    $('quality').innerHTML = (S.quality.length ? S.quality : ['No issues found in this load.']).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('');
    var src = S.sources, L = [];
    if (src.mvfdValue && src.mvfdValue.lastSession) L.push('MVFD pounds/value run through ' + niceDate(src.mvfdValue.lastSession) + '.');
    if (src.pantryValue && src.pantryValue.lastSession) L.push('Pantry pounds/value run through ' + niceDate(src.pantryValue.lastSession) + '.');
    L.push('Clients are matched across reports by full name. Household sizes over ' + S.householdCap + ' are treated as entry errors.');
    $('sources').textContent = L.join(' ');
  }

  // ---- sealed roster ----
  var R = null, rf = { q: '', prog: 'all', site: '' };
  $('unlockForm').onsubmit = function (e) {
    e.preventDefault();
    var pass = $('pass').value; if (!pass) return;
    $('unlockMsg').textContent = 'Unsealing...';
    fetch('data/roster.enc.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('none'); return r.json(); })
      .then(function (box) { return GreatHall.unseal(box, pass); })
      .then(function (list) {
        R = list; $('pass').value = ''; $('unlockMsg').textContent = '';
        $('vault').classList.add('hidden'); $('rosterBody').classList.remove('hidden');
        var sites = {}; R.forEach(function (c) { c.s.forEach(function (s) { sites[s] = 1; }); });
        $('rSite').innerHTML = '<option value="">All sites</option>' + Object.keys(sites).sort().map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
        drawRoster();
      })
      .catch(function (err) { $('unlockMsg').textContent = err.message === 'none' ? 'The roster has not been sealed yet. Run an update in the Kitchens.' : 'That passphrase did not work.'; });
  };
  $('rSearch').oninput = function () { rf.q = this.value.toLowerCase().trim(); drawRoster(); };
  $('rSite').onchange = function () { rf.site = this.value; drawRoster(); };
  seg('rProg', function (v) { rf.prog = v; drawRoster(); });
  $('rLock').onclick = function () { R = null; $('rTable').innerHTML = ''; $('rosterBody').classList.add('hidden'); $('vault').classList.remove('hidden'); };
  $('rCsv').onclick = function () {
    var rows = filtered(), q = function (s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; };
    var csv = ['Name,Status,Sites,MVFD visits,Pantry visits,Total visits,First visit,Last visit,Household'].concat(rows.map(function (c) { return [q(c.n), q(c.st), q(c.s.join('; ')), c.m, c.p, c.m + c.p, c.f, c.l, c.h || ''].join(','); })).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'food-clients-' + S.year + '.csv'; a.click();
  };
  function filtered() {
    return R.filter(function (c) {
      var p = c.m && c.p ? 'both' : c.m ? 'mvfd' : 'pantry';
      return (rf.prog === 'all' || rf.prog === p) && (!rf.site || c.s.indexOf(rf.site) !== -1) && (!rf.q || c.n.toLowerCase().indexOf(rf.q) !== -1);
    });
  }
  function drawRoster() {
    var rows = filtered(), shown = rows.slice(0, 500);
    $('rTable').innerHTML = '<thead><tr><th>Name</th><th>Program</th><th>Sites</th><th>Status</th><th class="num">MVFD</th><th class="num">Pantry</th><th class="num">Total</th><th>Last visit</th></tr></thead><tbody>' +
      shown.map(function (c) {
        var p = c.m && c.p ? '<span class="pill both">Both</span>' : c.m ? '<span class="pill mvfd">MVFD</span>' : '<span class="pill pantry">Pantry</span>';
        return '<tr><td>' + esc(c.n) + '</td><td>' + p + '</td><td>' + esc(c.s.join(', ')) + '</td><td>' + esc(c.st) + '</td><td class="num mono">' + c.m + '</td><td class="num mono">' + c.p + '</td><td class="num mono"><b>' + (c.m + c.p) + '</b></td><td class="mono">' + niceDate(c.l) + '</td></tr>';
      }).join('') + '</tbody>';
    $('rCount').textContent = fmt(rows.length) + ' clients match' + (rows.length > 500 ? ' (showing the first 500; search or download the CSV for the rest)' : '') + '.';
  }
})();
