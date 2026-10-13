(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var CFG = window.GREAT_HALL_CONFIG || {};
  var fmt = function (n) { return n == null ? '-' : Math.round(n).toLocaleString('en-US'); };
  var money = function (n) { return n == null ? '-' : '$' + Math.round(n).toLocaleString('en-US'); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var reports = {};
  var result = null;
  var VAULT = 'greatHall.tokenVault';

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
    var need = ['pantryAttended', 'mvfdAttended'].every(function (k) { return reports[k]; });
    $('run').disabled = !need;
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
    var T = result.summary.totals;
    var tiles = [
      ['Unique clients', fmt(T.uniqueClients)], ['Attended both', fmt(T.bothClients)], ['Total visits', fmt(T.totalVisits)], ['Sessions', fmt(T.mvfdSessions + T.pantrySessions)],
      ['Pounds', fmt(T.pounds)], ['Food value', money(T.value)], ['In-kind', T.inKind == null ? 'none yet' : money(T.inKind)], ['Pending sessions', fmt(T.pendingSessions)]
    ];
    $('preview').innerHTML = '<div class="grid g4">' + tiles.map(function (t) { return '<div class="card kpi"><div class="label">' + t[0] + '</div><div class="value" style="font-size:22px">' + t[1] + '</div></div>'; }).join('') + '</div>' +
      '<div class="card" style="margin-top:12px"><b style="font-family:Cinzel,serif;font-size:14px;letter-spacing:.06em">Before you publish, give these a look</b><ul class="notes">' +
      (result.summary.quality.length ? result.summary.quality : ['Nothing flagged.']).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div>';
    $('publish').disabled = false; $('download').disabled = false;
  };

  // ---------- passphrase checks ----------
  function passphrase() {
    var a = $('p1').value, b = $('p2').value;
    if (!a) throw new Error('Enter the staff passphrase.');
    if (a.length < 8) throw new Error('Use at least 8 characters for the passphrase.');
    if (a !== b) throw new Error('The two passphrases do not match.');
    return a;
  }
  // Make sure the passphrase matches the roster already live, so nobody gets locked out by a typo
  function checkExisting(pass) {
    if ($('changing').checked) return Promise.resolve();
    return fetch('data/roster.enc.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (box) {
        if (!box) return;
        return GreatHall.unseal(box, pass).catch(function () { throw new Error('That passphrase does not open the roster that is live now. Fix the typo, or tick "I\'m changing the passphrase on purpose".'); });
      });
  }

  function files(pass) {
    return GreatHall.seal(result.roster, pass).then(function (box) {
      return { 'data/summary.json': JSON.stringify(result.summary, null, 1), 'data/roster.enc.json': JSON.stringify(box) };
    });
  }

  // ---------- download ----------
  $('download').onclick = function () {
    var pass; try { pass = passphrase(); } catch (e) { return log(e.message, 'warn'); }
    checkExisting(pass).then(function () { return files(pass); }).then(function (f) {
      Object.keys(f).forEach(function (p) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f[p]], { type: 'application/json' })); a.download = p.split('/').pop(); document.body.appendChild(a); a.click(); a.remove();
      });
      log('Downloaded summary.json and roster.enc.json.\nIn GitHub: open the data folder > Add file > Upload files > drop both > Commit changes.', 'ok');
    }).catch(function (e) { log(e.message, 'warn'); });
  };

  // ---------- GitHub publish ----------
  var gh = CFG.github || {};
  $('repo').value = (gh.owner && gh.repo) ? gh.owner + '/' + gh.repo : '';
  $('branch').value = gh.branch || 'main';
  var vault = null; try { vault = JSON.parse(localStorage.getItem(VAULT) || 'null'); } catch (e) {}
  if (vault) $('vaultNote').innerHTML = 'A token is saved on this computer. Leave the token box empty and it unlocks with your passphrase. <a href="#" id="forget">Forget it</a>';
  document.addEventListener('click', function (e) { if (e.target.id === 'forget') { e.preventDefault(); try { localStorage.removeItem(VAULT); } catch (x) {} vault = null; $('vaultNote').textContent = 'Saved token removed.'; } });

  function b64utf8(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function api(token, url, opts) {
    opts = opts || {};
    opts.headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    return fetch('https://api.github.com' + url, opts);
  }
  function putFile(token, repo, branch, path, content, message) {
    return api(token, '/repos/' + repo + '/contents/' + path + '?ref=' + encodeURIComponent(branch))
      .then(function (r) { return r.status === 404 ? null : r.ok ? r.json() : r.json().then(function (j) { throw new Error(path + ': ' + (j.message || r.status)); }); })
      .then(function (existing) {
        var body = { message: message, content: b64utf8(content), branch: branch };
        if (existing && existing.sha) body.sha = existing.sha;
        return api(token, '/repos/' + repo + '/contents/' + path, { method: 'PUT', body: JSON.stringify(body) });
      })
      .then(function (r) { if (!r.ok) return r.json().then(function (j) { throw new Error(path + ': ' + (j.message || r.status)); }); });
  }

  $('publish').onclick = function () {
    var pass; try { pass = passphrase(); } catch (e) { return log(e.message, 'warn'); }
    var repo = $('repo').value.trim(), branch = $('branch').value.trim() || 'main';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return log('Repo should look like owner/repo.', 'warn');
    $('publish').disabled = true;
    var token = $('token').value.trim();
    log('Checking the passphrase...');
    checkExisting(pass)
      .then(function () {
        if (token) return token;
        if (!vault) throw new Error('Paste a GitHub token (see README for how to make one).');
        return GreatHall.unseal(vault, pass).then(function (v) { return v.token; }).catch(function () { throw new Error('The saved token did not unlock with that passphrase. Paste the token again.'); });
      })
      .then(function (tok) {
        token = tok;
        if ($('remember').checked && $('token').value.trim()) {
          return GreatHall.seal({ token: token }, pass).then(function (box) { try { localStorage.setItem(VAULT, JSON.stringify(box)); vault = box; } catch (e) {} });
        }
      })
      .then(function () { log('Sealing the roster...'); return files(pass); })
      .then(function (f) {
        var stamp = new Date().toLocaleDateString('en-US');
        var paths = Object.keys(f);
        return paths.reduce(function (p, path) {
          return p.then(function () { log('Sending ' + path + '...'); return putFile(token, repo, branch, path, f[path], 'Great Hall data update ' + stamp); });
        }, Promise.resolve());
      })
      .then(function () { $('token').value = ''; log('Published. Render will redeploy in about a minute. Refresh the Great Hall after that.\nMischief managed.', 'ok'); })
      .catch(function (e) { log(e.message, 'warn'); })
      .then(function () { $('publish').disabled = false; });
  };

  function log(msg, cls) {
    var el = $('log'); el.classList.remove('hidden');
    el.innerHTML = '<span class="' + (cls || '') + '">' + esc(msg) + '</span>';
  }

  drawSlots();
})();
