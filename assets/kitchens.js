(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var CFG = window.GREAT_HALL_CONFIG || {};
  var A = window.HallAdmin;
  var fmt = function (n) { return n == null ? '-' : Math.round(n).toLocaleString('en-US'); };
  var money = function (n) { return n == null ? '-' : '$' + Math.round(n).toLocaleString('en-US'); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var reports = {}, result = null;
  var admin = null, viewer = null, setupMode = false;

  // ---------- gate ----------
  var keysBox = null;
  A.getJSON(A.PATHS.keys).then(function (k) {
    keysBox = k;
    if (!k) {
      setupMode = true;
      $('gateTitle').textContent = 'First-time setup';
      $('gateSub').textContent = 'Pick two passwords: one for you (admin) and one for staff who view the dashboard. They go live with your first publish.';
      $('gateForm').classList.add('hidden'); $('setupForm').classList.remove('hidden');
    } else { $('adminPass').focus(); }
  });
  $('gateForm').onsubmit = function (e) {
    e.preventDefault();
    var p = $('adminPass').value; if (!p || !keysBox) return;
    $('gateMsg').textContent = 'Checking...';
    GreatHall.unseal(keysBox, p).then(function (k) { admin = p; viewer = k.viewer; enter(); })
      .catch(function () { $('gateMsg').textContent = 'That is not the admin password.'; });
  };
  $('setupForm').onsubmit = function (e) {
    e.preventDefault();
    try {
      admin = A.checkPair($('sa1').value, $('sa2').value, 'admin password');
      viewer = A.checkPair($('sv1').value, $('sv2').value, 'viewer password');
      if (admin === viewer) throw new Error('Make the admin and viewer passwords different.');
    } catch (err) { $('gateMsg').textContent = err.message; return; }
    enter();
  };
  function enter() {
    $('gate').classList.add('hidden'); $('work').classList.remove('hidden');
    if (!setupMode) $('pwLink').classList.remove('hidden');
    if (A.loadVault()) $('vaultNote').innerHTML = 'A token is saved on this computer. Leave the token box empty and it unlocks with the admin password. <a href="#" id="forget">Forget it</a>';
    drawSlots();
  }
  document.addEventListener('click', function (e) { if (e.target.id === 'forget') { e.preventDefault(); A.forgetVault(); $('vaultNote').textContent = 'Saved token removed.'; } });

  // ---------- Salesforce report links ----------
  var LINKS = (CFG.reports || []).filter(function (r) { return r.url; });
  $('repList').innerHTML = LINKS.map(function (r) {
    return '<li><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.name) + '</a><span class="ck" data-slot="' + esc(r.slot) + '"></span></li>';
  }).join('');
  $('openAll').onclick = function () {
    var opened = 0;
    LINKS.forEach(function (r) { var w = window.open(r.url, '_blank'); if (w) { try { w.opener = null; } catch (e) {} opened++; } });
    // a blocked tab comes back null, so flag the pop-up tip if any were stopped
    $('popNote').classList.toggle('warn', opened < LINKS.length);
  };
  function markLinks() {
    document.querySelectorAll('#repList .ck').forEach(function (el) { el.innerHTML = reports[el.dataset.slot] ? '&#10003; loaded' : ''; });
  }

  // ---------- slots ----------
  function drawSlots() {
    $('slots').innerHTML = GreatHall.SLOTS.map(function (s) {
      var r = reports[s.key];
      return '<div class="slot ' + (r ? 'filled' : '') + '"><span class="t">' + (r ? '&#10003; ' : '') + esc(s.label) + '</span>' +
        '<span class="f">' + (r ? esc(r.name) + ' &middot; ' + fmt(r.rows.length - 1) + ' rows' : esc(s.hint)) + '</span>' +
        '<label>' + (r ? 'Swap file' : 'Choose file') + '<input type="file" accept=".xls,.xlsx,.csv" data-slot="' + s.key + '"></label></div>';
    }).join('');
    $('slots').querySelectorAll('input[type=file]').forEach(function (inp) {
      inp.onchange = function () { if (this.files[0]) readFile(this.files[0], this.dataset.slot); };
    });
    $('run').disabled = !(reports.pantryAttended && reports.mvfdAttended);
    markLinks();
  }
  function readFile(file, forced) {
    return new Promise(function (resolve) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var wb = XLSX.read(new Uint8Array(fr.result), { type: 'array' });
          var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
          var key = forced || GreatHall.detect(file.name, rows);
          if (!key) alert('Could not tell which report "' + file.name + '" is. Use the Choose file link on the right slot.');
          else reports[key] = { name: file.name, rows: rows };
        } catch (e) { alert('Could not read ' + file.name + ': ' + e.message); }
        drawSlots(); resolve();
      };
      fr.readAsArrayBuffer(file);
    });
  }
  function readMany(files) { return Array.prototype.reduce.call(files, function (p, f) { return p.then(function () { return readFile(f); }); }, Promise.resolve()); }
  var drop = $('drop');
  drop.onclick = function () { $('multi').click(); };
  drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('multi').click(); } };
  $('multi').onchange = function () { readMany(this.files); this.value = ''; };
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { readMany(e.dataTransfer.files); });

  // ---------- process ----------
  $('run').onclick = function () {
    result = GreatHall.build(reports, { year: CFG.year, householdCap: CFG.householdCap, inKindManual: $('inKindManual').value });
    var T = result.summary.totals, M = result.summary.months, last = M[M.length - 1];
    var tiles = [
      ['Unique clients', fmt(T.uniqueClients)], ['Attended both', fmt(T.bothClients)], ['First-timers in ' + (last ? last.month : '-'), fmt(last ? last.newClients : 0)], ['Total visits', fmt(T.totalVisits)],
      ['Pounds', fmt(T.pounds)], ['Food value', money(T.value)], ['In-kind', T.inKind == null ? 'none yet' : money(T.inKind)], ['Pending sessions', fmt(T.pendingSessions)]
    ];
    $('preview').innerHTML = '<div class="grid g4">' + tiles.map(function (t) { return '<div class="card kpi"><div class="label">' + t[0] + '</div><div class="value" style="font-size:22px">' + t[1] + '</div></div>'; }).join('') + '</div>' +
      '<div class="card" style="margin-top:12px"><b style="font-family:Cinzel,serif;font-size:14px;letter-spacing:.06em">Before you publish, give these a look</b><ul class="notes">' +
      (result.summary.quality.length ? result.summary.quality : ['Nothing flagged.']).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div>';
    $('publish').disabled = false; $('download').disabled = false;
  };

  function files() {
    return Promise.all([
      GreatHall.seal({ summary: result.summary, roster: result.roster }, viewer),
      GreatHall.seal({ viewer: viewer, v: 1 }, admin)
    ]).then(function (b) {
      var f = {}; f[A.PATHS.hall] = JSON.stringify(b[0]); f[A.PATHS.keys] = JSON.stringify(b[1]); return f;
    });
  }

  $('download').onclick = function () {
    files().then(function (f) {
      A.download(f);
      log('Downloaded hall.enc.json and keys.enc.json.\nIn GitHub: open the data folder > Add file > Upload files > drop both > Commit changes.\nIf data/summary.json or data/roster.enc.json are still there, delete them.', 'ok');
    }).catch(function (e) { log(e.message, 'warn'); });
  };

  var gh = CFG.github || {};
  $('repo').value = (gh.owner && gh.repo) ? gh.owner + '/' + gh.repo : '';
  $('branch').value = gh.branch || 'main';
  $('publish').onclick = function () {
    var repo = $('repo').value.trim(), branch = $('branch').value.trim() || 'main';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return log('Repo should look like owner/repo.', 'warn');
    $('publish').disabled = true;
    var token;
    A.resolveToken($('token').value.trim(), admin, $('remember').checked)
      .then(function (t) { token = t; log('Locking everything with the viewer password...'); return files(); })
      .then(function (f) { return A.publish(token, repo, branch, f, 'Program numbers update ' + new Date().toLocaleDateString('en-US'), log); })
      .then(function () {
        $('token').value = ''; setupMode = false; $('pwLink').classList.remove('hidden');
        log('Published. Render redeploys in about a minute, then refresh the dashboard.\nMischief managed.', 'ok');
      })
      .catch(function (e) { log(e.message, 'warn'); })
      .then(function () { $('publish').disabled = false; });
  };

  function log(msg, cls) { var el = $('log'); el.classList.remove('hidden'); el.innerHTML = '<span class="' + (cls || '') + '">' + esc(msg) + '</span>'; }
})();
