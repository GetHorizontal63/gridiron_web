/* Past Seasons: Draft Grades. Every pick graded twice (NEW/python/draft_grades.py): on draft day, from ESPN's
   preseason projections and the roster the manager had built so far; and in hindsight, from what the player
   actually scored, with the players still on the board who would have been better picks.
   Draft day / Hindsight switches every grade, colour and chart on the page. Click a card to focus a manager,
   click a board cell for the full story of that pick. */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    const name = id => (b.byId[id] || {}).name || 'Vacant team';

    const gradeRows = await GT.query(`SELECT season, owner_id AS oid, picks, pre_score AS preScore, pre_pct AS prePct, pre_grade AS preGrade, pre_rank AS preRank,
                                             post_score AS postScore, post_pct AS postPct, post_grade AS postGrade, post_rank AS postRank,
                                             proj_vorp AS projVorp, actual_vorp AS actVorp, actual_points AS pts, starters_hit AS hits,
                                             best_pick AS bestPick, worst_pick AS worstPick, provisional AS prov FROM draft_grades`);
    const seasons = [...new Set(gradeRows.map(g => g.season))].sort((x, y) => y - x);
    const season = seasons.includes(Number(param('season'))) ? Number(param('season')) : seasons.includes(b.season) ? b.season : seasons[0];
    const [pickRows, valueRows] = await Promise.all([
        GT.query(`SELECT d.*, p.name FROM draft_picks d JOIN players p ON p.player_id = d.player_id WHERE d.season = $s ORDER BY d.overall_pick`, { $s: season }),
        GT.query(`SELECT v.player_id AS pid, p.name, v.pos, v.proj_points AS proj, v.proj_pos_rank AS prank, v.actual_points AS pts, v.actual_vorp AS avorp,
                         v.games, v.drafted_pick AS pick, p.pro_team AS team FROM player_values v JOIN players p ON p.player_id = v.player_id WHERE v.season = $s`, { $s: season })
    ]);
    const val = Object.fromEntries(valueRows.map(v => [v.pid, v]));
    // a season in progress: projections are compared pro rata (weeks played of a 17-week fantasy season)
    const PROV = gradeRows.some(g => g.season === season && g.prov);
    const [{ w: played }] = await GT.query('SELECT MAX(week) AS w FROM matchups WHERE season = $s', { $s: season });
    const SCALE = PROV ? Math.min(1, (played || 0) / 17) : 1;
    const picks = pickRows.map(r => ({ ...r, mgr: r.owner_id ? name(r.owner_id) : 'Vacant team', better: JSON.parse(r.better_available || '[]'),
                                       same: r.best_same_pos ? JSON.parse(r.best_same_pos) : null,
                                       projPace: r.proj_points == null ? null : r.proj_points * SCALE,
                                       vsProj: r.proj_points ? r.actual_points - r.proj_points * SCALE : null }));
    const grades = gradeRows.filter(g => g.season === season).map(g => ({ ...g, mgr: name(g.oid) }));
    const teams = Math.max(...picks.map(p => p.round_pick));
    const rounds = Math.max(...picks.map(p => p.round));
    const byPick = Object.fromEntries(picks.map(p => [p.overall_pick, p]));

    // ---------------------------------------------------------------- header
    SITE.subHeader({
        crumbs: [['Past Seasons', url('pages/past-seasons/index.html')], [`${season} Draft Grades`]],
        tabs: SITE.sectionTabs('competitions', 'draft').filter(t => !t.href.endsWith('index.html')).map(t => ({ ...t, href: `${t.href}?season=${season}` }))
    });
    SITE.hero({ title: `${season} Draft Grades`, size: 'short', dots: false, image: 'background-13.png',
                tools: `<label class="hero-season"><span>Season</span><select class="select" id="hero-season">${seasons.map(s => `<option value="${s}"${s === season ? ' selected' : ''}>${s} draft</option>`).join('')}</select></label>`,
                meta: [`${picks.length} picks · ${rounds} rounds · ${grades.length} managers`,
                       PROV ? `Season in progress: hindsight grades are provisional (through week ${played})` : 'Graded on draft day and again after the season'] });
    document.getElementById('hero-season').addEventListener('change', e => { const u = new URL(location.href); u.searchParams.set('season', e.target.value); u.searchParams.delete('pick'); location.href = u; });

    // ---------------------------------------------------------------- helpers
    const f1 = v => v == null || isNaN(v) ? '-' : GT.pts(v);
    const sgn = v => v == null || isNaN(v) ? '-' : `${v > 0 ? '+' : ''}${GT.pts(v)}`;
    const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    const pName = id => (val[id] || {}).name || (picks.find(p => p.player_id === id) || {}).name || '?';
    const player = (id, label) => id > 0 ? `<a href="${url(`pages/players/stats.html?id=${id}`)}">${esc(label || pName(id))}</a>` : esc(label || pName(id));
    const headshot = p => p.player_id > 0 ? `https://a.espncdn.com/i/headshots/nfl/players/full/${p.player_id}.png`
        : url(`assets/nfl-logos/${String((val[p.player_id] || {}).team || 'nfl').toLowerCase()}.png`);
    const pickLabel = p => `${p.round}.${String(p.round_pick).padStart(2, '0')}`;
    let mode = param('view') === 'pre' ? 'pre' : 'post';      // 'pre' = draft day, 'post' = hindsight
    let focus = b.byId[param('m')] ? Number(param('m')) : null;
    let selected = byPick[param('pick')] ? Number(param('pick')) : null;
    const f = { round: '', pos: '' };
    const G = (x, m = mode) => m === 'pre' ? { grade: x.pre_grade ?? x.preGrade, pct: x.pre_pct ?? x.prePct, s: x.pre_surplus ?? x.preScore, rank: x.preRank }
                                           : { grade: x.post_grade ?? x.postGrade, pct: x.post_pct ?? x.postPct, s: x.post_surplus ?? x.postScore, rank: x.postRank };
    const ring = (x, m = mode, small = false) => EX.ring(G(x, m).grade, { small, prov: m === 'post' && !!(x.provisional || x.prov),
                                                                          title: `${m === 'pre' ? 'Draft day' : 'Hindsight'} · surplus ${sgn(G(x, m).s)}` });
    const MODE_TXT = () => mode === 'pre' ? 'Draft day' : PROV ? 'Hindsight (to date)' : 'Hindsight';
    const charts = [];
    const C = {};
    const readColors = () => Object.assign(C, { accent: SITE.color('accent'), red: SITE.color('danger'), ink: SITE.color('ink'), muted: SITE.color('muted'),
                                                 grid: SITE.color('track'), line: SITE.color('line-strong'), surface: SITE.color('surface') });
    const ax = extra => ({ axisLabel: { color: C.muted, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } }, splitLine: { lineStyle: { color: C.grid } }, ...extra });
    const tip = { backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 } };
    const POS_COLOR = { QB: '#c0392b', RB: '#2e86de', WR: '#27ae60', TE: '#e67e22', K: '#8e44ad', P: '#7f8c8d', 'D/ST': '#34495e', HC: '#b7950b' };
    function mount(id, option, onClick) {
        const chart = echarts.init(document.getElementById(id), null, { renderer: 'canvas' });
        chart.setOption({ textStyle: { fontFamily: 'Inter, sans-serif' }, animationDuration: 400, ...option });
        if (onClick) chart.on('click', onClick);
        charts.push(chart);
    }
    const kpi = (label, value, sub) => `<div class="db-kpi"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;
    const syncUrl = () => {
        const u = new URL(location.href);
        [['m', focus], ['pick', selected], ['view', mode === 'pre' ? 'pre' : null]].forEach(([k, v]) => { if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); });
        history.replaceState(null, '', u);
    };
    const setFocus = id => { focus = id && b.byId[id] ? Number(id) : null; document.getElementById('dg-focus').value = focus || ''; syncUrl(); render(); };
    const select = pick => { selected = pick; syncUrl(); renderBoard(); renderDetail(); document.getElementById('dg-detail-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };

    // ---------------------------------------------------------------- layout
    const opt = (v, label) => `<option value="${v}">${esc(label)}</option>`;
    const POS = [...new Set(picks.map(p => p.pos).filter(Boolean))];
    content.innerHTML = `<div class="wrap page-pad">
        <div class="db-slicers">
            <div class="sx-f"><span>Grade</span><div class="seg" id="dg-mode"><button data-m="pre">Draft day</button><button data-m="post">Hindsight</button></div></div>
            <label class="sx-f"><span>Focus</span><select class="select" id="dg-focus">${opt('', 'Whole league')}${grades.slice().sort((x, y) => x.mgr.localeCompare(y.mgr)).map(g => opt(g.oid, g.mgr)).join('')}</select></label>
            <label class="sx-f"><span>Round</span><select class="select" id="dg-round">${opt('', 'All')}${Array.from({ length: rounds }, (_, i) => opt(i + 1, `Round ${i + 1}`)).join('')}</select></label>
            <label class="sx-f"><span>Position</span><select class="select" id="dg-pos">${opt('', 'All')}${POS.map(p => opt(p, p)).join('')}</select></label>
            <button class="sx-reset" id="dg-clear">Reset</button><span class="db-note" id="dg-note"></span></div>
        <div class="db-kpis" id="dg-kpis"></div>
        <section class="mv-section" style="margin-top:20px"><div class="panel-head"><div><div class="eyebrow" id="dg-cards-eyebrow"></div><h2 class="section-title">Report Cards</h2></div></div>
            <div class="dg-cards" id="dg-cards"></div></section>
        <div class="db-grid" style="margin-top:14px">
            <section class="db-tile s12" id="dg-profile-tile" hidden><header><h3 id="dg-profile-title"></h3><p>Percentile against the rest of this draft</p></header><div id="dg-profile"></div></section>
            <section class="db-tile s6"><header><h3>Draft Day vs Hindsight</h3><p>Each manager's summed pick surplus. Top right = drafted well and it paid off.</p></header><div class="db-chart" id="c-quad"></div></section>
            <section class="db-tile s6"><header><h3>Pick Value Curve</h3><p id="c-curve-sub"></p></header><div class="db-chart" id="c-curve"></div></section>
            <section class="db-tile s6"><header><h3>Projection vs Result</h3><p>Every pick: preseason projection vs points scored. Above the line = beat it.</p></header><div class="db-chart" id="c-proj"></div></section>
            <section class="db-tile s6"><header><h3>How Rosters Were Built</h3><p id="c-build-sub">Positions taken in each round</p></header><div class="db-chart" id="c-build"></div></section>
        </div>
        <section class="mv-section"><div class="panel-head"><div><div class="eyebrow">Click a pick for the full story</div><h2 class="section-title">Draft Board</h2></div></div>
            <div class="panel"><div class="dg-board-wrap" id="dg-board"></div>
            <div class="mv-key">${['QB', 'RB', 'WR', 'TE', 'K', 'P', 'D/ST', 'HC'].filter(p => POS.includes(p)).map(p => `<span><i style="width:10px;height:10px;display:inline-block;background:${POS_COLOR[p]}"></i>${p}</span>`).join('')}
                <span>Left edge = position · letter = pick grade (the selected view)</span></div></div></section>
        <section class="mv-section" id="dg-detail-panel"><div class="panel" id="dg-detail"></div></section>
        <section class="mv-section"><div class="panel-head"><div><div class="eyebrow">Explorer</div><h2 class="section-title">Every Pick</h2>
            <p class="section-copy" style="max-width:none">Sort any column; export what you see. Click a row to open the pick.</p></div>
            <button class="btn btn-black" id="dg-csv">Export CSV</button></div><div class="panel sx-panel" id="dg-table"></div></section>
        <section class="mv-section"><div class="panel-head"><div><div class="eyebrow">Every draft since ${seasons[seasons.length - 1]}</div><h2 class="section-title">Draft Grade History</h2>
            <p class="section-copy" style="max-width:none" id="dg-matrix-sub"></p></div></div><div class="panel sx-panel" id="dg-matrix"></div></section>
        <p class="an-note">How picks are graded: value is points over replacement (the best player at the position who wouldn't start in a ${teams}-team league, FLEX included).
        Draft day compares a pick's projected value, scaled by how much the roster needed that position at that moment (an open starting slot counts in full, a backup partly,
        a third QB or second kicker hardly at all), with what the slot was worth if the board went in projection order. Hindsight compares what the player actually scored over replacement
        with what picks around that slot returned in completed seasons. Pick letters rank within the same round of every draft; manager letters rank against every manager-draft since ${seasons[seasons.length - 1]}.
        Projections and points come from ESPN, scored with the league's rules for that season.</p></div>`;

    document.querySelectorAll('#dg-mode button').forEach(btn => btn.addEventListener('click', () => { mode = btn.dataset.m; syncUrl(); render(); }));
    document.getElementById('dg-focus').value = focus || '';
    document.getElementById('dg-focus').addEventListener('change', e => setFocus(e.target.value || null));
    document.getElementById('dg-round').addEventListener('change', e => { f.round = e.target.value ? Number(e.target.value) : ''; render(); });
    document.getElementById('dg-pos').addEventListener('change', e => { f.pos = e.target.value; render(); });
    document.getElementById('dg-clear').addEventListener('click', () => { f.round = ''; f.pos = ''; document.getElementById('dg-round').value = ''; document.getElementById('dg-pos').value = ''; setFocus(null); });

    const table = EX.table(document.getElementById('dg-table'), { minWidth: 1180, sort: ['overall_pick', 1], onRow: r => select(r.overall_pick), cols: [
        EX.col('overall_pick', 'Pick', 5, true, r => `<b>${pickLabel(r)}</b>`, r => pickLabel(r)),
        EX.col('mgr', 'Manager', 10, false, r => r.owner_id ? GT.managerLink(r.mgr, season) : esc(r.mgr)),
        EX.col('name', 'Player', 14, false, r => player(r.player_id, r.name)), EX.col('pos', 'Pos', 4, false),
        EX.col('slot_role', 'Fit', 6, false), EX.col('proj_points', 'Proj', 6, true, r => f1(r.proj_points)),
        EX.col('proj_pos_rank', 'Proj rk', 6, true, r => r.proj_pos_rank ? `${r.pos}${r.proj_pos_rank}` : '-'),
        EX.col('pre_pct', 'Day', 5, true, r => ring(r, 'pre', true), r => r.pre_grade || ''),
        EX.col('actual_points', 'Pts', 6, true, r => f1(r.actual_points)), EX.col('vsProj', '+/- proj', 6, true, r => `<span class="${r.vsProj >= 0 ? 'win' : 'loss'}">${sgn(r.vsProj)}</span>`),
        EX.col('actual_pos_rank', 'Fin rk', 6, true, r => r.actual_pos_rank ? `${r.pos}${r.actual_pos_rank}` : '-'),
        EX.col('post_pct', 'Now', 5, true, r => ring(r, 'post', true), r => r.post_grade || ''),
        EX.col('betterNames', 'Better available', 21, false, r => r.better.length ? r.better.map(x => `${player(x.id)} <span class="muted">${f1(x.pts)}</span>`).join(', ') : '<span class="muted">None: best value left</span>', r => r.betterNames)
    ] });
    document.getElementById('dg-csv').addEventListener('click', () => table.csv(`grass-touchers-draft-${season}`));
    const matrix = EX.table(document.getElementById('dg-matrix'), { minWidth: 260 + seasons.length * 70, perPage: 30, sort: ['avg', -1], cols: [
        EX.col('name', 'Manager', 16, false, r => `<span class="team-cell"><img src="${GT.logo(r.name)}" alt=""><b>${esc(r.name)}</b></span>`),
        ...seasons.slice().reverse().map(s => EX.col(`s${s}`, String(s), (72 / seasons.length).toFixed(2), true, r => r[`g${s}`] ? EX.ring(r[`g${s}`], { small: true, prov: r[`p${s}`] }) : '<span class="muted">·</span>', r => r[`g${s}`] || '')),
        EX.col('avg', 'Avg pct', 12, true, r => r.avg == null ? '-' : `<b>${Math.round(r.avg)}</b>`)
    ] });

    // ---------------------------------------------------------------- render
    function render() {
        readColors();
        charts.splice(0).forEach(c => c.dispose());
        document.querySelectorAll('#dg-mode button').forEach(btn => btn.classList.toggle('on', btn.dataset.m === mode));
        const shown = picks.filter(p => (!f.round || p.round === f.round) && (!f.pos || p.pos === f.pos));
        const mine = shown.filter(p => !focus || p.owner_id === focus);
        document.getElementById('dg-note').textContent = `${mine.length} picks · ${MODE_TXT()}`;
        renderKpis(mine);
        renderCards();
        renderProfile();
        renderCharts(shown);
        renderBoard();
        renderDetail();
        table.set(mine.map(p => ({ ...p, betterNames: p.better.map(x => pName(x.id)).join(', ') })));
        const rows = {};
        gradeRows.forEach(g => {
            const r = rows[g.oid] || (rows[g.oid] = { name: name(g.oid), pcts: [] });
            const x = G(g); r[`g${g.season}`] = x.grade; r[`s${g.season}`] = x.pct; r[`p${g.season}`] = mode === 'post' && !!g.prov;
            if (x.pct != null) r.pcts.push(x.pct);
        });
        matrix.set(Object.values(rows).filter(r => b.byId[(b.byName[r.name.toLowerCase()] || {}).id]).map(r => ({ ...r, avg: r.pcts.length ? r.pcts.reduce((t, v) => t + v, 0) / r.pcts.length : null })));
        document.getElementById('dg-matrix-sub').textContent = `${MODE_TXT()} grade for every manager's draft. Avg pct = average percentile across their drafts.`;
    }

    function renderKpis(list) {
        let html;
        const steal = list.filter(p => p.post_surplus != null).sort((x, y) => y.post_surplus - x.post_surplus)[0];
        const bust = list.filter(p => p.post_surplus != null).sort((x, y) => x.post_surplus - y.post_surplus)[0];
        if (focus) {
            const g = grades.find(x => x.oid === focus);
            const best = byPick[g.bestPick], worst = byPick[g.worstPick];
            html = kpi('Draft day', g.preGrade || '-', `${ord(g.preRank)} of ${grades.length} · surplus ${sgn(g.preScore)}`)
                 + kpi(PROV ? 'Hindsight (to date)' : 'Hindsight', g.postGrade || '-', `${ord(g.postRank)} of ${grades.length} · surplus ${sgn(g.postScore)}`)
                 + kpi('Points from picks', f1(g.pts), `${PROV ? 'so far' : 'season total'} · all ${g.picks} picks`)
                 + kpi('Starters hit', g.hits, 'picks who finished as a starter at their position')
                 + kpi('Best pick', best ? esc(best.name) : '-', best ? `${pickLabel(best)} · ${sgn(best.post_surplus)} vs slot` : '')
                 + kpi('Worst pick', worst ? esc(worst.name) : '-', worst ? `${pickLabel(worst)} · ${sgn(worst.post_surplus)} vs slot` : '');
        } else {
            const top = grades.slice().sort((x, y) => G(x).rank - G(y).rank)[0];
            const smart = grades.slice().sort((x, y) => x.preRank - y.preRank)[0];
            const gem = valueRows.filter(v => v.pick == null && v.avorp != null).sort((x, y) => y.avorp - x.avorp)[0];
            const beat = list.filter(p => p.vsProj != null && p.round <= 5).sort((x, y) => y.vsProj - x.vsProj)[0];
            html = kpi(mode === 'pre' ? 'Best on draft day' : 'Best draft', top ? esc(top.mgr) : '-', top ? `${G(top).grade} · surplus ${sgn(G(top).s)}` : '')
                 + kpi(mode === 'pre' ? 'Best in hindsight' : 'Best on draft day', esc((mode === 'pre' ? grades.slice().sort((x, y) => x.postRank - y.postRank)[0] : smart).mgr),
                       mode === 'pre' ? `${grades.slice().sort((x, y) => x.postRank - y.postRank)[0].postGrade} in hindsight` : `${smart.preGrade} on draft day`)
                 + kpi('Steal', steal ? esc(steal.name) : '-', steal ? `${pickLabel(steal)} ${esc(steal.mgr)} · ${sgn(steal.post_surplus)} vs slot` : '')
                 + kpi('Bust', bust ? esc(bust.name) : '-', bust ? `${pickLabel(bust)} ${esc(bust.mgr)} · ${sgn(bust.post_surplus)} vs slot` : '')
                 + kpi('Beat projection', beat ? esc(beat.name) : '-', beat ? `rounds 1-5 · ${sgn(beat.vsProj)} pts` : '')
                 + kpi('Undrafted gem', gem ? esc(gem.name) : '-', gem ? `${gem.pos} · ${f1(gem.pts)} pts, nobody took him` : '');
        }
        document.getElementById('dg-kpis').innerHTML = html;
    }

    function renderCards() {
        document.getElementById('dg-cards-eyebrow').textContent = `${season} · ranked by ${MODE_TXT().toLowerCase()} grade`;
        document.getElementById('dg-cards').innerHTML = grades.slice().sort((x, y) => G(x).rank - G(y).rank).map(g => {
            const best = byPick[g.bestPick], worst = byPick[g.worstPick];
            return `<div class="dg-card${focus === g.oid ? ' on' : focus ? ' dim' : ''}" data-oid="${g.oid}">
                <div class="dg-card-top"><img src="${GT.logo(g.mgr)}" alt=""><div><b>${esc(g.mgr)}</b><small>${esc(GT.teamName(b, g.mgr, season))}</small></div><span class="rk">${G(g).rank}</span></div>
                <div class="dg-grades"><div class="dg-grade">${ring(g, 'pre')}<span>Draft<br>day</span></div><div class="dg-grade">${ring(g, 'post')}<span>${PROV ? 'To<br>date' : 'Hind-<br>sight'}</span></div></div>
                <p><em>Best</em> ${best ? `${esc(best.name)} (${pickLabel(best)})` : '-'}</p>
                <p><em>Worst</em> ${worst ? `${esc(worst.name)} (${pickLabel(worst)})` : '-'}</p>
                <p><em>Starters hit</em> ${g.hits} · <em>pts</em> ${f1(g.pts)}</p></div>`;
        }).join('');
        document.querySelectorAll('.dg-card').forEach(c => c.addEventListener('click', () => setFocus(focus === Number(c.dataset.oid) ? null : c.dataset.oid)));
    }

    function renderProfile() {
        const tile = document.getElementById('dg-profile-tile');
        tile.hidden = !focus;
        if (!focus) return;
        const lines = grades.map(g => {
            const ps = picks.filter(p => p.owner_id === g.oid);
            const early = ps.filter(p => p.round <= 5);
            return { id: g.oid, pre: g.preScore, post: g.postScore, pts: g.pts, hits: g.hits,
                     early: early.reduce((t, p) => t + (p.actual_vorp || 0), 0), late: ps.filter(p => p.round > 5).reduce((t, p) => t + (p.actual_vorp || 0), 0),
                     beat: ps.filter(p => p.vsProj > 0).length / (ps.length || 1) };
        });
        const me = lines.find(l => l.id === focus);
        document.getElementById('dg-profile-title').textContent = `${name(focus)} · ${season} Draft Profile`;
        document.getElementById('dg-profile').innerHTML = `<div class="mv-profile">${[
            ['Draft-day surplus', 'pre', sgn], [PROV ? 'Hindsight surplus (to date)' : 'Hindsight surplus', 'post', sgn], ['Points from drafted players', 'pts', f1],
            ['Starters hit', 'hits', v => v], ['Rounds 1-5 value over replacement', 'early', sgn], ['Rounds 6+ value over replacement', 'late', sgn],
            ['Picks that beat their projection', 'beat', v => `${Math.round(v * 100)}%`]
        ].map(([label, k, fmt]) => AN.bar(label, fmt(me[k]), AN.percentile(me[k], lines.map(l => l[k])))).join('')}</div>${AN.legend()}`;
    }

    function renderCharts(shown) {
        const hi = g => focus && g.oid !== focus ? 0.22 : 0.95;
        mount('c-quad', {
            grid: { left: 54, right: 24, top: 16, bottom: 42 },
            tooltip: { ...tip, formatter: p => `<b>${esc(p.data.g.mgr)}</b><br>Draft day ${p.data.g.preGrade} (${sgn(p.data.g.preScore)})<br>Hindsight ${p.data.g.postGrade} (${sgn(p.data.g.postScore)})` },
            xAxis: ax({ type: 'value', name: 'Draft-day surplus', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: C.muted, fontSize: 10 } }),
            yAxis: ax({ type: 'value', name: 'Hindsight', nameTextStyle: { color: C.muted, fontSize: 10 } }),
            series: [{ type: 'scatter', symbolSize: 14, label: { show: true, position: 'right', formatter: p => p.data.g.mgr, color: C.muted, fontSize: 9 },
                       markLine: { silent: true, symbol: 'none', lineStyle: { color: C.line, type: 'dashed' }, label: { show: false }, data: [{ xAxis: 0 }, { yAxis: 0 }] },
                       data: grades.map(g => ({ value: [g.preScore, g.postScore], g, itemStyle: { color: AN.color(g.postPct), opacity: hi(g), borderColor: C.surface, borderWidth: 1 } })) }]
        }, p => setFocus(focus === p.data.g.oid ? null : p.data.g.oid));
        const key = mode === 'pre' ? 'pre_surplus' : 'post_surplus';
        document.getElementById('c-curve-sub').textContent = `${MODE_TXT()} surplus of every pick vs what its slot is worth. Coloured by position.`;
        mount('c-curve', {
            grid: { left: 46, right: 14, top: 26, bottom: 36 },
            legend: { top: 0, right: 0, textStyle: { color: C.muted, fontSize: 10 }, itemWidth: 9, itemHeight: 9 },
            tooltip: { ...tip, formatter: p => `<b>${esc(p.data.p.name)}</b> · ${pickLabel(p.data.p)} ${esc(p.data.p.mgr)}<br>${MODE_TXT()} surplus ${sgn(p.data.p[key])}` },
            xAxis: ax({ type: 'value', name: 'Overall pick', nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: C.muted, fontSize: 10 }, max: picks.length }),
            yAxis: ax({ type: 'value' }),
            series: Object.keys(POS_COLOR).filter(pos => shown.some(p => p.pos === pos)).map(pos => ({
                name: pos, type: 'scatter', symbolSize: 7,
                data: shown.filter(p => p.pos === pos && p[key] != null).map(p => ({ value: [p.overall_pick, p[key]], p,
                    itemStyle: { color: POS_COLOR[pos], opacity: focus && p.owner_id !== focus ? 0.12 : 0.85 } }))
            }))
        }, p => select(p.data.p.overall_pick));
        const maxP = Math.max(10, ...shown.map(p => Math.max(p.projPace || 0, p.actual_points || 0)));
        mount('c-proj', {
            grid: { left: 46, right: 14, top: 16, bottom: 40 },
            tooltip: { ...tip, formatter: p => p.data.p ? `<b>${esc(p.data.p.name)}</b> · ${pickLabel(p.data.p)} ${esc(p.data.p.mgr)}<br>Projected ${f1(p.data.p.projPace)}${PROV ? ' (pro rata)' : ''} · scored ${f1(p.data.p.actual_points)}` : '' },
            xAxis: ax({ type: 'value', name: PROV ? `Preseason projection, pro rata (${played} of 17 wk)` : 'Preseason projection', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: C.muted, fontSize: 10 }, max: Math.ceil(maxP / 10) * 10 }),
            yAxis: ax({ type: 'value', name: PROV ? 'Scored so far' : 'Scored', nameTextStyle: { color: C.muted, fontSize: 10 }, max: Math.ceil(maxP / 10) * 10 }),
            series: [{ type: 'line', data: [[0, 0], [maxP, maxP]], symbol: 'none', lineStyle: { color: C.line, type: 'dashed' }, silent: true },
                     { type: 'scatter', symbolSize: 7, data: shown.filter(p => p.projPace != null).map(p => ({ value: [p.projPace, p.actual_points], p,
                         itemStyle: { color: POS_COLOR[p.pos] || C.ink, opacity: focus && p.owner_id !== focus ? 0.12 : 0.85 } })) }]
        }, p => p.data.p && select(p.data.p.overall_pick));
        const base = focus ? shown.filter(p => p.owner_id === focus) : shown;
        document.getElementById('c-build-sub').textContent = focus ? `${name(focus)}: the position taken with each pick` : 'Positions taken in each round, whole league';
        const rs = Array.from({ length: rounds }, (_, i) => i + 1).filter(r => !f.round || r === f.round);
        mount('c-build', {
            grid: { left: 36, right: 14, top: 26, bottom: 26 },
            legend: { top: 0, right: 0, textStyle: { color: C.muted, fontSize: 10 }, itemWidth: 9, itemHeight: 9 },
            tooltip: { ...tip, trigger: 'axis', axisPointer: { type: 'shadow' } },
            xAxis: ax({ type: 'category', data: rs.map(r => `R${r}`) }), yAxis: ax({ type: 'value', minInterval: 1 }),
            series: Object.keys(POS_COLOR).filter(pos => base.some(p => p.pos === pos)).map(pos => ({
                name: pos, type: 'bar', stack: 'a', barMaxWidth: 22, itemStyle: { color: POS_COLOR[pos] },
                data: rs.map(r => base.filter(p => p.round === r && p.pos === pos).length) }))
        });
    }

    function renderBoard() {
        // columns = draft slots in round 1 order; every later pick sits under the team that made it
        const order = picks.filter(p => p.round === 1).sort((x, y) => x.round_pick - y.round_pick).map(p => p.owner_id);
        const col = id => order.indexOf(id);
        const grid = Array.from({ length: rounds }, () => Array(teams).fill(null));
        picks.forEach(p => { const c = col(p.owner_id); if (c >= 0) grid[p.round - 1][c] = p; });
        const visible = p => (!f.round || p.round === f.round) && (!f.pos || p.pos === f.pos) && (!focus || p.owner_id === focus);
        const cell = p => {
            if (!p) return '<td></td>';
            const x = G(p);
            return `<td><span class="dg-cell${visible(p) ? '' : ' dim'}${selected === p.overall_pick ? ' on' : ''}" data-pick="${p.overall_pick}" style="--c:${POS_COLOR[p.pos] || 'var(--line)'}"
                title="${esc(`${pickLabel(p)} ${p.name} · ${p.mgr}`)}"><b>${esc(p.name)}</b><small><span>${pickLabel(p)} ${esc(p.pos || '')}</span><i>${x.grade || '–'}</i></small></span></td>`;
        };
        document.getElementById('dg-board').innerHTML = `<table class="dg-board" style="width:${48 + teams * 118}px">
            <colgroup><col style="width:40px">${'<col style="width:115px">'.repeat(teams)}</colgroup>
            <thead><tr><th class="rd">Rd</th>${order.map(id => `<th title="${esc(name(id))}">${esc(id ? name(id) : 'Vacant')}</th>`).join('')}</tr></thead>
            <tbody>${grid.map((row, r) => `<tr><th class="rd">${r + 1}</th>${row.map(cell).join('')}</tr>`).join('')}</tbody></table>`;
        document.querySelectorAll('.dg-cell').forEach(el => el.addEventListener('click', () => select(Number(el.dataset.pick))));
    }

    function renderDetail() {
        const el = document.getElementById('dg-detail');
        const p = byPick[selected];
        if (!p) {
            el.innerHTML = `<p class="muted" style="height:28px;line-height:28px">Click any pick on the board (or a row below) to see the roster it joined, what the projections said, and who would have been better.</p>`;
            return;
        }
        const before = picks.filter(x => x.owner_id === p.owner_id && x.overall_pick < p.overall_pick);
        const kv = rows => `<ul class="dg-kv">${rows.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('')}</ul>`;
        const bpa = p.bpa_player_id ? val[p.bpa_player_id] : null;
        const alt = x => `<li><img src="${x.id > 0 ? `https://a.espncdn.com/i/headshots/nfl/players/full/${x.id}.png` : url('assets/nfl-logos/nfl.png')}" alt="" onerror="this.src='${url('assets/nfl-logos/nfl.png')}';this.onerror=null">
            <div class="who"><b>${player(x.id)}</b><small>${esc(x.pos || '')} · ${x.pick ? `went ${pickLabel(byPick[x.pick] || { round: Math.ceil(x.pick / teams), round_pick: (x.pick - 1) % teams + 1 })}` : 'undrafted'}</small></div>
            <span class="n">${f1(x.pts)}</span><span class="muted" style="font-size:10px;text-align:right">+${f1(x.vorp - (p.actual_vorp || 0))}</span></li>`;
        el.innerHTML = `<div class="dg-pick-head"><img src="${headshot(p)}" alt="" onerror="this.src='${url('assets/nfl-logos/nfl.png')}';this.onerror=null">
                <div><b>${esc(p.name)}</b><small>Pick ${pickLabel(p)} (#${p.overall_pick} overall) · ${p.owner_id ? GT.managerLink(p.mgr, season) : esc(p.mgr)} · ${esc(p.pos || '')} · ${esc(p.slot_role || '')}</small></div>
                <div class="dg-grade">${ring(p, 'pre')}<span>Draft<br>day</span></div><div class="dg-grade">${ring(p, 'post')}<span>${p.provisional ? 'To<br>date' : 'Hind-<br>sight'}</span></div></div>
            <div class="dg-detail">
                <div><h4>Roster before this pick (${before.length})</h4>
                    <ul class="mv-list">${before.map(x => `<li><img src="${headshot(x)}" alt="" onerror="this.src='${url('assets/nfl-logos/nfl.png')}';this.onerror=null"><div class="who"><b>${esc(x.name)}</b><small>${pickLabel(x)} · ${esc(x.pos || '')} · ${esc(x.slot_role || '')}</small></div>
                        <span class="n">${f1(x.proj_points)}</span>${ring(x, 'pre', true)}</li>`).join('') || '<li class="empty">First pick: an empty roster.</li>'}</ul></div>
                <div><h4>Draft day</h4>${kv([
                    ['Projected points', f1(p.proj_points)], ['Projected rank', p.proj_pos_rank ? `${p.pos}${p.proj_pos_rank}` : '-'],
                    ['Value over replacement', sgn(p.proj_vorp)], ['Roster fit', `${esc(p.slot_role || '-')} (x${p.fit})`],
                    ['Slot worth (projection order)', f1(p.proj_slot)], ['Surplus', `<span class="${p.pre_surplus >= 0 ? 'win' : 'loss'}">${sgn(p.pre_surplus)}</span>`],
                    ['Best available by projection', bpa ? `${player(bpa.pid)} <span class="muted">${esc(bpa.pos)}</span>` : '-']])}</div>
                <div><h4>${p.provisional ? 'Hindsight (season to date)' : 'Hindsight'}</h4>${kv([
                    ['Points scored', `${f1(p.actual_points)} <span class="muted">in ${p.games ?? 0} games</span>`], [PROV ? 'vs projection (pro rata)' : 'vs projection', `<span class="${p.vsProj >= 0 ? 'win' : 'loss'}">${sgn(p.vsProj)}</span>`],
                    ['Finished', p.actual_pos_rank ? `${p.pos}${p.actual_pos_rank}` : '-'], ['Value over replacement', sgn(p.actual_vorp)],
                    ['Slot standard', f1(p.actual_slot)], ['Surplus', `<span class="${p.post_surplus >= 0 ? 'win' : 'loss'}">${sgn(p.post_surplus)}</span>`]])}
                    <h4 style="margin-top:14px">Better picks still on the board</h4>
                    <ul class="mv-list">${p.better.map(alt).join('') || '<li class="empty">Nobody left was better. Great pick.</li>'}
                        ${p.same && !p.better.some(x => x.id === p.same.id) ? alt(p.same) : ''}</ul></div>
            </div>`;
    }

    window.addEventListener('themechange', render);
    window.addEventListener('resize', () => charts.forEach(c => c.resize()));
    render();
})();
