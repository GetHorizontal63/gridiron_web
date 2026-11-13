/* FBS rankings engine, shared by the FBS Rankings page (js/pages/fbs.js) and the record book (js/pages/recordbook.js).
   The 2002-03 BCS standings formula, week by week from week 1 to week N-1 of each full season (playoffs included),
   and the week-N title game between the final No. 1 and No. 2. See the FBS Rankings page's method notes.

   const E = await FbsEngine.load();
   E.seasons (newest first) · E.done (seasons with final placements) · E.nameOf[ownerId] · E.rows (every scored game)
   E.seasonData(season) -> { s, N, ids, last, weeks, byWeek[week] -> { X, T: [team rows with rank, fpi, sor...], sigG, n }, complete }
   E.titleGame(D, asOf?) -> { A, C, p, projected, a?, c?, winner? }   (asOf omitted = the season's final word) */
(function () {
    let loaded = null;
    async function build() {
        const b = await GT.load();
        const [rows, starters, owners, sched] = await Promise.all([
            GT.query(`SELECT m.season, m.week, m.season_period AS period, t.owner_id AS id, t.opponent_owner_id AS opp, t.team_score AS pf, t.opponent_score AS pa
                      FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id WHERE t.team_score IS NOT NULL ORDER BY m.season, m.week`),
            // title-game fallback: a finalist with no game that week still posted a lineup score
            GT.query(`SELECT fr.season, fr.week, fr.owner_id AS id, SUM(COALESCE(p.actual_points, 0)) AS pts
                      FROM fantasy_rosters fr JOIN fantasy_roster_players p ON p.roster_id = fr.roster_id
                      WHERE fr.week >= 15 AND p.slot_position NOT IN ('BE', 'IR') GROUP BY fr.season, fr.week, fr.owner_id`),
            GT.query('SELECT owner_id AS id, display_name AS mgr FROM owners'),
            fetch(SITE.url('data/schedule.json')).then(r => r.ok ? r.json() : null).catch(() => null)   // who plays whom, weeks not played yet
        ]);
        const nameOf = Object.fromEntries(owners.map(o => [o.id, o.mgr]));
        const seasons = [...new Set(rows.map(r => r.season))].sort((x, y) => y - x);
        const done = new Set(Object.keys(b.finish).map(k => Number(k.split('-')[0])));
        const maxWeek = s => Math.max(...rows.filter(r => r.season === s).map(r => r.week));
        const lastDone = seasons.find(s => done.has(s));
        // N: the full season, playoffs included. A season still in progress is as long as the last completed one.
        const lengthOf = s => done.has(s) ? maxWeek(s) : (lastDone ? maxWeek(lastDone) : 17);

        const sum = a => a.reduce((s, x) => s + x, 0);
        const mean = a => a.length ? sum(a) / a.length : NaN;
        const near = x => Math.abs(x) < 1e-9 ? 0 : x;
        const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
        const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
        // competition ranking (1, 2, 2, 4): `cmp` < 0 when a ranks ahead of c, 0 when level
        const rankBy = (list, cmp) => {
            const order = list.map((_, i) => i).sort((a, c) => cmp(list[a], list[c]));
            const r = new Array(list.length);
            order.forEach((i, k) => { r[i] = k > 0 && cmp(list[order[k - 1]], list[i]) === 0 ? r[order[k - 1]] : k + 1; });
            return r;
        };
        // Gaussian elimination with partial pivoting (the Colley system is small and well-conditioned)
        const solve = (A, y) => {
            const n = y.length, M = A.map((r, i) => [...r, y[i]]);
            for (let c = 0; c < n; c++) {
                let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
                [M[c], M[p]] = [M[p], M[c]];
                for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
            }
            const x = new Array(n).fill(0);
            for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
            return x;
        };
        const QW = [1, 0.8, 0.6, 0.4, 0.2];   // quality-win credit for beating the No. 1 ... No. 5 team

        // ------------------------------------------------------------------ one week's standings
        function rankWeek(D, X) {
            const n = D.ids.length, ix = Object.fromEntries(D.ids.map((id, i) => [id, i]));
            const G = D.games.filter(g => g.week <= X && ix[g.opp] != null);
            const res = g => g.pf > g.pa ? 1 : g.pf < g.pa ? 0 : 0.5;
            const T = D.ids.map(id => ({ id, mgr: nameOf[id] || '?', w: 0, l: 0, t: 0, pf: 0, pa: 0, gp: 0, ap: 0, opps: [], scores: [] }));
            const weekScores = {};
            G.forEach(g => { (weekScores[g.week] = weekScores[g.week] || []).push(g.pf); });
            G.forEach(g => {
                const t = T[ix[g.id]], r = res(g), ws = weekScores[g.week];
                t.gp++; t.pf += g.pf; t.pa += g.pa; t.scores.push(g.pf);
                if (r === 1) t.w++; else if (r === 0) t.l++; else t.t++;
                t.opps.push({ j: ix[g.opp], r, week: g.week });
                const others = ws.length - 1;                                  // all-play: share of that week's other scores beaten
                t.ap += others ? (ws.filter(v => v < g.pf).length + (ws.filter(v => v === g.pf).length - 1) / 2) / others : 0.5;
            });
            const W = t => t.w + t.t / 2;
            const pct = t => t.gp ? W(t) / t.gp : 0.5;
            // an opponent's record without its games against you (the NCAA convention)
            const pctExcl = (j, i) => { const t = T[j]; let w = W(t), g = t.gp; t.opps.forEach(o => { if (o.j === i) { w -= o.r; g--; } }); return g ? w / g : 0.5; };
            const OR = T.map((t, i) => t.gp ? mean(t.opps.map(o => pctExcl(o.j, i))) : 0.5);
            const OOR = T.map(t => t.gp ? mean(t.opps.map(o => OR[o.j])) : 0.5);
            T.forEach((t, i) => { t.or = OR[i]; t.oor = OOR[i]; t.sos = (2 * OR[i] + OOR[i]) / 3; t.pct = pct(t); t.apPct = t.gp ? t.ap / t.gp : 0.5; });
            // remaining regular-season opponents, rated the same way on their records to date
            T.forEach((t, i) => {
                const rem = [];
                for (let w = X + 1; w <= D.regEnd; w++) (D.regular[w] || []).forEach(([a, c]) => {
                    if (a === t.id && ix[c] != null) rem.push(ix[c]); else if (c === t.id && ix[a] != null) rem.push(ix[a]); });
                t.remN = rem.length;
                t.rem = rem.length ? mean(rem.map(j => (2 * pctExcl(j, i) + OR[j]) / 3)) : null;
            });

            // FPI: points a game better than an average team, the season so far pulled toward average (worth 4 average games)
            const lg = mean(G.map(g => g.pf));
            let ss = 0, dof = 0;
            T.forEach(t => { if (t.scores.length < 2) return; const m = mean(t.scores); t.scores.forEach(v => { ss += (v - m) ** 2; }); dof += t.scores.length - 1; });
            const sig = Math.sqrt((ss + 28 * 28 * 20) / (dof + 20)), sigG = sig * Math.SQRT2;
            T.forEach(t => { t.fpi = (t.pf + 4 * lg) / (t.gp + 4) - lg; });
            // SOR: chance an average team (FPI 0) has this record or better against this schedule
            T.forEach(t => {
                const ps = t.opps.map(o => Phi(-T[o.j].fpi / sigG));
                let dist = [1];
                ps.forEach(p => { const nd = new Array(dist.length + 1).fill(0); dist.forEach((q, k) => { nd[k] += q * (1 - p); nd[k + 1] += q * p; }); dist = nd; });
                const won = W(t), k0 = Math.ceil(won - 1e-9);
                t.sorP = sum(dist.slice(k0));
                t.xwAvg = sum(ps);
                t.resume = won - t.xwAvg;
            });

            // the polls (no voters here, so two results-based stand-ins) and the computers (win-loss only, as the BCS required)
            const media = rankBy(T, (a, c) => near(c.pct - a.pct) || near(c.pf - a.pf));
            const coaches = rankBy(T, (a, c) => near(c.apPct - a.apPct) || near(c.pf - a.pf));
            const colley = (() => {
                const A = T.map((t, i) => T.map((_, j) => i === j ? 2 + t.gp : 0)), y = T.map(t => 1 + (t.w - t.l) / 2);
                T.forEach((t, i) => t.opps.forEach(o => { A[i][o.j] -= 1; }));
                return solve(A, y);
            })();
            const wolfe = (() => {                     // Bradley-Terry maximum likelihood, one win and one loss against a 1.0 anchor
                let p = T.map(() => 1);
                for (let it = 0; it < 300; it++) p = T.map((t, i) => { let den = 2 / (p[i] + 1); t.opps.forEach(o => { den += 1 / (p[i] + p[o.j]); }); return (W(t) + 1) / den; });
                return p;
            })();
            const elo = (() => {                       // results in order, week by week, no margin of victory
                const r = T.map(() => 1500);
                for (let w = 1; w <= X; w++) {
                    const d = T.map(() => 0);
                    G.filter(g => g.week === w).forEach(g => { const i = ix[g.id], j = ix[g.opp]; d[i] += 32 * (res(g) - 1 / (1 + 10 ** ((r[j] - r[i]) / 400))); });
                    d.forEach((x, i) => { r[i] += x; });
                }
                return r;
            })();
            const ratings = [colley, wolfe, elo];
            const comp = ratings.map(v => rankBy(v, (a, c) => near(c - a)));
            // Record-based SOS ties are broken by the opponents' scoring (average opponent FPI). A closed schedule makes them
            // tie outright: when every team has played each division rival twice (2023-25, two divisions of 8), the
            // opponents' records without their games against you always total exactly .500, for everyone.
            T.forEach(t => { t.oppFpi = t.gp ? mean(t.opps.map(o => T[o.j].fpi)) : 0; });
            const sosR = rankBy(T, (a, c) => near(c.sos - a.sos) || near(c.oppFpi - a.oppFpi));
            T.forEach((t, i) => {
                t.media = media[i]; t.coaches = coaches[i]; t.poll = (media[i] + coaches[i]) / 2;
                t.ratings = ratings.map(v => v[i]);
                t.comps = comp.map(r => r[i]);
                const worst = Math.max(...t.comps);
                t.dropIdx = t.comps.indexOf(worst);
                t.comp = (sum(t.comps) - worst) / 2;
                t.sosRank = sosR[i];
                t.sosPts = sosR[i] * 117 / (25 * n);    // the BCS's SOS rank / 25, rescaled from 117 teams to this league
                t.losses = t.l + t.t / 2;
                t.sub = t.poll + t.comp + t.sosPts + t.losses;
            });
            const subR = rankBy(T, (a, c) => near(a.sub - c.sub) || near(a.poll - c.poll));
            T.forEach((t, i) => { t.subRank = subR[i]; });
            T.forEach(t => {
                t.qw = 0; t.qwList = [];
                t.opps.forEach(o => { const rk = T[o.j].subRank; if (o.r > 0 && rk <= QW.length) { const v = QW[rk - 1] * o.r; t.qw += v; t.qwList.push({ mgr: T[o.j].mgr, rk, week: o.week, v }); } });
                t.total = t.sub - t.qw;
            });
            // final order is strict (the title game needs a clear No. 1 and No. 2): total, then polls, computers, name
            T.slice().sort((a, c) => near(a.total - c.total) || near(a.poll - c.poll) || near(a.comp - c.comp) || a.mgr.localeCompare(c.mgr))
                .forEach((t, k) => { t.rank = k + 1; });
            const sorR = rankBy(T, (a, c) => near(a.sorP - c.sorP) || near(W(c) - W(a)));
            const remList = T.filter(t => t.rem != null), remR = rankBy(remList, (a, c) => near(c.rem - a.rem));
            const fpiR = rankBy(T, (a, c) => near(c.fpi - a.fpi));
            T.forEach((t, i) => { t.sorRank = sorR[i]; t.fpiRank = fpiR[i]; t.remRank = null; });
            remList.forEach((t, i) => { t.remRank = remR[i]; });
            return { X, T, lg, sig, sigG, n };
        }

        // ------------------------------------------------------------------ one season, every week
        const cache = {};
        function seasonData(s) {
            if (cache[s]) return cache[s];
            const all = rows.filter(r => r.season === s), N = lengthOf(s);
            const games = all.filter(r => r.opp != null && r.pa != null);
            const played = games.length ? Math.max(...games.map(g => g.week)) : 0;
            const ids = [...new Set(all.map(r => r.id))];
            // the regular-season schedule: every pairing on file, plus data/schedule.json for weeks not played yet
            const regular = {};
            all.filter(r => r.period === 'Regular' && r.opp != null && r.id < r.opp).forEach(r => { (regular[r.week] = regular[r.week] || []).push([r.id, r.opp]); });
            if (sched && sched.season === s && sched.weeks) Object.entries(sched.weeks).forEach(([w, list]) => { if (!regular[w]) regular[w] = list; });
            const regEnd = Math.max(0, ...Object.keys(regular).map(Number));
            const last = Math.min(N - 1, played);
            const weeks = Array.from({ length: last }, (_, i) => i + 1);
            const D = { s, N, ids, games, regular, regEnd, last, weeks, byWeek: {}, complete: done.has(s) && last === N - 1 };
            weeks.forEach(w => { D.byWeek[w] = rankWeek(D, w); });
            return (cache[s] = D);
        }

        // week N: the final No. 1 against the final No. 2, on the scores they posted that week
        // asOf omitted = the season's final word (the real title game when the season is over)
        function titleGame(D, asOf) {
            const final = D.complete && (asOf == null || asOf === D.N - 1);
            const V = final ? D.byWeek[D.N - 1] : D.byWeek[asOf || D.last];
            if (!V) return null;
            const [A, C] = V.T.slice().sort((x, y) => x.rank - y.rank);
            const p = Phi((A.fpi - C.fpi) / V.sigG);          // pre-game chance No. 1 wins, from FPI
            if (!final) return { A, C, p, projected: true, V };
            const scoreOf = id => {
                const g = rows.find(r => r.season === D.s && r.week === D.N && r.id === id);
                if (g) return g.pf;
                const st = starters.find(r => r.season === D.s && r.week === D.N && r.id === id);
                return st ? st.pts : null;
            };
            const a = scoreOf(A.id), c = scoreOf(C.id);
            const winner = a == null || c == null ? null : a > c ? A : c > a ? C : null;
            return { A, C, a, c, p, winner, projected: false, V };
        }
        const champOf = s => { const k = Object.keys(b.finish).find(k => k.startsWith(`${s}-`) && b.finish[k] === 1); return k ? nameOf[Number(k.split('-')[1])] : null; };
        return { b, rows, starters, nameOf, seasons, done, lengthOf, seasonData, titleGame, champOf, Phi, mean, sum, near };
    }
    window.FbsEngine = { load: () => loaded || (loaded = build()) };
})();
