/* Stats: the league analytics dashboard.
   Probabilistic outcomes (Monte Carlo playoff + title odds as of any week, pre-game win probability from projections)
   and expectation vs performance (expected wins vs actual, FP+, points vs projection). Click any manager to focus
   every visual on them. */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    SITE.subHeader({ crumbs: [['Stats']],
                     tabs: [{ label: 'Dashboard', href: url('pages/stats.html'), active: true },
                            { label: 'Stat Finder', href: url('pages/stat-finder.html') }] });
    SITE.hero({ title: 'League Analytics', size: 'short', dots: false, image: 'background-15.png',
                meta: ['Playoff odds, win probability and expectation vs performance'] });
    content.innerHTML = '<div class="wrap page-pad"><div class="loading" style="margin-top:40px">Loading every game and lineup...</div></div>';

    // ---------------------------------------------------------------- data (all seasons, loaded once)
    const [allGames, divRows, rules, slotRows, metrics] = await Promise.all([
        GT.query(`SELECT m.game_id AS gameId, m.season, m.week, m.season_period AS period, t.owner_id AS id, o.display_name AS mgr,
                         t.opponent_owner_id AS oppId, t.team_score AS pf, t.opponent_score AS pa
                  FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                  ORDER BY m.season, m.week`),
        GT.query(`SELECT d.season, d.division_id AS div, d.division_name AS name, m.owner_id AS id
                  FROM divisions d JOIN division_members m ON m.division_id = d.division_id ORDER BY d.season, d.division_id`),
        GT.query('SELECT season, qualification_method AS method, regular_season_end_week AS endWeek FROM playoff_rules'),
        GT.query('SELECT season, division_id AS div, auto_slots AS auto, playin_slots AS playin FROM playoff_division_slots'),
        RosterMetrics.load()
    ]);
    const proj = (mgr, season, week) => { const m = metrics.get(`${mgr}|${season}|${week}`); return m && m.projected > 0 ? m : null; };
    const seasons = [...new Set(allGames.map(g => g.season))].sort((x, y) => y - x);

    // ---------------------------------------------------------------- pre-game win probability from projections
    // P(win) = Phi(projected margin / sigma); sigma = spread of (actual margin - projected margin) across every game on file
    const pairs = [];
    allGames.filter(g => g.pf != null && g.pa != null && g.id < g.oppId).forEach(g => {
        const a = proj(g.mgr, g.season, g.week), o = allGames.find(x => x.gameId === g.gameId && x.id === g.oppId);
        const c = o && proj(o.mgr, g.season, g.week);
        if (a && c) pairs.push({ g, o, pm: a.projected - c.projected, am: g.pf - g.pa });
    });
    const sigma = Math.sqrt(pairs.reduce((t, p) => t + (p.am - p.pm) ** 2, 0) / Math.max(1, pairs.length)) || 30;
    const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
    const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
    pairs.forEach(p => { p.p = Phi(p.pm / sigma); });         // chance the first team wins

    // ---------------------------------------------------------------- state
    let season = Number(param('season')) || seasons[0];
    let asOf = null, focus = null;
    const charts = [];

    function seasonModel(s) {
        const games = allGames.filter(g => g.season === s);
        const rule = rules.find(r => r.season === s) || {};
        const playin = rule.method === 'divisional_top_n_plus_playin';
        const reg = games.filter(g => g.period === 'Regular');
        const played = reg.filter(g => g.pf != null && g.pa != null);
        const lastPlayed = played.length ? Math.max(...played.map(g => g.week)) : 0;
        // regular season length: the rule (the play-in format plays its play-in in week 14, so 13 weeks)
        const endWeek = playin ? 13 : Math.max(rule.endWeek || 0, ...reg.map(g => g.week));
        const ids = [...new Set(games.map(g => g.id))];
        const divs = [];
        divRows.filter(d => d.season === s).forEach(d => {
            let x = divs.find(v => v.div === d.div);
            if (!x) divs.push(x = { div: d.div, name: d.name, ids: [], auto: 0, playin: 0 });
            x.ids.push(d.id);
            const slot = slotRows.find(r => r.season === s && r.div === d.div);
            if (slot) { x.auto = slot.auto; x.playin = slot.playin; }
        });
        if (!divs.length) divs.push({ div: 0, name: 'League', ids, auto: 8, playin: 0 });
        divs.forEach(d => { d.ids = d.ids.filter(i => ids.includes(i)); });
        return { s, games, reg, played, lastPlayed, endWeek, ids, divs, playin };
    }

    // ---------------------------------------------------------------- Monte Carlo
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    // Seeds within one division, the same procedure as the bracket outlook: win %, then head-to-head only when every
    // tied team has played every other, then point differential, then points for; restart after each pick.
    function seedDivision(list, st) {
        const out = [], rows = list.slice().sort((x, y) => st.w[y] - st.w[x]);
        for (let i = 0; i < rows.length;) {
            let j = i; while (j < rows.length && st.w[rows[j]] === st.w[rows[i]]) j++;
            const left = rows.slice(i, j);
            while (left.length) {
                let allMet = true;
                for (const a of left) for (const c of left) if (a !== c && !st.met[a][c]) { allMet = false; break; }
                const h = r => left.reduce((t, o) => o === r ? t : t + st.h2h[r][o], 0);
                let best = left[0];
                for (const r of left.slice(1)) {
                    const d = (allMet ? h(r) - h(best) : 0) || (st.pf[r] - st.pa[r]) - (st.pf[best] - st.pa[best]) || st.pf[r] - st.pf[best];
                    if (d > 0) best = r;
                }
                out.push(best); left.splice(left.indexOf(best), 1);
            }
            i = j;
        }
        return out;
    }

    function simulate(model, week, sims) {
        const n = model.ids.length, idx = Object.fromEntries(model.ids.map((id, i) => [id, i]));
        const base = { w: new Float64Array(n), pf: new Float64Array(n), pa: new Float64Array(n), h2h: model.ids.map(() => new Float64Array(n)), met: model.ids.map(() => new Uint8Array(n)) };
        const scores = model.ids.map(() => []);
        model.played.filter(g => g.week <= week && g.oppId != null).forEach(g => {
            const a = idx[g.id], c = idx[g.oppId];
            if (a == null || c == null) return;
            const r = g.pf > g.pa ? 1 : g.pf < g.pa ? -1 : 0;
            base.w[a] += r > 0 ? 1 : r === 0 ? 0.5 : 0; base.pf[a] += g.pf; base.pa[a] += g.pa;
            base.h2h[a][c] += r; base.met[a][c] = 1; scores[a].push(g.pf);
        });
        // each team's scoring: its mean so far shrunk toward the league mean (worth 4 games), one shared spread
        const all = scores.flat();
        const lgMean = all.length ? all.reduce((t, v) => t + v, 0) / all.length : 130;
        let ss = 0, dof = 0;
        scores.forEach(l => { if (!l.length) return; const m = l.reduce((t, v) => t + v, 0) / l.length; l.forEach(v => { ss += (v - m) ** 2; }); dof += l.length - 1; });
        const sd = Math.sqrt((ss + 28 * 28 * 20) / (dof + 20));      // early weeks lean on the prior instead of collapsing to 0
        const mu = scores.map(l => (l.reduce((t, v) => t + v, 0) + 4 * lgMean) / (l.length + 4));
        // remaining schedule: the real pairings when on file, otherwise a random pairing each week
        const remaining = [];
        for (let w = week + 1; w <= model.endWeek; w++) {
            const known = model.reg.filter(g => g.week === w && g.id < g.oppId && idx[g.id] != null && idx[g.oppId] != null).map(g => [idx[g.id], idx[g.oppId]]);
            remaining.push(known.length ? known : null);
        }
        const seedCount = model.ids.map(() => new Float64Array(n + 1));
        const out = { bye: new Float64Array(n), playIn: new Float64Array(n), gulag: new Float64Array(n), playoffs: new Float64Array(n), title: new Float64Array(n), wins: new Float64Array(n) };
        const score = i => mu[i] + sd * gauss();
        for (let k = 0; k < sims; k++) {
            const st = { w: Float64Array.from(base.w), pf: Float64Array.from(base.pf), pa: Float64Array.from(base.pa),
                         h2h: base.h2h.map(r => Float64Array.from(r)), met: base.met.map(r => Uint8Array.from(r)) };
            remaining.forEach(pairsW => {
                let list = pairsW;
                if (!list) {                                              // random pairing
                    const order = [...Array(n).keys()].sort(() => Math.random() - 0.5);
                    list = []; for (let i = 0; i + 1 < n; i += 2) list.push([order[i], order[i + 1]]);
                }
                list.forEach(([a, c]) => {
                    const sa = score(a), sc = score(c);
                    st.pf[a] += sa; st.pa[a] += sc; st.pf[c] += sc; st.pa[c] += sa;
                    if (sa > sc) { st.w[a]++; st.h2h[a][c]++; st.h2h[c][a]--; } else { st.w[c]++; st.h2h[c][a]++; st.h2h[a][c]--; }
                    st.met[a][c] = st.met[c][a] = 1;
                });
            });
            const seeds = model.divs.map(d => seedDivision(d.ids.map(id => idx[id]).filter(v => v != null), st));
            seeds.forEach((list, di) => list.forEach((t, si) => {
                seedCount[t][si + 1]++;
                const d = model.divs[di];
                if (model.playin) { if (si < d.auto) out.bye[t]++; else if (si < d.auto + d.playin) out.playIn[t]++; else out.gulag[t]++; }
                else if (si < d.auto) out.playoffs[t]++;
            }));
            model.ids.forEach((_, t) => { out.wins[t] += st.w[t]; });
            // the play-in format's championship bracket (weeks 14-17): reach the quarterfinal = playoffs; win it all = title
            if (model.playin && seeds.length === 2) {
                const A = seeds[0], B = seeds[1], g = (x, y) => (score(x) >= score(y) ? x : y);
                const pi = [g(B[3], A[4]), g(A[2], B[5]), g(A[3], B[4]), g(B[2], A[5])];
                const qf = [A[0], B[1], B[0], A[1]];
                [...qf, ...pi].forEach(t => out.playoffs[t]++);
                const q = qf.map((t, i) => g(t, pi[i]));
                out.title[g(g(q[0], q[1]), g(q[2], q[3]))]++;
            }
        }
        const f = v => Array.from(v, x => x / sims);
        return { seedPct: seedCount.map(r => Array.from(r, x => x / sims)), bye: f(out.bye), playIn: f(out.playIn), gulag: f(out.gulag),
                 playoffs: f(out.playoffs), title: model.playin ? f(out.title) : null, wins: f(out.wins), mu, sd, base };
    }

    // ---------------------------------------------------------------- page
    function frame() {
        content.innerHTML = `<div class="wrap page-pad">
            <div class="db-slicers">
                <label class="sx-f"><span>Season</span><select class="select" id="db-season">${seasons.map(s => `<option${s === season ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
                <label class="sx-f"><span>As of</span><select class="select" id="db-week"></select></label>
                <label class="sx-f"><span>Focus</span><select class="select" id="db-focus"></select></label>
                <button class="sx-reset" id="db-clear">Clear focus</button>
                <span class="db-note" id="db-note"></span>
            </div>
            <div class="db-kpis" id="db-kpis"></div>
            <div class="db-grid">
                <section class="db-tile s12"><header><h3>Playoff Odds</h3><p id="odds-sub"></p></header><div id="odds"></div></section>
                <section class="db-tile s7"><header><h3>Odds Through the Season</h3><p>Chance of reaching the championship bracket after each week</p></header><div class="db-chart" id="c-traj"></div></section>
                <section class="db-tile s5"><header><h3>Luck: Expected vs Actual Wins</h3><p>Expected wins = all-play record. Above the line = lucky.</p></header><div class="db-chart" id="c-luck"></div></section>
                <section class="db-tile s5"><header><h3>FP+ (Points vs Projection)</h3><p>Starters' points ÷ ESPN projection × 100</p></header><div class="db-chart" id="c-fp"></div></section>
                <section class="db-tile s7"><header><h3>Beat the Projection, Week by Week</h3><p>Actual minus projected starter points. Click a cell for the game.</p></header><div class="db-chart" id="c-heat"></div></section>
                <section class="db-tile s5"><header><h3>Are Projections Honest?</h3><p>Every game since 2019: projected favorite's win chance vs how often they won</p></header><div class="db-chart" id="c-cal"></div></section>
                <section class="db-tile s7"><header><h3>Biggest Upsets</h3><p id="up-sub">Lowest pre-game win probability that still won</p></header><div id="upsets"></div></section>
            </div>
            <section class="mb" id="moneyball"><div class="loading" style="margin-top:30px">Loading Moneyball...</div></section>
            <p class="an-note">Win probability: projected margin ÷ ${sigma.toFixed(1)} pts (the spread of how far real margins miss projected ones), through a normal curve.
            Playoff odds: 5,000 simulated finishes. Each team scores around its average so far (pulled toward the league average as if it had played four average games),
            the real remaining schedule when it is on file and random pairings when it is not. Seeds use the league tiebreakers.
            <a href="${url('pages/stat-finder.html')}">Stat Finder</a> has every raw table.</p>
        </div>`;
        document.getElementById('db-season').addEventListener('change', e => { season = Number(e.target.value); asOf = null; focus = null; build(); });
        document.getElementById('db-week').addEventListener('change', e => { asOf = Number(e.target.value); build(); });
        document.getElementById('db-focus').addEventListener('change', e => setFocus(e.target.value || null));
        document.getElementById('db-clear').addEventListener('click', () => setFocus(null));
    }

    let model, sim, traj, lines;
    async function build() {
        model = seasonModel(season);
        if (asOf == null || asOf > model.lastPlayed) asOf = model.lastPlayed;
        document.getElementById('db-week').innerHTML = Array.from({ length: model.lastPlayed + 1 }, (_, w) =>
            `<option value="${w}"${w === asOf ? ' selected' : ''}>${w ? `Week ${w}` : 'Preseason'}</option>`).join('');
        const names = model.ids.map(id => b.byId[id].name).sort((x, y) => x.localeCompare(y));
        document.getElementById('db-focus').innerHTML = `<option value="">Whole league</option>${names.map(n => `<option${n === focus ? ' selected' : ''}>${esc(n)}</option>`).join('')}`;
        document.getElementById('db-note').textContent = 'Simulating...';
        await new Promise(r => setTimeout(r, 20));
        sim = simulate(model, asOf, 5000);
        traj = [];
        for (let w = 0; w <= asOf; w++) traj.push(w === asOf ? sim : simulate(model, w, 1200));
        document.getElementById('db-note').textContent = `${model.lastPlayed < model.endWeek ? `Regular season ${model.lastPlayed} of ${model.endWeek} weeks` : 'Regular season complete'} · 5,000 simulations`;
        lines = managerLines();
        render();
    }

    // per-manager lines through the as-of week: wins, expected (all-play) wins, FP+, efficiency, points vs projection
    function managerLines() {
        const games = model.played.filter(g => g.week <= asOf);
        const pool = {}; games.forEach(g => { (pool[g.week] = pool[g.week] || []).push(g.pf); });
        return model.ids.map(id => {
            const name = b.byId[id].name, mine = games.filter(g => g.id === id);
            const w = mine.reduce((t, g) => t + (g.pf > g.pa ? 1 : g.pf === g.pa ? 0.5 : 0), 0);
            const xw = mine.reduce((t, g) => { const p = pool[g.week]; return t + (p.filter(v => v < g.pf).length + (p.filter(v => v === g.pf).length - 1) / 2) / (p.length - 1); }, 0);
            const pooled = RosterMetrics.pool(mine.map(g => metrics.get(`${name}|${season}|${g.week}`)).filter(Boolean));
            const pf = mine.reduce((t, g) => t + g.pf, 0);
            return { id, name, g: mine.length, w, l: mine.length - w, xw, luck: w - xw, fp: pooled.fp, eff: pooled.eff, ppg: mine.length ? pf / mine.length : null,
                     weeks: mine.map(g => ({ week: g.week, gameId: g.gameId, pf: g.pf, m: proj(name, season, g.week) })) };
        });
    }

    const pct = (v, d = 0) => v == null ? '-' : `${(v * 100).toFixed(d)}%`;
    const heat = v => `background:rgba(var(--accent-rgb),${(0.08 + v * 0.85).toFixed(2)});color:${v > 0.55 ? 'var(--on-accent)' : 'var(--ink)'}`;
    const nameOf = i => b.byId[model.ids[i]].name;

    function render() {
        readColors();
        charts.splice(0).forEach(c => c.dispose());
        renderKpis(); renderOdds(); renderUpsets();
        renderTrajectory(); renderLuck(); renderFp(); renderHeat(); renderCalibration();
    }

    // ---- KPI cards: league-wide, or the focused manager
    function renderKpis() {
        const games = model.played.filter(g => g.week <= asOf);
        const card = (label, value, sub) => `<div class="db-kpi"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;
        let html;
        if (focus) {
            const L = lines.find(l => l.name === focus), i = model.ids.indexOf(L.id);
            const rank = (k, desc = true) => 1 + lines.filter(x => x[k] != null && (desc ? x[k] > L[k] : x[k] < L[k])).length;
            const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
            html = card('Record', `${L.w}-${L.l}`, `${L.xw.toFixed(1)} expected wins`)
                 + card('Luck', `${L.luck >= 0 ? '+' : ''}${L.luck.toFixed(1)}`, `wins vs expected · ${ord(rank('luck'))}`)
                 + card('Points / game', L.ppg == null ? '-' : GT.pts(L.ppg), `${ord(rank('ppg'))} in the league`)
                 + card('FP+', L.fp == null ? '-' : L.fp.toFixed(1), `vs projection · ${ord(rank('fp'))}`)
                 + card('Playoff odds', pct(sim.playoffs[i], 1), `projected ${sim.wins[i].toFixed(1)} wins`)
                 + card(sim.title ? 'Title odds' : 'Lineup efficiency', sim.title ? pct(sim.title[i], 1) : (L.eff == null ? '-' : `${L.eff.toFixed(1)}%`), sim.title ? 'simulated bracket' : `${ord(rank('eff'))} in the league`);
        } else {
            const ppg = games.length ? games.reduce((t, g) => t + g.pf, 0) / games.length : null;
            const sp = pairs.filter(p => p.g.season === season && p.g.week <= asOf && p.g.period === 'Regular');
            const upsets = sp.filter(p => (p.p >= 0.5) !== (p.am > 0)).length;
            const mae = sp.length ? sp.reduce((t, p) => t + Math.abs(p.am - p.pm), 0) / sp.length : null;
            const pooled = RosterMetrics.pool(games.map(g => metrics.get(`${g.mgr}|${season}|${g.week}`)).filter(Boolean));
            const luckiest = lines.slice().sort((x, y) => y.luck - x.luck)[0];
            const fav = sim.title ? sim.title.indexOf(Math.max(...sim.title)) : sim.playoffs.indexOf(Math.max(...sim.playoffs));
            html = card('Points / game', ppg == null ? '-' : GT.pts(ppg), `${games.length / 2} games`)
                 + card('Upset rate', sp.length ? pct(upsets / sp.length) : '-', `underdog won ${upsets} of ${sp.length}`)
                 + card('Projection miss', mae == null ? '-' : GT.pts(mae), 'pts off projected margin')
                 + card('League FP+', pooled.fp == null ? '-' : pooled.fp.toFixed(1), `lineup efficiency ${pooled.eff == null ? '-' : pooled.eff.toFixed(1) + '%'}`)
                 + card('Luckiest', luckiest && luckiest.g ? esc(luckiest.name) : '-', luckiest && luckiest.g ? `${luckiest.luck >= 0 ? '+' : ''}${luckiest.luck.toFixed(1)} wins vs expected` : '')
                 + card(sim.title ? 'Title favorite' : 'Best playoff odds', esc(nameOf(fav)), sim.title ? pct(sim.title[fav], 1) : pct(sim.playoffs[fav], 1));
        }
        document.getElementById('db-kpis').innerHTML = html;
    }

    // ---- odds table: seed probability heat map
    function renderOdds() {
        const maxSeeds = Math.max(...model.divs.map(d => d.ids.length));
        const extra = model.playin ? ['Bye', 'Play-in', 'Gulag', 'Bracket', 'Title'] : ['Playoffs'];
        const extraW = model.playin ? 7 : 9, seedW = (100 - 31 - extraW * extra.length) / maxSeeds;
        const cols = SITE.cols('14%', '6%', '5%', '6%', ...Array(maxSeeds).fill(`${seedW.toFixed(2)}%`), ...Array(extra.length).fill(`${extraW}%`));
        const rowsFor = d => d.ids.map(id => model.ids.indexOf(id))
            .sort((x, y) => sim.seedPct[x].reduce((t, v, s) => t + v * s, 0) - sim.seedPct[y].reduce((t, v, s) => t + v * s, 0));
        const letter = i => model.divs.length === 2 && model.playin ? 'AB'[i] : '';
        document.getElementById('odds-sub').textContent = asOf ? `As of week ${asOf} · each cell is the chance of finishing at that seed in the division` : 'Preseason: every team starts level';
        document.getElementById('odds').innerHTML = model.divs.map((d, di) => `
            <div class="table-scroll"><table class="data-table db-odds" style="min-width:${model.playin ? 1100 : 820}px">${cols}<thead><tr>
                <th>${esc(d.name)}${letter(di) ? ` (${letter(di)})` : ''}</th><th class="num">W-L</th><th class="num">xW</th><th class="num">Proj W</th>
                ${Array.from({ length: maxSeeds }, (_, s) => `<th class="num">${s + 1}${letter(di)}</th>`).join('')}
                ${extra.map(x => `<th class="num">${x}</th>`).join('')}</tr></thead><tbody>
            ${rowsFor(d).map(i => {
                const L = lines[i], on = focus === L.name;
                const vals = model.playin ? [sim.bye[i], sim.playIn[i], sim.gulag[i], sim.playoffs[i], sim.title[i]] : [sim.playoffs[i]];
                return `<tr class="db-row${on ? ' on' : ''}${focus && !on ? ' dim' : ''}" data-name="${esc(L.name)}">
                    <td><span class="team-cell"><img src="${GT.logo(L.name)}" alt=""><b>${esc(L.name)}</b></span></td>
                    <td class="num">${L.w}-${L.l}</td><td class="num">${L.xw.toFixed(1)}</td><td class="num"><b>${sim.wins[i].toFixed(1)}</b></td>
                    ${Array.from({ length: maxSeeds }, (_, s) => { const v = sim.seedPct[i][s + 1] || 0; return `<td class="num db-cell" style="${heat(v)}">${v >= 0.005 ? Math.round(v * 100) : ''}</td>`; }).join('')}
                    ${vals.map(v => `<td class="num db-cell" style="${heat(v)}">${pct(v)}</td>`).join('')}</tr>`;
            }).join('')}</tbody></table></div>`).join('');
        document.querySelectorAll('.db-row').forEach(tr => tr.addEventListener('click', () => setFocus(focus === tr.dataset.name ? null : tr.dataset.name)));
    }

    // ---- upsets
    function renderUpsets() {
        const list = pairs.filter(p => p.g.season === season && p.g.week <= asOf && p.am !== 0)
            .map(p => { const aWon = p.am > 0; return { p, win: aWon ? p.g.mgr : p.o.mgr, lose: aWon ? p.o.mgr : p.g.mgr, prob: aWon ? p.p : 1 - p.p,
                                                       ws: aWon ? p.g.pf : p.g.pa, ls: aWon ? p.g.pa : p.g.pf }; })
            .filter(u => !focus || u.win === focus || u.lose === focus)
            .sort((x, y) => x.prob - y.prob).slice(0, 8);
        document.getElementById('up-sub').textContent = focus ? `${focus}'s biggest upsets, for and against` : 'Lowest pre-game win probability that still won';
        document.getElementById('upsets').innerHTML = `<div class="table-scroll"><table class="data-table" style="min-width:560px">${SITE.cols('14%', '24%', '24%', '14%', '24%')}<thead><tr>
            <th>Week</th><th>Winner</th><th>Loser</th><th class="num">Win prob</th><th class="num">Score</th></tr></thead><tbody>
            ${list.map(u => `<tr class="row-link" data-href="${url(`pages/past-seasons/game-center.html?id=${u.p.g.gameId}`)}"><td>${u.p.g.period === 'Regular' ? `Week ${u.p.g.week}` : esc(GT.periodLabel(u.p.g.period, u.p.g.week))}</td>
                <td><span class="team-cell"><img src="${GT.logo(u.win)}" alt=""><b>${esc(u.win)}</b></span></td><td><span class="team-cell"><img src="${GT.logo(u.lose)}" alt="">${esc(u.lose)}</span></td>
                <td class="num"><b>${pct(u.prob)}</b></td><td class="num">${GT.pts(u.ws)}-${GT.pts(u.ls)}</td></tr>`).join('')
              || '<tr><td colspan="5" class="muted">No games with projections yet.</td></tr>'}
            ${Array(Math.max(0, 8 - Math.max(1, list.length))).fill('<tr><td colspan="5"></td></tr>').join('')}</tbody></table></div>`;
    }

    // ---- charts
    // chart colours come from the theme, re-read on every render (light / dark)
    const C = {};
    const readColors = () => Object.assign(C, { accent: SITE.color('accent'), red: SITE.color('danger'), ink: SITE.color('ink'), muted: SITE.color('muted'),
                                                 grid: SITE.color('track'), faint: SITE.color('hair'), line: SITE.color('line-strong'), surface: SITE.color('surface') });
    const font = { fontFamily: 'Inter, sans-serif' };
    function mount(id, option, onClick) {
        const el = document.getElementById(id);
        const chart = echarts.init(el, null, { renderer: 'canvas' });
        chart.setOption({ textStyle: font, animationDuration: 400, ...option });
        if (onClick) chart.on('click', onClick);
        charts.push(chart);
        return chart;
    }
    const dimmed = n => focus && n !== focus;

    function renderTrajectory() {
        const weeks = traj.map((_, w) => (w ? `W${w}` : 'Pre'));
        mount('c-traj', {
            grid: { left: 44, right: 16, top: 16, bottom: 30 },
            tooltip: { trigger: 'axis', order: 'valueDesc', valueFormatter: v => `${v}%` },
            xAxis: { type: 'category', data: weeks, boundaryGap: false, axisLabel: { color: C.muted } },
            yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%', color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
            series: model.ids.map((id, i) => {
                const n = b.byId[id].name, on = n === focus;
                return { name: n, type: 'line', smooth: true, symbol: on ? 'circle' : 'none', symbolSize: 6,
                         data: traj.map(t => Math.round(t.playoffs[i] * 1000) / 10),
                         lineStyle: { width: on ? 3.5 : 1.5, color: on ? C.accent : dimmed(n) ? C.faint : undefined },
                         itemStyle: { color: on ? C.accent : undefined }, z: on ? 10 : 2,
                         emphasis: { focus: 'series' }, endLabel: { show: on, formatter: '{a}', color: C.accent, fontWeight: 700 } };
            })
        }, p => setFocus(p.seriesName === focus ? null : p.seriesName));
    }

    function renderLuck() {
        const max = Math.max(1, ...lines.map(l => Math.max(l.w, l.xw))) + 0.5;
        mount('c-luck', {
            grid: { left: 40, right: 18, top: 16, bottom: 40 },
            tooltip: { formatter: p => `<b>${esc(p.data.name)}</b><br>${p.data.value[1]} wins, ${p.data.value[0].toFixed(1)} expected<br>Luck ${p.data.luck >= 0 ? '+' : ''}${p.data.luck.toFixed(1)}` },
            xAxis: { type: 'value', name: 'Expected wins', nameLocation: 'middle', nameGap: 26, min: 0, max: Math.ceil(max), axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
            yAxis: { type: 'value', name: 'Actual', min: 0, max: Math.ceil(max), axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
            series: [{ type: 'line', data: [[0, 0], [Math.ceil(max), Math.ceil(max)]], symbol: 'none', lineStyle: { type: 'dashed', color: C.line }, silent: true },
                     { type: 'scatter', symbolSize: d => 14,
                       data: lines.filter(l => l.g).map(l => ({ name: l.name, luck: l.luck, value: [l.xw, l.w],
                           itemStyle: { color: dimmed(l.name) ? C.faint : l.luck >= 0 ? C.accent : C.red, borderColor: l.name === focus ? C.ink : C.surface, borderWidth: l.name === focus ? 2 : 1 },
                           label: { show: !focus || l.name === focus, formatter: l.name, position: 'right', fontSize: 10, color: C.ink } })) }]
        }, p => p.data && p.data.name && setFocus(p.data.name === focus ? null : p.data.name));
    }

    function renderFp() {
        const list = lines.filter(l => l.fp != null).sort((x, y) => x.fp - y.fp);
        mount('c-fp', {
            grid: { left: 74, right: 34, top: 8, bottom: 22 },
            tooltip: { formatter: p => `<b>${esc(p.name)}</b><br>FP+ ${p.value.toFixed(1)}` },
            xAxis: { type: 'value', min: v => Math.floor(Math.min(90, v.min) / 5) * 5, max: v => Math.ceil(Math.max(110, v.max) / 5) * 5, axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
            yAxis: { type: 'category', data: list.map(l => l.name), axisLabel: { color: C.ink, fontSize: 10, fontWeight: 600 } },
            series: [{ type: 'bar', barWidth: '62%',
                       data: list.map(l => ({ value: l.fp, itemStyle: { color: dimmed(l.name) ? C.faint : l.fp >= 100 ? C.accent : C.red } })),
                       label: { show: true, position: 'right', formatter: p => p.value.toFixed(1), fontSize: 9, color: C.muted },
                       markLine: { silent: true, symbol: 'none', data: [{ xAxis: 100 }], lineStyle: { color: C.ink, type: 'solid' }, label: { show: false } } }]
        }, p => setFocus(p.name === focus ? null : p.name));
    }

    function renderHeat() {
        const names = lines.slice().sort((x, y) => x.name.localeCompare(y.name)).map(l => l.name).reverse();
        const weeks = Array.from({ length: asOf }, (_, i) => i + 1);
        const data = [];
        lines.forEach(l => l.weeks.forEach(w => { if (w.m) data.push({ value: [w.week - 1, names.indexOf(l.name), Math.round((w.pf - w.m.projected) * 10) / 10], gameId: w.gameId, name: l.name }); }));
        const lim = Math.max(10, ...data.map(d => Math.abs(d.value[2])));
        mount('c-heat', {
            grid: { left: 74, right: 10, top: 6, bottom: 46 },
            tooltip: { formatter: p => `<b>${esc(p.data.name)}</b> · week ${p.data.value[0] + 1}<br>${p.data.value[2] >= 0 ? '+' : ''}${p.data.value[2]} vs projection` },
            xAxis: { type: 'category', data: weeks.map(w => `W${w}`), axisLabel: { color: C.muted, fontSize: 10 }, splitArea: { show: false } },
            yAxis: { type: 'category', data: names, axisLabel: { fontSize: 10, fontWeight: 600, color: v => (dimmed(v) ? C.line : C.ink) } },
            visualMap: { min: -lim, max: lim, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 120, itemWidth: 10, text: ['Beat it', 'Missed'], textStyle: { fontSize: 10, color: C.muted },
                         inRange: { color: [C.red, C.surface, C.accent] } },
            series: [{ type: 'heatmap', data: data.map(d => ({ ...d, itemStyle: dimmed(d.name) ? { opacity: 0.25 } : {} })), itemStyle: { borderColor: C.surface, borderWidth: 1 } }]
        }, p => { if (p.data && p.data.gameId) location.href = url(`pages/past-seasons/game-center.html?id=${p.data.gameId}`); });
    }

    function renderCalibration() {
        const bins = [[50, 60], [60, 70], [70, 80], [80, 90], [90, 101]].map(([lo, hi]) => {
            const list = pairs.filter(p => { const f = Math.max(p.p, 1 - p.p) * 100; return f >= lo && f < hi && p.am !== 0; });
            const won = list.filter(p => (p.p >= 0.5) === (p.am > 0)).length;
            const exp = list.reduce((t, p) => t + Math.max(p.p, 1 - p.p), 0);
            return { label: `${lo}-${Math.min(hi, 100)}%`, n: list.length, actual: list.length ? won / list.length * 100 : null, predicted: list.length ? exp / list.length * 100 : null };
        });
        mount('c-cal', {
            grid: { left: 44, right: 16, top: 28, bottom: 30 },
            legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 10, color: C.muted } },
            tooltip: { trigger: 'axis', formatter: ps => `<b>${ps[0].name}</b> favorites (${bins[ps[0].dataIndex].n} games)<br>` + ps.map(p => `${p.seriesName}: ${p.value == null ? '-' : p.value.toFixed(1) + '%'}`).join('<br>') },
            xAxis: { type: 'category', data: bins.map(x => x.label), axisLabel: { color: C.muted, fontSize: 10 } },
            yAxis: { type: 'value', min: 40, max: 100, axisLabel: { formatter: '{value}%', color: C.muted }, splitLine: { lineStyle: { color: C.grid } } },
            series: [{ name: 'Actually won', type: 'bar', barWidth: '48%', data: bins.map(x => x.actual), itemStyle: { color: C.accent } },
                     { name: 'Projected', type: 'line', data: bins.map(x => x.predicted), symbol: 'circle', symbolSize: 7, lineStyle: { color: C.ink, width: 2 }, itemStyle: { color: C.ink } }]
        });
    }

    function setFocus(n) {
        focus = n || null;
        const sel = document.getElementById('db-focus'); if (sel) sel.value = focus || '';
        render();
    }
    window.addEventListener('resize', () => charts.forEach(c => c.resize()));
    window.addEventListener('themechange', () => { if (sim) render(); });

    frame();
    await build();
    if (window.MONEYBALL) MONEYBALL.mount(document.getElementById('moneyball'));   // what it takes to win (js/moneyball.js)
})();
