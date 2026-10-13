# The Great Hall
Soldiers' Angels food programs dashboard: MVFDs + food pantries in one place.

**What it shows:** every client who attended an MVFD or pantry this year, how many times, who attended both, attendance per service session, total pounds, total food value, in-kind value (slot ready), households and demographics, and Community Support numbers.

**Privacy:** the public page only shows totals. Client names live in `data/roster.enc.json`, encrypted (AES-256-GCM) with the staff passphrase, and only open in the browser. Raw reports are never uploaded (`.gitignore` blocks .xls/.xlsx/.csv).

## Files
| Path | What it is |
|---|---|
| `index.html` | The Great Hall (the dashboard) |
| `kitchens.html` | The Kitchens (update page) |
| `config.js` | Year, household cap, GitHub repo for publishing |
| `assets/processor.js` | Reads the 6 reports and does all the math (browser + Node) |
| `assets/app.js`, `assets/kitchens.js`, `assets/styles.css` | Page code and styling |
| `data/summary.json` | Published totals (no names) |
| `data/roster.enc.json` | Encrypted client roster (created on your first Kitchens run) |
| `scripts/build.js` | Optional command-line version of the Kitchens |

## Reports it reads (Salesforce exports)
1. 2026 - Pantry Total Value Pounds: pantry session pounds + value
2. 2026 - MVFD Value Pounds: MVFD session pounds + value
3. 2026 Pantry Attended Clients: who came to each pantry
4. 2026 MVFD Attended Clients: who came to each MVFD
5. 2026 - MVFD Stats: household size, ages, military, ethnicity, race
6. 2026 Community Support: monthly manual entries
7. In-kind (optional): any report with an in-kind/value/amount column

Detection is by file name + column headers, so new export dates in the file name are fine.

## Updating (every time)
1. Run the 6 reports in Salesforce, export each (Details only).
2. Open `your-site.onrender.com/kitchens.html`.
3. Drop all 6 files in the box. Every slot should turn green.
4. Click **Process reports**. Check the tiles and the "give these a look" list.
5. Enter the staff passphrase twice (same one every time).
6. Click **Publish to GitHub**. Render redeploys in about a minute.

No token handy? Click **Download files instead**, then in GitHub open `data` > Add file > Upload files > drop `summary.json` + `roster.enc.json` > Commit.

## GitHub token (one time)
GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token.
- Repository access: Only select repositories > `sa-food-impact`
- Permissions: Contents = Read and write
- Expiration: 1 year (set a reminder)

Paste it in the Kitchens once with "Remember" checked; it's stored on that computer locked with your passphrase.
