/* Past Seasons: Trades and Free Agency. Every graded roster move (NEW/python/transaction_grades.py): what each side
   went on to score, the move grade, the what-if record, and league-wide analytics with a manager focus.
   Grades are percentiles of net started points among same-kind moves in completed seasons (A 90th+, B 70th+,
   C 30th+, D 10th+, F). A season still in progress has no final grades: its moves get a provisional pace grade
   (net started points per week so far, ranked against completed seasons' per-week rates), drawn with a dashed ring. */
(async function () {
    const { esc, url, param } = SITE;
    const page = document.body.dataset.page;                       // 'trades' | 'free-agency'
    const TRADES = page === 'trades';
    const content = document.getElementById('content');
    const b = await GT.load();
    const KINDS = TRADES ? "('TRADE')" : "('PICKUP','DROP')";
    const name = id => (b.byId[id] || {}).name || '—';

    const [moveRows, playerRows, weekRows] = await Promise.all([
        GT.query(`SELECT m.move_id AS id, m.transaction_id AS tx, m.kind, m.season, m.effective_week AS week, m.occurred_at AS at,
                         m.owner_id AS oid, m.counterparty_owner_id AS cid, m.weeks_counted AS wc, m.pts_in AS ptsIn, m.pts_out AS ptsOut,
                         m.started_in AS stIn, m.started_out AS stOut, m.net_total AS net, m.net_started AS netSt, m.grade, m.provisional AS prov,
                         m.evidence, m.real_wins AS rw, m.real_losses AS rl, m.alt_wins AS aw, m.alt_losses AS al, m.real_pd AS rpd, m.alt_pd AS apd,
                         t.type AS txType
                  FROM transaction_moves m LEFT JOIN transactions t ON t.transaction_id = m.transaction_id
                  WHERE m.kind IN ${KINDS}`),
        GT.query(`SELECT mp.move_id AS id, mp.player_id AS pid, p.name, p.position AS pos, mp.direction AS dir, mp.ros_points AS ros,
                         mp.started_points AS st, mp.weeks_started AS ws
                  FROM transaction_move_players mp JOIN players p ON p.player_id = mp.player_id
                  JOIN transaction_moves m ON m.move_id = mp.move_id WHERE m.kind IN ${KINDS}`),
        GT.query(`SELECT m.season, MAX(m.week) AS week FROM matchups m JOIN matchup_team_stats t ON t.game_id = m.game_id
                  WHERE m.season_period = 'Regular' AND t.team_score IS NOT NULL GROUP BY m.season`)
    ]);

    // ---------------------------------------------------------------- moves, with provisional pace grades
    const lastWeek = Object.fromEntries(weekRows.map(r => [r.season, r.week]));
    const byMove = {};
    playerRows.forEach(p => { const m = byMove[p.id] || (byMove[p.id] = { in: [], out: [] }); (p.dir === 'IN' ? m.in : m.out).push(p); });
    const rates = {};
    moveRows.forEach(m => { if (!m.prov && m.grade && m.wc > 0) (rates[m.kind] = rates[m.kind] || []).push(m.netSt / m.wc); });
    const share = (v, list) => { if (!list || !list.length) return null; let lo = 0, eq = 0; list.forEach(x => { if (x < v) lo++; else if (x === v) eq++; }); return (lo + eq / 2) / list.length; };
    const letterOf = p => p == null ? null : p >= 0.9 ? 'A' : p >= 0.7 ? 'B' : p >= 0.3 ? 'C' : p >= 0.1 ? 'D' : 'F';
    const byRos = (x, y) => (y.ros || 0) - (x.ros || 0);
    const moves = moveRows.map(m => {
        const pl = byMove[m.id] || { in: [], out: [] };
        const elapsed = m.prov ? Math.max(0, (lastWeek[m.season] || 0) - (m.week || 1) + 1) : m.wc;
        let grade = m.grade, provGrade = false;
        if (m.prov && elapsed > 0) { grade = letterOf(share(m.netSt / elapsed, rates[m.kind])); provGrade = true; }
        const type = m.kind === 'TRADE' ? 'Trade' : m.kind === 'DROP' ? 'Drop' : m.txType === 'WAIVER' ? 'Waiver claim' : 'Free agent';
        return { ...m, ins: pl.in.sort(byRos), outs: pl.out.sort(byRos), elapsed, grade, provGrade, type,
                 mgr: name(m.oid), partner: m.cid ? name(m.cid) : '', gpa: grade ? EX.GPA[grade] : null,
                 winsAdded: m.rw != null && m.aw != null ? m.rw - m.aw : null };
    });

    // ---------------------------------------------------------------- season (hero) + sub header
    const seasons = [...new Set(moves.map(m => m.season))].sort((x, y) => y - x);
    const raw = param('season');
    const season = raw === 'all' ? 'all' : seasons.includes(Number(raw)) ? Number(raw) : seasons.includes(b.season) ? b.season : seasons[0];
    const ALL = season === 'all';
    const scope = moves.filter(m => ALL || m.season === season);
    const LABEL = TRADES ? 'Trades' : 'Free Agency';
    SITE.subHeader({
        crumbs: [['Past Seasons', url('pages/past-seasons/index.html')], [`${ALL ? 'All seasons' : season} ${LABEL}`]],
        tabs: SITE.sectionTabs('competitions', page).filter(t => !t.href.endsWith('index.html'))
            .map(t => ({ ...t, href: `${t.href}?season=${ALL ? b.season : season}` }))
    });
    const heroTools = `<label class="hero-season"><span>Season</span><select class="select" id="hero-season">
        <option value="all"${ALL ? ' selected' : ''}>All seasons</option>${seasons.map(s => `<option value="${s}"${s === season ? ' selected' : ''}>${s} season</option>`).join('')}</select></label>`;
    const inProgress = !ALL && scope.some(m => m.prov);
    const bindHero = () => document.getElementById('hero-season').addEventListener('change', e => {
        const u = new URL(location.href); u.searchParams.set('season', e.target.value); location.href = u;
    });

    // ---------------------------------------------------------------- shared bits
    const f1 = v => v == null || isNaN(v) ? '-' : GT.pts(v);
    const sgn = v => v == null || isNaN(v) ? '-' : `${v > 0 ? '+' : ''}${GT.pts(v)}`;
    const pctTxt = v => v == null || isNaN(v) ? '-' : `${Math.round(v * 100)}%`;
    const player = p => p.pid > 0 ? `<a href="${url(`pages/players/stats.html?id=${p.pid}`)}">${esc(p.name)}</a>` : esc(p.name);
    const names = list => list.map(p => p.name).join(', ');
    const when = m => `${m.season} · Wk ${m.week || '-'}`;
    const gradeTitle = m => m.provGrade ? `Provisional: ${GT.pts(m.netSt)} net started pts in ${m.elapsed} wk so far` : m.grade ? 'Final grade' : 'Not graded (no weeks left to measure)';
    const ringOf = (m, small) => EX.ring(m.grade, { small, prov: m.provGrade, title: gradeTitle(m) });
    const gpaLetter = g => g == null ? null : g >= 3.5 ? 'A' : g >= 2.5 ? 'B' : g >= 1.5 ? 'C' : g >= 0.5 ? 'D' : 'F';
    const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    let focus = b.byId[param('m')] ? Number(param('m')) : null;
    const charts = [];
    const C = {};
    const readColors = () => Object.assign(C, { accent: SITE.color('accent'), red: SITE.color('danger'), ink: SITE.color('ink'), muted: SITE.color('muted'),
                                                 grid: SITE.color('track'), line: SITE.color('line-strong'), surface: SITE.color('surface') });
    function mount(id, option, onClick) {
        const el = document.getElementById(id);
        if (!el) return null;
        const chart = echarts.init(el, null, { renderer: 'canvas' });
        chart.setOption({ textStyle: { fontFamily: 'Inter, sans-serif' }, animationDuration: 400, ...option });
        if (onClick) chart.on('click', onClick);
        charts.push(chart);
        return chart;
    }
    const ax = extra => ({ axisLabel: { color: C.muted, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } }, splitLine: { lineStyle: { color: C.grid } }, ...extra });
    const tip = { backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 } };
    const kpi = (label, value, sub) => `<div class="db-kpi"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;
    const managerIds = [...new Set(scope.flatMap(m => [m.oid]).filter(id => b.byId[id]))].sort((x, y) => name(x).localeCompare(name(y)));
    const focusSelect = `<label class="sx-f"><span>Focus</span><select class="select" id="mv-focus"><option value="">Whole league</option>
        ${managerIds.map(id => `<option value="${id}"${id === focus ? ' selected' : ''}>${esc(name(id))}</option>`).join('')}</select></label>`;
    function setFocus(id) {
        focus = id && b.byId[id] ? Number(id) : null;
        const sel = document.getElementById('mv-focus'); if (sel) sel.value = focus || '';
        const u = new URL(location.href); if (focus) u.searchParams.set('m', focus); else u.searchParams.delete('m'); history.replaceState(null, '', u);
        render();
    }
    // Statcast-style profile: the focused manager against everyone in scope
    const profile = (rows, metrics) => {
        const me = rows.find(r => r.id === focus);
        if (!me) return '';
        return `<div class="mv-profile">${metrics.map(([label, k, fmt, higher = true]) =>
            AN.bar(label, fmt(me[k]), AN.percentile(me[k], rows.map(r => r[k]), higher))).join('')}</div>${AN.legend()}`;
    };

    const render = TRADES ? tradesPage() : freeAgencyPage();
    window.addEventListener('themechange', () => render());
    window.addEventListener('resize', () => charts.forEach(c => c.resize()));
    render();

    // ================================================================ TRADES
    function tradesPage() {
        const groups = {};
        scope.forEach(m => { const k = `${m.tx}|${[m.oid, m.cid].sort().join('-')}`; (groups[k] = groups[k] || []).push(m); });
        const trades = Object.values(groups).map(sides => {
            sides.sort((x, y) => (y.netSt || 0) - (x.netSt || 0));
            const [a, c] = sides;
            return { a, c, sides, season: a.season, week: a.week, at: a.at, evidence: a.evidence, prov: a.prov,
                     margin: c ? Math.abs((a.netSt || 0) - (c.netSt || 0)) : Math.abs(a.netSt || 0) };
        }).sort((x, y) => y.season - x.season || (y.week || 0) - (x.week || 0));
        const seasonsIn = [...new Set(scope.map(m => m.season))];

        SITE.hero({ title: `${ALL ? 'All-Time' : season} Trades`, size: 'short', dots: false, image: 'background-12.png', tools: heroTools,
                    meta: [`${trades.length} trade${trades.length === 1 ? '' : 's'}${ALL ? ` · ${seasonsIn.length} seasons` : ''} · ${scope.reduce((t, m) => t + m.ins.length, 0)} players moved`,
                           inProgress ? 'Season in progress: dashed grades are provisional (pace so far)' : 'Graded on what each side went on to score in starting lineups'] });
        bindHero();
        content.innerHTML = `<div class="wrap page-pad">
            <div class="db-slicers">${focusSelect}<button class="sx-reset" id="mv-clear">Clear focus</button>
                <span class="db-note">${trades.length} trades · grades rank net started points vs every completed-season trade</span></div>
            <div class="db-kpis" id="mv-kpis"></div>
            <div class="db-grid">
                <section class="db-tile s12" id="mv-profile-tile" hidden><header><h3 id="mv-profile-title">Trade Profile</h3><p>Percentile against every manager who traded in this span</p></header><div id="mv-profile"></div></section>
                <section class="db-tile s7"><header><h3>Trade Ledger</h3><p>Net started points from trades, per manager. Click a bar to focus.</p></header><div class="db-chart" id="c-ledger"></div></section>
                <section class="db-tile s5"><header><h3>Who Won the Deal</h3><p>Each side: started points received vs given up. Below the line = won.</p></header><div class="db-chart" id="c-scatter"></div></section>
                <section class="db-tile s7"><header><h3>Record Swing</h3><p>Regular-season wins a manager's trades added (vs never making them)</p></header><div class="db-chart" id="c-swing"></div></section>
                <section class="db-tile s5"><header><h3>${ALL ? 'Trades by Season' : 'Trade Timing'}</h3><p>${ALL ? 'Trades per season and the average winning margin' : 'Trades by the week they took effect'}</p></header><div class="db-chart" id="c-time"></div></section>
            </div>
            <section class="mv-section"><div class="panel-head"><div><div class="eyebrow">${ALL ? 'Every season' : season}</div><h2 class="section-title">Every Trade</h2></div></div>
                <div class="tr-list" id="mv-cards"></div>
                <div class="mv-key"><span>${EX.ring('A', { small: true })} Final grade</span><span>${EX.ring('B', { small: true, prov: true })} Provisional (season in progress)</span>
                    <span>ROS = points scored after the trade · Started = while in this manager's lineup</span></div></section>
            <section class="mv-section"><div class="panel-head"><div><div class="eyebrow">Explorer</div><h2 class="section-title">Trade Sides</h2>
                <p class="section-copy" style="max-width:none">One row per side of every trade. Sort any column; export what you see.</p></div>
                <button class="btn btn-black" id="mv-csv">Export CSV</button></div>
                <div class="panel sx-panel" id="mv-table"></div></section>
            <p class="an-note">How trades are found and graded: python/transaction_grades.py reads the weekly roster snapshots (ESPN's trade log misses some trades),
            measures every player's points from the week he joined the new roster to the end of the regular season, and swaps players back for the what-if record.</p></div>`;
        document.getElementById('mv-focus').addEventListener('change', e => setFocus(e.target.value || null));
        document.getElementById('mv-clear').addEventListener('click', () => setFocus(null));

        const cols = [
            EX.col('season', 'Season', 6, false), EX.col('week', 'Wk', 5, true),
            EX.col('mgr', 'Manager', 12, false, r => GT.managerLink(r.mgr, r.season)), EX.col('partner', 'Partner', 12, false, r => r.partner ? GT.managerLink(r.partner, r.season) : '-'),
            EX.col('recv', 'Received', 17, false, r => esc(r.recv)), EX.col('sent', 'Sent', 17, false, r => esc(r.sent)),
            EX.col('stIn', 'St. in', 6, true, r => f1(r.stIn)), EX.col('stOut', 'St. out', 6, true, r => f1(r.stOut)),
            EX.col('netSt', 'Net', 7, true, r => `<b class="${r.netSt >= 0 ? 'win' : 'loss'}">${sgn(r.netSt)}</b>`),
            EX.col('winsAdded', 'Wins', 6, true, r => r.winsAdded == null ? '-' : r.winsAdded > 0 ? `+${r.winsAdded}` : String(r.winsAdded)),
            EX.col('gpa', 'Grade', 6, true, r => ringOf(r, true), r => r.grade || '')
        ];
        const table = EX.table(document.getElementById('mv-table'), { cols, rows: [], sort: ['netSt', -1], minWidth: 980 });
        document.getElementById('mv-csv').addEventListener('click', () => table.csv(`grass-touchers-trades-${season}`));

        return function render() {
            readColors();
            charts.splice(0).forEach(c => c.dispose());
            const mine = m => !focus || m.oid === focus;
            const sides = scope.filter(mine);
            const shown = trades.filter(t => !focus || t.sides.some(s => s.oid === focus));
            // per manager lines (everyone in scope), for the ledger, swing and profile
            const per = {};
            scope.forEach(m => {
                const r = per[m.oid] || (per[m.oid] = { id: m.oid, name: m.mgr, n: 0, net: 0, won: 0, wins: 0, gpaSum: 0, gpaN: 0 });
                r.n++; r.net += m.netSt || 0; if ((m.netSt || 0) > 0) r.won++; r.wins += m.winsAdded || 0;
                if (m.gpa != null) { r.gpaSum += m.gpa; r.gpaN++; }
            });
            const lines = Object.values(per).filter(r => b.byId[r.id]).map(r => ({ ...r, avg: r.n ? r.net / r.n : 0, winRate: r.n ? r.won / r.n : 0, gpa: r.gpaN ? r.gpaSum / r.gpaN : null }));

            // KPIs
            let html;
            if (focus) {
                const L = lines.find(l => l.id === focus) || { n: 0, net: 0, won: 0, wins: 0, gpa: null, avg: 0 };
                const rank = k => 1 + lines.filter(x => x[k] > L[k]).length;
                const best = sides.slice().sort((x, y) => (y.netSt || 0) - (x.netSt || 0))[0];
                html = kpi('Trades', L.n, `${L.won} won · ${L.n - L.won} lost or even`)
                     + kpi('Net started', sgn(L.net), `${ord(rank('net'))} of ${lines.length} traders`)
                     + kpi('Per trade', sgn(L.avg), 'net started points')
                     + kpi('Wins added', L.wins > 0 ? `+${L.wins}` : String(L.wins), 'what-if regular-season record')
                     + kpi('Avg grade', L.gpa == null ? '-' : gpaLetter(L.gpa), L.gpa == null ? 'no graded trades' : `GPA ${L.gpa.toFixed(2)}`)
                     + kpi('Best trade', best ? sgn(best.netSt) : '-', best ? `${esc(names(best.ins)) || '-'} · ${when(best)}` : '');
            } else {
                const active = lines.slice().sort((x, y) => y.n - x.n)[0];
                const lop = trades.slice().sort((x, y) => y.margin - x.margin)[0];
                const winner = lines.slice().sort((x, y) => y.net - x.net)[0];
                const swings = scope.filter(m => m.winsAdded > 0).length;
                html = kpi('Trades', trades.length, `${scope.reduce((t, m) => t + m.ins.length, 0)} players changed teams`)
                     + kpi('Most active', active ? esc(active.name) : '-', active ? `${active.n} trades` : '')
                     + kpi('Best trader', winner ? esc(winner.name) : '-', winner ? `${sgn(winner.net)} net started pts` : '')
                     + kpi('Most lopsided', lop ? GT.pts(lop.margin) : '-', lop ? `${esc(lop.a.mgr)} over ${esc(lop.c ? lop.c.mgr : '-')} · ${when(lop.a)}` : '')
                     + kpi('Avg margin', trades.length ? GT.pts(trades.reduce((t, x) => t + x.margin, 0) / trades.length) : '-', 'started-point gap between sides')
                     + kpi('Record changers', swings, 'trade sides that added a win');
            }
            document.getElementById('mv-kpis').innerHTML = html;

            // profile
            const tile = document.getElementById('mv-profile-tile');
            tile.hidden = !focus || !lines.find(l => l.id === focus);
            if (!tile.hidden) {
                document.getElementById('mv-profile-title').textContent = `${name(focus)} · Trade Profile`;
                document.getElementById('mv-profile').innerHTML = profile(lines, [
                    ['Trades made', 'n', v => v], ['Net started points', 'net', sgn], ['Net per trade', 'avg', sgn],
                    ['Trades won', 'winRate', pctTxt], ['Wins added', 'wins', v => v > 0 ? `+${v}` : String(v)], ['Grade point average', 'gpa', v => v == null ? '-' : v.toFixed(2)]]);
            }

            // charts
            const ledger = lines.slice().sort((x, y) => x.net - y.net);
            mount('c-ledger', {
                grid: { left: 84, right: 24, top: 6, bottom: 26 }, tooltip: { ...tip, trigger: 'axis', axisPointer: { type: 'shadow' } },
                xAxis: ax({ type: 'value' }), yAxis: ax({ type: 'category', data: ledger.map(l => l.name), axisTick: { show: false }, axisLabel: { color: C.ink, fontSize: 11 } }),
                series: [{ type: 'bar', barMaxWidth: 14, data: ledger.map(l => ({ value: +l.net.toFixed(1),
                    itemStyle: { color: l.net >= 0 ? C.accent : C.red, opacity: focus && l.id !== focus ? 0.28 : 1 } })) }]
            }, p => setFocus(focus === ledger[p.dataIndex].id ? null : ledger[p.dataIndex].id));
            const pts = scope.filter(m => m.stIn != null && m.stOut != null);
            const hi = Math.max(10, ...pts.map(m => Math.max(m.stIn, m.stOut)));
            mount('c-scatter', {
                grid: { left: 46, right: 18, top: 14, bottom: 40 },
                tooltip: { ...tip, formatter: p => p.data.m ? `<b>${esc(p.data.m.mgr)}</b> · ${when(p.data.m)}<br>Got ${esc(names(p.data.m.ins)) || '-'}: ${GT.pts(p.data.m.stIn)}<br>Gave ${esc(names(p.data.m.outs)) || '-'}: ${GT.pts(p.data.m.stOut)}` : '' },
                xAxis: ax({ type: 'value', name: 'Received (started pts)', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: C.muted, fontSize: 10 }, max: Math.ceil(hi / 10) * 10 }),
                yAxis: ax({ type: 'value', name: 'Given up', nameTextStyle: { color: C.muted, fontSize: 10 }, max: Math.ceil(hi / 10) * 10 }),
                series: [{ type: 'line', data: [[0, 0], [hi, hi]], symbol: 'none', lineStyle: { color: C.line, type: 'dashed' }, silent: true },
                         { type: 'scatter', symbolSize: 11, data: pts.map(m => ({ value: [m.stIn, m.stOut], m,
                             itemStyle: { color: m.stIn >= m.stOut ? C.accent : C.red, opacity: focus && m.oid !== focus ? 0.18 : 0.9, borderColor: C.surface, borderWidth: 1 } })) }]
            });
            const swing = lines.slice().sort((x, y) => y.wins - x.wins);
            mount('c-swing', {
                grid: { left: 36, right: 14, top: 10, bottom: 56 }, tooltip: { ...tip, trigger: 'axis', axisPointer: { type: 'shadow' } },
                xAxis: ax({ type: 'category', data: swing.map(l => l.name), axisLabel: { color: C.ink, fontSize: 10, rotate: 40 }, axisTick: { show: false } }),
                yAxis: ax({ type: 'value', minInterval: 1 }),
                series: [{ type: 'bar', barMaxWidth: 22, data: swing.map(l => ({ value: l.wins, itemStyle: { color: l.wins >= 0 ? C.accent : C.red, opacity: focus && l.id !== focus ? 0.28 : 1 } })) }]
            }, p => setFocus(swing[p.dataIndex].id));
            if (ALL) {
                const ss = [...new Set(trades.map(t => t.season))].sort();
                mount('c-time', {
                    grid: { left: 36, right: 44, top: 24, bottom: 26 }, tooltip: { ...tip, trigger: 'axis' },
                    legend: { top: 0, right: 0, textStyle: { color: C.muted, fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
                    xAxis: ax({ type: 'category', data: ss.map(String) }), yAxis: [ax({ type: 'value', minInterval: 1 }), ax({ type: 'value', splitLine: { show: false } })],
                    series: [{ name: 'Trades', type: 'bar', barMaxWidth: 26, itemStyle: { color: C.accent }, data: ss.map(s => trades.filter(t => t.season === s && (!focus || t.sides.some(x => x.oid === focus))).length) },
                             { name: 'Avg margin', type: 'line', yAxisIndex: 1, symbolSize: 6, itemStyle: { color: C.ink }, lineStyle: { color: C.ink },
                               data: ss.map(s => { const l = trades.filter(t => t.season === s); return l.length ? +(l.reduce((t, x) => t + x.margin, 0) / l.length).toFixed(1) : 0; }) }]
                });
            } else {
                const wks = Array.from({ length: Math.max(1, ...trades.map(t => t.week || 1)) }, (_, i) => i + 1);
                mount('c-time', {
                    grid: { left: 36, right: 14, top: 14, bottom: 26 }, tooltip: { ...tip, trigger: 'axis', axisPointer: { type: 'shadow' } },
                    xAxis: ax({ type: 'category', data: wks.map(w => `W${w}`) }), yAxis: ax({ type: 'value', minInterval: 1 }),
                    series: [{ type: 'bar', barMaxWidth: 22, itemStyle: { color: C.accent }, data: wks.map(w => shown.filter(t => t.week === w).length) }]
                });
            }

            // trade cards (both sides padded to the same number of player rows, so every row is the same height)
            const side = (m, rows, won) => !m ? '<div class="tr-side"></div>' : `<div class="tr-side${won ? ' won' : ''}">
                <div class="tr-who"><img src="${GT.logo(m.mgr)}" alt=""><div><b>${GT.managerLink(m.mgr, m.season)}</b><small>Received</small></div>${ringOf(m)}</div>
                <ul class="tr-pl"><li class="hd"><span>Pos</span><span>Player</span><span class="n">ROS</span><span class="n">Started</span></li>
                    ${m.ins.map(p => `<li><span class="pos">${esc(p.pos || '')}</span><span>${player(p)}</span><span class="n">${f1(p.ros)}</span><span class="n">${f1(p.st)}</span></li>`).join('')}
                    ${'<li></li>'.repeat(Math.max(0, rows - m.ins.length))}</ul>
                <div class="tr-foot"><span>Net started <b class="${m.netSt >= 0 ? 'win' : 'loss'}">${sgn(m.netSt)}</b></span>
                    <span>${m.rw != null && m.aw != null ? `Record <b>${m.rw}-${m.rl}</b> · without <b>${m.aw}-${m.al}</b>` : '&nbsp;'}</span></div></div>`;
            document.getElementById('mv-cards').innerHTML = shown.map(t => {
                const rows = Math.max(t.a.ins.length, t.c ? t.c.ins.length : 0, 1);
                const even = !t.c || Math.abs((t.a.netSt || 0) - (t.c.netSt || 0)) < 5;
                return `<article class="tr-card"><div class="tr-head"><span class="pill pill-dark">${t.season} · Wk ${t.week || '-'}</span>
                    <span>${t.at ? GT.fmtDate(new Date(t.at)) : ''}</span><span>${t.evidence === 'espn' ? 'ESPN record' : 'From weekly rosters'}</span>
                    <span class="tr-win">${even ? 'Even trade' : `${esc(t.a.mgr)} won by ${GT.pts(t.margin)}`}</span></div>
                    <div class="tr-sides">${side(t.a, rows, !even)}${side(t.c, rows, false)}</div></article>`;
            }).join('') || '<div class="panel"><p class="muted">No trades in this span.</p></div>';

            table.set(sides.map(m => ({ ...m, recv: names(m.ins), sent: names(m.outs) })));
        };
    }

    // ================================================================ FREE AGENCY
    function freeAgencyPage() {
        const f = { type: '', pos: '', q: '' };
        const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'P', 'D/ST', 'HC'];
        const mainPos = m => (m.kind === 'DROP' ? m.outs[0] : m.ins[0] || m.outs[0] || {}).pos || '';
        const adds = scope.filter(m => m.kind === 'PICKUP');
        SITE.hero({ title: `${ALL ? 'All-Time' : season} Free Agency`, size: 'short', dots: false, image: 'background-11.png', tools: heroTools,
                    meta: [`${adds.filter(m => m.type === 'Waiver claim').length} waiver claims · ${adds.filter(m => m.type === 'Free agent').length} free-agent adds · ${scope.filter(m => m.kind === 'DROP').length} drops`,
                           inProgress ? 'Season in progress: dashed grades are provisional (pace so far)' : 'Graded on what the added players scored in the lineup, minus what was cut'] });
        bindHero();
        const opt = (v, label, cur) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
        content.innerHTML = `<div class="wrap page-pad">
            <div class="db-slicers">${focusSelect}
                <label class="sx-f"><span>Move</span><select class="select" id="fa-type">${opt('', 'All moves', f.type)}${opt('Waiver claim', 'Waiver claims', f.type)}${opt('Free agent', 'Free-agent adds', f.type)}${opt('Drop', 'Drops only', f.type)}</select></label>
                <label class="sx-f"><span>Position</span><select class="select" id="fa-pos">${opt('', 'All', f.pos)}${POS.map(p => opt(p, p, f.pos)).join('')}</select></label>
                <label class="sx-f sx-q"><span>Player</span><input type="search" id="fa-q" placeholder="Search..." autocomplete="off"></label>
                <button class="sx-reset" id="mv-clear">Reset</button><span class="db-note" id="fa-note"></span></div>
            <div class="db-kpis" id="mv-kpis"></div>
            <div class="db-grid">
                <section class="db-tile s12" id="mv-profile-tile" hidden><header><h3 id="mv-profile-title">Waiver Profile</h3><p>Percentile against every manager in this span</p></header><div id="mv-profile"></div></section>
                <section class="db-tile s7"><header><h3>Activity</h3><p>${ALL ? 'Moves per season' : 'Moves by the week they took effect'}: waiver claims, free-agent adds and drops</p></header><div class="db-chart" id="c-activity"></div></section>
                <section class="db-tile s5"><header><h3>Value Added</h3><p>Net started points from pickups, per manager. Click a bar to focus.</p></header><div class="db-chart" id="c-value"></div></section>
                <section class="db-tile s5"><header><h3>Volume vs Value</h3><p>Pickups made vs net started points they produced</p></header><div class="db-chart" id="c-volume"></div></section>
                <section class="db-tile s7"><header><h3>Where the Points Came From</h3><p>Started points from pickups by position, waiver claims vs free agents</p></header><div class="db-chart" id="c-pos"></div></section>
                <section class="db-tile s6"><header><h3>Best Pickups</h3><p>Most net started points</p></header><ul class="mv-list" id="fa-best"></ul></section>
                <section class="db-tile s6"><header><h3>Costliest Cuts</h3><p>Dropped players who scored the most afterwards (any team)</p></header><ul class="mv-list" id="fa-cuts"></ul></section>
            </div>
            <section class="mv-section"><div class="panel-head"><div><div class="eyebrow">By manager</div><h2 class="section-title">Waiver Wire Report</h2></div></div>
                <div class="panel sx-panel" id="fa-mgr"></div></section>
            <section class="mv-section"><div class="panel-head"><div><div class="eyebrow">Explorer</div><h2 class="section-title">Every Move</h2>
                <p class="section-copy" style="max-width:none">Adds, waiver claims and drops with what the players did next. Sort any column; export what you see.</p></div>
                <button class="btn btn-black" id="mv-csv">Export CSV</button></div>
                <div class="panel sx-panel" id="mv-table"></div>
                <div class="mv-key"><span>${EX.ring('A', { small: true })} Final grade</span><span>${EX.ring('B', { small: true, prov: true })} Provisional (season in progress)</span>
                    <span>Pickup net = added players' points − the player dropped for them · Drop net = −(what the cut player scored next)</span></div></section></div>`;
        document.getElementById('mv-focus').addEventListener('change', e => setFocus(e.target.value || null));
        document.getElementById('mv-clear').addEventListener('click', () => { f.type = f.pos = f.q = ''; ['fa-type', 'fa-pos', 'fa-q'].forEach(id => { document.getElementById(id).value = ''; }); setFocus(null); });
        document.getElementById('fa-type').addEventListener('change', e => { f.type = e.target.value; render(); });
        document.getElementById('fa-pos').addEventListener('change', e => { f.pos = e.target.value; render(); });
        let timer;
        document.getElementById('fa-q').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { f.q = e.target.value.trim().toLowerCase(); render(); }, 200); });

        const mgrTable = EX.table(document.getElementById('fa-mgr'), { minWidth: 980, perPage: 20, sort: ['net', -1], cols: [
            EX.col('name', 'Manager', 14, false, r => `<span class="team-cell"><img src="${GT.logo(r.name)}" alt=""><b>${esc(r.name)}</b></span>`),
            EX.col('adds', 'Adds', 6, true), EX.col('waiver', 'Waivers', 7, true), EX.col('fa', 'FA', 6, true), EX.col('drops', 'Drops', 6, true),
            EX.col('stIn', 'Pts started', 9, true, r => f1(r.stIn)), EX.col('net', 'Net started', 9, true, r => `<b class="${r.net >= 0 ? 'win' : 'loss'}">${sgn(r.net)}</b>`),
            EX.col('hit', 'A/B rate', 7, true, r => pctTxt(r.hit)), EX.col('gpa', 'GPA', 6, true, r => r.gpa == null ? '-' : r.gpa.toFixed(2)),
            EX.col('bestName', 'Best add', 30, false, r => r.best ? `${esc(r.bestName)} <span class="muted">· ${sgn(r.best.netSt)} · ${when(r.best)}</span>` : '-')
        ], onRow: r => setFocus(r.id) });
        const cols = [
            EX.col('season', 'Season', 6, false), EX.col('week', 'Wk', 5, true), EX.col('type', 'Move', 9, false),
            EX.col('mgr', 'Manager', 12, false, r => GT.managerLink(r.mgr, r.season)),
            EX.col('added', 'Added', 17, false, r => r.ins.map(player).join(', ') || '-', r => r.added),
            EX.col('dropped', 'Dropped', 17, false, r => r.outs.map(player).join(', ') || '-', r => r.dropped),
            EX.col('stIn', 'Started', 7, true, r => f1(r.stIn)), EX.col('ptsOut', 'Cut pts', 7, true, r => f1(r.ptsOut)),
            EX.col('netSt', 'Net', 7, true, r => `<b class="${r.netSt >= 0 ? 'win' : 'loss'}">${sgn(r.netSt)}</b>`),
            EX.col('elapsed', 'Wks', 6, true, r => r.elapsed ?? '-'), EX.col('gpa', 'Grade', 7, true, r => ringOf(r, true), r => r.grade || '')
        ];
        const table = EX.table(document.getElementById('mv-table'), { cols, rows: [], sort: ['netSt', -1], minWidth: 1000 });
        document.getElementById('mv-csv').addEventListener('click', () => table.csv(`grass-touchers-free-agency-${season}`));

        return function render() {
            readColors();
            charts.splice(0).forEach(c => c.dispose());
            const match = m => (!f.type || m.type === f.type) && (!f.pos || mainPos(m) === f.pos)
                && (!f.q || [...m.ins, ...m.outs].some(p => String(p.name).toLowerCase().includes(f.q)));
            const pool = scope.filter(match);                   // the league, filtered (for comparisons)
            const list = pool.filter(m => !focus || m.oid === focus);
            document.getElementById('fa-note').textContent = `${list.length.toLocaleString()} moves`;

            const per = {};
            pool.forEach(m => {
                const r = per[m.oid] || (per[m.oid] = { id: m.oid, name: m.mgr, moves: 0, adds: 0, waiver: 0, fa: 0, drops: 0, stIn: 0, net: 0, ab: 0, graded: 0, gpaSum: 0, best: null });
                r.moves++;
                if (m.kind === 'DROP') r.drops++; else { r.adds++; if (m.type === 'Waiver claim') r.waiver++; else r.fa++; r.stIn += m.stIn || 0; r.net += m.netSt || 0;
                    if (!r.best || (m.netSt || 0) > (r.best.netSt || 0)) r.best = m; }
                if (m.kind === 'PICKUP' && m.grade) { r.graded++; r.gpaSum += m.gpa; if (m.grade === 'A' || m.grade === 'B') r.ab++; }
            });
            const lines = Object.values(per).filter(r => b.byId[r.id]).map(r => ({ ...r, hit: r.graded ? r.ab / r.graded : null, gpa: r.graded ? r.gpaSum / r.graded : null,
                                                                                   perAdd: r.adds ? r.net / r.adds : null, bestName: r.best ? names(r.best.ins) : '' }));
            const pick = list.filter(m => m.kind === 'PICKUP');
            const graded = pick.filter(m => m.grade);

            let html;
            if (focus) {
                const L = lines.find(l => l.id === focus) || { adds: 0, waiver: 0, fa: 0, drops: 0, stIn: 0, net: 0, hit: null, gpa: null };
                const rank = k => 1 + lines.filter(x => (x[k] ?? -1e9) > (L[k] ?? -1e9)).length;
                html = kpi('Adds', L.adds, `${L.waiver} waiver · ${L.fa} free agent`) + kpi('Drops', L.drops, 'pure cuts (no add)')
                     + kpi('Pts started', f1(L.stIn), `from pickups · ${ord(rank('stIn'))}`) + kpi('Net started', sgn(L.net), `${ord(rank('net'))} of ${lines.length}`)
                     + kpi('A/B rate', pctTxt(L.hit), L.gpa == null ? 'no graded pickups' : `GPA ${L.gpa.toFixed(2)}`)
                     + kpi('Best add', L.best ? sgn(L.best.netSt) : '-', L.best ? `${esc(names(L.best.ins))} · ${when(L.best)}` : '');
            } else {
                const busiest = lines.slice().sort((x, y) => y.moves - x.moves)[0];
                const top = lines.slice().sort((x, y) => y.net - x.net)[0];
                html = kpi('Moves', list.length.toLocaleString(), `${pick.length} adds · ${list.length - pick.length} drops`)
                     + kpi('Waiver claims', pick.filter(m => m.type === 'Waiver claim').length, `${pick.filter(m => m.type === 'Free agent').length} free-agent adds`)
                     + kpi('Pts started', f1(pick.reduce((t, m) => t + (m.stIn || 0), 0)), 'by players picked up')
                     + kpi('A/B rate', graded.length ? pctTxt(graded.filter(m => m.grade === 'A' || m.grade === 'B').length / graded.length) : '-', `of ${graded.length} graded pickups`)
                     + kpi('Busiest', busiest ? esc(busiest.name) : '-', busiest ? `${busiest.moves} moves` : '')
                     + kpi('Best wire work', top ? esc(top.name) : '-', top ? `${sgn(top.net)} net started` : '');
            }
            document.getElementById('mv-kpis').innerHTML = html;

            const tile = document.getElementById('mv-profile-tile');
            tile.hidden = !focus || !lines.find(l => l.id === focus);
            if (!tile.hidden) {
                document.getElementById('mv-profile-title').textContent = `${name(focus)} · Waiver Profile`;
                document.getElementById('mv-profile').innerHTML = profile(lines, [
                    ['Pickups made', 'adds', v => v], ['Points started from pickups', 'stIn', f1], ['Net started points', 'net', sgn],
                    ['Net per pickup', 'perAdd', sgn], ['A/B hit rate', 'hit', pctTxt], ['Grade point average', 'gpa', v => v == null ? '-' : v.toFixed(2)]]);
            }

            // activity
            const buckets = ALL ? [...new Set(list.map(m => m.season))].sort() : Array.from({ length: Math.max(1, ...list.map(m => m.week || 1)) }, (_, i) => i + 1);
            const key = m => ALL ? m.season : m.week;
            const count = t => buckets.map(x => list.filter(m => key(m) === x && m.type === t).length);
            mount('c-activity', {
                grid: { left: 36, right: 14, top: 28, bottom: 26 }, tooltip: { ...tip, trigger: 'axis', axisPointer: { type: 'shadow' } },
                legend: { top: 0, right: 0, textStyle: { color: C.muted, fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
                xAxis: ax({ type: 'category', data: buckets.map(x => ALL ? String(x) : `W${x}`) }), yAxis: ax({ type: 'value', minInterval: 1 }),
                series: [['Waiver claim', C.accent], ['Free agent', C.ink], ['Drop', C.red]].map(([t, c]) => ({ name: t, type: 'bar', stack: 'a', barMaxWidth: 26, itemStyle: { color: c }, data: count(t) }))
            });
            const value = lines.slice().sort((x, y) => x.net - y.net);
            mount('c-value', {
                grid: { left: 84, right: 20, top: 6, bottom: 26 }, tooltip: { ...tip, trigger: 'axis', axisPointer: { type: 'shadow' } },
                xAxis: ax({ type: 'value' }), yAxis: ax({ type: 'category', data: value.map(l => l.name), axisTick: { show: false }, axisLabel: { color: C.ink, fontSize: 11 } }),
                series: [{ type: 'bar', barMaxWidth: 14, data: value.map(l => ({ value: +l.net.toFixed(1), itemStyle: { color: l.net >= 0 ? C.accent : C.red, opacity: focus && l.id !== focus ? 0.28 : 1 } })) }]
            }, p => setFocus(focus === value[p.dataIndex].id ? null : value[p.dataIndex].id));
            mount('c-volume', {
                grid: { left: 46, right: 24, top: 16, bottom: 40 },
                tooltip: { ...tip, formatter: p => `<b>${esc(p.data.l.name)}</b><br>${p.data.l.adds} pickups · ${sgn(p.data.l.net)} net started` },
                xAxis: ax({ type: 'value', name: 'Pickups', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: C.muted, fontSize: 10 }, minInterval: 1 }),
                yAxis: ax({ type: 'value', name: 'Net started', nameTextStyle: { color: C.muted, fontSize: 10 } }),
                series: [{ type: 'scatter', symbolSize: 13, label: { show: true, position: 'right', formatter: p => p.data.l.name, color: C.muted, fontSize: 9 },
                           data: lines.map(l => ({ value: [l.adds, +l.net.toFixed(1)], l, itemStyle: { color: l.net >= 0 ? C.accent : C.red, opacity: focus && l.id !== focus ? 0.2 : 0.9 } })) }]
            }, p => setFocus(p.data.l.id));
            const byPos = t => POS.map(p => +pick.filter(m => m.type === t && (m.ins[0] || {}).pos === p).reduce((s, m) => s + (m.stIn || 0), 0).toFixed(1));
            mount('c-pos', {
                grid: { left: 46, right: 14, top: 28, bottom: 26 }, tooltip: { ...tip, trigger: 'axis', axisPointer: { type: 'shadow' } },
                legend: { top: 0, right: 0, textStyle: { color: C.muted, fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
                xAxis: ax({ type: 'category', data: POS }), yAxis: ax({ type: 'value' }),
                series: [['Waiver claim', C.accent], ['Free agent', C.ink]].map(([t, c]) => ({ name: t, type: 'bar', stack: 'a', barMaxWidth: 34, itemStyle: { color: c }, data: byPos(t) }))
            });

            // lists
            const li = (img, title, sub, val, ring) => `<li><img src="${img}" alt=""><div class="who"><b>${title}</b><small>${sub}</small></div><span class="n">${val}</span>${ring}</li>`;
            const best = pick.slice().sort((x, y) => (y.netSt || 0) - (x.netSt || 0)).slice(0, 8);
            document.getElementById('fa-best').innerHTML = best.map(m => li(GT.logo(m.mgr), m.ins.map(player).join(', ') || '-',
                `${esc(m.mgr)} · ${esc(m.type)} · ${when(m)}${m.outs.length ? ` · for ${esc(names(m.outs))}` : ''}`, sgn(m.netSt), ringOf(m, true))).join('') || '<li class="empty">No pickups match.</li>';
            const cuts = list.flatMap(m => m.outs.map(p => ({ m, p }))).filter(x => (x.p.ros || 0) > 0).sort((x, y) => (y.p.ros || 0) - (x.p.ros || 0)).slice(0, 8);
            document.getElementById('fa-cuts').innerHTML = cuts.map(({ m, p }) => li(GT.logo(m.mgr), player(p),
                `${esc(m.mgr)} · cut ${when(m)}${m.ins.length ? ` · for ${esc(names(m.ins))}` : ''}`, f1(p.ros), ringOf(m, true))).join('') || '<li class="empty">No costly cuts.</li>';

            mgrTable.set(lines);
            table.set(list.map(m => ({ ...m, added: names(m.ins), dropped: names(m.outs) })));
        };
    }
})();
