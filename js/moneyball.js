/* Moneyball (League Analytics): what it takes to win here. Scoring distributions, the win curve, the wins and points
   it takes to make the playoffs, and "quads" (teams grouped 1-4 / 5-8 / 9-12 / 13-16 by final standings, and by weekly
   score rank). Regular season only. Mounted once below the dashboard; it has its own scope picker. */
window.MONEYBALL = (() => {
    const { esc } = SITE;
    const pts = v => (v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1));
    const pct = (v, d = 0) => (v == null || isNaN(v) ? '-' : `${(v * 100).toFixed(d)}%`);
    const quantile = (sorted, q) => { if (!sorted.length) return null; const i = (sorted.length - 1) * q, lo = Math.floor(i); return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo); };
    const mean = list => (list.length ? list.reduce((t, v) => t + v, 0) / list.length : null);
    const QUADS = ['1–4', '5–8', '9–12', '13–16'];
    let host, data, scope = 'completed', charts = [], tab = 'win', posData = null, posCharts = [];

    async function load() {
        const [games, teams] = await Promise.all([
            GT.query(`SELECT m.season, m.week, t.owner_id AS id, o.display_name AS mgr, t.team_score AS pf, t.opponent_score AS pa
                      FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                      WHERE m.season_period = 'Regular' AND t.team_score IS NOT NULL AND t.opponent_score IS NOT NULL`),
            LeagueDb.seasonTeamRows()
        ]);
        const completed = [...new Set(teams.filter(t => t.place != null).map(t => t.season))].sort();
        // each team-season: record, scoring, final regular-season rank (record, then points for), and how it ended
        teams.forEach(t => {
            t.g = t.wins + t.losses + t.ties; t.pct = t.g ? (t.wins + t.ties / 2) / t.g : 0;
            t.ppg = t.g ? t.pointsFor / t.g : 0; t.papg = t.g ? t.pointsAgainst / t.g : 0;
            t.made = t.bracketType === 'championship'; t.title = t.place === 1;
        });
        [...new Set(teams.map(t => t.season))].forEach(s => {
            teams.filter(t => t.season === s).sort((x, y) => y.pct - x.pct || y.pointsFor - x.pointsFor).forEach((t, i, all) => {
                t.rank = i + 1; t.quad = Math.min(3, Math.floor(i / Math.ceil(all.length / 4)));
            });
        });
        // each game: that week's score rank
        const weeks = {};
        games.forEach(g => { (weeks[`${g.season}|${g.week}`] = weeks[`${g.season}|${g.week}`] || []).push(g); });
        Object.values(weeks).forEach(list => list.sort((x, y) => y.pf - x.pf).forEach((g, i) => {
            g.wkRank = i + 1; g.wkQuad = Math.min(3, Math.floor(i / Math.ceil(list.length / 4))); g.won = g.pf > g.pa ? 1 : g.pf === g.pa ? 0.5 : 0;
        }));
        return { games, teams, completed, seasons: [...new Set(teams.map(t => t.season))].sort((x, y) => y - x) };
    }

    // ---------------------------------------------------------------- numbers for one scope
    function analyse() {
        const inScope = s => (scope === 'completed' ? data.completed.includes(s) : scope === 'all' ? true : s === Number(scope));
        const games = data.games.filter(g => inScope(g.season));
        const teams = data.teams.filter(t => inScope(t.season));
        const decided = teams.filter(t => t.place != null);                        // seasons with a finished bracket
        const scores = games.map(g => g.pf).sort((x, y) => x - y);

        // win curve: share of games won at each 10-point score band
        const lo = Math.floor((scores[0] || 60) / 10) * 10, hi = Math.ceil((scores[scores.length - 1] || 200) / 10) * 10;
        const bands = [];
        for (let b = lo; b < hi; b += 10) {
            const g = games.filter(x => x.pf >= b && x.pf < b + 10);
            bands.push({ b, n: g.length, win: g.length ? g.reduce((t, x) => t + x.won, 0) / g.length : null });
        }
        // the score that wins X% of the time: smallest band from which the win share stays at or above X
        const scoreFor = p => { for (let i = 0; i < bands.length; i++) if (bands.slice(i).filter(x => x.n >= 5).every(x => x.win >= p) && bands[i].n >= 5) return bands[i].b; return null; };

        // wins -> playoffs
        const winTotals = [...new Set(decided.map(t => t.wins))].sort((x, y) => x - y);
        const byWins = winTotals.map(w => { const list = decided.filter(t => t.wins === w); return { w, n: list.length, made: mean(list.map(t => +t.made)), title: mean(list.map(t => +t.title)) }; });
        const lineAt = p => { const hit = byWins.find((x, i) => byWins.slice(i).every(y => y.made >= p)); return hit ? hit.w : null; };
        const fewestIn = decided.filter(t => t.made).reduce((m, t) => Math.min(m, t.wins), Infinity);
        const mostOut = decided.filter(t => !t.made).reduce((m, t) => Math.max(m, t.wins), -Infinity);

        // points per game -> wins (least squares), and the scoring line for the playoffs
        const xs = teams.map(t => t.ppg), ys = teams.map(t => t.wins);
        const mx = mean(xs), my = mean(ys);
        const slope = xs.length > 2 ? xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0) / xs.reduce((t, x) => t + (x - mx) ** 2, 0) : null;
        const icpt = slope == null ? null : my - slope * mx;
        const r = xs.length > 2 ? xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0) / Math.sqrt(xs.reduce((t, x) => t + (x - mx) ** 2, 0) * ys.reduce((t, y) => t + (y - my) ** 2, 0)) : null;
        // scoring line: logistic fit of making the bracket on points per game above that season's average
        // (scoring levels change year to year, so each team is measured against its own season)
        const seasonAvg = {};
        decided.forEach(t => { (seasonAvg[t.season] = seasonAvg[t.season] || []).push(t.ppg); });
        Object.keys(seasonAvg).forEach(k => { seasonAvg[k] = mean(seasonAvg[k]); });
        const fit = (() => {
            const pts2 = decided.map(t => [t.ppg - seasonAvg[t.season], +t.made]);
            if (pts2.length < 12) return null;
            let a = 0, b = 0;
            for (let it = 0; it < 50; it++) {                // Newton-Raphson
                let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
                pts2.forEach(([x, y]) => { const pr = 1 / (1 + Math.exp(-(a + b * x))), w = pr * (1 - pr); ga += y - pr; gb += (y - pr) * x; haa += w; hab += w * x; hbb += w * x * x; });
                const det = haa * hbb - hab * hab;
                if (Math.abs(det) < 1e-9) break;
                a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det;
            }
            return b > 0 ? { at: p => (Math.log(p / (1 - p)) - a) / b } : null;
        })();
        const lg = mean(teams.map(t => t.ppg));
        const enough = mean(teams.map(t => t.g)) >= 8;            // season-level figures need most of a season

        // quads by final standings, and by weekly score rank
        const quads = QUADS.map((label, q) => {
            const list = teams.filter(t => t.quad === q), fin = list.filter(t => t.place != null);
            const p = list.map(t => t.ppg).sort((x, y) => x - y);
            return { label, n: list.length, wins: mean(list.map(t => t.wins)), losses: mean(list.map(t => t.losses)), ppg: mean(p), lo: p[0], hi: p[p.length - 1],
                     papg: mean(list.map(t => t.papg)), made: fin.length ? mean(fin.map(t => +t.made)) : null, title: fin.length ? mean(fin.map(t => +t.title)) : null,
                     finish: fin.length ? mean(fin.map(t => t.place)) : null };
        });
        const wkQuads = QUADS.map((label, q) => {
            const list = games.filter(g => g.wkQuad === q), s = list.map(g => g.pf).sort((x, y) => x - y);
            return { label, n: list.length, win: mean(list.map(g => g.won)), avg: mean(s), lo: s[0], hi: s[s.length - 1], med: quantile(s, 0.5) };
        });
        const bySeason = data.seasons.slice().reverse().filter(inScope).map(s => {
            const v = data.games.filter(g => g.season === s).map(g => g.pf).sort((x, y) => x - y);
            return { s, box: [v[0], quantile(v, 0.25), quantile(v, 0.5), quantile(v, 0.75), v[v.length - 1]], avg: mean(v) };
        });
        return { games, teams, decided, scores, bands, scoreFor, byWins, lineAt, fewestIn, mostOut, slope, icpt, r, fit, lg, enough, quads, wkQuads, bySeason,
                 q: { p25: quantile(scores, 0.25), p50: quantile(scores, 0.5), p75: quantile(scores, 0.75), p90: quantile(scores, 0.9) } };
    }

    // ---------------------------------------------------------------- page
    function render() {
        charts.forEach(c => c.dispose()); charts = [];
        const A = analyse();
        const label = scope === 'completed' ? `${data.completed.length} completed seasons` : scope === 'all' ? 'every season' : scope;
        const line50 = A.lineAt(0.5), line90 = A.lineAt(0.9);
        const w50 = A.scoreFor(0.5), w75 = A.scoreFor(0.75), w90 = A.scoreFor(0.9);
        const card = (k, v, s) => `<div class="db-kpi"><span>${k}</span><b>${v}</b><small>${s}</small></div>`;
        const noPlayoffs = !A.decided.length;
        host.querySelector('#mb-cards').innerHTML =
            card('Playoff line', noPlayoffs || line50 == null ? '-' : `${line50} wins`, noPlayoffs ? 'no finished playoffs in this scope' : `half of ${line50}-win teams made it${A.fewestIn !== Infinity ? ` · fewest ever: ${A.fewestIn}` : ''}`)
            + card('Lock', noPlayoffs || line90 == null ? '-' : `${line90} wins`, noPlayoffs ? '' : `90%+ made it${A.mostOut !== -Infinity ? ` · most left out: ${A.mostOut}` : ''}`)
            + card('Scoring line', !A.fit ? '-' : `${A.fit.at(0.5) >= 0 ? '+' : ''}${pts(A.fit.at(0.5))} / g`, !A.fit ? 'needs finished seasons'
                   : `over the season average for a 50% shot (≈ ${pts(A.lg + A.fit.at(0.5))} at ${pts(A.lg)} avg) · ${A.fit.at(0.8) >= 0 ? '+' : ''}${pts(A.fit.at(0.8))} for 80%`)
            + card('Score to win', w50 == null ? '-' : `${w50}+`, `wins half the time${w75 != null ? ` · ${w75}+ wins 75%` : ''}${w90 != null ? ` · ${w90}+ wins 90%` : ''}`)
            + card('Cost of a win', A.slope && A.enough ? `${pts(1 / A.slope)} / g` : '-', A.slope && A.enough ? `extra points per game for one more win (r = ${A.r.toFixed(2)})` : 'needs most of a season')
            + card('Median week', pts(A.q.p50), `middle half ${pts(A.q.p25)}–${pts(A.q.p75)} · top 10% ${pts(A.q.p90)}+`);

        const qRow = q => `<tr><td><b>${q.label}</b></td><td class="num">${q.n}</td><td class="num">${q.wins == null ? '-' : `${q.wins.toFixed(1)}-${q.losses.toFixed(1)}`}</td>
            <td class="num"><b>${pts(q.ppg)}</b></td><td class="num">${pts(q.lo)}–${pts(q.hi)}</td><td class="num">${pts(q.papg)}</td>
            <td class="num">${pct(q.made)}</td><td class="num">${pct(q.title)}</td><td class="num">${q.finish == null ? '-' : q.finish.toFixed(1)}</td></tr>`;
        host.querySelector('#mb-quads').innerHTML = `<div class="table-scroll"><table class="data-table" style="min-width:760px">${SITE.cols('12%', '7%', '13%', '11%', '17%', '11%', '10%', '9%', '10%')}
            <thead><tr><th>Finished</th><th class="num">Teams</th><th class="num">Avg W-L</th><th class="num">PPG</th><th class="num">PPG range</th><th class="num">PA / G</th>
            <th class="num">Playoffs</th><th class="num">Titles</th><th class="num">Avg finish</th></tr></thead><tbody>${A.quads.map(qRow).join('')}</tbody></table></div>`;
        host.querySelector('#mb-wkquads').innerHTML = `<div class="table-scroll"><table class="data-table" style="min-width:520px">${SITE.cols('22%', '16%', '16%', '16%', '30%')}
            <thead><tr><th>Week rank</th><th class="num">Games</th><th class="num">Won</th><th class="num">Median</th><th class="num">Score range</th></tr></thead><tbody>
            ${A.wkQuads.map(q => `<tr><td><b>${q.label}</b></td><td class="num">${q.n}</td><td class="num"><b>${pct(q.win, 1)}</b></td><td class="num">${pts(q.med)}</td>
                <td class="num">${pts(q.lo)}–${pts(q.hi)}</td></tr>`).join('')}</tbody></table></div>`;

        // manager quads + score rank matrix (same method as the NEW site's Weekly Score Ranks page)
        const lines = SR.managers(SR.teamWeeks(A.games.map(g => ({ season: g.season, week: g.week, id: g.id, name: g.mgr, rank: g.wkRank, pf: g.pf, pa: g.pa }))));
        const mlink = n => GT.managerLink(n, scope === 'completed' || scope === 'all' ? 'career' : scope);
        host.querySelector('#mb-mgrquads').innerHTML = lines.length ? SR.table(lines, { link: mlink }) : '<p class="muted">No games in this scope.</p>';
        host.querySelector('#mb-matrix').innerHTML = lines.length ? SR.matrix(lines) : '';
        host.querySelector('#mb-matrix-sub').textContent = `Weeks each manager finished at each weekly score rank · 1 = highest score of the week · managers under ${lines.min} games are listed unranked (faded)`;

        const c = { accent: SITE.color('accent'), red: SITE.color('danger'), ink: SITE.color('ink'), muted: SITE.color('muted'), grid: SITE.color('track'), line: SITE.color('line-strong') };
        const mount = (id, option) => { const el = host.querySelector(`#${id}`); const ch = echarts.init(el); ch.setOption({ textStyle: { fontFamily: 'Inter, sans-serif' }, animationDuration: 300, ...option }); charts.push(ch); };
        const axis = { axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.grid } } };

        // 1. scoring distribution + win curve
        mount('mb-dist', {
            grid: { left: 46, right: 46, top: 30, bottom: 30 },
            legend: { type: 'scroll', top: 0, left: 'center', textStyle: { color: c.muted, fontSize: 11 } },
            tooltip: { trigger: 'axis', formatter: ps => `<b>${ps[0].name}–${Number(ps[0].name) + 9.9}</b><br>` + ps.map(p => `${p.seriesName}: ${p.seriesName === 'Games' ? p.value : p.value == null ? '-' : p.value + '%'}`).join('<br>') },
            xAxis: { type: 'category', data: A.bands.map(x => String(x.b)), axisLabel: { color: c.muted } },
            yAxis: [{ type: 'value', name: 'Games', nameTextStyle: { color: c.muted }, ...axis }, { type: 'value', name: 'Won', min: 0, max: 100, axisLabel: { color: c.muted, formatter: '{value}%' }, splitLine: { show: false } }],
            series: [{ name: 'Games', type: 'bar', data: A.bands.map(x => x.n), itemStyle: { color: c.line }, barWidth: '70%',
                       markLine: { silent: true, symbol: 'none', label: { color: c.ink, fontSize: 10, formatter: p => p.name }, lineStyle: { color: c.ink, type: 'dashed' },
                                   data: [['Median', A.q.p50], ['25%', A.q.p25], ['75%', A.q.p75]].map(([n, v]) => ({ name: n, xAxis: String(Math.floor(v / 10) * 10) })) } },
                     { name: 'Won', type: 'line', yAxisIndex: 1, smooth: true, data: A.bands.map(x => (x.n >= 3 ? Math.round(x.win * 1000) / 10 : null)), connectNulls: true, symbolSize: 6, lineStyle: { color: c.accent, width: 3 }, itemStyle: { color: c.accent } }]
        });
        // 2. wins -> playoffs
        mount('mb-wins', {
            grid: { left: 46, right: 16, top: 30, bottom: 34 },
            legend: { type: 'scroll', top: 0, left: 'center', textStyle: { color: c.muted, fontSize: 11 } },
            tooltip: { trigger: 'axis', formatter: ps => `<b>${ps[0].name} wins</b> (${A.byWins[ps[0].dataIndex].n} teams)<br>` + ps.map(p => `${p.seriesName}: ${p.value}%`).join('<br>') },
            xAxis: { type: 'category', name: 'Regular-season wins', nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: c.muted }, data: A.byWins.map(x => String(x.w)), axisLabel: { color: c.muted } },
            yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: c.muted, formatter: '{value}%' }, splitLine: { lineStyle: { color: c.grid } } },
            series: [{ name: 'Made the bracket', type: 'bar', data: A.byWins.map(x => Math.round(x.made * 100)), itemStyle: { color: c.accent }, barWidth: '60%' },
                     { name: 'Won the title', type: 'line', data: A.byWins.map(x => Math.round(x.title * 100)), symbolSize: 6, lineStyle: { color: c.ink }, itemStyle: { color: c.ink } }]
        });
        // 3. points per game -> wins
        const xr = [Math.floor(Math.min(...A.teams.map(t => t.ppg)) / 5) * 5, Math.ceil(Math.max(...A.teams.map(t => t.ppg)) / 5) * 5];
        mount('mb-ppg', {
            grid: { left: 40, right: 16, top: 30, bottom: 36 },
            legend: { type: 'scroll', top: 0, left: 'center', textStyle: { color: c.muted, fontSize: 11 } },
            tooltip: { formatter: p => p.data && p.data.t ? `<b>${esc(p.data.t.owner)} ${p.data.t.season}</b><br>${pts(p.data.t.ppg)} per game · ${p.data.t.wins}-${p.data.t.losses}` : '' },
            xAxis: { type: 'value', name: 'Points per game', nameLocation: 'middle', nameGap: 24, nameTextStyle: { color: c.muted }, min: xr[0], max: xr[1], ...axis },
            yAxis: { type: 'value', name: 'Wins', nameTextStyle: { color: c.muted }, min: 0, ...axis },
            series: [{ name: 'Made the bracket', type: 'scatter', symbolSize: 9, itemStyle: { color: c.accent }, data: A.teams.filter(t => t.made).map(t => ({ value: [t.ppg, t.wins], t })) },
                     { name: 'Missed', type: 'scatter', symbolSize: 9, itemStyle: { color: c.line }, data: A.teams.filter(t => !t.made).map(t => ({ value: [t.ppg, t.wins], t })) },
                     ...(A.slope ? [{ name: 'Trend', type: 'line', symbol: 'none', silent: true, lineStyle: { color: c.ink, type: 'dashed' }, itemStyle: { color: c.ink }, data: xr.map(x => [x, A.icpt + A.slope * x]) }] : [])]
        });
        // 4. scoring by season
        mount('mb-season', {
            grid: { left: 46, right: 16, top: 16, bottom: 30 },
            tooltip: { formatter: p => p.seriesType === 'boxplot' ? `<b>${p.name}</b><br>low ${pts(p.data[1])} · 25% ${pts(p.data[2])}<br>median ${pts(p.data[3])} · 75% ${pts(p.data[4])}<br>high ${pts(p.data[5])}` : `${p.name}: average ${pts(p.value)}` },
            xAxis: { type: 'category', data: A.bySeason.map(x => String(x.s)), axisLabel: { color: c.muted } },
            yAxis: { type: 'value', ...axis, min: v => Math.floor(v.min / 10) * 10 },
            series: [{ type: 'boxplot', data: A.bySeason.map(x => x.box), itemStyle: { color: SITE.color('surface-2'), borderColor: c.accent, borderWidth: 1.5 } },
                     { type: 'line', data: A.bySeason.map(x => Math.round(x.avg * 10) / 10), symbolSize: 6, lineStyle: { color: c.ink }, itemStyle: { color: c.ink } }]
        });
        host.querySelector('#mb-scope-note').textContent = `${label} · ${A.games.length.toLocaleString()} team-games · ${A.teams.length} team-seasons`;
    }

    // ================================================================ POSITIONAL VALUE
    // Every regular-season lineup split by slot. Each team-week's slot points and team score are measured against that
    // week's league average (so a high-scoring year doesn't look like a good QB). A slot's share of the scoring swings
    // is cov(slot, team score) / var(team score): the shares of all slots add up to 100%. Draft capital: each pick is
    // worth (picks left in the draft) / (picks in the draft), so 1.01 = 1 and the last pick ~ 0.
    const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'P', 'D/ST', 'HC'];
    const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'P', 'D/ST', 'HC'];
    async function loadPos() {
        if (posData) return posData;
        const [lineups, picks] = await Promise.all([
            GT.query(`SELECT fr.season, fr.week, fr.owner_id AS id, frp.slot_position AS slot, p.position AS pos, frp.actual_points AS pts
                      FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id JOIN players p ON p.player_id = frp.player_id
                      WHERE frp.slot_position NOT IN ('BE', 'IR') AND frp.actual_points IS NOT NULL`),
            GT.query(`SELECT season, overall_pick AS pick, pos FROM draft_picks`).catch(() => [])
        ]);
        const tw = {};
        data.games.forEach(g => { tw[`${g.season}|${g.week}|${g.id}`] = { season: g.season, week: g.week, pf: g.pf, margin: g.pf - g.pa, won: g.won, slot: {}, n: {}, pos: {} }; });
        lineups.forEach(r => {
            const x = tw[`${r.season}|${r.week}|${r.id}`];
            if (!x) return;                                    // playoffs / no recorded game
            x.slot[r.slot] = (x.slot[r.slot] || 0) + r.pts; x.n[r.slot] = (x.n[r.slot] || 0) + 1;
            x.pos[r.pos] = (x.pos[r.pos] || 0) + r.pts;
        });
        posData = { teamWeeks: Object.values(tw).filter(x => Object.keys(x.slot).length), picks };
        return posData;
    }
    const cov = (xs, ys) => { const n = xs.length; if (n < 3) return null; const mx = mean(xs), my = mean(ys); return xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0) / n; };
    const corr = (xs, ys) => { const c = cov(xs, ys), a = cov(xs, xs), b = cov(ys, ys); return c == null || !a || !b ? null : c / Math.sqrt(a * b); };

    function analysePos(D) {
        const inScope = s => (scope === 'completed' ? data.completed.includes(s) : scope === 'all' ? true : s === Number(scope));
        const rows = D.teamWeeks.filter(x => inScope(x.season));
        // week means, to take out each week's scoring environment
        const wk = {};
        rows.forEach(x => { const k = `${x.season}|${x.week}`; (wk[k] = wk[k] || []).push(x); });
        const weekMean = (x, f) => mean(wk[`${x.season}|${x.week}`].map(f));
        const pfDev = rows.map(x => x.pf - weekMean(x, y => y.pf));
        const varPf = cov(pfDev, pfDev);
        const slots = SLOT_ORDER.filter(s => rows.some(x => x.n[s]));
        const slotStats = slots.map(s => {
            const have = rows.filter(x => x.n[s]);
            const per = have.map(x => x.slot[s] / x.n[s]);
            const won = have.filter(x => x.won === 1), lost = have.filter(x => x.won === 0);
            const dev = rows.map(x => (x.slot[s] || 0) - weekMean(x, y => y.slot[s] || 0));
            // win curve: team win rate across ten equal-size bins of points per starter; the 50% line is where it crosses
            const order = have.map((x, i) => ({ v: per[i], w: x.won })).sort((a, b) => a.v - b.v);
            const bins = Array.from({ length: 10 }, (_, i) => order.slice(Math.floor(i * order.length / 10), Math.floor((i + 1) * order.length / 10)))
                .filter(b => b.length).map(b => ({ v: mean(b.map(x => x.v)), w: mean(b.map(x => x.w)) }));
            let line = null;
            for (let i = 1; i < bins.length; i++) if (bins[i - 1].w < 0.5 && bins[i].w >= 0.5) { const a = bins[i - 1], c = bins[i]; line = a.v + (0.5 - a.w) / (c.w - a.w) * (c.v - a.v); break; }
            return { s, starters: mean(have.map(x => x.n[s])), avg: mean(per), win: mean(won.map(x => x.slot[s] / x.n[s])), loss: mean(lost.map(x => x.slot[s] / x.n[s])),
                     line, r: corr(dev, rows.map(x => x.margin)), share: varPf ? cov(dev, pfDev) / varPf : null, bins };
        });
        // by player position (FLEX starts count for the player's own position), against draft capital
        const posList = POS_ORDER.filter(pp => rows.some(x => x.pos[pp]));
        const posShare = Object.fromEntries(posList.map(pp => { const dev = rows.map(x => (x.pos[pp] || 0) - weekMean(x, y => y.pos[pp] || 0)); return [pp, varPf ? cov(dev, pfDev) / varPf : null]; }));
        const picks = D.picks.filter(k => inScope(k.season));
        const per = {};
        picks.forEach(k => { per[k.season] = Math.max(per[k.season] || 0, k.pick); });
        const capital = {};
        picks.forEach(k => { if (k.pos) capital[k.pos] = (capital[k.pos] || 0) + (per[k.season] - k.pick + 1) / per[k.season]; });
        const capTotal = posList.reduce((t, pp) => t + (capital[pp] || 0), 0);
        const shareTotal = posList.reduce((t, pp) => t + Math.max(0, posShare[pp] || 0), 0);
        const value = posList.map(pp => {
            const impact = shareTotal ? Math.max(0, posShare[pp] || 0) / shareTotal : null, cap = capTotal ? (capital[pp] || 0) / capTotal : null;
            return { pos: pp, impact, cap, index: impact != null && cap ? impact / cap * 100 : null };
        });
        return { rows, slotStats, value, picks: picks.length };
    }

    async function renderPos() {
        const pane = host.querySelector('#mb-pane-pos');
        if (!pane.dataset.ready) { pane.innerHTML = '<div class="loading" style="margin:20px 0">Splitting every lineup by slot...</div>'; }
        const D = await loadPos();
        posCharts.forEach(c => c.dispose()); posCharts = [];
        const A = analysePos(D);
        const p1 = v => v == null || isNaN(v) ? '-' : pts(v);
        const sg = v => v == null || isNaN(v) ? '-' : `${v >= 0 ? '+' : ''}${pts(v)}`;
        const verdict = i => i == null ? '-' : i >= 115 ? 'Undervalued' : i <= 85 ? 'Overvalued' : 'Fairly valued';
        const top = A.slotStats.slice().sort((x, y) => (y.share || 0) / (y.starters || 1) - (x.share || 0) / (x.starters || 1))[0];
        const under = A.value.filter(v => v.index != null).sort((x, y) => y.index - x.index)[0];
        const over = A.value.filter(v => v.index != null).sort((x, y) => x.index - y.index)[0];
        const card = (k, v, s, tip) => `<div class="db-kpi"><span data-tip="${esc(tip)}">${k}</span><b>${v}</b><small>${s}</small></div>`;
        pane.dataset.ready = '1';
        pane.innerHTML = `
            <div class="db-kpis">
                ${card('Team-weeks', A.rows.length.toLocaleString(), 'regular-season lineups in scope', 'Every manager-week in the scope with a recorded game and lineup. Playoffs are left out.')}
                ${card('Biggest lever', top ? top.s : '-', top ? `${pct(top.share / top.starters)} of score swings per starter` : '', 'The slot that moves results most per player you start there: its share of the scoring swings divided by how many starters it has.')}
                ${card('Most undervalued', under ? under.pos : '-', under ? `value index ${Math.round(under.index)} · ${pct(under.impact)} of swings, ${pct(under.cap)} of draft capital` : 'needs drafts in scope', 'The position whose share of the scoring swings is largest compared with the share of draft capital the league spends on it (highest value index).')}
                ${card('Most overvalued', over ? over.pos : '-', over ? `value index ${Math.round(over.index)} · ${pct(over.impact)} of swings, ${pct(over.cap)} of draft capital` : 'needs drafts in scope', 'The position the league spends the most draft capital on relative to how much of the scoring swings it actually decides (lowest value index).')}
                ${card('QB line', p1((A.slotStats.find(s => s.s === 'QB') || {}).line), 'QB points where the team starts winning more than half', 'Team win rate climbs with QB points. This is the QB score where it crosses 50%, read off ten equal-size bins of QB weeks.')}
                ${card('RB line', p1((A.slotStats.find(s => s.s === 'RB') || {}).line), 'points per RB starter for a 50% win rate', 'The points per RB starter where the team win rate crosses 50%.')}
            </div>
            <div class="db-grid">
                <section class="db-tile s12"><header><h3 data-tip="One row per lineup slot, regular season, starters only. Numbers are per starter, so the two RB slots are averaged, not added.">What Each Slot Needs to Produce</h3><p>Per starter in the slot. 50% line = the score where the team's win rate passes half. Share of swings = how much of the week-to-week difference between teams comes from the slot (all slots add to 100%).</p></header>
                    <div class="table-scroll"><table class="data-table" style="min-width:860px">${SITE.cols('10%', '9%', '11%', '11%', '11%', '10%', '12%', '12%', '14%')}<thead><tr>
                        <th>Slot</th>
                        <th class="num" data-tip="Average number of players a team started in this slot (FLEX can be under 2 in seasons with one FLEX).">Starters</th>
                        <th class="num" data-tip="Average points per starter in this slot, all games.">Avg / starter</th>
                        <th class="num" data-tip="Average points per starter in this slot in games the team won.">In wins</th>
                        <th class="num" data-tip="Average points per starter in this slot in games the team lost.">In losses</th>
                        <th class="num" data-tip="In wins minus in losses: how many more points per starter winning teams got from this slot.">Gap</th>
                        <th class="num" data-tip="The points per starter where the team's win rate crosses 50%. Below it the team loses more often than not; above it, wins more often. Read off ten equal-size bins of this slot's weeks; '-' when the curve never crosses cleanly.">50% line</th>
                        <th class="num" data-tip="Correlation between the slot's points (vs the week's league average) and the game margin. 0 = no relationship, 1 = perfect. Above about 0.3 is a strong link for one slot.">r with margin</th>
                        <th class="num" data-tip="Share of swings: how much of the week-to-week difference between team scores comes from this slot. Each team-week is measured against that week's league average first, then the slot's covariance with the team score is divided by the team score's variance. All slots add up to 100%, so a slot with 20% decides about a fifth of who outscores whom.">Share of swings</th></tr></thead><tbody>
                    ${A.slotStats.map(s => `<tr><td><b>${s.s}</b></td><td class="num">${s.starters.toFixed(1)}</td><td class="num">${p1(s.avg)}</td><td class="num win">${p1(s.win)}</td>
                        <td class="num loss">${p1(s.loss)}</td><td class="num"><b>${sg(s.win - s.loss)}</b></td><td class="num">${p1(s.line)}</td>
                        <td class="num">${s.r == null ? '-' : s.r.toFixed(2)}</td><td class="num"><b>${pct(s.share, 1)}</b></td></tr>`).join('')}</tbody></table></div></section>
                <section class="db-tile s7"><header><h3 data-tip="Each slot's weeks are sorted by points per starter and cut into ten equal groups. Each dot is one group: its average slot score (x) and how often those teams won (y). Steeper curves = slots where points matter more.">Win Rate by Slot Score</h3><p>Team win % across ten bins of points per starter. Click a slot in the legend to hide it.</p></header><div class="db-chart" id="mbp-curve"></div></section>
                <section class="db-tile s5"><header><h3 data-tip="Green: the position's share of the scoring swings (FLEX starts count for the player's own position). Grey: its share of draft capital, where each pick is weighted by how early it went (1.01 = 1, the last pick about 0). Green taller than grey = the league underpays the position.">Impact vs Draft Capital</h3><p>Share of the scoring swings vs share of draft capital spent, by position</p></header><div class="db-chart" id="mbp-value"></div></section>
                <section class="db-tile s12"><header><h3>Are Positions Over- or Undervalued?</h3><p>Value index = share of swings ÷ share of draft capital × 100. Above 115: the league pays too little for what the position decides; below 85: too much. ${A.picks.toLocaleString()} draft picks in scope.</p></header>
                    <div class="table-scroll"><table class="data-table" style="min-width:640px">${SITE.cols('16%', '21%', '21%', '18%', '24%')}<thead><tr>
                        <th>Position</th>
                        <th class="num" data-tip="The position's share of the week-to-week scoring swings, counting FLEX starts for the player's own position. Only positive shares count toward 100%.">Share of swings</th>
                        <th class="num" data-tip="The position's share of all draft capital spent in the scope. Each pick is worth (picks left in the draft) / (picks in the draft), so early picks count most.">Share of draft capital</th>
                        <th class="num" data-tip="Share of swings ÷ share of draft capital × 100. 100 = paid exactly what it decides; 150 = decides half again as much as the league spends on it.">Value index</th>
                        <th data-tip="Undervalued: index 115 or more. Overvalued: 85 or less. In between: fairly valued.">Verdict</th></tr></thead><tbody>
                    ${A.value.map(v => `<tr><td><b>${v.pos}</b></td><td class="num">${pct(v.impact, 1)}</td><td class="num">${pct(v.cap, 1)}</td>
                        <td class="num"><b class="${v.index >= 115 ? 'win' : v.index <= 85 ? 'loss' : ''}">${v.index == null ? '-' : Math.round(v.index)}</b></td><td>${verdict(v.index)}</td></tr>`).join('')}</tbody></table></div></section>
            </div>
            <p class="an-note">Regular season, starters only; a FLEX start counts toward the player's own position in the valuation. Every slot and team score is measured against that week's league average first.
            Draft capital weights each pick by how early it went (1.01 = 1, the last pick about 0).</p>`;
        const c = { accent: SITE.color('accent'), red: SITE.color('danger'), ink: SITE.color('ink'), muted: SITE.color('muted'), grid: SITE.color('track'), line: SITE.color('line-strong') };
        const COLORS = { QB: '#c0392b', RB: '#2e86de', WR: '#27ae60', TE: '#e67e22', FLEX: '#16a085', K: '#8e44ad', P: '#7f8c8d', 'D/ST': '#34495e', HC: '#b7950b' };
        const mountP = (id, option) => { const ch = echarts.init(host.querySelector(`#${id}`)); ch.setOption({ textStyle: { fontFamily: 'Inter, sans-serif' }, animationDuration: 300, ...option }); posCharts.push(ch); };
        mountP('mbp-curve', {
            grid: { left: 44, right: 16, top: 30, bottom: 36 },
            legend: { type: 'scroll', top: 0, left: 'center', textStyle: { color: c.muted, fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
            tooltip: { trigger: 'item', formatter: p => `<b>${p.seriesName}</b><br>${pts(p.value[0])} per starter → team won ${Math.round(p.value[1])}%` },
            xAxis: { type: 'value', name: 'Points per starter', nameLocation: 'middle', nameGap: 24, nameTextStyle: { color: c.muted }, axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.grid } } },
            yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: c.muted, formatter: '{value}%' }, splitLine: { lineStyle: { color: c.grid } } },
            series: A.slotStats.map(s => ({ name: s.s, type: 'line', smooth: true, symbolSize: 5, itemStyle: { color: COLORS[s.s] }, lineStyle: { color: COLORS[s.s], width: 2 },
                                            data: s.bins.map(bn => [Math.round(bn.v * 10) / 10, Math.round(bn.w * 1000) / 10]),
                                            markLine: s.s === 'QB' ? { silent: true, symbol: 'none', lineStyle: { color: c.line, type: 'dashed' }, label: { show: false }, data: [{ yAxis: 50 }] } : undefined }))
        });
        mountP('mbp-value', {
            grid: { left: 40, right: 12, top: 30, bottom: 26 },
            legend: { type: 'scroll', top: 0, left: 'center', textStyle: { color: c.muted, fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => `${v}%` },
            xAxis: { type: 'category', data: A.value.map(v => v.pos), axisLabel: { color: c.muted } },
            yAxis: { type: 'value', axisLabel: { color: c.muted, formatter: '{value}%' }, splitLine: { lineStyle: { color: c.grid } } },
            series: [{ name: 'Share of swings', type: 'bar', barMaxWidth: 18, itemStyle: { color: c.accent }, data: A.value.map(v => v.impact == null ? 0 : Math.round(v.impact * 1000) / 10) },
                     { name: 'Share of draft capital', type: 'bar', barMaxWidth: 18, itemStyle: { color: c.line }, data: A.value.map(v => v.cap == null ? 0 : Math.round(v.cap * 1000) / 10) }]
        });
    }

    async function mount(el) {
        host = el;
        data = await load();
        host.innerHTML = `
            <div class="mb-head">
                <div><div class="eyebrow">What it takes to win here</div><h2 class="section-title">Moneyball</h2>
                    <p class="section-copy" style="max-width:none">Regular season only. Playoff rates use seasons whose bracket is finished.</p></div>
                <div class="mb-controls">
                    <div class="sx-f"><span>View</span><div class="seg" id="mb-tabs"><button data-t="win" class="on">What it takes to win</button><button data-t="pos">Positional value</button></div></div>
                    <label class="sx-f"><span>Scope</span><select class="select" id="mb-scope">
                    <option value="completed">All completed seasons</option><option value="all">Every season</option>
                    ${data.seasons.map(s => `<option value="${s}">${s}</option>`).join('')}</select></label></div>
            </div>
            <p class="db-note" id="mb-scope-note" style="margin:0 0 10px"></p>
            <div id="mb-pane-pos" hidden></div>
            <div id="mb-pane-win">
            <div class="db-kpis" id="mb-cards"></div>
            <div class="db-grid">
                <section class="db-tile s7"><header><h3>Scoring Distribution & Win Curve</h3><p>Every weekly score (bars) and how often that score won (line). Dashed: median and middle half.</p></header><div class="db-chart" id="mb-dist"></div></section>
                <section class="db-tile s5"><header><h3>Wins It Takes</h3><p>Share of teams at each win total that made the bracket, and won it all</p></header><div class="db-chart" id="mb-wins"></div></section>
                <section class="db-tile s7"><header><h3>Points Buy Wins</h3><p>Every team-season: points per game vs wins. Dashed line = the trend.</p></header><div class="db-chart" id="mb-ppg"></div></section>
                <section class="db-tile s5"><header><h3>Scoring by Season</h3><p>Weekly scores each year: middle half (box), full range (whiskers) and average (line)</p></header><div class="db-chart" id="mb-season"></div></section>
                <section class="db-tile s12"><header><h3>Quads: Final Standings</h3><p>Teams grouped by where they finished the regular season (record, then points for): 1–4, 5–8, 9–12, 13–16</p></header><div id="mb-quads"></div></section>
                <section class="db-tile s12"><header><h3>Quads: Weekly Score Rank</h3><p>Every week's scores ranked 1–16: how often each group won its game, and what it scored</p></header><div id="mb-wkquads"></div></section>
                <section class="db-tile s12"><header><h3>Manager Quads: Weekly Scoring Position</h3><p>Every manager by all-play %. PCT 1-4 etc. = win % in weeks their score ranked in that quad. Luck = wins minus what all-play predicts.</p></header><div id="mb-mgrquads"></div></section>
                <section class="db-tile s12"><header><h3>Score Rank Matrix</h3><p id="mb-matrix-sub">Weeks each manager finished at each weekly score rank · 1 = highest score of the week</p></header><div id="mb-matrix"></div></section>
            </div></div>`;
        host.querySelector('#mb-scope').addEventListener('change', e => { scope = e.target.value; render(); if (tab === 'pos') renderPos(); });
        host.querySelectorAll('#mb-tabs button').forEach(btn => btn.addEventListener('click', () => {
            tab = btn.dataset.t;
            host.querySelectorAll('#mb-tabs button').forEach(x => x.classList.toggle('on', x === btn));
            host.querySelector('#mb-pane-win').hidden = tab !== 'win';
            host.querySelector('#mb-pane-pos').hidden = tab !== 'pos';
            if (tab === 'pos') renderPos(); else charts.forEach(ch => ch.resize());
        }));
        render();
        window.addEventListener('resize', () => [...charts, ...posCharts].forEach(ch => ch.resize()));
        window.addEventListener('themechange', () => { render(); if (tab === 'pos') renderPos(); });
    }
    return { mount };
})();
