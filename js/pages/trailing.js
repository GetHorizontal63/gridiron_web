/* Season pages: Trailing Form. Every manager's scoring over their last N games as of a chosen week, then the analysis:
   spread (median, SD, range), form against their own earlier games (Welch t-test), the luck-free all-play record, league
   context (z-score, percentile among every N-game stretch on file), next-week probabilities from a model whose error is
   measured on league history, a head-to-head probability grid, a backtest of how much trailing form really predicts,
   and the best / worst N-game stretches on file.
   ?season= &week= (as of) &n= (window) &games=reg|all &m= (manager to highlight) */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    const [rows, sched] = await Promise.all([
        GT.query(`SELECT m.season, m.week, m.season_period AS period, m.game_id AS gid, o.display_name AS mgr,
                         t.team_score AS pf, t.opponent_score AS pa, op.display_name AS opp
                  FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                  LEFT JOIN owners op ON op.owner_id = t.opponent_owner_id
                  WHERE t.team_score IS NOT NULL ORDER BY m.season, m.week, m.game_id`),
        fetch(url('data/schedule.json')).then(r => r.ok ? r.json() : null).catch(() => null)   // who plays whom, weeks not played yet
    ]);
    const seasons = [...new Set(rows.map(r => r.season))].sort((x, y) => y - x);
    const season = seasons.includes(Number(param('season'))) ? Number(param('season')) : seasons[0];
    const done = new Set(Object.keys(b.finish).map(k => Number(k.split('-')[0])));         // seasons with final placements
    const NMAX = 12;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const S = { games: param('games') === 'reg' ? 'reg' : 'all', n: clamp(Number(param('n')) || 4, 1, NMAX),
                week: Number(param('week')) || null, focus: param('m') || null, sort: 'avg', dir: -1 };

    SITE.subHeader({
        crumbs: [['Past Seasons', url('pages/past-seasons/index.html')], [`${season} Trailing Form`]],
        tabs: SITE.sectionTabs('competitions', 'trailing').filter(t => !t.href.endsWith('index.html')).map(t => ({ ...t, href: `${t.href}?season=${season}` }))
    });
    SITE.hero({ title: `${season} Trailing Form`, size: 'short', dots: false, image: 'background-9.png',
                tools: `<label class="hero-season"><span>Season</span><select class="select" id="hero-season">${seasons.map(s =>
                    `<option value="${s}"${s === season ? ' selected' : ''}>${s} season</option>`).join('')}</select></label>`,
                meta: ['Who is scoring the most right now: each manager over their last N games, as of any week', done.has(season) ? 'Final season' : 'Season in progress'] });
    document.getElementById('hero-season').addEventListener('change', e => {
        const u = new URL(location.href); u.searchParams.set('season', e.target.value); u.searchParams.delete('week'); location.href = u; });

    // ------------------------------------------------------------------ statistics
    const sum = a => a.reduce((s, x) => s + x, 0);
    const mean = a => a.length ? sum(a) / a.length : NaN;
    const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const variance = a => { if (a.length < 2) return NaN; const m = mean(a); return sum(a.map(x => (x - m) ** 2)) / (a.length - 1); };
    const sd = a => Math.sqrt(variance(a));
    const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
    const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
    // Student t two-sided p-value: regularized incomplete beta I_{df/(df+t^2)}(df/2, 1/2)
    const lgamma = z => { const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
        if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
        z -= 1; let x = 0.99999999999980993; g.forEach((c, i) => { x += c / (z + i + 1); }); const t = z + 7.5;
        return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); };
    const betacf = (a, c, x) => { let qab = a + c, qap = a + 1, qam = a - 1, cc = 1, d = 1 - qab * x / qap; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); let h = d;
        for (let m = 1; m <= 200; m++) { const m2 = 2 * m; let aa = m * (c - m) * x / ((qam + m2) * (a + m2));
            d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); cc = 1 + aa / cc; if (Math.abs(cc) < 1e-30) cc = 1e-30; h *= d * cc;
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); cc = 1 + aa / cc; if (Math.abs(cc) < 1e-30) cc = 1e-30;
            const del = d * cc; h *= del; if (Math.abs(del - 1) < 3e-12) break; }
        return h; };
    const ibeta = (x, a, c) => { if (x <= 0) return 0; if (x >= 1) return 1;
        const bt = Math.exp(lgamma(a + c) - lgamma(a) - lgamma(c) + a * Math.log(x) + c * Math.log(1 - x));
        return x < (a + 1) / (a + c + 2) ? bt * betacf(a, c, x) / a : 1 - bt * betacf(c, a, 1 - x) / c; };
    const tP = (t, df) => ibeta(df / (df + t * t), df / 2, 0.5);
    // Welch's t-test: is the window's average really different from the team's earlier games this season?
    const welch = (a, c) => { if (a.length < 2 || c.length < 2) return null;
        const va = variance(a) / a.length, vc = variance(c) / c.length, se = Math.sqrt(va + vc);
        if (!se) return null;
        const t = (mean(a) - mean(c)) / se, df = (va + vc) ** 2 / (va ** 2 / (a.length - 1) + vc ** 2 / (c.length - 1));
        return { t, df, p: tP(Math.abs(t), df) }; };
    const slope = (xs, ys) => { const mx = mean(xs), my = mean(ys); const sxx = sum(xs.map(x => (x - mx) ** 2));
        return sxx ? sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sxx : NaN; };
    const pearson = (xs, ys) => { const mx = mean(xs), my = mean(ys);
        const sxy = sum(xs.map((x, i) => (x - mx) * (ys[i] - my))), sxx = sum(xs.map(x => (x - mx) ** 2)), syy = sum(ys.map(y => (y - my) ** 2));
        return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN; };
    // seeded generator: the simulated odds don't wobble every time a control changes
    const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const gaussFrom = rand => () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

    // ------------------------------------------------------------------ formatting
    const f1 = v => Number.isFinite(v) ? GT.pts(v) : '-';
    const sgn = v => Number.isFinite(v) ? (v >= 0 ? '+' : '−') + GT.pts(Math.abs(v)) : '-';
    const pc = (v, d = 0) => Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '-';
    const odds = v => !Number.isFinite(v) ? '-' : v < 0.001 ? '<0.1%' : v > 0.999 ? '>99.9%' : `${(v * 100).toFixed(1)}%`;
    const pv = p => p == null ? '' : p < 0.001 ? 'p<.001' : `p ${p.toFixed(3).replace(/^0/, '')}`;
    const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    const mUrl = name => GT.managerHref(name, season);
    const who = (name, sub = '') => `<a class="team-cell" href="${mUrl(name)}"><img src="${GT.logo(name)}" alt=""><span><b>${esc(name)}</b>${sub ? `<span class="muted"> · ${sub}</span>` : ''}</span></a>`;
    const wkSpan = (a, z) => a === z ? `Wk ${a}` : `Wks ${a}-${z}`;

    // ------------------------------------------------------------------ data shaping (cached per games scope)
    const SEQ = {}, BT = {}, STRETCH = {};
    // each team-season's games in order: `${season}|${mgr}` -> rows
    const seqsOf = scope => SEQ[scope] || (SEQ[scope] = (() => {
        const m = new Map();
        rows.forEach(r => { if (scope === 'reg' && r.period !== 'Regular') return;
            const k = `${r.season}|${r.mgr}`; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
        return m;
    })());
    // a team's spread for the model: its own season-to-date variance, shrunk toward the league's (worth 4 games)
    const sigmaOf = (prior, base, leagueVar) => {
        const k = prior.length, v = k >= 2 ? variance(prior) : leagueVar, dfp = Math.max(0, k - 1);
        return base * Math.sqrt(((dfp * v + 4 * leagueVar) / (dfp + 4)) / leagueVar);
    };
    const winProb = (mA, sA, mB, sB) => Phi((mA - mB) / Math.sqrt(sA * sA + sB * sB));
    const BINS = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.01]];

    // the league's average score in a season's games before a week (the level a team regresses toward)
    const LB = {};
    const leagueBefore = (scope, s, week) => {
        if (!LB[scope]) {
            const by = {}, out = {};
            rows.forEach(r => { if (scope === 'reg' && r.period !== 'Regular') return;
                const m = (by[r.season] = by[r.season] || {}); (m[r.week] = m[r.week] || []).push(r.pf); });
            Object.entries(by).forEach(([ss, wk]) => { let tot = 0, n = 0;
                Object.keys(wk).map(Number).sort((x, y) => x - y).forEach(w => { out[`${ss}|${w}`] = n ? tot / n : NaN; wk[w].forEach(v => { tot += v; n++; }); });
                out[`${ss}|end`] = n ? tot / n : NaN; });
            LB[scope] = out;
        }
        return LB[scope][`${s}|${week}`];
    };

    // Backtest on every completed season: predict each game from the team's previous N games that season, and score it
    function backtest(scope) {
        if (BT[scope]) return BT[scope];
        const sq = seqsOf(scope);
        let ss = 0, df = 0;                                       // pooled week-to-week variance within a team-season
        sq.forEach((list, k) => { if (!done.has(+k.split('|')[0]) || list.length < 2) return;
            const m = mean(list.map(r => r.pf)); list.forEach(r => { ss += (r.pf - m) ** 2; }); df += list.length - 1; });
        const leagueVar = ss / df;
        const byN = {};
        [...Array.from({ length: NMAX }, (_, i) => i + 1), 'S'].forEach(N => {
            const pred = new Map(), err = [], xs = [], ys = [], samples = [];
            sq.forEach((list, k) => {
                if (!done.has(+k.split('|')[0])) return;
                list.forEach((r, i) => {
                    if (i < (N === 'S' ? 1 : N)) return;
                    const lm = leagueBefore(scope, r.season, r.week);
                    if (!Number.isFinite(lm)) return;
                    const prior = list.slice(0, i).map(x => x.pf), raw = mean(N === 'S' ? prior : prior.slice(-N));
                    samples.push({ key: `${r.gid}|${r.mgr}`, raw, lm, y: r.pf, prior });
                    err.push(r.pf - raw); xs.push(raw); ys.push(r.pf);
                });
            });
            const rmse = Math.sqrt(mean(err.map(e => e * e)));
            // regression to the mean: how much of a team's distance from the league average carries into the next game
            // (least squares through the league average: next - lm = beta * (trailing - lm)). The model's expected score is
            // lm + beta * (trailing - lm), and its sigma is that expectation's own miss.
            const beta = sum(samples.map(s => (s.raw - s.lm) * (s.y - s.lm))) / sum(samples.map(s => (s.raw - s.lm) ** 2));
            const resid = samples.map(s => s.y - (s.lm + beta * (s.raw - s.lm)));
            const sigma = Math.sqrt(mean(resid.map(e => e * e)));
            samples.forEach(s => pred.set(s.key, { mu: s.lm + beta * (s.raw - s.lm), prior: s.prior }));
            let right = 0, wrong = 0, brier = 0, nb = 0;
            const cal = BINS.map(([lo, hi]) => ({ lo, hi, n: 0, p: 0, won: 0 }));
            rows.forEach(r => {
                if (!done.has(r.season) || !r.opp || !(r.mgr < r.opp) || r.pa == null || r.pf === r.pa) return;
                const a = pred.get(`${r.gid}|${r.mgr}`), c = pred.get(`${r.gid}|${r.opp}`);
                if (!a || !c) return;
                const pA = winProb(a.mu, sigmaOf(a.prior, sigma, leagueVar), c.mu, sigmaOf(c.prior, sigma, leagueVar));
                const aWon = r.pf > r.pa ? 1 : 0;
                brier += (pA - aWon) ** 2; nb++;
                if (a.mu === c.mu) return;
                const pFav = Math.max(pA, 1 - pA), favWon = pA >= 0.5 ? aWon : 1 - aWon;
                if (favWon) right++; else wrong++;
                const bin = cal.find(x => pFav >= x.lo && pFav < x.hi);
                if (bin) { bin.n++; bin.p += pFav; bin.won += favWon; }
            });
            byN[N] = { N, games: err.length, mae: mean(err.map(Math.abs)), rmse, bias: mean(err), r: pearson(xs, ys), beta, sigma, right, wrong, brier: brier / nb, cal };
        });
        return (BT[scope] = { leagueVar, byN });
    }

    // every run of `len` consecutive games inside one team-season (all seasons on file)
    function stretches(scope, len) {
        const key = `${scope}|${len}`;
        if (STRETCH[key]) return STRETCH[key];
        const list = [];
        seqsOf(scope).forEach((g, k) => {
            const [s, mgr] = k.split('|');
            for (let i = 0; i + len <= g.length; i++) {
                const w = g.slice(i, i + len);
                list.push({ season: +s, mgr, from: w[0].week, to: w[len - 1].week, total: sum(w.map(r => r.pf)) });
            }
        });
        const sorted = list.map(x => x.total).sort((x, y) => x - y);
        return (STRETCH[key] = { list, sorted });
    }
    const pctRank = (sorted, v) => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
        let eq = lo; while (eq < sorted.length && sorted[eq] === v) eq++; return sorted.length ? (lo + (eq - lo) / 2) / sorted.length : NaN; };

    // ------------------------------------------------------------------ the view as of S.week
    function compute() {
        const sq = seqsOf(S.games), bt = backtest(S.games);
        const seasonRows = rows.filter(r => r.season === season && (S.games === 'all' || r.period === 'Regular'));
        const weeks = [...new Set(seasonRows.map(r => r.week))].sort((x, y) => x - y);
        if (!weeks.includes(S.week)) S.week = weeks[weeks.length - 1];
        // a week's period for labels: one bracket's name when only it played, "Postseason" when the brackets share the week
        const periodOf = {};
        seasonRows.forEach(r => { const p = periodOf[r.week]; periodOf[r.week] = p == null || p === r.period ? r.period : 'Postseason'; });
        const byWeek = {};
        seasonRows.forEach(r => { (byWeek[r.week] = byWeek[r.week] || []).push(r.pf); });
        const fit = k => bt.byN[clamp(k, 1, NMAX)];
        const lmNow = mean(seasonRows.filter(r => r.week <= S.week).map(r => r.pf));   // league average this season so far

        const teams = [];
        sq.forEach((list, k) => {
            const [s, mgr] = k.split('|');
            if (+s !== season) return;
            const G = list.filter(r => r.week <= S.week);
            if (!G.length) return;
            const W = G.slice(-S.n), P = G.slice(0, G.length - W.length), w = W.map(r => r.pf);
            const allPlay = mean(W.map(r => { const o = byWeek[r.week];
                return o.length > 1 ? (o.filter(x => x < r.pf).length + (o.filter(x => x === r.pf).length - 1) / 2) / (o.length - 1) : NaN; }));
            teams.push({ mgr, G, W, P, w, total: sum(w), avg: mean(w), med: median(w), sd: sd(w), lo: Math.min(...w), hi: Math.max(...w),
                         wins: W.filter(r => r.pa != null && r.pf > r.pa).length, losses: W.filter(r => r.pa != null && r.pf < r.pa).length,
                         ties: W.filter(r => r.pa != null && r.pf === r.pa).length, allPlay,
                         seasonAvg: mean(G.map(r => r.pf)), priorAvg: P.length ? mean(P.map(r => r.pf)) : NaN,
                         test: welch(w, P.map(r => r.pf)), trend: W.length >= 3 ? slope(W.map((_, i) => i), w) : NaN,
                         from: W[0].week, to: W[W.length - 1].week });
        });
        const avgs = teams.map(t => t.avg), lgMean = mean(avgs), lgSd = sd(avgs);
        teams.forEach(t => {
            t.delta = t.avg - t.priorAvg;
            t.z = lgSd ? (t.avg - lgMean) / lgSd : 0;
            t.pct = pctRank(stretches(S.games, t.W.length).sorted, t.total);
            const f = fit(t.W.length);
            t.mu = lmNow + f.beta * (t.avg - lmNow);              // regressed toward the league by what history says carries over
            t.sigma = sigmaOf(t.G.map(r => r.pf), f.sigma, bt.leagueVar);
        });
        teams.sort((x, y) => y.avg - x.avg).forEach((t, i) => { t.rank = i + 1; });

        // the next week: played games when they exist, else the schedule (season in progress)
        const nextWeek = weeks.find(w => w > S.week);
        let pairs = [], nextLabel = null, played = false;
        if (nextWeek != null) {
            seasonRows.filter(r => r.week === nextWeek && r.opp && r.mgr < r.opp).forEach(r => pairs.push([r.mgr, r.opp, r]));
            nextLabel = GT.periodLabel(periodOf[nextWeek], nextWeek); played = true;
        } else if (season === b.season && sched && Number(sched.season) === season && sched.weeks && sched.weeks[S.week + 1]) {
            pairs = sched.weeks[S.week + 1].map(([x, y]) => [b.byId[x] && b.byId[x].name, b.byId[y] && b.byId[y].name, null]).filter(p => p[0] && p[1]);
            nextLabel = `Regular W${S.week + 1}`;
        }
        const byMgr = Object.fromEntries(teams.map(t => [t.mgr, t]));
        pairs = pairs.filter(p => byMgr[p[0]] && byMgr[p[1]]);
        const field = pairs.length ? [...new Set(pairs.flatMap(p => [p[0], p[1]]))].map(m => byMgr[m]) : teams.slice();
        const actual = {};
        if (played) seasonRows.filter(r => r.week === nextWeek).forEach(r => { actual[r.mgr] = r.pf; });

        // Monte Carlo over the field: top score, bottom score, top half, expected rank
        const n = field.length, SIMS = 20000, gauss = gaussFrom(rng(season * 1000 + S.week * 37 + S.n));
        const top = new Float64Array(n), bot = new Float64Array(n), half = new Float64Array(n), rankSum = new Float64Array(n);
        const draw = new Float64Array(n), idx = Array.from({ length: n }, (_, i) => i);
        for (let s = 0; s < SIMS && n > 1; s++) {
            for (let i = 0; i < n; i++) draw[i] = field[i].mu + field[i].sigma * gauss();
            idx.sort((x, y) => draw[y] - draw[x]);
            top[idx[0]]++; bot[idx[n - 1]]++;
            idx.forEach((t, r) => { rankSum[t] += r + 1; if (r < n / 2) half[t]++; });
        }
        field.forEach((t, i) => { t.sim = { top: top[i] / SIMS, bot: bot[i] / SIMS, half: half[i] / SIMS, rank: rankSum[i] / SIMS,
                                           over150: 1 - Phi((150 - t.mu) / t.sigma), under100: Phi((100 - t.mu) / t.sigma) }; });

        // how the form favourite did in this season's games so far (same window, games up to the as-of week)
        let picksW = 0, picksL = 0;
        const preAt = new Map();
        sq.forEach((list, k) => { if (+k.split('|')[0] !== season) return;
            list.forEach((r, i) => { if (i >= 1) preAt.set(`${r.gid}|${r.mgr}`, mean(list.slice(Math.max(0, i - S.n), i).map(x => x.pf))); }); });
        seasonRows.forEach(r => { if (r.week > S.week || !r.opp || !(r.mgr < r.opp) || r.pa == null || r.pf === r.pa) return;
            const a = preAt.get(`${r.gid}|${r.mgr}`), c = preAt.get(`${r.gid}|${r.opp}`);
            if (a == null || c == null || a === c) return;
            if ((a > c) === (r.pf > r.pa)) picksW++; else picksL++; });

        // rolling average path for the chart (from the team's Nth game on)
        const paths = {};
        sq.forEach((list, k) => { const [s, mgr] = k.split('|'); if (+s !== season) return;
            paths[mgr] = {}; list.forEach((r, i) => { if (i + 1 >= Math.min(S.n, list.length)) paths[mgr][r.week] = mean(list.slice(Math.max(0, i + 1 - S.n), i + 1).map(x => x.pf)); }); });

        return { teams, weeks, periodOf, bt, lgMean, lgSd, lmNow, nextLabel, pairs, played, field, actual, picksW, picksL, paths, seasonRows };
    }

    // ------------------------------------------------------------------ rendering
    let chart = null, V = null;
    const SORTS = { mgr: t => t.mgr, total: t => t.total, avg: t => t.avg, med: t => t.med, sd: t => t.sd, lo: t => t.lo, hi: t => t.hi,
                    ap: t => t.allPlay, wl: t => t.wins - t.losses, season: t => t.seasonAvg, delta: t => t.delta, trend: t => t.trend,
                    z: t => t.z, pct: t => t.pct, form: t => t.test ? Math.sign(t.test.t) * (1 - t.test.p) : 0 };
    const formOf = t => {
        if (!t.test) return `<span class="muted">${t.P.length < 2 ? 'Too few earlier games' : '-'}</span>`;
        const { p, t: tv } = t.test, up = tv > 0;
        const word = p < 0.05 ? (up ? 'Hot' : 'Cold') : p < 0.2 ? (up ? 'Warming' : 'Cooling') : 'Steady';
        return `<span class="${p < 0.2 ? (up ? 'tf-hot' : 'tf-cold') : 'muted'}">${word}</span> <span class="muted">· ${pv(p)}</span>`;
    };
    const th = (k, label, tip, cls = 'num') => `<th class="${cls}${S.sort === k ? ' tf-on' : ''}" data-sort="${k}" data-tip="${esc(tip)}">${label}${S.sort === k ? (S.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;

    function leaderboard() {
        const key = SORTS[S.sort];
        // dir -1 = high to low; blanks (too few games for an SD, a trend or a test) always sink to the bottom
        const list = V.teams.slice().sort((x, y) => { const a = key(x), c = key(y);
            if (typeof a === 'string') return S.dir * a.localeCompare(c);
            if (!Number.isFinite(a) || !Number.isFinite(c)) return Number.isFinite(a) ? -1 : Number.isFinite(c) ? 1 : 0;
            return S.dir * (a - c) || x.rank - y.rank; });
        return `<div class="table-scroll"><table class="data-table tf-lb" style="min-width:1080px">${SITE.cols('4%', '12%', '6%', '5%', '6%', '5%', '5%', '5%', '6%', '5%', '6%', '6%', '6%', '5%', '6%', '12%')}<thead><tr>
            <th class="num">#</th>${th('mgr', 'Manager', 'Sort by name', '')}
            ${th('total', 'Total', `Points over the last ${S.n} games through the as-of week`)}
            ${th('avg', 'Avg', 'Average points per game in the window')}
            ${th('med', 'Median', 'Middle score in the window: one blow-up week moves it less than the average')}
            ${th('sd', 'SD', 'Standard deviation of the window scores (sample): how far a typical week strays from the average')}
            ${th('lo', 'Low', 'Lowest score in the window')}${th('hi', 'High', 'Highest score in the window')}
            ${th('ap', 'All-play', 'Share of the league each score would have beaten that week (ties count half): record with the schedule luck taken out')}
            ${th('wl', 'W-L', 'Actual record in the window')}
            ${th('season', 'Season avg', 'Average over every game this season through the as-of week')}
            ${th('delta', 'vs Before', 'Window average minus the average of the team\'s earlier games this season')}
            ${th('trend', 'Trend', 'Least-squares slope through the window: points gained (or lost) per game, game to game')}
            ${th('z', 'z', 'Standard deviations above or below the league\'s average trailing average')}
            ${th('pct', 'All-time pct', `Where this ${S.n}-game total ranks among every ${S.n}-game stretch on file (all seasons)`)}
            ${th('form', 'Form', 'Welch t-test of the window against the team\'s earlier games this season. Hot / Cold: p < .05; Warming / Cooling: p < .20')}
            </tr></thead><tbody>${list.map(t => `<tr class="${t.mgr === S.focus ? 'tf-sel' : ''}">
                <td class="num">${t.rank}</td><td data-tip="${esc(`${t.mgr}: ${wkSpan(t.from, t.to)}`)}">${who(t.mgr)}</td>
                <td class="num"><b>${f1(t.total)}</b></td><td class="num">${f1(t.avg)}</td><td class="num">${f1(t.med)}</td><td class="num">${f1(t.sd)}</td>
                <td class="num">${f1(t.lo)}</td><td class="num">${f1(t.hi)}</td><td class="num">${pc(t.allPlay, 1)}</td>
                <td class="num">${t.wins}-${t.losses}${t.ties ? '-' + t.ties : ''}</td><td class="num">${f1(t.seasonAvg)}</td>
                <td class="num ${t.delta >= 0 ? 'win' : 'loss'}">${sgn(t.delta)}</td><td class="num">${sgn(t.trend)}</td>
                <td class="num">${Number.isFinite(t.z) ? (t.z >= 0 ? '+' : '−') + Math.abs(t.z).toFixed(2) : '-'}</td><td class="num">${Number.isFinite(t.pct) ? ord(Math.round(t.pct * 100)) : '-'}</td>
                <td>${formOf(t)}</td></tr>`).join('')}</tbody></table></div>`;
    }

    function tiles() {
        const T = V.teams, by = (f, dir = -1) => T.filter(t => Number.isFinite(f(t))).sort((x, y) => dir * (f(x) - f(y)))[0];
        const lead = by(t => t.total), hot = by(t => t.test ? t.delta : NaN), cold = by(t => t.test ? t.delta : NaN, 1);
        const steady = by(t => t.W.length >= 3 ? t.sd : NaN, 1), wild = by(t => t.W.length >= 3 ? t.sd : NaN), ap = by(t => t.allPlay);
        const tile = (l, v, s, tip) => `<div class="stat-tile"><div class="v">${v}</div><div class="l" data-tip="${esc(tip)}">${l}</div><div class="s">${s}</div></div>`;
        const bt = V.bt.byN[S.n];
        return `<div class="stat-tiles tiles-4 tf-tiles">
            ${lead ? tile(`Top ${S.n}-game scorer`, f1(lead.total), `${esc(lead.mgr)} · ${f1(lead.avg)} a game · ${wkSpan(lead.from, lead.to)}`, 'Most points over the window') : ''}
            ${ap ? tile('Best all-play', pc(ap.allPlay, 1), `${esc(ap.mgr)} · share of the league outscored`, 'Highest share of the league outscored, week by week, across the window (ties count half)') : ''}
            ${tile('League trailing avg', f1(V.lgMean), `SD between teams ${f1(V.lgSd)}`, 'Average of every team\'s trailing average, and how spread out the teams are')}
            ${hot ? tile('Biggest jump', sgn(hot.delta), `${esc(hot.mgr)} · ${pv(hot.test.p)}`, 'Largest rise of the window average over the team\'s earlier games this season') : ''}
            ${cold ? tile('Biggest drop', sgn(cold.delta), `${esc(cold.mgr)} · ${pv(cold.test.p)}`, 'Largest fall of the window average below the team\'s earlier games this season') : ''}
            ${steady ? tile('Steadiest', f1(steady.sd), `${esc(steady.mgr)} · SD in the window`, 'Smallest standard deviation over the window (3+ games)') : ''}
            ${wild ? tile('Most volatile', f1(wild.sd), `${esc(wild.mgr)} · SD in the window`, 'Largest standard deviation over the window (3+ games)') : ''}
            ${bt ? tile(`Model miss, ${S.n} games`, `±${f1(bt.sigma)}`, `Raw average misses by ±${f1(bt.rmse)} · r ${bt.r.toFixed(2)}`, `League history: how far the model's expected score lands from the next game (RMSE), against the raw ${S.n}-game average's miss, and how closely the raw average tracks the next score`) : ''}
        </div>`;
    }

    // dot strip: every window score per manager, with the range, mean ± 1 SD band and median tick on one shared scale
    function strip() {
        const T = V.teams.slice().sort((x, y) => y.med - x.med);
        const all = T.flatMap(t => t.w), lo = Math.floor((Math.min(...all) - 5) / 10) * 10, hi = Math.ceil((Math.max(...all) + 5) / 10) * 10;
        const x = v => `${((clamp(v, lo, hi) - lo) / (hi - lo) * 100).toFixed(2)}%`;
        const step = (hi - lo) > 120 ? 20 : 10, ticks = [];
        for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
        const lgMed = median(all);
        return `<div class="table-scroll"><div class="tf-strip" style="min-width:720px">
            <div class="tf-srow tf-axis"><span></span><div class="tf-track">${ticks.map(v => `<span class="tf-tick" style="left:${x(v)}">${v}</span>`).join('')}</div><span class="tf-sv muted">Median</span></div>
            ${T.map(t => `<div class="tf-srow${t.mgr === S.focus ? ' tf-sel' : ''}">${who(t.mgr)}<div class="tf-track">
                <span class="tf-grid" style="left:${x(lgMed)}" data-tip="League median of all window scores: ${f1(lgMed)}"></span>
                <span class="tf-range" style="left:${x(t.lo)};width:calc(${x(t.hi)} - ${x(t.lo)})"></span>
                ${Number.isFinite(t.sd) ? `<span class="tf-band" style="left:${x(t.avg - t.sd)};width:calc(${x(t.avg + t.sd)} - ${x(t.avg - t.sd)})" data-tip="${esc(`${t.mgr}: average ${f1(t.avg)}, ±1 SD ${f1(t.avg - t.sd)} to ${f1(t.avg + t.sd)}`)}"></span>` : ''}
                <span class="tf-med" style="left:${x(t.med)}" data-tip="${esc(`${t.mgr}: median ${f1(t.med)}`)}"></span>
                ${t.W.map(r => `<span class="tf-dot" style="left:${x(r.pf)}" data-tip="${esc(`${t.mgr} · ${GT.periodLabel(r.period, r.week)}${r.opp ? ` vs ${r.opp}` : ''}: ${f1(r.pf)}${r.pa != null ? ` - ${f1(r.pa)}` : ''}`)}"></span>`).join('')}
                </div><span class="tf-sv"><b>${f1(t.med)}</b></span></div>`).join('')}
            </div></div>
            <div class="tf-legend"><span><i class="tf-k-dot"></i>One game</span><span><i class="tf-k-band"></i>Average ± 1 SD</span><span><i class="tf-k-med"></i>Median</span>
                <span><i class="tf-k-range"></i>Low to high</span><span><i class="tf-k-grid"></i>League median ${f1(lgMed)}</span></div>`;
    }

    function nextWeek() {
        const F = V.field.slice().sort((x, y) => y.sim.top - x.sim.top || y.mu - x.mu);
        const have = V.played;
        const actRank = {};
        if (have) Object.entries(V.actual).sort((x, y) => y[1] - x[1]).forEach(([m], i) => { actRank[m] = i + 1; });
        const fieldTable = `<div class="table-scroll"><table class="data-table" style="min-width:1060px">${SITE.cols('17%', '8%', '7%', '9%', '9%', '9%', '8%', '8%', '9%', '16%')}<thead><tr>
            <th>Manager</th><th class="num" data-tip="Model's expected score: the trailing average pulled toward this season's league average by the carry-over share history supports">Expected</th><th class="num" data-tip="Model's spread (σ) for this team: the model's typical miss for this window, scaled by the team's own volatility this season">Spread</th>
            <th class="num" data-tip="Chance of the week's highest score among the teams playing">Top score</th><th class="num" data-tip="Chance of finishing in the top half of the week's scores">Top half</th>
            <th class="num" data-tip="Chance of the week's lowest score">Low score</th><th class="num" data-tip="Chance of 150 or more points">150+</th><th class="num" data-tip="Chance of fewer than 100 points">Under 100</th>
            <th class="num" data-tip="Average finish among the week's scores across the simulations">Exp. rank</th><th class="num">${have ? 'Actual (rank)' : 'Actual'}</th></tr></thead><tbody>
            ${F.map(t => `<tr class="${t.mgr === S.focus ? 'tf-sel' : ''}"><td>${who(t.mgr)}</td><td class="num"><b>${f1(t.mu)}</b></td><td class="num">${f1(t.sigma)}</td>
                <td class="num">${odds(t.sim.top)}</td><td class="num">${odds(t.sim.half)}</td><td class="num">${odds(t.sim.bot)}</td>
                <td class="num">${odds(t.sim.over150)}</td><td class="num">${odds(t.sim.under100)}</td><td class="num">${t.sim.rank.toFixed(1)}</td>
                <td class="num">${have && V.actual[t.mgr] != null ? `${f1(V.actual[t.mgr])} <span class="muted">(${ord(actRank[t.mgr])})</span>` : '<span class="muted">Not played</span>'}</td></tr>`).join('')}
            </tbody></table></div>`;
        const games = V.pairs.map(([a, c, r]) => {
            const A = V.teams.find(t => t.mgr === a), C = V.teams.find(t => t.mgr === c);
            const pA = winProb(A.mu, A.sigma, C.mu, C.sigma), fav = pA >= 0.5 ? A : C, dog = fav === A ? C : A, p = Math.max(pA, 1 - pA);
            let res = '<span class="muted">Not played</span>';
            if (r && r.pa != null) {
                const favPts = fav.mgr === r.mgr ? r.pf : r.pa, dogPts = fav.mgr === r.mgr ? r.pa : r.pf;
                res = favPts === dogPts ? `Tie ${f1(favPts)}` : `<span class="${favPts > dogPts ? 'win' : 'loss'}">${favPts > dogPts ? 'Favorite won' : 'Upset'}</span> <span class="muted">· ${f1(favPts)}-${f1(dogPts)}</span>`;
            }
            return `<tr><td>${who(fav.mgr)}</td><td>${who(dog.mgr)}</td><td class="num">${f1(fav.mu - dog.mu)}</td><td class="num"><b>${odds(p)}</b></td><td>${res}</td></tr>`;
        }).join('');
        const pk = V.picksW + V.picksL;
        return `${V.pairs.length ? `<h4 class="tf-h4">${esc(V.nextLabel)} matchups</h4>
            <div class="table-scroll"><table class="data-table" style="min-width:820px">${SITE.cols('24%', '24%', '12%', '12%', '28%')}<thead><tr><th>Form favorite</th><th>Underdog</th>
                <th class="num" data-tip="Difference in the model's expected scores (trailing averages after regression to the mean)">Edge</th><th class="num" data-tip="Chance the favorite outscores the underdog: Normal model, both teams' spreads combined">Win chance</th><th>Result</th></tr></thead>
                <tbody>${games}</tbody></table></div>` : ''}
            <p class="tf-sub">${pk ? `Form favorites (higher ${S.n}-game average going in) are <b>${V.picksW}-${V.picksL}</b> (${pc(V.picksW / pk, 1)}) in ${season} games through week ${S.week}.` : ''}
                Every figure models next week's score as Normal around the trailing average pulled toward the league average (${f1(V.lmNow)} this season), with the spread history says that estimate deserves.</p>
            <h4 class="tf-h4">${V.pairs.length ? `${esc(V.nextLabel)}: the field` : 'If they played again tomorrow'}</h4>${fieldTable}`;
    }

    // head-to-head grid: chance the row team outscores the column team
    function matrix() {
        const T = V.teams.slice().sort((x, y) => y.mu - x.mu), n = T.length, w = (84 / n).toFixed(3);
        const cell = (a, c) => {
            if (a === c) return '<td class="tf-p tf-self"></td>';
            const p = winProb(a.mu, a.sigma, c.mu, c.sigma), k = Math.round(Math.abs(p - 0.5) * 2 * 70);
            const bg = p >= 0.5 ? `color-mix(in srgb, var(--win) ${k}%, var(--surface))` : `color-mix(in srgb, var(--loss) ${k}%, var(--surface))`;
            return `<td class="tf-p" style="background:${bg}" data-tip="${esc(`${a.mgr} beats ${c.mgr}: ${odds(p)}`)}">${Math.round(p * 100)}</td>`;
        };
        return `<div class="table-scroll"><table class="data-table tf-matrix" style="min-width:${180 + n * 44}px">${SITE.cols('16%', ...T.map(() => `${w}%`))}<thead><tr><th>Row beats column</th>
            ${T.map(t => `<th class="tf-mh" data-tip="${esc(t.mgr)}"><img src="${GT.logo(t.mgr)}" alt="${esc(t.mgr)}"></th>`).join('')}</tr></thead><tbody>
            ${T.map(a => `<tr class="${a.mgr === S.focus ? 'tf-sel' : ''}"><td>${who(a.mgr)}</td>${T.map(c => cell(a, c)).join('')}</tr>`).join('')}</tbody></table></div>
            <div class="tf-legend"><span><i class="tf-k-win"></i>Row team favored</span><span><i class="tf-k-even"></i>Even</span><span><i class="tf-k-loss"></i>Column team favored</span>
                <span>Numbers are win chances in percent. Deeper colour = bigger edge.</span></div>`;
    }

    function predictive() {
        const bt = V.bt.byN, Ns = [...Array.from({ length: NMAX }, (_, i) => i + 1), 'S'];
        const best = Ns.reduce((m, N) => bt[N].sigma < bt[m].sigma ? N : m, 1);
        const name = N => N === 'S' ? 'Season to date' : `Last ${N} game${N === 1 ? '' : 's'}`;
        const table = `<div class="table-scroll"><table class="data-table" style="min-width:1000px">${SITE.cols('16%', '8%', '7%', '8%', '7%', '7%', '7%', '8%', '8%', '9%', '7%', '8%')}<thead><tr>
            <th>Predictor</th><th class="num" data-tip="Games predicted (completed seasons; a team needs N earlier games that season)">Games</th>
            <th class="num" data-tip="Raw trailing average: mean absolute miss of the next score, in points">MAE</th>
            <th class="num" data-tip="Raw trailing average: root mean square miss of the next score">RMSE</th>
            <th class="num" data-tip="Average of next score minus the raw trailing average: positive = scores tend to beat it">Bias</th>
            <th class="num" data-tip="Correlation between the raw trailing average and the next score">r</th><th class="num" data-tip="Share of next-week score variation the raw trailing average explains">R²</th>
            <th class="num" data-tip="Share of a team's distance from the league average that carries into the next game (1 = all of it, 0 = none). The model's expected score keeps only this share (β in the method notes).">Carry-over</th>
            <th class="num" data-tip="The model's miss (RMSE) after regressing toward the league average: the σ used for every probability on this page">Model miss</th>
            <th class="num" data-tip="Games where the team with the higher trailing average won">Fav W-L</th><th class="num">Fav %</th>
            <th class="num" data-tip="Brier score of the model's win chances (lower is better; 0.25 = calling every game a coin flip)">Brier</th></tr></thead><tbody>
            ${Ns.map(N => { const x = bt[N], g = x.right + x.wrong;
                return `<tr class="${N === S.n ? 'tf-sel' : ''}"><td><b>${name(N)}</b>${N === best ? ' <span class="pill pill-accent">Best</span>' : ''}</td><td class="num">${x.games.toLocaleString()}</td>
                    <td class="num">${f1(x.mae)}</td><td class="num">${f1(x.rmse)}</td><td class="num">${sgn(x.bias)}</td><td class="num">${x.r.toFixed(3)}</td>
                    <td class="num">${pc(x.r * x.r, 1)}</td><td class="num">${x.beta.toFixed(2)}</td><td class="num"><b>${f1(x.sigma)}</b></td>
                    <td class="num">${x.right}-${x.wrong}</td><td class="num">${pc(x.right / g, 1)}</td><td class="num">${x.brier.toFixed(3)}</td></tr>`; }).join('')}
            </tbody></table></div>`;
        const cal = bt[S.n].cal;
        const calTable = `<div class="table-scroll"><table class="data-table" style="min-width:520px">${SITE.cols('28%', '16%', '20%', '18%', '18%')}<thead><tr>
            <th>Favorite's chance</th><th class="num">Games</th><th class="num" data-tip="Average win chance the model gave the favorites in this band">Predicted</th>
            <th class="num" data-tip="How often those favorites actually won">Actual</th><th class="num" data-tip="Actual minus predicted: positive = the model undersold the favorites">Gap</th></tr></thead><tbody>
            ${cal.map(c => `<tr><td>${Math.round(c.lo * 100)}-${Math.min(100, Math.round(c.hi * 100))}%</td><td class="num">${c.n}</td>
                <td class="num">${c.n ? pc(c.p / c.n, 1) : '-'}</td><td class="num">${c.n ? pc(c.won / c.n, 1) : '-'}</td>
                <td class="num ${c.n ? (c.won / c.n >= c.p / c.n ? 'win' : 'loss') : ''}">${c.n ? `${c.won / c.n >= c.p / c.n ? '+' : '−'}${(Math.abs(c.won / c.n - c.p / c.n) * 100).toFixed(1)}` : '-'}</td></tr>`).join('')}
            </tbody></table></div>`;
        const sel = bt[S.n], st = bt.S;
        const verdict = `Taken at face value, a ${S.n}-game average has missed the next score by ±${f1(sel.rmse)} (season to date: ±${f1(st.rmse)}).
            Only <b>${Math.round(sel.beta * 100)}%</b> of a team's distance from the league average over its last ${S.n} game${S.n === 1 ? '' : 's'} has carried into the next game; the rest was noise.
            So the model expects league average + ${sel.beta.toFixed(2)} × (trailing average − league average), which misses by ±${f1(sel.sigma)}.
            ${sel.sigma <= st.sigma ? `That beats the season-to-date version (±${f1(st.sigma)}): recent form has carried real signal.` : `The season-to-date version does better (±${f1(st.sigma)}): over league history, recent form has been noisier than the full-season picture.`}
            The sharpest window on file is <b>${name(best).toLowerCase()}</b>.`;
        return `<p class="tf-sub">${verdict}</p>${table}
            <h4 class="tf-h4">Are the win chances honest? Last ${S.n} game${S.n === 1 ? '' : 's'}</h4>
            <p class="tf-sub">Every completed-season game the model could call, grouped by how sure it was. When the actual column tracks the predicted one, the percentages on this page can be read at face value.</p>${calTable}`;
    }

    function records() {
        const { list } = stretches(S.games, S.n);
        const best = list.slice().sort((x, y) => y.total - x.total).slice(0, 10), worst = list.slice().sort((x, y) => x.total - y.total).slice(0, 10);
        const tbl = (L, title) => `<div><h4 class="tf-h4">${title}</h4><div class="table-scroll"><table class="data-table" style="min-width:440px">${SITE.cols('8%', '38%', '14%', '18%', '22%')}<thead><tr>
            <th class="num">#</th><th>Manager</th><th class="num">Season</th><th>Weeks</th><th class="num">Total (avg)</th></tr></thead><tbody>
            ${L.map((x, i) => `<tr class="${x.season === season ? 'tf-sel' : ''}"><td class="num">${i + 1}</td><td>${who(x.mgr)}</td><td class="num">${x.season}</td><td>${wkSpan(x.from, x.to)}</td>
                <td class="num"><b>${f1(x.total)}</b> <span class="muted">(${f1(x.total / S.n)})</span></td></tr>`).join('')}</tbody></table></div></div>`;
        return `<div class="tf-two">${tbl(best, `Best ${S.n}-game stretches`)}${tbl(worst, `Worst ${S.n}-game stretches`)}</div>
            <p class="tf-sub">${list.length.toLocaleString()} stretches of ${S.n} straight games on file (${S.games === 'reg' ? 'regular season' : 'all games'}, a stretch stays inside one season). Highlighted rows are from ${season}.</p>`;
    }

    function drawChart() {
        const el = document.getElementById('tf-chart');
        if (!el || !window.echarts) return;
        if (chart) chart.dispose();
        chart = echarts.init(el);
        const muted = SITE.color('muted'), grid = SITE.color('track'), ink = SITE.color('ink'), faint = SITE.color('line-strong'), accent = SITE.color('accent');
        const weeks = V.weeks, mgrs = Object.keys(V.paths);
        const focus = S.focus && V.paths[S.focus] ? S.focus : (V.teams[0] || {}).mgr;
        const med = weeks.map(w => { const v = mgrs.map(m => V.paths[m][w]).filter(Number.isFinite); return v.length ? Math.round(median(v) * 10) / 10 : null; });
        const val = (m, w) => Number.isFinite(V.paths[m][w]) ? Math.round(V.paths[m][w] * 10) / 10 : null;
        chart.setOption({
            textStyle: { fontFamily: 'Inter, sans-serif' }, animationDuration: 400,
            grid: { left: 48, right: 110, top: 36, bottom: 36 },
            legend: { top: 0, left: 'center', data: [focus, 'League median'], textStyle: { color: muted, fontSize: 10.5 }, itemWidth: 14, itemHeight: 8, selectedMode: false },
            tooltip: { trigger: 'axis', backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 },
                       axisPointer: { type: 'line', lineStyle: { color: faint } },
                       formatter: ps => { const i = ps[0].dataIndex, w = weeks[i];
                           const ranked = mgrs.map(m => [m, V.paths[m][w]]).filter(x => Number.isFinite(x[1])).sort((x, y) => y[1] - x[1]);
                           const pos = ranked.findIndex(x => x[0] === focus);
                           return `<b>${esc(GT.periodLabel(V.periodOf[w], w))}</b> · ${S.n}-game average<br>` +
                               ranked.slice(0, 3).map((x, k) => `${k + 1}. ${esc(x[0])} ${f1(x[1])}`).join('<br>') +
                               (pos >= 3 ? `<br>${pos + 1}. <b>${esc(focus)}</b> ${f1(ranked[pos][1])}` : '') +
                               `<br>League median ${f1(med[i])}`; } },
            xAxis: { type: 'category', data: weeks.map(w => `W${w}`), boundaryGap: false, axisLabel: { color: muted }, axisLine: { lineStyle: { color: faint } }, axisTick: { show: false } },
            yAxis: { type: 'value', scale: true, name: `${S.n}-game avg`, nameTextStyle: { color: muted, fontSize: 10 }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: grid } } },
            series: [
                ...mgrs.filter(m => m !== focus).map(m => ({ name: m, type: 'line', showSymbol: false, connectNulls: true, silent: true, z: 1,
                    lineStyle: { width: 1.2, color: faint, opacity: 0.7 }, itemStyle: { color: faint }, emphasis: { disabled: true }, data: weeks.map(w => val(m, w)) })),
                { name: 'League median', type: 'line', showSymbol: false, connectNulls: true, z: 2, lineStyle: { width: 2, type: 'dashed', color: ink }, itemStyle: { color: ink }, data: med },
                { name: focus, type: 'line', connectNulls: true, z: 3, symbol: 'circle', symbolSize: 8, showSymbol: true,
                  lineStyle: { width: 2.5, color: accent }, itemStyle: { color: accent, borderColor: SITE.color('surface'), borderWidth: 2 },
                  endLabel: { show: true, formatter: '{a}', color: ink, fontSize: 11, fontWeight: 700, distance: 8 }, data: weeks.map(w => val(focus, w)),
                  markLine: { silent: true, symbol: 'none', animation: false, lineStyle: { color: muted, type: 'solid', width: 1 },
                              label: { formatter: 'As of', color: muted, fontSize: 10, position: 'insideEndTop' }, data: [{ xAxis: `W${S.week}` }] } }
            ]
        });
    }

    function render() {
        V = compute();
        if (!V.teams.length) { content.innerHTML = '<div class="wrap page-pad"><div class="panel" style="margin-top:34px"><p class="muted">No games played yet this season.</p></div></div>'; return; }
        const focusName = S.focus && V.teams.some(t => t.mgr === S.focus) ? S.focus : V.teams[0].mgr;
        const label = GT.periodLabel(V.periodOf[S.week], S.week);
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">${season} · as of ${esc(label)} · last ${S.n} game${S.n === 1 ? '' : 's'}</div><h2 class="section-title">Trailing Form</h2>
                <p class="section-copy" style="max-width:640px">Each manager's last ${S.n} game${S.n === 1 ? '' : 's'} played on or before the chosen week, ${S.games === 'reg' ? 'regular season only' : 'playoffs and Gulag included'}. A team that sat out a week (a bye) reaches back one more week.</p></div>
                <div class="tf-ctl">
                    <label>As of<select class="select" id="tf-week">${V.weeks.map(w => `<option value="${w}"${w === S.week ? ' selected' : ''}>${esc(GT.periodLabel(V.periodOf[w], w))}</option>`).join('')}</select></label>
                    <label>Window<select class="select" id="tf-n">${Array.from({ length: NMAX }, (_, i) => i + 1).map(n => `<option value="${n}"${n === S.n ? ' selected' : ''}>Last ${n} game${n === 1 ? '' : 's'}</option>`).join('')}</select></label>
                    <label>Games<span class="seg seg-eq" id="tf-games"><button data-k="all" class="${S.games === 'all' ? 'on' : ''}">All</button><button data-k="reg" class="${S.games === 'reg' ? 'on' : ''}">Regular</button></span></label>
                </div></div>
            ${tiles()}
            <div class="panel"><h3 class="panel-title">Leaderboard</h3><p class="tf-sub">Ranked by trailing average (the # column). Click any heading to sort; hover a heading for its definition.</p>${leaderboard()}</div>
            <div class="panel"><div class="tf-head"><div><h3 class="panel-title">Form Through the Season</h3><p class="tf-sub">Every manager's rolling ${S.n}-game average, week by week. Pick a manager to trace.</p></div>
                <label class="tf-ctl-one">Manager<select class="select" id="tf-focus">${V.teams.slice().sort((x, y) => x.mgr.localeCompare(y.mgr)).map(t => `<option${t.mgr === focusName ? ' selected' : ''}>${esc(t.mgr)}</option>`).join('')}</select></label></div>
                <div id="tf-chart" class="tf-chart" role="img" aria-label="Rolling ${S.n}-game scoring average by week for every manager"></div></div>
            <div class="panel"><h3 class="panel-title">Spread in the Window</h3><p class="tf-sub">Every score in each manager's window on one scale, sorted by median. A wide band means boom-or-bust; a tight cluster means you know what you're getting.</p>${strip()}</div>
            <div class="panel"><h3 class="panel-title">${V.pairs.length ? `Next Up: ${esc(V.nextLabel)}` : 'Odds From Here'}</h3>${nextWeek()}</div>
            <div class="panel"><h3 class="panel-title">Head-to-Head Odds</h3><p class="tf-sub">Chance each team (row) outscores each other team (column) if they met next week, from current form. Sorted by trailing average.</p>${matrix()}</div>
            <div class="panel"><h3 class="panel-title">Does Trailing Form Predict Anything?</h3>${predictive()}</div>
            <div class="panel"><h3 class="panel-title">${S.n}-Game Stretches on File</h3>${records()}</div>
            <div class="panel tf-method"><h3 class="panel-title">How It's Calculated</h3><ul>
                <li><b>Window.</b> The last ${S.n} games each manager played on or before the as-of week. Stats are the plain total, average, median, sample SD (n − 1), low and high of those scores.</li>
                <li><b>All-play.</b> For each game in the window, the share of the rest of the league that scored less that week (ties count half), averaged. It is a record with schedule luck removed.</li>
                <li><b>vs Before and Form.</b> The window average minus the average of the team's earlier games this season. Form is Welch's two-sample t-test between those two groups: p is the chance of a gap this big if nothing had really changed. Small windows and short seasons rarely reach significance, and that is the honest answer.</li>
                <li><b>Trend.</b> The least-squares slope through the window's scores in game order, in points per game.</li>
                <li><b>z and All-time pct.</b> z compares the trailing average with the league's trailing averages this week. All-time pct places the ${S.n}-game total among every ${S.n}-game stretch on file, all seasons.</li>
                <li><b>Expected score.</b> A raw trailing average overstates how good or bad a team is, because part of any hot or cold run is luck that won't repeat. Across completed seasons, the model measures the carry-over share β: next score − league average = β × (trailing average − league average), fitted by least squares, with the league average taken from that season's earlier games. The expected score is μ = league average + β × (trailing average − league average).</li>
                <li><b>Probabilities.</b> Next week's score is modelled as Normal(μ, σ). σ starts from the model's historical miss for this window (Model miss in the table), then is scaled by how volatile the team has been this season, with that volatility pulled toward the league norm as if it had 4 extra average games. Matchup odds use Φ((μA − μB) / √(σA² + σB²)). Top, bottom, top-half and expected rank come from ${(20000).toLocaleString()} simulated weeks. 150+ and under-100 chances are read straight off the Normal curve.</li>
                <li><b>Backtest.</b> Every game in a completed season is predicted from the same team's previous games that season and the league's earlier games, nothing later. The raw columns score the plain trailing average; Carry-over (β), Model miss (σ) and Brier score the model. Calibration groups the model's win chances in 10-point bands and compares them with how often the favorite really won.</li>
            </ul></div></div>`;
        bind();
        drawChart();
    }

    function sync() {
        const u = new URL(location.href);
        u.searchParams.set('season', season); u.searchParams.set('week', S.week); u.searchParams.set('n', S.n);
        if (S.games === 'reg') u.searchParams.set('games', 'reg'); else u.searchParams.delete('games');
        if (S.focus) u.searchParams.set('m', S.focus); else u.searchParams.delete('m');
        history.replaceState(null, '', u);
    }
    function bind() {
        const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
        const keepY = fn => { const y = window.scrollY; fn(); sync(); render(); window.scrollTo(0, y); };
        on('tf-week', 'change', e => keepY(() => { S.week = Number(e.target.value); }));
        on('tf-n', 'change', e => keepY(() => { S.n = Number(e.target.value); }));
        on('tf-focus', 'change', e => keepY(() => { S.focus = e.target.value; }));
        document.querySelectorAll('#tf-games button').forEach(btn => btn.addEventListener('click', () => keepY(() => { S.games = btn.dataset.k; })));
        document.querySelectorAll('.tf-lb th[data-sort]').forEach(h => h.addEventListener('click', () => keepY(() => {
            const k = h.dataset.sort; if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = k === 'mgr' ? 1 : -1; } })));
    }

    try {
        render();
        window.addEventListener('resize', () => chart && chart.resize());
        window.addEventListener('themechange', drawChart);
    } catch (error) {
        console.error('Trailing form error:', error);
        content.innerHTML = '<div class="wrap"><div class="panel">Error loading data.</div></div>';
    }
})();
