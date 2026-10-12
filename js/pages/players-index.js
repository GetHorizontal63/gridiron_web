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
    // (or every year pooled). Wide screens show five columns; narrow ones just all busts / normal / all booms.
    const narrowMq = matchMedia('(max-width: 1000px)');
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
    function head(narrow) {
        const rc = RATE_COLS.filter(c => !narrow || !c.wide);
        const widths = narrow ? ['30%', '7%', '13%', '8%', '10%', '9%', ...rc.map(() => `${23 / rc.length}%`)]
                              : ['26%', '6%', '12%', '7%', '9%', '8%', ...rc.map(() => `${32 / rc.length}%`)];
        document.getElementById('find-table').innerHTML = `${SITE.cols(...widths)}<thead><tr><th>Player</th><th>Pos</th><th>Team</th>
            <th class="num">Games</th><th class="num">Fantasy Pts</th><th class="num">Per Game</th>
            ${rc.map(c => `<th class="num" data-tip="${esc(`${c.tip} ${FPP.TIP}`)}">${narrow && c.short ? c.short : c.label}</th>`).join('')}</tr></thead><tbody id="rows"></tbody>`;
        return rc;
    }

    let drawn = 0;
    async function render() {
        const ticket = ++drawn;
        const mix = await rates(season);
        if (ticket !== drawn) return;                     // a newer render started while the rates loaded
        const rc = head(narrowMq.matches);
        const pc = v => v == null ? '-' : `${Math.round(v * 100)}%`;
        const ql = query.trim().toLowerCase();
        const list = players
            .filter(p => matches(pos, p.group) && (!ql || p.name.toLowerCase().includes(ql)))
            .map(p => ({ p, t: totals(p) }))
            .filter(x => x.t.g > 0)
            .sort((x, y) => y.t.f - x.t.f);
        const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
        page = Math.min(Math.max(1, page), pages);
        const start = (page - 1) * PER_PAGE;
        document.getElementById('rows').innerHTML = list.slice(start, start + PER_PAGE).map(({ p, t }) => {
            const teams = teamsOf(p) || [p.team];
            const logo = `<img src="${PS.nflLogo(season === ALL ? p.team : teams[0])}" alt=""><b>${esc(p.name)}</b>`;
            return `<tr><td>${p.coach ? `<span class="team-cell">${logo}</span>`
                : `<a class="team-cell" href="${url(`pages/players/stats.html?id=${encodeURIComponent(p.id)}`)}">${logo}</a>`}</td>
                <td>${esc(p.pos)}</td><td>${esc(teams.join(', '))}</td><td class="num">${t.g}</td><td class="num"><b>${GT.pts(t.f)}</b></td><td class="num">${t.g ? GT.pts(t.f / t.g) : '-'}</td>
                ${rc.map(c => { const m = mix.get(String(p.id)); const v = m && m.n ? c.get(m) : null;
                    return `<td class="num ${c.cls}"${m && m.n ? ` data-tip="${esc(`${c.label}: ${Math.round((v || 0) * m.n)} of ${m.n} projected weeks${m.unprojected ? ` (${m.unprojected} unprojected left out)` : ''}`)}"` : ''}>${pc(v)}</td>`; }).join('')}</tr>`;
        }).join('') || `<tr><td colspan="${6 + rc.length}" class="muted">No players found.</td></tr>`;
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
    narrowMq.addEventListener('change', render);        // switch between the five rate columns and three
    updatePositions();
    render();
})();
