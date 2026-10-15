/* Stats: Lineup Regret. Each week's best possible lineup (hindsight) from the players on the roster that week, against
   the lineup the manager set: points left on the bench, how often the lineup was perfect, and the losses a best
   lineup would have won. The best lineup fills the same slots the manager had that week (FLEX takes an RB, WR or TE);
   IR players are not eligible. */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    await GT.load();
    SITE.subHeader({ crumbs: [['Stats', url('pages/stats.html')], ['Lineup Regret']], tabs: SITE.statsTabs('lineup-regret') });
    SITE.hero({ title: 'Lineup Regret', size: 'short', dots: false, image: 'background-15.png',
                meta: ['Points left on the bench, perfect lineups and the losses a better lineup would have won'] });
    content.innerHTML = '<div class="wrap page-pad"><div class="loading" style="margin-top:40px">Loading every lineup...</div></div>';

    const [players, gameRows] = await Promise.all([
        GT.query(`SELECT fr.season, fr.week, fr.owner_id AS id, frp.slot_position AS slot, p.position AS pos, p.name, COALESCE(frp.actual_points, 0) AS pts
                  FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id JOIN players p ON p.player_id = frp.player_id
                  WHERE frp.slot_position != 'IR'`),
        GT.query(`SELECT m.game_id AS gameId, m.season, m.week, m.season_period AS period, t.owner_id AS id, o.display_name AS mgr,
                         x.display_name AS opp, t.team_score AS pf, t.opponent_score AS pa
                  FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                  LEFT JOIN owners x ON x.owner_id = t.opponent_owner_id WHERE t.team_score IS NOT NULL`)
    ]);
    const FIXED = ['QB', 'RB', 'WR', 'TE', 'K', 'P', 'D/ST', 'HC'], FLEX = ['RB', 'WR', 'TE'];
    const roster = {};
    players.forEach(p => { (roster[`${p.season}|${p.week}|${p.id}`] = roster[`${p.season}|${p.week}|${p.id}`] || []).push(p); });

    // the best lineup for one manager-week, in the slots he actually had
    function best(list) {
        const starters = list.filter(p => p.slot !== 'BE');
        const need = {};
        starters.forEach(p => { need[p.slot] = (need[p.slot] || 0) + 1; });
        const pool = list.slice().sort((x, y) => y.pts - x.pts), used = new Set();
        FIXED.forEach(s => { pool.filter(p => p.pos === s).slice(0, need[s] || 0).forEach(p => used.add(p)); });
        pool.filter(p => FLEX.includes(p.pos) && !used.has(p)).slice(0, need.FLEX || 0).forEach(p => used.add(p));
        const opt = [...used].reduce((t, p) => t + p.pts, 0), actual = starters.reduce((t, p) => t + p.pts, 0);
        const ins = [...used].filter(p => p.slot === 'BE').sort((x, y) => y.pts - x.pts);
        const outs = starters.filter(p => !used.has(p)).sort((x, y) => x.pts - y.pts);
        return { opt, actual, left: Math.max(0, opt - actual), ins, outs };
    }
    const weeks = gameRows.map(g => {
        const list = roster[`${g.season}|${g.week}|${g.id}`];
        if (!list || !list.some(p => p.slot !== 'BE')) return null;
        const r = best(list);
        return { ...g, ...r, perfect: r.left < 0.05, costly: g.pa != null && g.pf < g.pa && r.opt > g.pa };
    }).filter(Boolean);
    const seasons = [...new Set(weeks.map(w => w.season))].sort((x, y) => y - x);

    const PLAYOFF = ['Post-WC', 'Post-WB', 'Championship'];
    const st = { season: param('season') === 'all' ? 0 : (seasons.includes(Number(param('season'))) ? Number(param('season')) : seasons[0]),
                 games: ['regular', 'playoffs', 'all'].includes(param('games')) ? param('games') : 'regular', list: param('list') === 'costly' ? 'costly' : 'all' };
    const f1 = v => GT.pts(v), pct = v => `${(v * 100).toFixed(1)}%`;
    const mgrCell = (n, season) => `<a class="team-cell" href="${GT.managerHref(n, season)}"><img src="${GT.logo(n)}" alt=""><b>${esc(n)}</b></a>`;
    const kpi = (l, v, s, tip = '') => `<div class="db-kpi"><span${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</span><b>${v}</b><small>${s}</small></div>`;
    const opt = (v, label, cur) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
    const BEST_TIP = 'The best lineup in hindsight from the players on the roster that week (not IR), in the same slots the manager had. FLEX takes the best remaining RB, WR or TE.';

    content.innerHTML = `<div class="wrap page-pad">
        <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">Stats</div><h2 class="section-title">Lineup Regret</h2>
            <p class="section-copy">Every week's lineup against the best one the roster could have fielded. Points left on the bench, perfect weeks, and the losses that were sitting on the bench.</p></div>
            <div class="lr-ctl"><label class="sx-f"><span>Season</span><select class="select" id="lr-season">${opt('all', 'All seasons', st.season || 'all')}${seasons.map(s => opt(s, `${s} season`, st.season)).join('')}</select></label>
                <label class="sx-f"><span>Games</span><select class="select" id="lr-games">${opt('regular', 'Regular season', st.games)}${opt('playoffs', 'Playoffs', st.games)}${opt('all', 'All games', st.games)}</select></label></div></div>
        <div class="db-kpis vn-kpis" id="lr-kpis"></div>
        <div class="panel"><h3 class="panel-title" style="margin-bottom:12px" data-tip="${esc(BEST_TIP)}">Manager by Manager</h3><table class="data-table lr-table ph-fit" id="lr-table"></table></div>
        <div class="panel"><div class="panel-head" style="margin-bottom:10px"><h3 class="panel-title">Biggest Regrets</h3>
            <span class="seg seg-eq" id="lr-list"><button data-v="all">All weeks</button><button data-v="costly" data-tip="Losses the best lineup would have won.">Cost the game</button></span></div>
            <table class="data-table lr-table ph-fit" id="lr-worst"></table></div></div>`;

    const hideCols = id => {
        const t = document.getElementById(id);
        [...t.querySelectorAll('thead th')].forEach((th, i) => { if (th.classList.contains('ph-x')) t.querySelectorAll('col')[i].classList.add('ph-x'); });
    };
    const playerList = l => l.map(p => `${esc(p.name)} (${f1(p.pts)})`).join(', ');

    function draw() {
        const list = weeks.filter(w => (!st.season || w.season === st.season)
            && (st.games === 'all' || (st.games === 'playoffs' ? PLAYOFF.includes(w.period) : w.period === 'Regular')));
        if (!list.length) {
            document.getElementById('lr-kpis').innerHTML = '';
            document.getElementById('lr-table').innerHTML = '<tbody><tr><td class="muted">No games for these filters.</td></tr></tbody>';
            document.getElementById('lr-worst').innerHTML = '';
            return;
        }
        const by = {};
        list.forEach(w => {
            const o = by[w.id] || (by[w.id] = { mgr: w.mgr, g: 0, actual: 0, opt: 0, left: 0, perfect: 0, costly: 0 });
            o.g++; o.actual += w.actual; o.opt += w.opt; o.left += w.left; o.perfect += w.perfect ? 1 : 0; o.costly += w.costly ? 1 : 0;
        });
        const rows = Object.values(by).map(o => ({ ...o, eff: o.opt ? o.actual / o.opt : 1, per: o.left / o.g })).sort((x, y) => y.eff - x.eff);
        const most = rows.reduce((m, o) => !m || o.left > m.left ? o : m, null);
        const top = rows[0];
        const costly = list.filter(w => w.costly).length;
        const worst = list.reduce((m, w) => !m || w.left > m.left ? w : m, null);
        const scope = st.season ? `${st.season}` : 'all seasons';
        document.getElementById('lr-kpis').innerHTML =
            kpi('Best lineup setter', esc(top.mgr), `${pct(top.eff)} of the best possible points`) +
            kpi('Most left on the bench', esc(most.mgr), `${f1(most.left)} points, ${scope}`) +
            kpi('Losses on the bench', costly, `games a best lineup would have won, ${scope}`, BEST_TIP) +
            kpi('Worst single week', esc(worst.mgr), `${f1(worst.left)} left, ${worst.season} week ${worst.week}`);

        document.getElementById('lr-table').innerHTML = `${SITE.cols('22%', '7%', '11%', '11%', '11%', '9%', '10%', '9%', '10%')}<thead><tr><th>Manager</th><th class="num">G</th>
            <th class="num ph-x">Actual</th><th class="num ph-x" data-tip="${esc(BEST_TIP)}">Best</th><th class="num">Left</th><th class="num ph-x">Per week</th>
            <th class="num" data-tip="Actual points as a share of the best lineup's points."><span class="hl">Efficiency</span><span class="hs">Eff</span></th><th class="num ph-x" data-tip="Weeks the lineup set was the best one possible.">Perfect</th>
            <th class="num" data-tip="Losses the best lineup would have won.">Lost</th></tr></thead><tbody>${rows.map(r => `<tr>
            <td>${mgrCell(r.mgr, st.season)}</td><td class="num">${r.g}</td><td class="num ph-x">${f1(r.actual)}</td><td class="num ph-x">${f1(r.opt)}</td>
            <td class="num"><b>${f1(r.left)}</b></td><td class="num ph-x">${f1(r.per)}</td><td class="num">${pct(r.eff)}</td><td class="num ph-x">${r.perfect}</td>
            <td class="num ${r.costly ? 'loss' : ''}">${r.costly}</td></tr>`).join('')}</tbody>`;
        hideCols('lr-table');

        const pick = (st.list === 'costly' ? list.filter(w => w.costly) : list).slice().sort((x, y) => y.left - x.left).slice(0, 15);
        document.getElementById('lr-worst').innerHTML = `${SITE.cols('14%', '14%', '15%', '10%', '10%', '8%', '29%')}<thead><tr><th>Week</th><th><span class="hl">Manager</span><span class="hs">Mgr</span></th>
            <th class="num ph-x" data-tip="${esc(BEST_TIP)}">Score → best</th><th class="num ph-x">Opponent</th><th><span class="hl">Result</span><span class="hs">Res</span></th><th class="num">Left</th><th><span class="hl">Should have started</span><span class="hs">Started</span></th></tr></thead>
            <tbody>${pick.map(w => `<tr class="row-link" data-href="${GT.gameHref(w.gameId)}">
            <td><span class="hl">${w.season} W${w.week}</span><span class="hs">'${String(w.season).slice(2)} W${w.week}</span></td><td>${mgrCell(w.mgr, w.season)}</td><td class="num ph-x">${f1(w.actual)} → ${f1(w.opt)}</td><td class="num ph-x">${w.pa == null ? '-' : f1(w.pa)}</td>
            <td>${w.pa == null ? '-' : w.costly ? '<b class="loss">L</b>→<b class="win">W</b>' : w.pf > w.pa ? '<b class="win">W</b>' : w.pf < w.pa ? '<b class="loss">L</b>' : 'T'}</td>
            <td class="num"><b>${f1(w.left)}</b></td><td title="${esc(`In: ${w.ins.map(p => `${p.name} (${f1(p.pts)})`).join(', ')} · Out: ${w.outs.map(p => `${p.name} (${f1(p.pts)})`).join(', ')}`)}">${playerList(w.ins)} <span class="muted">over ${playerList(w.outs)}</span></td></tr>`).join('')
            || '<tr><td colspan="7" class="muted">No games match.</td></tr>'}</tbody>`;
        hideCols('lr-worst');
        document.querySelectorAll('#lr-worst tr.row-link').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) location.href = tr.dataset.href; }));
        document.querySelectorAll('#lr-list button').forEach(btn => btn.classList.toggle('on', btn.dataset.v === st.list));
    }
    const save = () => {
        const u = new URL(location.href);
        u.searchParams.set('season', st.season || 'all'); u.searchParams.set('games', st.games);
        if (st.list === 'costly') u.searchParams.set('list', 'costly'); else u.searchParams.delete('list');
        history.replaceState(null, '', u);
    };
    document.getElementById('lr-season').addEventListener('change', e => { st.season = e.target.value === 'all' ? 0 : Number(e.target.value); save(); draw(); });
    document.getElementById('lr-games').addEventListener('change', e => { st.games = e.target.value; save(); draw(); });
    document.querySelectorAll('#lr-list button').forEach(btn => btn.addEventListener('click', () => { st.list = btn.dataset.v; save(); draw(); }));
    draw();
})();
