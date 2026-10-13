#!/usr/bin/env node
/* Optional command-line build (the Kitchens page does the same thing in the browser).
 * Usage:  npm install xlsx  &&  node scripts/build.js path/to/reports/*.xls*
 * Writes data/summary.json. Set ROSTER_PASSPHRASE to also write data/roster.enc.json.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const GH = require('../assets/processor.js');
const cfg = (() => { const src = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8'); const w = {}; new Function('window', src)(w); return w.GREAT_HALL_CONFIG; })();

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Give me the report files.'); process.exit(1); }
  const reports = {};
  for (const f of files) {
    const wb = XLSX.read(fs.readFileSync(f), { type: 'buffer', cellDates: false });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    const name = path.basename(f);
    const key = GH.detect(name, rows);
    if (!key) { console.warn('Could not tell what this report is, skipped:', name); continue; }
    reports[key] = { name, rows };
    console.log(key.padEnd(15), '<-', name, `(${rows.length - 1} rows)`);
  }
  const out = GH.build(reports, { year: cfg.year, householdCap: cfg.householdCap });
  const dir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(out.summary, null, 1));
  console.log('\nWrote data/summary.json');
  if (process.env.ROSTER_PASSPHRASE) {
    const box = await GH.seal(out.roster, process.env.ROSTER_PASSPHRASE);
    fs.writeFileSync(path.join(dir, 'roster.enc.json'), JSON.stringify(box));
    console.log('Wrote data/roster.enc.json (sealed,', out.roster.length, 'clients)');
  }
  console.log('\nTotals:', out.summary.totals);
  console.log('\nNotes:\n - ' + out.summary.quality.join('\n - '));
})();
