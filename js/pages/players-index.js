/* Players: search and browse every NFL player since 2019 (25 per page) */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    SITE.subHeader({ crumbs: [['Players']],
                     tabs: [{ label: 'All Players', href: url('pages/players/index.html'), active: true }] });
    SITE.hero({ title: 'Players', size: 'short', dots: false, image: 'background-12.png',
                meta: ['Every NFL player since 2019 · game-by-game stats, weather and venue'] });
    let players;
    try { players = (await PS.index()).slice(); }
    catch (_) { content.innerHTML = '<div class="wrap"><div class="panel">Player data is still being copied into this project.</div></div>'; return; }

    const PER_PAGE = 25;
    const ALL = 'ALL';
    // the league's fantasy positions; FLEX = RB + WR + TE. Defensive players and linemen are not listed.
    const POS = [ALL, 'QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'P', 'D/ST', 'HC'];
    const FANTASY = { QB: 'QB', RB: 'RB', FB: 'RB', HB: 'RB', WR: 'WR', TE: 'TE', K: 'K', PK: 'K', P: 'P', 'D/ST': 'D/ST', HC: 'HC' };
    const matches = (filter, group) => filter === ALL ? true : filter === 'FLEX' ? ['RB', 'WR', 'TE'].includes(group) : filter === group;

    // Head coaches are not in the NFL stats files; their points come from the weeks a manager rostered them
    const coaches = await GT.query(`
        SELECT s.season, s.pid, p.name, p.pro_team AS team, COUNT(*) AS g, SUM(s.pts) AS f FROM (
            SELECT fr.season, fr.week, frp.player_id AS pid, MAX(frp.actual_points) AS pts
            FROM fantasy_roster_players frp JOIN fantasy_rosters fr ON fr.roster_id = frp.roster_id
            JOIN players p ON p.player_id = frp.player_id
            WHERE p.position = 'HC' AND frp.actual_points IS NOT NULL
            GROUP BY fr.season, fr.week, frp.player_id) s
        JOIN players p ON p.player_id = s.pid GROUP BY s.season, s.pid`);
    const hcById = {};
    coaches.forEach(c => {
        const h = hcById[c.pid] || (hcById[c.pid] = { id: String(c.pid), name: c.name, pos: 'HC', team: c.team, seasons: {}, fp: {}, coach: true });
        h.seasons[c.season] = [c.team];
        h.fp[c.season] = { REG: [c.g, c.f] };
    });
    players = players.filter(p => FANTASY[p.pos]).concat(Object.values(hcById));
    players.forEach(p => { p.group = FANTASY[p.pos]; });
    const seasons = [...new Set(players.flatMap(p => Object.keys(p.fp || {})))].sort().reverse();
    let pos = POS.includes(param('pos')) ? param('pos') : ALL;
    let query = param('q') || '';
    let season = param('season') || String(b.season);
    let page = 1;

    // games and fantasy points (regular season + playoffs) for one season, or all seasons
    const totals = p => {
        const years = season === ALL ? Object.keys(p.fp || {}) : [season];
        return years.reduce((t, s) => {
            const x = (p.fp || {})[s];
            if (x) { t.g += (x.REG || [0])[0] + (x.POST || [0])[0]; t.f += (x.REG || [0, 0])[1] + (x.POST || [0, 0])[1]; }
            return t;
        }, { g: 0, f: 0 });
    };
    const teamsOf = p => season === ALL ? [...new Set(Object.values(p.seasons).flat())] : p.seasons[season];
    // a position is available for the chosen year when anyone at it played that year
    const available = filter => players.some(p => matches(filter, p.group) && totals(p).g > 0);
    function updatePositions() {
        document.querySelectorAll('#pos button').forEach(btn => {
            const ok = btn.dataset.p === ALL || available(btn.dataset.p);
            btn.disabled = !ok;
            btn.classList.toggle('off', !ok);
            btn.title = ok ? '' : `No ${btn.dataset.p} data for ${season === ALL ? 'any year' : season}`;
        });
        if (document.querySelector(`#pos button[data-p="${CSS.escape(pos)}"]`).disabled) {      // selected position not in this year
            pos = ALL;
            document.querySelectorAll('#pos button').forEach(x => x.classList.toggle('on', x.dataset.p === ALL));
        }
    }

    content.innerHTML = `<div class="wrap page-pad">
        <div class="panel-head" style="margin-top:34px">
            <div><div class="eyebrow">Player database</div><h2 class="section-title">Find a Player</h2></div>
            <select class="select" id="season"><option value="${ALL}">All years</option>${seasons.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
        </div>
        <div class="find-bar">
            <div class="search-box"><input id="q" type="search" placeholder="Search by name..." value="${esc(query)}" autocomplete="off"></div>
            <div class="seg find-pos" id="pos">${POS.map(p => `<button data-p="${p}" class="${p === pos ? 'on' : ''}">${p}</button>`).join('')}</div>
        </div>
        <div class="panel"><div class="table-scroll"><table class="data-table" id="find-table"></table></div>
            <div class="pager" id="pager"></div></div></div>`;
    document.getElementById('season').value = season;

    // ---- FP+ boom / bust rates (js/fpplus.js): every projected week classified against its position, for the chosen year
    // (or every year pooled). The table shows the three: all busts / normal / all booms.
    const rateCache = {};
    const rates = yr => rateCache[yr] || (rateCache[yr] = GT.query(`SELECT w.season, w.week, w.player_id AS id, w.points AS pts, w.projected AS proj, v.pos
            FROM player_week_points w JOIN player_values v ON v.season = w.season AND v.player_id = w.player_id
            WHERE w.points IS NOT NULL AND ($s = 0 OR w.season = $s)`, { $s: yr === ALL ? 0 : Number(yr) }).then(rows => {
        const out = new Map(), byPos = {};
        rows.forEach(r => { (byPos[r.pos] = byPos[r.pos] || []).push(r); });
        Object.values(byPos).forEach(list => {
            const C = FPP.classify(list), mine = {};
            list.forEach(r => { (mine[r.id] = mine[r.id] || []).push(r); });
            Object.entries(mine).forEach(([id, l]) => out.set(String(id), FPP.mix(l, C)));
        });
        return out;
    }).catch(() => new Map()));
    const RATE_COLS = [
        { k: 'disaster', label: 'Disaster', wide: true, get: m => m.share('disaster'), cls: 'loss', tip: 'Share of projected weeks more than 3 standard deviations below the position\'s average weekly FP+.' },
        { k: 'bust', label: 'Bust', get: m => m.side(-1), cls: 'loss', tip: 'Share of projected weeks at least 0.5 standard deviations below the position\'s average weekly FP+: every bust tier (Bust, Big, Huge, Disaster).' },
        { k: 'normal', label: 'Normal', short: 'Norm', get: m => m.share('normal'), cls: '', tip: 'Share of projected weeks within half a standard deviation of the position\'s average weekly FP+.' },
        { k: 'boom', label: 'Boom', get: m => m.side(1), cls: 'win', tip: 'Share of projected weeks at least 0.5 standard deviations above the position\'s average weekly FP+: every boom tier (Boom, Big, Huge, Smash).' },
        { k: 'smash', label: 'Smash', wide: true, get: m => m.share('smash'), cls: 'win', tip: 'Share of projected weeks more than 3 standard deviations above the position\'s average weekly FP+.' }
    ];
    // bench points: what each player scored in league weeks he sat on a roster outside the starting lineup (bench or IR)
    const benchCache = {};
    // (one query: points in a starting slot, points on the bench / IR, and the weeks of each)
    const bench = yr => benchCache[yr] || (benchCache[yr] = GT.query(`SELECT frp.player_id AS id,
                SUM(CASE WHEN frp.slot_position IN ('BE', 'IR') THEN frp.actual_points ELSE 0 END) AS pts,
                SUM(CASE WHEN frp.slot_position IN ('BE', 'IR') THEN 1 ELSE 0 END) AS wk,
                SUM(CASE WHEN frp.slot_position NOT IN ('BE', 'IR') THEN frp.actual_points ELSE 0 END) AS st,
                SUM(CASE WHEN frp.slot_position NOT IN ('BE', 'IR') THEN 1 ELSE 0 END) AS stwk
            FROM fantasy_roster_players frp JOIN fantasy_rosters fr ON fr.roster_id = frp.roster_id
            WHERE frp.actual_points IS NOT NULL AND ($s = 0 OR fr.season = $s) GROUP BY frp.player_id`, { $s: yr === ALL ? 0 : Number(yr) })
        .then(rows => new Map(rows.map(r => [String(r.id), r]))).catch(() => new Map()));
    // free agency points: what each player scored in league weeks nobody had him on a roster
    const faCache = {};
    const freeAgency = yr => faCache[yr] || (faCache[yr] = GT.query(`SELECT w.player_id AS id, SUM(w.points) AS pts, COUNT(*) AS wk FROM player_week_points w
            JOIN (SELECT DISTINCT season, week FROM fantasy_rosters) lw ON lw.season = w.season AND lw.week = w.week
            LEFT JOIN (SELECT DISTINCT fr.season, fr.week, f.player_id FROM fantasy_rosters fr JOIN fantasy_roster_players f ON f.roster_id = fr.roster_id) r
                ON r.season = w.season AND r.week = w.week AND r.player_id = w.player_id
            WHERE r.player_id IS NULL AND w.points IS NOT NULL AND ($s = 0 OR w.season = $s) GROUP BY w.player_id`, { $s: yr === ALL ? 0 : Number(yr) })
        .then(rows => new Map(rows.map(r => [String(r.id), r]))).catch(() => new Map()));
    // the columns; every header sorts (numbers high first, text A-Z first; click again to flip)
    const RC = RATE_COLS.filter(c => !c.wide);
    const COLS = [
        { k: 'name', label: 'Player', w: '22%', text: true, get: x => x.p.name },
        { k: 'pos', label: 'Pos', w: '5%', text: true, get: x => x.p.pos },
        { k: 'team', label: 'Team', w: '10%', text: true, get: x => (teamsOf(x.p) || [x.p.team]).join(', ') },
        { k: 'g', label: 'Games', w: '6%', get: x => x.t.g },
        { k: 'st', label: 'Start Pts', w: '9%', get: x => x.b && x.b.stwk ? x.b.st : null, tip: 'Points the player scored in league weeks he was in a starting lineup.' },
        { k: 'bench', label: 'Bench Pts', w: '9%', get: x => x.b && x.b.wk ? x.b.pts : null, tip: 'Points the player scored in league weeks he was on a roster but not in the starting lineup (bench or IR).' },
        { k: 'fa', label: 'FA Pts', w: '8%', get: x => x.fa ? x.fa.pts : null, tip: 'Free agency points: what the player scored in league weeks he was not on any roster.' },
        { k: 'tot', label: 'Total FP', w: '9%', get: x => x.tot, tip: 'Start + Bench + FA points: everything the player scored in league weeks.' },
        ...RC.map(c => ({ k: c.k, label: c.label, w: '7.33%', rate: c, get: x => x.m && x.m.n ? c.get(x.m) : null, tip: `${c.tip} ${FPP.TIP}` }))
    ];
    let sort = { k: 'tot', dir: -1 };
    function head() {
        document.getElementById('find-table').innerHTML = `${SITE.cols(...COLS.map(c => c.w))}<thead><tr>${COLS.map(c =>
            `<th class="sx-sort${c.text ? '' : ' num'}${sort.k === c.k ? (sort.dir === 1 ? ' asc' : ' desc') : ''}" data-k="${c.k}"${c.tip ? ` data-tip="${esc(c.tip)}"` : ''}>${c.label}</th>`).join('')}</tr></thead><tbody id="rows"></tbody>`;
        document.querySelectorAll('#find-table th.sx-sort').forEach(th => th.addEventListener('click', () => {
            const c = COLS.find(x => x.k === th.dataset.k);
            sort = sort.k === c.k ? { k: c.k, dir: -sort.dir } : { k: c.k, dir: c.text ? 1 : -1 };
            page = 1; render();
        }));
    }

    let drawn = 0;
    async function render() {
        const ticket = ++drawn;
        const [mix, bp, fap] = await Promise.all([rates(season), bench(season), freeAgency(season)]);
        if (ticket !== drawn) return;                     // a newer render started while the data loaded
        head();
        const pc = v => v == null ? '-' : `${Math.round(v * 100)}%`;
        const ql = query.trim().toLowerCase();
        const col = COLS.find(c => c.k === sort.k);
        const list = players
            .filter(p => matches(pos, p.group) && (!ql || p.name.toLowerCase().includes(ql)))
            .map(p => { const b = bp.get(String(p.id)), fa = fap.get(String(p.id));
                return { p, t: totals(p), b, fa, m: mix.get(String(p.id)), tot: (b ? b.st + b.pts : 0) + (fa ? fa.pts : 0) }; })
            .filter(x => x.t.g > 0)
            .sort((x, y) => { const a = col.get(x), c = col.get(y);
                if (a == null && c == null) return 0; if (a == null) return 1; if (c == null) return -1;      // blanks always last
                return (col.text ? String(a).localeCompare(String(c)) : a - c) * sort.dir || y.tot - x.tot; });
        const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
        page = Math.min(Math.max(1, page), pages);
        const start = (page - 1) * PER_PAGE;
        document.getElementById('rows').innerHTML = list.slice(start, start + PER_PAGE).map(x => {
            const { p, t, b, fa, m, tot } = x, teams = teamsOf(p) || [p.team];
            const logo = `<img src="${PS.nflLogo(season === ALL ? p.team : teams[0])}" alt=""><b>${esc(p.name)}</b>`;
            return `<tr><td>${p.coach ? `<span class="team-cell">${logo}</span>`
                : `<a class="team-cell" href="${url(`pages/players/stats.html?id=${encodeURIComponent(p.id)}`)}">${logo}</a>`}</td>
                <td>${esc(p.pos)}</td><td>${esc(teams.join(', '))}</td><td class="num">${t.g}</td>
                <td class="num"${b && b.stwk ? ` data-tip="${b.stwk} starts"` : ''}>${b && b.stwk ? GT.pts(b.st) : '-'}</td>
                <td class="num"${b && b.wk ? ` data-tip="${b.wk} benched weeks"` : ''}>${b && b.wk ? GT.pts(b.pts) : '-'}</td>
                <td class="num"${fa ? ` data-tip="${fa.wk} weeks unrostered"` : ''}>${fa ? GT.pts(fa.pts) : '-'}</td>
                <td class="num"><b>${GT.pts(tot)}</b></td>
                ${RC.map(c => { const v = m && m.n ? c.get(m) : null;
                    return `<td class="num ${c.cls}"${m && m.n ? ` data-tip="${esc(`${c.label}: ${Math.round((v || 0) * m.n)} of ${m.n} projected weeks${m.unprojected ? ` (${m.unprojected} unprojected left out)` : ''}`)}"` : ''}>${pc(v)}</td>`; }).join('')}</tr>`;
        }).join('') || `<tr><td colspan="${COLS.length}" class="muted">No players found.</td></tr>`;
        renderPager(list.length, pages, start);
    }

    // Prev / page numbers (current page with two either side, plus first and last) / Next
    function renderPager(count, pages, start) {
        const nums = [...new Set([1, pages, ...Array.from({ length: 5 }, (_, i) => page - 2 + i)])]
            .filter(n => n >= 1 && n <= pages).sort((x, y) => x - y);
        let html = '', prev = 0;
        nums.forEach(n => {
            if (n - prev > 1) html += '<span class="pager-gap">…</span>';
            html += `<button data-page="${n}" class="${n === page ? 'on' : ''}">${n}</button>`;
            prev = n;
        });
        document.getElementById('pager').innerHTML = count ? `
            <span class="pager-info">${(start + 1).toLocaleString()}-${Math.min(start + PER_PAGE, count).toLocaleString()} of ${count.toLocaleString()}</span>
            <div class="pager-nav">
                <button data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Prev</button>${html}
                <button data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>Next</button>
            </div>` : '';
        document.querySelectorAll('#pager button[data-page]').forEach(btn => btn.addEventListener('click', () => {
            page = Number(btn.dataset.page); render();
            document.querySelector('.find-bar').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
    }

    document.getElementById('q').addEventListener('input', e => { query = e.target.value; page = 1; render(); });
    document.getElementById('season').addEventListener('change', e => { season = e.target.value; page = 1; updatePositions(); render(); });
    document.querySelectorAll('#pos button').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('#pos button').forEach(x => x.classList.remove('on'));
        btn.classList.add('on'); pos = btn.dataset.p; page = 1; render();
    }));
    updatePositions();
    render();
})();
