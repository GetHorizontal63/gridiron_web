/* Stats: Schedule Luck. Actual wins against all-play wins (the record a score would have earned against every team that
   week), and the swap grid: each manager's record with every other manager's schedule. Regular season only. */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    SITE.subHeader({ crumbs: [['Stats', url('pages/stats.html')], ['Schedule Luck']], tabs: SITE.statsTabs('schedule-luck') });
    SITE.hero({ title: 'Schedule Luck', size: 'short', dots: false, image: 'background-15.png',
                meta: ['Wins against all-play wins, and every record with every other schedule', 'Regular season games'] });

    const games = await GT.query(`
        SELECT m.season, m.week, t.owner_id AS id, o.display_name AS mgr, t.opponent_owner_id AS oppId, t.team_score AS pf, t.opponent_score AS pa
        FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
        WHERE m.season_period = 'Regular' AND t.team_score IS NOT NULL AND t.opponent_owner_id IS NOT NULL ORDER BY m.season, m.week`);
    const seasons = [...new Set(games.map(g => g.season))].sort((x, y) => y - x);
    const nameOf = {};
    games.forEach(g => { nameOf[g.id] = g.mgr; });
    const f1 = v => GT.pts(v);
    const sg = v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
    const recText = (w, l, t) => `${w}-${l}${t ? '-' + t : ''}`;
    const half = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));
    const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    const mgrCell = (n, season) => `<a class="team-cell" href="${GT.managerHref(n, season)}"><img src="${GT.logo(n)}" alt=""><b>${esc(n)}</b></a>`;

    // one season: every manager's actual record, all-play record, expected wins and luck
    function seasonLines(season) {
        const list = games.filter(g => g.season === season), byWeek = {};
        list.forEach(g => { (byWeek[g.week] = byWeek[g.week] || []).push(g); });
        const out = {};
        list.forEach(g => {
            const o = out[g.id] || (out[g.id] = { id: g.id, mgr: g.mgr, g: 0, w: 0, l: 0, t: 0, apW: 0, apL: 0, xw: 0, pf: 0, pa: 0 });
            const pool = byWeek[g.week].filter(x => x.id !== g.id).map(x => x.pf);
            const beat = pool.filter(v => v < g.pf).length + pool.filter(v => v === g.pf).length / 2;
            o.g++; o.pf += g.pf; o.pa += g.pa; o.apW += beat; o.apL += pool.length - beat; o.xw += pool.length ? beat / pool.length : 0;
            if (g.pf > g.pa) o.w++; else if (g.pf < g.pa) o.l++; else o.t++;
        });
        const lg = list.length ? list.reduce((t, g) => t + g.pf, 0) / list.length : 0;
        return Object.values(out).map(o => ({ ...o, luck: o.w + o.t / 2 - o.xw, ppg: o.pf / o.g, papg: o.pa / o.g, sched: o.pa / o.g - lg,
                                               finish: b.finish[`${season}-${o.id}`] || null }));
    }

    // the swap grid: rows play the column manager's schedule (facing that manager when the schedule meets the row)
    function swapGrid(season) {
        const list = games.filter(g => g.season === season), score = {}, opp = {};
        list.forEach(g => { score[`${g.id}|${g.week}`] = g.pf; opp[`${g.id}|${g.week}`] = g.oppId; });
        const ids = [...new Set(list.map(g => g.id))];
        const weeks = [...new Set(list.map(g => g.week))];
        const cell = (a, c) => {
            const r = { w: 0, l: 0, t: 0 };
            weeks.forEach(w => {
                const mine = score[`${a}|${w}`], o = opp[`${c}|${w}`];
                if (mine == null || o == null) return;
                const vs = o === a ? c : o, theirs = score[`${vs}|${w}`];
                if (theirs == null) return;
                if (mine > theirs) r.w++; else if (mine < theirs) r.l++; else r.t++;
            });
            return r;
        };
        return { ids, cell };
    }

    function careerLines() {
        const out = {};
        seasons.forEach(s => seasonLines(s).forEach(o => {
            const c = out[o.id] || (out[o.id] = { id: o.id, mgr: o.mgr, seasons: 0, w: 0, l: 0, t: 0, xw: 0, luck: 0, best: null, worst: null });
            c.seasons++; c.w += o.w; c.l += o.l; c.t += o.t; c.xw += o.xw; c.luck += o.luck;
            if (!c.best || o.luck > c.best.luck) c.best = { season: s, luck: o.luck };
            if (!c.worst || o.luck < c.worst.luck) c.worst = { season: s, luck: o.luck };
        }));
        return Object.values(out).map(c => ({ ...c, perSeason: c.luck / c.seasons }));
    }

    const ALL = param('season') === 'all';
    let season = ALL ? 0 : (seasons.includes(Number(param('season'))) ? Number(param('season')) : seasons[0]);
    const kpi = (l, v, s, tip = '') => `<div class="db-kpi"><span${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</span><b>${v}</b><small>${s}</small></div>`;
    const LUCK_TIP = 'Luck = actual wins minus expected wins. Expected wins add up, week by week, the share of the league this team outscored (its all-play win %). A team that outscores 12 of 15 others earns 0.8 expected wins that week, win or lose.';
    content.innerHTML = `<div class="wrap page-pad">
        <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">Stats</div><h2 class="section-title">Schedule Luck</h2>
            <p class="section-copy">Who won more than their scores deserved, and who got robbed. Expected wins come from the all-play record: every week, each score against every other team's score.</p></div>
            <label class="sx-f"><span>Season</span><select class="select" id="lk-season"><option value="all"${ALL ? ' selected' : ''}>All seasons</option>${seasons.map(s =>
                `<option value="${s}"${s === season ? ' selected' : ''}>${s} season</option>`).join('')}</select></label></div>
        <div class="db-kpis vn-kpis" id="lk-kpis"></div>
        <div class="panel"><h3 class="panel-title" style="margin-bottom:10px" data-tip="${esc(LUCK_TIP)}">Wins Above Expected</h3><div id="lk-chart" class="lk-chart"></div></div>
        <div class="panel"><h3 class="panel-title" style="margin-bottom:12px" id="lk-table-title"></h3><table class="data-table lk-table ph-fit" id="lk-table"></table></div>
        <div class="panel" id="lk-swap-panel"><h3 class="panel-title" style="margin-bottom:6px">The Swap Grid</h3>
            <p class="section-copy lk-copy">Each row's scores played against each column's schedule: the record a manager would have had with that manager's opponents (when that schedule meets the row manager, he plays the column manager instead). Shaded green when better than his real record, red when worse; his real record is outlined.</p>
            <table class="lk-grid" id="lk-grid"></table></div></div>`;

    let chart;
    function draw() {
        const C = { win: SITE.color('win'), loss: SITE.color('loss'), muted: SITE.color('muted'), line: SITE.color('line-strong'), grid: SITE.color('track') };
        let rows, kpis, table;
        if (!season) {
            rows = careerLines().sort((x, y) => y.luck - x.luck);
            const top = rows[0], low = rows[rows.length - 1];
            const allSeasonLines = seasons.flatMap(s => seasonLines(s).map(o => ({ ...o, season: s })));
            const bestS = allSeasonLines.reduce((m, o) => !m || o.luck > m.luck ? o : m, null), worstS = allSeasonLines.reduce((m, o) => !m || o.luck < m.luck ? o : m, null);
            kpis = kpi('Luckiest career', esc(top.mgr), `${sg(top.luck)} wins over ${top.seasons} seasons`) + kpi('Unluckiest career', esc(low.mgr), `${sg(low.luck)} wins over ${low.seasons} seasons`) +
                   kpi('Luckiest season', `${esc(bestS.mgr)} ${bestS.season}`, `${recText(bestS.w, bestS.l, bestS.t)} with ${bestS.xw.toFixed(1)} expected wins`) +
                   kpi('Most robbed season', `${esc(worstS.mgr)} ${worstS.season}`, `${recText(worstS.w, worstS.l, worstS.t)} with ${worstS.xw.toFixed(1)} expected wins`);
            document.getElementById('lk-table-title').textContent = 'Career Luck';
            table = `${SITE.cols('24%', '9%', '12%', '12%', '11%', '11%', '21%')}<thead><tr><th>Manager</th><th class="num"><span class="hl">Seasons</span><span class="hs">Yrs</span></th><th class="num"><span class="hl">Record</span><span class="hs">Rec</span></th>
                <th class="num"><span class="hl">Exp. wins</span><span class="hs">xW</span></th><th class="num" data-tip="${esc(LUCK_TIP)}">Luck</th><th class="num"><span class="hl">Per season</span><span class="hs">/ yr</span></th><th class="num ph-x">Luckiest / unluckiest</th></tr></thead><tbody>${rows.map(r => `<tr>
                <td>${mgrCell(r.mgr)}</td><td class="num">${r.seasons}</td><td class="num">${recText(r.w, r.l, r.t)}</td><td class="num">${r.xw.toFixed(1)}</td>
                <td class="num ${r.luck >= 0 ? 'win' : 'loss'}"><b>${sg(r.luck)}</b></td><td class="num">${sg(r.perSeason)}</td>
                <td class="num ph-x">${r.best.season} ${sg(r.best.luck)} / ${r.worst.season} ${sg(r.worst.luck)}</td></tr>`).join('')}</tbody>`;
        } else {
            rows = seasonLines(season).sort((x, y) => y.luck - x.luck);
            const top = rows[0], low = rows[rows.length - 1];
            const hard = rows.reduce((m, o) => !m || o.sched > m.sched ? o : m, null), easy = rows.reduce((m, o) => !m || o.sched < m.sched ? o : m, null);
            kpis = kpi('Luckiest', esc(top.mgr), `${recText(top.w, top.l, top.t)} with ${top.xw.toFixed(1)} expected wins`) +
                   kpi('Unluckiest', esc(low.mgr), `${recText(low.w, low.l, low.t)} with ${low.xw.toFixed(1)} expected wins`) +
                   kpi('Toughest schedule', esc(hard.mgr), `opponents scored ${f1(hard.papg)} a week (${sg(hard.sched)})`) +
                   kpi('Easiest schedule', esc(easy.mgr), `opponents scored ${f1(easy.papg)} a week (${sg(easy.sched)})`);
            document.getElementById('lk-table-title').textContent = `${season} Luck`;
            const SCHED_TIP = 'Points scored against this team a week, minus the league average score. Positive = tougher opponents.';
            table = `${SITE.cols('22%', '10%', '12%', '10%', '10%', '9%', '9%', '9%', '9%')}<thead><tr><th>Manager</th><th class="num"><span class="hl">Record</span><span class="hs">Rec</span></th>
                <th class="num ph-x" data-tip="The record against every other team, every week.">All-play</th><th class="num"><span class="hl">Exp. wins</span><span class="hs">xW</span></th><th class="num" data-tip="${esc(LUCK_TIP)}">Luck</th>
                <th class="num ph-x">PF / G</th><th class="num ph-x">PA / G</th><th class="num" data-tip="${esc(SCHED_TIP)}"><span class="hl">Schedule</span><span class="hs">Sched</span></th><th class="num ph-x">Finish</th></tr></thead><tbody>${rows.map(r => `<tr>
                <td>${mgrCell(r.mgr, season)}</td><td class="num">${recText(r.w, r.l, r.t)}</td><td class="num ph-x">${half(r.apW)}-${half(r.apL)}</td><td class="num">${r.xw.toFixed(1)}</td>
                <td class="num ${r.luck >= 0 ? 'win' : 'loss'}"><b>${sg(r.luck)}</b></td><td class="num ph-x">${f1(r.ppg)}</td><td class="num ph-x">${f1(r.papg)}</td>
                <td class="num">${sg(r.sched)}</td><td class="num ph-x">${r.finish ? ord(r.finish) : '-'}</td></tr>`).join('')}</tbody>`;
        }
        document.getElementById('lk-kpis').innerHTML = kpis;
        document.getElementById('lk-table').innerHTML = table;
        // colgroup cells hidden on phones follow their header's ph-x
        const table_ = document.getElementById('lk-table');
        [...table_.querySelectorAll('thead th')].forEach((th, i) => { if (th.classList.contains('ph-x')) table_.querySelectorAll('col')[i].classList.add('ph-x'); });

        const bars = rows.slice().sort((x, y) => x.luck - y.luck);
        if (!chart) chart = echarts.init(document.getElementById('lk-chart'));
        chart.setOption({
            textStyle: { fontFamily: 'Inter, sans-serif' }, animationDurationUpdate: 300,
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 },
                       formatter: ps => { const r = bars[ps[0].dataIndex]; return `<b>${esc(r.mgr)}</b><br>${recText(r.w, r.l, r.t)} · ${r.xw.toFixed(1)} expected wins<br>Luck ${sg(r.luck)}`; } },
            grid: { left: 84, right: 24, top: 8, bottom: 22 },
            xAxis: { type: 'value', axisLabel: { color: C.muted, fontSize: 10, formatter: v => sg(v) }, splitLine: { lineStyle: { color: C.grid } } },
            yAxis: { type: 'category', data: bars.map(r => r.mgr), axisLabel: { color: C.muted, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
            series: [{ type: 'bar', barMaxWidth: 16, data: bars.map(r => ({ value: Number(r.luck.toFixed(2)), itemStyle: { color: r.luck >= 0 ? C.win : C.loss } })) }]
        }, true);
        document.getElementById('lk-chart').style.height = `${Math.max(240, bars.length * 26 + 40)}px`;
        chart.resize();

        const panel = document.getElementById('lk-swap-panel');
        panel.style.display = season ? '' : 'none';
        if (!season) return;
        const { ids, cell } = swapGrid(season);
        const order = rows.map(r => r.id).filter(id => ids.includes(id));
        document.getElementById('lk-grid').innerHTML = `<colgroup><col class="lk-rowh">${order.map(() => '<col>').join('')}</colgroup>
            <thead><tr><th class="lk-corner"><span>Scores ↓</span><span>Schedule →</span></th>${order.map(c => `<th title="${esc(nameOf[c])}'s schedule"><img src="${GT.logo(nameOf[c])}" alt=""></th>`).join('')}</tr></thead>
            <tbody>${order.map(a => {
                const real = cell(a, a), realW = real.w + real.t / 2;
                return `<tr><th><img src="${GT.logo(nameOf[a])}" alt=""><b>${esc(nameOf[a])}</b></th>${order.map(c => {
                    const r = cell(a, c), d = r.w + r.t / 2 - realW;
                    const bg = a === c ? '' : d > 0 ? `background:color-mix(in srgb, var(--win) ${Math.min(55, 10 + d * 9)}%, transparent)` : d < 0 ? `background:color-mix(in srgb, var(--loss) ${Math.min(55, 10 - d * 9)}%, transparent)` : '';
                    return `<td class="${a === c ? 'me' : ''}" style="${bg}" title="${esc(nameOf[a])} with ${esc(nameOf[c])}'s schedule: ${recText(r.w, r.l, r.t)}"><span class="lk-full">${recText(r.w, r.l, r.t)}</span><span class="lk-short">${r.w}</span></td>`;
                }).join('')}</tr>`;
            }).join('')}</tbody>`;
    }

    document.getElementById('lk-season').addEventListener('change', e => {
        season = e.target.value === 'all' ? 0 : Number(e.target.value);
        const u = new URL(location.href); u.searchParams.set('season', e.target.value); history.replaceState(null, '', u);
        draw();
    });
    window.addEventListener('resize', () => chart && chart.resize());
    window.addEventListener('themechange', draw);
    draw();
})();
