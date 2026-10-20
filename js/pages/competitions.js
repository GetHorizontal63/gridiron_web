/* Competitions: Overview, Schedule, Standings, Playoff Bracket, Managers (all by season) */
(async function () {
    const { esc, url, param } = SITE;
    const page = document.body.dataset.page;
    const content = document.getElementById('content');
    const b = await GT.load();
    const seasonList = (await GT.query('SELECT DISTINCT season FROM matchups ORDER BY season DESC')).map(r => r.season);
    const season = Number(param('season')) || b.season;
    const LABEL = { overview: 'Overview', schedule: 'Schedule', standings: 'Standings', 'playoff-bracket': 'Playoff Bracket', managers: 'Managers' };

    // ============================================================ ALL SEASONS (the Past Seasons landing page)
    if (page === 'index') {
        SITE.subHeader({ crumbs: [['Past Seasons']],
                         tabs: [{ label: 'All Seasons', href: url('pages/past-seasons/index.html'), active: true },
                                { label: 'Historic League Moments', href: url('pages/past-seasons/moments.html') }] });
        SITE.hero({ title: 'Past Seasons', size: 'short', dots: false, image: 'background-7.png',
                    meta: [`${seasonList.length} seasons of Grass Touchers FFL · ${seasonList[seasonList.length - 1]}-${seasonList[0]}`] });
        const [placeRows, recs, weeks] = await Promise.all([
            GT.query(`SELECT fp.season, fp.place, o.display_name AS name FROM final_placements fp JOIN owners o ON o.owner_id = fp.owner_id WHERE fp.place <= 3`),
            GT.query(`SELECT m.season, o.display_name AS name, SUM(t.team_score > t.opponent_score) AS w, SUM(t.team_score < t.opponent_score) AS l,
                             SUM(t.team_score) AS pf, MAX(t.team_score) AS hi
                      FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                      WHERE m.season_period = 'Regular' GROUP BY m.season, t.owner_id`),
            GT.query(`SELECT season, MAX(week) AS week, COUNT(DISTINCT owner_id) AS teams FROM matchups m JOIN matchup_team_stats t ON t.game_id = m.game_id GROUP BY season`)
        ]);
        const PER_PAGE = 10;
        // one horizontal band per season, Game of the Week style: year | podium | season facts
        const band = s => {
            const place = n => placeRows.find(r => r.season === s && r.place === n);
            const rows = recs.filter(r => r.season === s);
            const best = rows.slice().sort((x, y) => y.w - x.w || y.pf - x.pf)[0];
            const high = rows.slice().sort((x, y) => y.hi - x.hi)[0];
            const info = weeks.find(w => w.season === s) || {};
            const done = !!place(1);
            // a finished season shows its top three; the season in progress shows the current top three by record
            const podium = done ? [1, 2, 3].map(n => place(n) && { name: place(n).name, note: GT.teamName(b, place(n).name, s) })
                                : rows.slice().sort((x, y) => y.w - x.w || y.pf - x.pf).slice(0, 3).map(r => ({ name: r.name, note: `${r.w}-${r.l} · ${GT.pts(r.pf)} PF` }));
            const LABELS = done ? ['Champion', '2nd place', '3rd place'] : ['1st', '2nd', '3rd'];
            const spot = (p, i) => `<div class="pb-spot${i === 0 ? ' first' : ''}">
                <div class="sb-logo"><img src="${GT.logo(p ? p.name : '')}" alt=""></div>
                <div class="pb-who"><small>${LABELS[i]}</small><b>${esc(p ? p.name : '-')}</b><em>${esc(p ? p.note : '')}</em></div></div>`;
            const fact = (label, value) => `<div class="pb-fact"><span>${label}</span><b>${value}</b></div>`;
            return `<a class="pb-band${done ? '' : ' live'}" href="${url(`pages/past-seasons/overview.html?season=${s}`)}">
                <div class="pb-year"><span class="pill ${done ? 'pill-dark' : 'pill-accent'}">${done ? 'Final' : `In progress · Wk ${info.week || '-'}`}</span><b>${s}</b></div>
                <div class="pb-podium">${podium.map(spot).join('')}</div>
                <div class="pb-facts">
                    ${fact('Best record', best ? `${esc(best.name)} ${best.w}-${best.l}` : '-')}
                    ${fact('High score', high ? `${esc(high.name)} ${GT.pts(high.hi)}` : '-')}
                    ${fact('Managers', info.teams || '-')}
                    <span class="btn btn-accent pb-open">Open season</span>
                </div></a>`;
        };
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">League history</div><h2 class="section-title">Choose a Season</h2></div></div>
            <div class="pb-list" id="pb-list"></div><div class="pager" id="pb-pager"></div></div>`;
        let current = 1;
        const pages = Math.max(1, Math.ceil(seasonList.length / PER_PAGE));
        const render = () => {
            const start = (current - 1) * PER_PAGE;
            document.getElementById('pb-list').innerHTML = seasonList.slice(start, start + PER_PAGE).map(band).join('');
            const nums = Array.from({ length: pages }, (_, i) => i + 1);
            document.getElementById('pb-pager').innerHTML = `
                <span class="pager-info">${start + 1}-${Math.min(start + PER_PAGE, seasonList.length)} of ${seasonList.length} seasons</span>
                <div class="pager-nav"><button data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}>Prev</button>
                    ${nums.map(n => `<button data-page="${n}" class="${n === current ? 'on' : ''}">${n}</button>`).join('')}
                    <button data-page="${current + 1}" ${current === pages ? 'disabled' : ''}>Next</button></div>`;
            document.querySelectorAll('#pb-pager button[data-page]').forEach(btn => btn.addEventListener('click', () => {
                current = Number(btn.dataset.page); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
            }));
        };
        render();
        return;
    }

    SITE.subHeader({
        crumbs: [['Past Seasons', url('pages/past-seasons/index.html')], [`${season} ${LABEL[page]}`]],
        tabs: SITE.sectionTabs('competitions', page).filter(t => !t.href.endsWith('index.html')).map(t => ({ ...t, href: `${t.href}?season=${season}` }))
    });

    // every game of the season, one row per matchup (owner_id < opponent so each game appears once)
    const games = await GT.query(`
        SELECT m.game_id AS id, m.week, m.season_period AS period, a.display_name AS home, h.team_score AS hs,
               o.display_name AS away, h.opponent_score AS aws
        FROM matchups m JOIN matchup_team_stats h ON h.game_id = m.game_id AND h.owner_id < h.opponent_owner_id
        JOIN owners a ON a.owner_id = h.owner_id JOIN owners o ON o.owner_id = h.opponent_owner_id
        WHERE m.season = $s ORDER BY m.week, m.game_id`, { $s: season });
    // the week in progress (live scores from the last data update): shown with the week's matchups, never counted
    // in standings, records or the bracket outlook, which all use the final games above
    const live = await GT.liveGames(season);
    const all = games.concat(live);
    const weeks = [...new Set(all.map(g => g.week))];
    const lastWeek = weeks[weeks.length - 1];
    const picture = await GT.standings(season);
    const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    const mUrl = name => GT.managerHref(name, season);
    const seasonSelect = (cls = 'select') => `<select class="${cls}" id="season-pick">${seasonList.map(s =>
        `<option value="${s}"${s === season ? ' selected' : ''}>${s} season</option>`).join('')}</select>`;
    const bindSeason = () => { const el = document.getElementById('season-pick'); if (el) el.addEventListener('change', e => {
        const u = new URL(location.href); u.searchParams.set('season', e.target.value); u.searchParams.delete('week'); location.href = u; }); };
    const matchBlock = g => {
        const hw = g.hs > g.aws, aw = g.aws > g.hs;
        return `<div class="match">
            <div><img src="${GT.logo(g.home)}" alt=""><a href="${mUrl(g.home)}" class="${hw ? 'w' : ''}">${esc(g.home)}</a><span class="s ${hw ? 'w' : ''}">${GT.pts(g.hs)}</span></div>
            <div><img src="${GT.logo(g.away)}" alt=""><a href="${mUrl(g.away)}" class="${aw ? 'w' : ''}">${esc(g.away)}</a><span class="s ${aw ? 'w' : ''}">${GT.pts(g.aws)}</span></div>
            ${g.id ? `<a class="match-open" href="${url(`pages/past-seasons/game-center.html?id=${g.id}`)}">Game center →</a>` : ''}
        </div>`;
    };
    const standingsTable = (rows, highlightCut = 0) => `<div class="table-scroll"><table class="data-table" style="min-width:820px">${SITE.cols('5%', '33%', '6%', '6%', '6%', '8%', '10%', '10%', '9%', '7%')}<thead><tr>
            <th class="num">#</th><th>Manager</th><th class="num">W</th><th class="num">L</th><th class="num">T</th><th class="num">Pct</th>
            <th class="num">PF</th><th class="num">PA</th><th class="num">Diff</th><th class="num">Finish</th></tr></thead><tbody>
        ${rows.map((r, i) => {
            const id = (b.byName[r.owner.toLowerCase()] || {}).id;
            const fin = b.finish[`${season}-${id}`];
            const pct = r.gamesPlayed ? (r.wins + r.ties / 2) / r.gamesPlayed : 0;
            return `<tr><td class="num">${i + 1}</td><td><a class="team-cell" href="${mUrl(r.owner)}"><img src="${GT.logo(r.owner)}" alt=""><span><b>${esc(r.owner)}</b>
                    <span class="muted"> · ${esc(GT.teamName(b, r.owner, season))}</span></span></a></td>
                <td class="num">${r.wins}</td><td class="num">${r.losses}</td><td class="num">${r.ties}</td><td class="num">${pct.toFixed(3).replace(/^0/, '')}</td>
                <td class="num">${GT.pts(r.pointsFor)}</td><td class="num">${GT.pts(r.pointsAgainst)}</td>
                <td class="num ${r.pointsFor >= r.pointsAgainst ? 'win' : 'loss'}">${(r.pointsFor >= r.pointsAgainst ? '+' : '') + GT.pts(r.pointsFor - r.pointsAgainst)}</td>
                <td class="num"><b>${fin ? ord(fin) : '-'}</b></td></tr>`;
        }).join('')}</tbody></table></div>`;

    // ============================================================ OVERVIEW
    function overview() {
        const champs = Object.entries(b.finish).filter(([, p]) => p === 1)
            .map(([k]) => { const [s, id] = k.split('-'); return { s: +s, name: b.byId[id] ? b.byId[id].name : '' }; })
            .sort((x, y) => y.s - x.s);
        const wk = all.filter(g => g.week === lastWeek);
        const liveWk = wk.some(g => g.live);
        const allScores = games.flatMap(g => [{ n: g.home, v: g.hs, w: g.week }, { n: g.away, v: g.aws, w: g.week }]).filter(x => x.v != null);
        const hi = allScores.reduce((m, x) => x.v > m.v ? x : m, { v: -1 });
        const avg = allScores.reduce((a, x) => a + x.v, 0) / (allScores.length || 1);
        const feature = wk.slice().sort((x, y) => (y.hs + y.aws) - (x.hs + x.aws))[0];
        const first = wk[0];
        SITE.hero({ title: `${season} Season`, image: 'background-7.png',
                    tools: `<label class="hero-season"><span>Season</span>${seasonSelect()}</label>`,
                    meta: [`Grass Touchers FFL · ${picture.standings.length} managers`, `Latest: ${GT.periodLabel(first ? first.period : 'Regular', lastWeek || 0)}`,
                           champs.find(c => c.s === season) ? `Champion: ${esc(champs.find(c => c.s === season).name)}` : 'Champion: to be decided'] });
        // a gear beside the title: the season's scoring rules
        const h1 = document.querySelector('#hero .hero-title');
        if (h1) h1.insertAdjacentHTML('beforeend', `<a class="hero-gear" href="${url(`pages/past-seasons/scoring.html?season=${season}`)}" title="${season} scoring rules" aria-label="Scoring rules">
            <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg></a>`);
        const d = feature ? GT.weekDate(b, season, feature.week) : null;
        content.innerHTML = `<div class="wrap page-pad">
            <div class="card-row">
                ${GT.divisionCards(picture, season)}
                <div class="card"><div class="card-head"><span class="card-title">Week ${lastWeek || '-'} Scores${liveWk ? ' · Live' : ''}</span></div><div class="card-body">
                    <ul class="mini-list score-list">${wk.slice(0, 8).map(g => `<li class="row-link" data-href="${GT.gameHref(g.id)}" title="Open game center"><img src="${GT.logo(g.hs >= g.aws ? g.home : g.away)}" alt="">
                        <span>${GT.managerLink(g.home, season)} v ${GT.managerLink(g.away, season)}</span><span class="res">${Math.round(g.hs)}–${Math.round(g.aws)}</span></li>`).join('')}</ul>
                    </div><a class="card-link" href="${url(`pages/past-seasons/schedule.html?season=${season}&week=${lastWeek}`)}">Full schedule</a></div>
                <div class="card"><div class="card-head"><span class="card-title">League Stats</span></div><div class="card-body">
                    <ul class="kv"><li><span>Games played</span><b>${games.length}</b></li>
                        <li><span>Average score</span><b>${GT.pts(avg)}</b></li>
                        <li><span>High score</span><b>${hi.v >= 0 ? GT.pts(hi.v) : '-'}</b></li>
                        <li><span>High scorer</span><b>${hi.n ? esc(hi.n) + ' · W' + hi.w : '-'}</b></li>
                        <li><span>200-point games</span><b>${allScores.filter(x => x.v >= 200).length}</b></li>
                        <li><span>Closest game</span><b>${games.length ? GT.pts(Math.min(...games.map(g => Math.abs(g.hs - g.aws)))) : '-'}</b></li></ul>
                    </div><a class="card-link" href="${url('pages/stories/features.html')}">League records</a></div>
            </div>
            ${feature ? `<section class="game-band">
                <div class="band-label"><span class="pill ${feature.live ? 'pill-accent' : 'pill-dark'}">${feature.live ? 'Live · game of the week' : 'Game of the week'}</span>${esc(GT.periodLabel(feature.period, feature.week))}${d ? ' · ' + GT.fmtDate(d) : ''}</div>
                <div class="scoreboard">
                    <div class="sb-team"><div class="sb-logo"><img src="${GT.logo(feature.home)}" alt=""></div>
                        <div class="sb-name">${esc(GT.teamName(b, feature.home, season))}<small>${GT.managerLink(feature.home, season)}</small></div></div>
                    <div class="sb-scores"><div class="sb-score ${feature.hs > feature.aws ? 'won' : ''}">${GT.pts(feature.hs)}</div><span class="sb-at">AT</span>
                        <div class="sb-score ${feature.aws > feature.hs ? 'won' : ''}">${GT.pts(feature.aws)}</div></div>
                    <div class="sb-team right"><div class="sb-name">${esc(GT.teamName(b, feature.away, season))}<small>${GT.managerLink(feature.away, season)}</small></div>
                        <div class="sb-logo"><img src="${GT.logo(feature.away)}" alt=""></div></div>
                </div>
                <div class="band-foot"><div><h4>${GT.pts(feature.hs + feature.aws)} combined points</h4><p>${feature.live ? `Highest-scoring game of week ${feature.week} so far · ${esc(GT.updatedText(feature.updated))}` : `Highest-scoring game of week ${feature.week}`}</p></div>
                    <div class="band-actions"><a class="btn btn-accent" href="${url(`pages/past-seasons/game-center.html?id=${feature.id}`)}">Open game center</a></div></div>
            </section>` : ''}
            <section class="split-section">
                <div><div class="eyebrow">${season} season · week ${lastWeek || '-'}</div><h2 class="section-title">This Week's<br>Results</h2>
                    <p class="section-copy">${liveWk ? `Week ${lastWeek} is in progress: scores so far, ${esc(GT.updatedText(wk[0].updated))}. Final once the week's last game ends.` : 'Every matchup from the latest week. Winners in bold.'}</p><div class="section-tools"></div></div>
                <ul class="list-rows">${wk.map(g => `<li class="row-link" data-href="${GT.gameHref(g.id)}" title="Open game center"><img src="${GT.logo(g.hs >= g.aws ? g.home : g.away)}" alt="">
                    <div class="main"><b>${GT.managerLink(g.home, season)}</b> ${GT.pts(g.hs)} <span class="sub">vs</span> ${GT.pts(g.aws)} <b>${GT.managerLink(g.away, season)}</b></div>
                    <div class="date sub">${GT.fmtDate(GT.weekDate(b, season, g.week))}</div><div class="time sub">Margin ${GT.pts(Math.abs(g.hs - g.aws))}</div>
                    <div class="tag">${g.live ? 'Live' : esc(GT.periodLabel(g.period, g.week))}</div></li>`).join('') || '<li class="muted">No games yet.</li>'}</ul>
            </section>
            <section class="an-section" id="season-stream"></section>
            <section class="an-section" id="season-nfl"></section>
            <section class="an-section" id="season-quads"></section>
            <section class="an-section" id="season-groups"></section></div>`;
        bindSeason();
        seasonStream();
        seasonNfl();
        seasonQuads();
        seasonGroups();
    }

    // managers ranked by position group over the regular season's finished weeks (starters by the player's position,
    // so a FLEX RB counts as a running back). FP+ and roster efficiency as js/roster-metrics.js defines them, inside the group:
    //   FP+        = the group's starters' points / their projections x 100 (pooled over the weeks)
    //   Efficiency = those points / the most the group could have scored with its own bench (same-position swaps)
    async function seasonGroups() {
        const host = document.getElementById('season-groups');
        if (!host || typeof RosterMetrics === 'undefined') return;
        const GROUPS = [['Quarterback', ['QB']], ['Running Back', ['RB']], ['Receivers', ['WR', 'TE'], 'WR / TE'],
                        ['Special Teams', ['K', 'P', 'D/ST'], 'K / P / D/ST'], ['Kicking', ['K', 'P'], 'K / P'], ['Coaching', ['HC'], '', true]];
        const rows = await GT.query(`
            SELECT o.display_name AS owner, fr.week, p.player_id AS playerId, p.position,
                   frp.slot_position AS slotPosition, frp.actual_points AS actualPoints, frp.projected_points AS projectedPoints
            FROM fantasy_rosters fr JOIN owners o ON o.owner_id = fr.owner_id
            JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id JOIN players p ON p.player_id = frp.player_id
            WHERE fr.season = $s AND fr.week IN (SELECT DISTINCT m.week FROM matchups m JOIN matchup_team_stats t ON t.game_id = m.game_id
                                                 WHERE m.season = $s AND m.season_period = 'Regular' AND t.team_score IS NOT NULL)`, { $s: season });
        if (!rows.length) return;
        const weeks = new Set(rows.map(r => r.week)).size;
        const byTeamWeek = new Map();
        rows.forEach(r => { const k = `${r.owner}|${r.week}`; if (!byTeamWeek.has(k)) byTeamWeek.set(k, []); byTeamWeek.get(k).push(r); });
        const owners = [...new Set(rows.map(r => r.owner))];
        // Coaching scores go negative and its projections sit near zero, so the ratios break: there it shows points against
        // projection (+/- Proj) and how often the manager started his best-scoring coach (Best start) instead
        const table = ([name, pos, sub, signed]) => {
            const lines = owners.map(owner => {
                const rosters = [...byTeamWeek.entries()].filter(([k]) => k.startsWith(owner + '|')).map(([, roster]) => roster.filter(r => pos.includes(r.position)));
                const wk = rosters.map(r => RosterMetrics.weekOf(r));
                let act = 0, proj = 0, projAll = 0, best = 0;
                wk.forEach(m => { act += m.actual; projAll += m.projected; if (m.projected > 0) proj += m.projected; best += m.optimal; });
                const pts = r => parseFloat(r.actualPoints) || 0, start = r => r.slotPosition !== 'BE' && r.slotPosition !== 'IR';
                const bestWeeks = rosters.filter(r => r.some(start) && Math.max(...r.filter(start).map(pts)) >= Math.max(...r.map(pts))).length;
                return { owner, fp: act, fpp: signed ? act - projAll : proj > 0 ? 100 * act / proj : null,
                         eff: signed ? (rosters.length ? 100 * bestWeeks / rosters.length : null) : best > 0 ? 100 * act / best : null };
            }).sort((x, y) => y.fp - x.fp);
            return `<div class="panel pg-panel"><div class="pg-head"><h3 class="panel-title">${esc(name)}</h3>${sub ? `<span>${esc(sub)}</span>` : ''}</div>
                <table class="data-table pg-table">${SITE.cols('30px', 'auto', '58px', '54px', '62px')}
                    <thead><tr><th class="num">#</th><th>Manager</th><th class="num">FP</th><th class="num">${signed ? 'vs Proj' : 'FP+'}</th><th class="num">${signed ? 'Best' : 'Eff'}</th></tr></thead>
                    <tbody>${lines.map((l, i) => `<tr><td class="num"><b>${i + 1}</b></td>
                        <td><span class="pg-mgr"><img src="${GT.logo(l.owner)}" alt="">${GT.managerLink(l.owner, season)}</span></td>
                        <td class="num"><b>${GT.pts(l.fp)}</b></td><td class="num">${l.fpp == null ? '-' : signed ? `${l.fpp > 0 ? '+' : ''}${l.fpp.toFixed(1)}` : l.fpp.toFixed(1)}</td>
                        <td class="num">${l.eff == null ? '-' : `${l.eff.toFixed(1)}%`}</td></tr>`).join('')}</tbody></table></div>`;
        };
        host.innerHTML = `<div class="panel-head"><div><div class="eyebrow">${season} regular season · ${weeks} week${weeks === 1 ? '' : 's'}</div><h2 class="section-title">Position Group Rankings</h2>
                <p class="section-copy" style="max-width:none">Every manager ranked by the fantasy points their starters scored at each position group. FP+ = those starters' points against their projections (100 = right on projection). Eff = the share of the most the group could have scored with that manager's own bench. Coaching scores can go negative, so it shows points against projection and how often the best-scoring coach on the roster was the one started.</p></div></div>
            <div class="pg-grid">${GROUPS.map(table).join('')}</div>`;
    }

    // the league against the Stream Team: the best lineup each week from free agents alone (regular season and playoffs)
    async function seasonStream() {
        const host = document.getElementById('season-stream');
        if (!host || !window.ST) return;
        const list = await ST.games(season);
        if (!list.length) return;
        const lines = ST.lines(list);
        const league = ST.rec(list, 'sp'), best = ST.rec(list, 'sb');
        const wks = [...new Set(list.map(g => g.week))].sort((x, y) => x - y);
        const byWeek = w => list.filter(g => g.week === w);
        const wkLabel = w => { const g = byWeek(w)[0]; return g.period === 'Regular' ? `Week ${w}` : `Week ${w} · ${GT.PERIOD[g.period] || g.period}`; };
        const SHORT = { 'Post-WC': 'Play-in', 'Post-WB': 'Playoffs', Championship: 'Final', 'Post-LB': 'Gulag', 'Post-LP': 'Gulag PI', Chumpionship: 'Chump' };
        const wkShort = w => { const g = byWeek(w)[0]; return g.period === 'Regular' ? `Wk ${w}` : `Wk ${w} ${SHORT[g.period] || ''}`.trim(); };
        const post = wks.filter(w => byWeek(w)[0].period !== 'Regular').length;
        const avg = l => l.reduce((t, g) => t + g.pf, 0) / (l.length || 1);
        const stAvg = wks.reduce((t, w) => t + byWeek(w)[0].sp, 0) / wks.length;
        const wireWeek = wks.map(w => ({ w, beat: byWeek(w).filter(g => g.pf > g.sp).length, of: byWeek(w).length, st: byWeek(w)[0].sp }))
            .sort((x, y) => y.st - x.st)[0];
        const tile = (v, l, s, tip = '') => `<div class="stat-tile"><div class="v">${v}</div><div class="l"${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</div><div class="s">${s}</div></div>`;
        const pct = r => r.pct == null ? '-' : r.pct.toFixed(3).replace(/^0/, '');
        const sg = v => v == null ? '-' : `${v >= 0 ? '+' : ''}${GT.pts(v)}`;
        const ST_TIP = `The Stream Team: each week, the best legal lineup from players on nobody\'s roster that week (bench and IR count as taken), picked by ESPN\'s weekly projections and scored with what those players really scored. It is what a manager streaming the waiver wire on projections alone would have put up. A win = the manager outscored it that week.`, BW_TIP = `The Best Wire: the same free agents, but the lineup is picked with hindsight by what they actually scored. It is the most the waiver wire could have produced that week, a ceiling nobody could have set in advance.`;
        host.innerHTML = `<div class="panel-head"><div><div class="eyebrow">${season} · ${wks.length - post} regular-season week${wks.length - post === 1 ? '' : 's'}${post ? ` + ${post} playoff week${post === 1 ? '' : 's'}` : ''}</div><h2 class="section-title">Vs the Stream Team</h2>
                <p class="section-copy" style="max-width:none">The Stream Team is the best lineup you could build each week from players on nobody's roster, picked by ESPN's
                projections and scored with what they really scored. Beat it and you out-managed the waiver wire. The Best Wire is the same idea picked with hindsight: the most the wire could have scored.</p></div></div>
            <div class="stat-tiles" style="grid-template-columns:repeat(5,minmax(0,1fr))">
                ${tile(ST.recText(league), 'League vs Stream Team', `${pct(league)} · avg margin ${sg(league.margin)}`, `Every manager's week (regular season and playoffs) compared with that week's Stream Team score, added up. ${ST_TIP} Avg margin = how many points a week the league scored over it.`)}
                ${tile(GT.pts(stAvg), 'Stream Team per week', `league average ${GT.pts(avg(list))}`, 'The Stream Team\'s average score per week this season, next to the average manager score.')}
                ${tile(ST.recText(best), 'League vs Best Wire', `${pct(best)} · avg margin ${sg(best.margin)}`, `Every manager's week compared with that week's Best Wire. ${BW_TIP}`)}
                ${tile(lines.filter(l => l.vsProj.l === 0).length, 'Never lost to it', `of ${lines.length} managers`, 'Managers who outscored the Stream Team every week they played this season, playoffs included.')}
                ${tile(`W${wireWeek.w}`, 'Stream Team best week', `${GT.pts(wireWeek.st)} pts · beat ${wireWeek.of - wireWeek.beat} of ${wireWeek.of}`, 'The Stream Team\'s highest-scoring week, and how many managers it would have beaten.')}
            </div>
            <div class="db-grid" style="margin-top:12px">
                <section class="db-tile s7 fill"><header><h3 data-tip="Each box is that week's spread of manager scores: the box holds the middle half, the line inside is the median, the whiskers reach the lowest and highest score. Solid green = the Stream Team, dashed red = the Best Wire.">Week by Week</h3><p>Every manager's score (box: middle half, whiskers: range) against the Stream Team and the Best Wire${post ? ' · * = playoffs' : ''}</p></header><div class="db-chart" id="st-chart"></div></section>
                <section class="db-tile s5"><header><h3 id="st-lu-title" data-tip="${esc(ST_TIP)}">Stream Team</h3><p style="display:flex;gap:8px;align-items:center;flex-wrap:nowrap;justify-content:flex-start">
                    <span class="seg" id="st-kind"><button data-k="proj" class="on" data-tip="${esc(`Proj: the best free-agent lineup by projection. ${ST_TIP}`)}">Proj</button><button data-k="best" data-tip="${esc(`Best: the best free-agent lineup in hindsight. ${BW_TIP}`)}">Best</button></span>
                    <select class="select" id="st-week">${wks.map(w => `<option value="${w}"${w === wks[wks.length - 1] ? ' selected' : ''}>${esc(wkShort(w))}</option>`).join('')}</select></p></header>
                    <div id="st-lineup"></div></section>
            </div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px" data-tip="Each manager's weeks (regular season and playoffs) against both free-agent lineups, best record against the Stream Team first.">Managers vs the Wire</h3>
                <div class="table-scroll"><table class="data-table" style="min-width:820px">${SITE.cols('24%', '7%', '9%', '12%', '9%', '12%', '13%', '14%')}<thead><tr>
                    <th>Manager</th><th class="num" data-tip="Games played, playoffs included.">G</th><th class="num" data-tip="The manager's average score per game.">PF / G</th>
                    <th class="num" data-tip="${esc(`Weeks won-lost against the Stream Team. ${ST_TIP}`)}">Vs Stream Team</th>
                    <th class="num" data-tip="Winning percentage against the Stream Team.">PCT</th>
                    <th class="num" data-tip="Average points a week the manager scored over (+) or under (-) the Stream Team.">Avg margin</th>
                    <th class="num" data-tip="${esc(`Weeks won-lost against the Best Wire. ${BW_TIP}`)}">Vs Best Wire</th>
                    <th class="num" data-tip="Average points a week over (+) or under (-) the Best Wire. Almost everyone is negative: it is a hindsight ceiling.">Margin vs best</th></tr></thead><tbody>
                ${lines.map(l => `<tr><td><span class="team-cell"><img src="${GT.logo(l.name)}" alt="">${GT.managerLink(l.name, season)}</span></td><td class="num">${l.g}</td>
                    <td class="num">${GT.pts(l.ppg)}</td><td class="num"><b>${ST.recText(l.vsProj)}</b></td><td class="num">${pct(l.vsProj)}</td>
                    <td class="num ${l.vsProj.margin >= 0 ? 'win' : 'loss'}">${sg(l.vsProj.margin)}</td><td class="num">${ST.recText(l.vsBest)}</td>
                    <td class="num ${l.vsBest.margin >= 0 ? 'win' : 'loss'}">${sg(l.vsBest.margin)}</td></tr>`).join('')}
                <tr class="group"><td>League</td><td class="num">${list.length}</td><td class="num">${GT.pts(avg(list))}</td><td class="num">${ST.recText(league)}</td><td class="num">${pct(league)}</td>
                    <td class="num">${sg(league.margin)}</td><td class="num">${ST.recText(best)}</td><td class="num">${sg(best.margin)}</td></tr></tbody></table></div></div>`;
        let luWeek = wks[wks.length - 1], luKind = 'proj';      // 'proj' = the Stream Team, 'best' = the Best Wire (hindsight)
        const showLineup = async () => {
            const w = luWeek;
            const lu = await ST.lineup(season, w, luKind);    // Proj = ESPN's projection that week, Pts = what the player scored
            const title = document.getElementById('st-lu-title');
            title.textContent = `${wkLabel(w)} ${luKind === 'proj' ? 'Stream Team' : 'Best Wire'} · ${GT.pts(lu.reduce((t, p) => t + (p.pts || 0), 0))} pts`;
            title.dataset.tip = luKind === 'proj' ? ST_TIP : BW_TIP;
            document.getElementById('st-lineup').innerHTML = `<table class="data-table">${SITE.cols('14%', '50%', '18%', '18%')}<thead><tr><th data-tip="The lineup slot the player filled (FLEX = best RB, WR or TE left).">Slot</th><th>Player</th><th class="num" data-tip="ESPN's projection for the player that week. The Stream Team picks on this; the Best Wire picks on actual points.">Proj</th><th class="num" data-tip="What the player actually scored that week.">Pts</th></tr></thead><tbody>
                ${lu.map(p => `<tr><td class="muted">${esc(p.slot)}</td><td>${p.pid > 0 ? `<a href="${url(`pages/players/stats.html?id=${p.pid}`)}">${esc(p.name)}</a>` : esc(p.name)} <span class="muted">${esc(p.pos)}</span></td>
                    <td class="num">${GT.pts(p.proj)}</td><td class="num"><b>${GT.pts(p.pts)}</b></td></tr>`).join('')}</tbody></table>`;
            window.dispatchEvent(new Event('resize'));       // the chart beside it stretches to this tile's height
        };
        document.getElementById('st-week').addEventListener('change', e => { luWeek = Number(e.target.value); showLineup(); });
        document.querySelectorAll('#st-kind button').forEach(btn => btn.addEventListener('click', () => {
            luKind = btn.dataset.k;
            document.querySelectorAll('#st-kind button').forEach(x => x.classList.toggle('on', x === btn));
            showLineup();
        }));
        showLineup();
        const c = { accent: SITE.color('accent'), red: SITE.color('danger'), muted: SITE.color('muted'), grid: SITE.color('track'), line: SITE.color('line-strong') };
        const q = (s, p) => { const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
        const chart = echarts.init(document.getElementById('st-chart'));
        chart.setOption({
            textStyle: { fontFamily: 'Inter, sans-serif' }, grid: { left: 40, right: 14, top: 28, bottom: 26 },
            legend: { type: 'scroll', top: 0, left: 'center', textStyle: { color: c.muted, fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
            tooltip: { trigger: 'axis', backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 } },
            xAxis: { type: 'category', data: wks.map(w => byWeek(w)[0].period === 'Regular' ? `W${w}` : `W${w}*`), axisLabel: { color: c.muted, fontSize: 10 } },
            yAxis: { type: 'value', axisLabel: { color: c.muted, fontSize: 10 }, splitLine: { lineStyle: { color: c.grid } }, min: v => Math.floor(v.min / 10) * 10 },
            series: [{ name: 'Managers', type: 'boxplot', itemStyle: { color: SITE.color('surface-2'), borderColor: c.line },
                       data: wks.map(w => { const s = byWeek(w).map(g => g.pf).sort((x, y) => x - y); return [s[0], q(s, 0.25), q(s, 0.5), q(s, 0.75), s[s.length - 1]]; }) },
                     { name: 'Stream Team', type: 'line', symbolSize: 6, itemStyle: { color: c.accent }, lineStyle: { color: c.accent, width: 3 }, data: wks.map(w => byWeek(w)[0].sp) },
                     { name: 'Best Wire', type: 'line', symbolSize: 5, itemStyle: { color: c.red }, lineStyle: { color: c.red, type: 'dashed' }, data: wks.map(w => byWeek(w)[0].sb) }]
        });
        window.addEventListener('resize', () => chart.resize());
    }

    // the league against the NFL: every NFL team's own roster as a fantasy team each week (nflgm.js), managers and
    // front offices ranked together; 'proj' = picked by ESPN's projections, 'best' = picked with hindsight
    async function seasonNfl() {
        const host = document.getElementById('season-nfl');
        if (!host || !window.NG) return;
        const [gmRows, teams, mgrRows] = await Promise.all([NG.weeks(season), NG.teams(), GT.query(`
            SELECT m.week, o.display_name AS name, t.team_score AS pf FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id
            JOIN owners o ON o.owner_id = t.owner_id WHERE m.season = $s AND t.team_score IS NOT NULL`, { $s: season })]);
        if (!gmRows.length || !mgrRows.length) return;
        const wks = [...new Set(mgrRows.map(r => r.week))].sort((x, y) => x - y);
        const nameOf = Object.fromEntries(teams.map(t => [t.abbr, t.name]));
        const NFL_TIP = 'An NFL GM is an NFL team played as a fantasy team: each week, the best legal lineup in this league\'s format from that team\'s own players (its QB, backs, receivers, tight end, kicker, punter, D/ST and head coach). Proj picks the lineup by ESPN\'s projections and scores it with what the players really scored, the way a manager has to pick. Best picks it with hindsight. A team on its bye has no lineup that week.';
        let kind = 'proj';
        const tile = (v, l, s, tip = '') => `<div class="stat-tile"><div class="v">${v}</div><div class="l"${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</div><div class="s">${s}</div></div>`;
        const render = () => {
            const gm = gmRows.filter(r => r.kind === kind && wks.includes(r.week));
            const gmWeek = w => gm.filter(r => r.week === w);
            // every manager-week against every NFL team-week of the same week
            let w_ = 0, l_ = 0;
            const mgrLine = {};
            mgrRows.forEach(r => {
                const field = gmWeek(r.week);
                const beat = field.filter(x => r.pf > x.score).length, lost = field.filter(x => r.pf < x.score).length;
                w_ += beat; l_ += lost;
                const m = mgrLine[r.name] || (mgrLine[r.name] = { name: r.name, g: 0, pts: 0, beat: 0, of: 0, hi: 0 });
                m.g++; m.pts += r.pf; m.beat += beat; m.of += field.length; m.hi = Math.max(m.hi, r.pf);
            });
            const nflLine = {};
            gm.forEach(r => {
                const mgrs = mgrRows.filter(x => x.week === r.week);
                const n = nflLine[r.team] || (nflLine[r.team] = { abbr: r.team, g: 0, pts: 0, beat: 0, of: 0, hi: 0 });
                n.g++; n.pts += r.score; n.beat += mgrs.filter(x => r.score > x.pf).length; n.of += mgrs.length; n.hi = Math.max(n.hi, r.score);
            });
            const rows = [...Object.values(mgrLine).map(m => ({ ...m, type: 'mgr', ppg: m.pts / m.g })), ...Object.values(nflLine).map(n => ({ ...n, type: 'nfl', ppg: n.pts / n.g }))]
                .sort((x, y) => y.ppg - x.ppg);
            const nflRows = rows.filter(r => r.type === 'nfl'), mgrList = rows.filter(r => r.type === 'mgr');
            const topNfl = nflRows[0], avgNfl = nflRows.reduce((t, r) => t + r.ppg, 0) / nflRows.length, avgMgr = mgrList.reduce((t, r) => t + r.ppg, 0) / mgrList.length;
            const bestWeek = gm.slice().sort((x, y) => y.score - x.score)[0];
            const pctTxt = v => v == null ? '-' : v.toFixed(3).replace(/^0/, '');
            host.querySelector('#nfl-tiles').innerHTML =
                tile(`${w_}-${l_}`, 'League vs the NFL', `${pctTxt(w_ / (w_ + l_ || 1))} · every manager-week vs every NFL team that week`, `Each manager's score against all ${nflRows.length} NFL GMs that played that week, added up. ${NFL_TIP}`) +
                tile(GT.pts(avgNfl), 'NFL GM per week', `league average ${GT.pts(avgMgr)}`, 'The average NFL GM score per week, next to the average manager score.') +
                tile(`<img class="nfl-ic" src="${NG.logo(topNfl.abbr)}" alt="">${esc(topNfl.abbr)}`, 'Best NFL GM', `${GT.pts(topNfl.ppg)} pts / week`, `The NFL team whose own roster scored the most per week in this format (${kind === 'proj' ? 'picked by projection' : 'picked with hindsight'}).`) +
                tile(mgrList.filter(m => m.ppg > topNfl.ppg).length, 'Managers above every NFL GM', `of ${mgrList.length} managers`, 'Managers who scored more per week than the best NFL GM.') +
                tile(`${GT.pts(bestWeek.score)}`, 'Best NFL GM week', `${esc(nameOf[bestWeek.team] || bestWeek.team)}, week ${bestWeek.week}`, 'The highest single-week score by any NFL GM this season.');
            host.querySelector('#nfl-rows').innerHTML = rows.map((r, i) => {
                const who = r.type === 'mgr' ? `<span class="team-cell"><img src="${GT.logo(r.name)}" alt="">${GT.managerLink(r.name, season)}</span>`
                                             : `<span class="team-cell"><img src="${NG.logo(r.abbr)}" alt=""><span>${esc(nameOf[r.abbr] || r.abbr)}</span></span>`;
                return `<tr class="${r.type === 'mgr' ? 'me' : ''}"><td class="num">${i + 1}</td><td>${who}</td><td class="muted">${r.type === 'mgr' ? 'Manager' : 'NFL GM'}</td>
                    <td class="num">${r.g}</td><td class="num"><b>${GT.pts(r.ppg)}</b></td><td class="num">${GT.pts(r.hi)}</td>
                    <td class="num">${pctTxt(r.of ? r.beat / r.of : null)}</td></tr>`;
            }).join('');
        };
        host.innerHTML = `<div class="panel-head"><div><div class="eyebrow">${season} · ${wks.length} weeks</div><h2 class="section-title">Vs the NFL</h2>
                <p class="section-copy" style="max-width:none">Every NFL team played as a fantasy team: each week the best lineup in this league's format from its own roster,
                D/ST and head coach included. Proj picks the lineup by ESPN's projections, the way you have to; Best picks it with hindsight. How did the league's managers do against 32 NFL front offices?</p></div>
                <span class="seg" id="nfl-kind"><button data-k="proj" class="on" data-tip="${esc(NFL_TIP)}">Proj</button><button data-k="best" data-tip="Best: each NFL roster's best lineup in hindsight.">Best</button></span></div>
            <div class="stat-tiles" id="nfl-tiles" style="grid-template-columns:repeat(5,minmax(0,1fr))"></div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px" data-tip="${esc(`Managers and NFL GMs ranked by points per week. Vs the field = the share of the other side beaten in the same weeks: for a manager, NFL GMs; for an NFL GM, managers. ${NFL_TIP}`)}">Managers and NFL GMs</h3>
                <div class="table-scroll"><table class="data-table" style="min-width:720px">${SITE.cols('7%', '35%', '14%', '9%', '12%', '11%', '12%')}<thead><tr>
                    <th class="num">#</th><th>Team</th><th>Type</th><th class="num">Weeks</th><th class="num">Pts / wk</th><th class="num">High</th>
                    <th class="num" data-tip="For a manager: the share of NFL GMs he outscored in the same weeks. For an NFL GM: the share of managers it outscored.">Vs the field</th></tr></thead>
                    <tbody id="nfl-rows"></tbody></table></div></div>`;
        host.querySelectorAll('#nfl-kind button').forEach(btn => btn.addEventListener('click', () => {
            kind = btn.dataset.k;
            host.querySelectorAll('#nfl-kind button').forEach(x => x.classList.toggle('on', x === btn));
            render();
        }));
        render();
    }

    // the season's weekly score ranks: every manager's quads and rank spread (regular season)
    async function seasonQuads() {
        const host = document.getElementById('season-quads');
        if (!host || !window.SR) return;
        const rows = await GT.query(`SELECT m.season, m.week, t.owner_id AS id, o.display_name AS name, t.score_rank_on_week AS rank,
                                            t.team_score AS pf, t.opponent_score AS pa
                                     FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                                     WHERE m.season = $s AND m.season_period = 'Regular' AND t.team_score IS NOT NULL AND t.opponent_score IS NOT NULL`, { $s: season });
        const lines = SR.managers(SR.teamWeeks(rows));
        if (!lines.length) return;
        const weeks = new Set(rows.map(r => r.week)).size;
        host.innerHTML = `<div class="panel-head"><div><div class="eyebrow">${season} regular season · ${weeks} week${weeks === 1 ? '' : 's'}</div><h2 class="section-title">Season Quads</h2>
                <p class="section-copy" style="max-width:none">Every week's scores ranked 1 to ${lines.maxRank}. Managers by all-play %; PCT 1-4 etc. = how often they won when their score ranked in that quad. Luck = wins minus what all-play predicts.</p></div>
                <a class="card-link" href="${url(`pages/stats.html?season=${season}#moneyball`)}">All seasons in Moneyball</a></div>
            <div class="panel" style="margin-top:0">${SR.table(lines, { link: n => GT.managerLink(n, season) })}</div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">Score Rank Matrix</h3>${SR.matrix(lines)}
                <p class="an-note">Weeks each manager finished at each weekly score rank · 1 = highest score of the week${lines.some(l => !l.ranked) ? ` · managers under ${lines.min} games are listed unranked (faded)` : ''}.</p></div>`;
    }

    // ============================================================ SCHEDULE
    async function schedule() {
        const week = Number(param('week')) || lastWeek;
        SITE.hero({ title: `${season} Schedule`, size: 'short', dots: false, image: 'background-9.png',
                    meta: [`${weeks.length} weeks · ${games.length} games`] });
        const wk = all.filter(g => g.week === week);
        // per manager this week: lineup projection, top starter, and score rank (all from the saved lineups / matchup stats)
        const [lineups, ranks] = await Promise.all([
            GT.query(`SELECT o.display_name AS owner, p.player_id AS pid, p.name, p.position AS pos, frp.actual_points AS pts, frp.projected_points AS proj
                      FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                      JOIN players p ON p.player_id = frp.player_id JOIN owners o ON o.owner_id = fr.owner_id
                      WHERE fr.season = $s AND fr.week = $w AND frp.slot_position NOT IN ('BE','IR')`, { $s: season, $w: week }),
            GT.query(`SELECT o.display_name AS owner, t.score_rank_on_week AS rank FROM matchup_team_stats t
                      JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                      WHERE m.season = $s AND m.week = $w`, { $s: season, $w: week })
        ]);
        const teamsThisWeek = wk.length * 2;
        const info = name => {
            const mine = lineups.filter(l => l.owner === name);
            const top = mine.filter(l => l.pts != null).sort((x, y) => y.pts - x.pts)[0];
            const proj = mine.reduce((t, l) => t + (Number(l.proj) || 0), 0);
            const before = games.filter(g => g.week < week && g.period === 'Regular' && (g.home === name || g.away === name) && g.hs != null);
            const w = before.filter(g => (g.home === name ? g.hs > g.aws : g.aws > g.hs)).length;
            const l = before.filter(g => (g.home === name ? g.hs < g.aws : g.aws < g.hs)).length;
            // a live week has no recorded ranks yet: rank on the score so far
            const game = wk.find(g => g.home === name || g.away === name);
            const soFar = game && game.live ? (game.home === name ? game.hs : game.aws) : null;
            const liveRank = soFar == null ? null : 1 + wk.flatMap(g => [g.hs, g.aws]).filter(v => v > soFar).length;
            return { top, proj, rec: `${w}-${l}`, rank: (ranks.find(r => r.owner === name) || {}).rank || liveRank };
        };
        const teamRow = (name, score, won, x) => `<div class="sc-team${won ? ' won' : ''}">
            <img src="${GT.logo(name)}" alt="">
            <div class="sc-who">${GT.managerLink(name, season)}<small>${esc(GT.teamName(b, name, season))} · ${x.rec}</small></div>
            <div class="sc-top">${x.top ? `<b>${esc(x.top.name)}</b><small>${esc(x.top.pos)} · ${GT.pts(x.top.pts)} pts</small>` : '<small>-</small>'}</div>
            <div class="sc-proj"><b>${x.proj ? GT.pts(x.proj) : '-'}</b><small>Proj</small></div>
            <div class="sc-rank"><b>${x.rank ? `#${x.rank}` : '-'}</b><small>of ${teamsThisWeek}</small></div>
            <div class="sc-score">${score == null ? '-' : GT.pts(score)}</div></div>`;
        const card = g => {
            const h = info(g.home), a = info(g.away);
            const done = g.hs != null && g.aws != null && !g.live;
            const homeWon = done && g.hs > g.aws, awayWon = done && g.aws > g.hs;
            const favHome = h.proj && a.proj ? h.proj >= a.proj : null;
            const upset = done && favHome != null && ((favHome && awayWon) || (!favHome && homeWon));
            return `<div class="sc-card row-link" data-href="${GT.gameHref(g.id)}" title="Open game center">
                <div class="sc-head"><span class="pill ${done ? 'pill-dark' : 'pill-accent'}">${done ? 'Final' : 'Live'}</span>${g.live ? `<span>${esc(GT.updatedText(g.updated))}</span>` : ''}
                    <span>${esc(GT.periodLabel(g.period, g.week))}</span>${done ? `<span>Margin ${GT.pts(Math.abs(g.hs - g.aws))}</span>` : ''}
                    ${upset ? '<span class="sc-upset">Upset</span>' : ''}<a class="sc-open" href="${GT.gameHref(g.id)}">Game center →</a></div>
                ${teamRow(g.home, g.hs, homeWon, h)}${teamRow(g.away, g.aws, awayWon, a)}</div>`;
        };
        // week summary
        const scores = wk.filter(g => g.hs != null).flatMap(g => [{ n: g.home, v: g.hs }, { n: g.away, v: g.aws }]);
        const hi = scores.reduce((m, x) => !m || x.v > m.v ? x : m, null), lo = scores.reduce((m, x) => !m || x.v < m.v ? x : m, null);
        const close = wk.filter(g => g.hs != null).reduce((m, g) => !m || Math.abs(g.hs - g.aws) < Math.abs(m.hs - m.aws) ? g : m, null);
        const avg = scores.length ? scores.reduce((t, x) => t + x.v, 0) / scores.length : null;
        const tile = (v, l, sub = '') => `<div class="stat-tile"><div class="v">${v}</div><div class="l">${l}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">${esc(GT.periodLabel(wk[0] ? wk[0].period : 'Regular', week))}${GT.weekDate(b, season, week) ? ' · ' + GT.fmtDate(GT.weekDate(b, season, week)) : ''}</div>
                <h2 class="section-title">Week ${week}</h2></div>
                <div class="section-tools" style="margin:0">${seasonSelect()}
                    <select class="select" id="week-pick">${weeks.map(w => `<option value="${w}"${w === week ? ' selected' : ''}>Week ${w}</option>`).join('')}</select></div></div>
            ${scores.length ? `<div class="stat-tiles tiles-4">
                ${tile(GT.pts(hi.v), 'High score', esc(hi.n))}${tile(GT.pts(lo.v), 'Low score', esc(lo.n))}
                ${tile(GT.pts(avg), 'League average', `${scores.length} teams`)}${tile(GT.pts(Math.abs(close.hs - close.aws)), 'Closest game', `${esc(close.home)} v ${esc(close.away)}`)}</div>` : ''}
            <div class="sc-grid">${wk.map(card).join('') || '<p class="muted">No games this week.</p>'}</div></div>`;
        bindSeason();
        document.getElementById('week-pick').addEventListener('change', e => { const u = new URL(location.href); u.searchParams.set('week', e.target.value); location.href = u; });
    }

    // ============================================================ STANDINGS
    function standings() {
        SITE.hero({ title: `${season} Standings`, size: 'short', dots: false, image: 'background-18.png',
                    meta: [`Regular season · ranked by record, ${season >= 2026 ? 'point differential, head-to-head' : 'head-to-head, point differential'}, points for`] });
        const byDiv = {};
        picture.divisionStandings.forEach(r => { (byDiv[r.divisionName] = byDiv[r.divisionName] || []).push(r); });
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">${season} season</div><h2 class="section-title">Standings</h2></div>${seasonSelect()}</div>
            ${Object.entries(byDiv).map(([name, rows]) => `<div class="panel"><h3 class="panel-title" style="margin-bottom:12px">${esc(name)}</h3>${standingsTable(rows)}</div>`).join('')}
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">Overall</h3>${standingsTable(picture.standings)}</div></div>`;
        bindSeason();
    }

    // ============================================================ PLAYOFF BRACKET
    async function bracket() {
        const groups = {};
        picture.bracket.forEach(r => { ((groups[r.bracket] = groups[r.bracket] || {})[r.roundNumber] = groups[r.bracket][r.roundNumber] || []).push(r); });
        const [rule] = await GT.query('SELECT qualification_method AS method FROM playoff_rules WHERE season = $s', { $s: season });
        if (!Object.keys(groups).length && rule && rule.method === 'divisional_top_n_plus_playin') return projection();
        SITE.hero({ title: `${season} Playoffs`, size: 'short', dots: false, image: 'background-14.png',
                    meta: [picture.placements.length ? `Champion: ${esc(picture.placements[0].owner || '')}` : 'Playoffs not played yet'] });
        const block = r => matchBlock({ id: r.gameId, home: r.team || 'TBD', hs: r.teamScore, away: r.opponent || 'TBD', aws: r.opponentScore });
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">${season} postseason</div><h2 class="section-title">Playoff Bracket</h2></div>${seasonSelect()}</div>
            ${Object.entries(groups).map(([name, rounds]) => `<div class="panel"><h3 class="panel-title" style="margin-bottom:14px">${esc(name)}</h3>
                ${bracketBoard(Object.keys(rounds).sort((x, y) => x - y).map(n => rounds[n].sort((x, y) => x.slotInRound - y.slotInRound)), block)}</div>`).join('')
                || '<div class="panel"><p class="muted">No bracket recorded for this season yet.</p></div>'}
            ${picture.placements.length ? `<div class="panel"><h3 class="panel-title" style="margin-bottom:12px">Final Placements</h3>
                <div class="table-scroll"><table class="data-table">${SITE.cols('12%', '38%', '50%')}<thead><tr><th class="num">Place</th><th>Manager</th><th>Team</th></tr></thead><tbody>
                ${picture.placements.map(p => `<tr><td class="num"><b>${ord(p.place)}</b></td><td><a class="team-cell" href="${mUrl(p.owner || '')}"><img src="${GT.logo(p.owner || '')}" alt="">${esc(p.owner || '')}</a></td>
                    <td class="muted">${esc(GT.teamName(b, p.owner || '', season))}</td></tr>`).join('')}</tbody></table></div></div>` : ''}</div>`;
        bindSeason();
    }

    // ============================================================ BRACKET OUTLOOK (play-in format, season in progress)
    // Seeds 1-8 in each division from the current regular-season standings. Tiebreakers, in order:
    // win %, head-to-head record among the tied teams, point differential, points for.
    // Championship: play-in week 14 (4B-5A, 3A-6B, 4A-5B, 3B-6A); week 15 1A / 2B / 1B / 2A meet the play-in winners;
    // then single elimination. Gulag (losers advance): week 15 8A / 7B / 8B / 7A meet the play-in losers.
    async function projection() {
        const divs = await GT.query(`SELECT d.division_id AS id, d.division_name AS name, o.display_name AS owner
                                     FROM divisions d JOIN division_members m ON m.division_id = d.division_id JOIN owners o ON o.owner_id = m.owner_id
                                     WHERE d.season = $s ORDER BY d.division_id`, { $s: season });
        const divNames = [...new Set(divs.map(d => d.name))];                     // first division = A, second = B
        const LETTER = Object.fromEntries(divNames.map((n, i) => [n, 'AB'[i]]));
        const reg = games.filter(g => g.period === 'Regular' && g.hs != null && g.aws != null);
        const played = [...new Set(reg.map(g => g.week))].sort((x, y) => x - y);
        const through = played[played.length - 1] || 0;

        const seedsThrough = week => {
            const list = reg.filter(g => g.week <= week);
            const line = owner => {
                const r = { owner, w: 0, l: 0, t: 0, pf: 0, pa: 0 };
                list.forEach(g => {
                    const me = g.home === owner ? [g.hs, g.aws] : g.away === owner ? [g.aws, g.hs] : null;
                    if (!me) return;
                    r.pf += me[0]; r.pa += me[1];
                    if (me[0] > me[1]) r.w++; else if (me[0] < me[1]) r.l++; else r.t++;
                });
                const n = r.w + r.l + r.t;
                r.pct = n ? (r.w + r.t / 2) / n : 0; r.diff = r.pf - r.pa;
                return r;
            };
            // head-to-head between two tied teams: wins minus losses against each other (0 when they have not met or split)
            const h2h = (a, c) => list.reduce((t, g) => {
                const mine = g.home === a && g.away === c ? [g.hs, g.aws] : g.away === a && g.home === c ? [g.aws, g.hs] : null;
                return mine ? t + Math.sign(mine[0] - mine[1]) : t;
            }, 0);
            const out = {};
            divNames.forEach(dn => {
                const rows = divs.filter(d => d.name === dn).map(d => line(d.owner)).sort((x, y) => y.pct - x.pct);
                const seeded = [];
                for (let i = 0; i < rows.length;) {                                 // break each tie group on its own
                    let j = i; while (j < rows.length && rows[j].pct === rows[i].pct) j++;
                    // NFL-style: head-to-head only counts when every tied team has played every other; otherwise
                    // point differential, then points for, picks the top team. Then start over with the teams left.
                    const left = rows.slice(i, j);
                    while (left.length) {
                        const met = (a, c) => list.some(g => (g.home === a && g.away === c) || (g.home === c && g.away === a));
                        const allMet = left.every(a => left.every(c => a === c || met(a.owner, c.owner)));
                        const h2hOf = r => left.reduce((t, o) => o === r ? t : t + h2h(r.owner, o.owner), 0);
                        // 2026 on: point differential first, then head-to-head; earlier seasons: head-to-head first
                        const h2hCmp = (x, y) => allMet ? h2hOf(y) - h2hOf(x) : 0;
                        const pick = left.slice().sort((x, y) => (season >= 2026 ? (y.diff - x.diff) || h2hCmp(x, y) : h2hCmp(x, y) || (y.diff - x.diff))
                                                                 || y.pf - x.pf || x.owner.localeCompare(y.owner))[0];
                        seeded.push(pick); left.splice(left.indexOf(pick), 1);
                    }
                    i = j;
                }
                seeded.forEach((r, i) => { r.seed = i + 1; r.div = LETTER[dn]; r.key = `${i + 1}${LETTER[dn]}`; out[r.key] = r; });
            });
            return out;
        };
        const now = seedsThrough(through);
        const before = played.length > 1 ? seedsThrough(played[played.length - 2]) : null;
        const prevSeed = {};
        if (before) Object.values(before).forEach(r => { prevSeed[r.owner] = r; });
        // ▲ / ▼ against the projection one week earlier (nothing when unchanged or week 1)
        const move = r => {
            const p = prevSeed[r.owner];
            if (!p || p.seed === r.seed) return '';
            return p.seed > r.seed ? `<span class="pj-up" title="Up from ${p.key}">▲</span>` : `<span class="pj-dn" title="Down from ${p.key}">▼</span>`;
        };
        const team = key => {
            const r = now[key];
            if (!r) return `<div><span class="pj-seed">${key}</span><span class="muted">TBD</span><span></span></div>`;
            return `<div><span class="pj-seed">${key}</span><span class="pj-name"><img src="${GT.logo(r.owner)}" alt=""><a href="${mUrl(r.owner)}">${esc(r.owner)}</a>${move(r)}</span>
                <span class="s">${r.w}-${r.l}${r.t ? '-' + r.t : ''}</span></div>`;
        };
        const slot = text => `<div class="pj-tbd"><span class="pj-seed"></span><span>${esc(text)}</span><span></span></div>`;
        const game = (top, bottom, foot) => `<div class="match pj-match">${top}${bottom}<span class="match-open pj-foot">${esc(foot)}</span></div>`;

        const PLAYIN = [['4B', '5A'], ['3A', '6B'], ['4A', '5B'], ['3B', '6A']];
        const pi = ([x, y]) => game(team(x), team(y), 'Play-in · week 14');
        const champ = [
            PLAYIN.map(pi),
            [['1A', 0], ['2B', 1], ['1B', 2], ['2A', 3]].map(([k, i]) => game(team(k), slot(`Winner ${PLAYIN[i].join(' / ')}`), 'Week 15')),
            [game(slot('Winner 1A side'), slot('Winner 2B side'), 'Semifinal · week 16'), game(slot('Winner 1B side'), slot('Winner 2A side'), 'Semifinal · week 16')],
            [game(slot('Semifinal winner'), slot('Semifinal winner'), 'Championship · week 17')]
        ];
        const gulag = [
            [['8A', 2], ['7B', 3], ['8B', 0], ['7A', 1]].map(([k, i]) => game(team(k), slot(`Loser ${PLAYIN[i].join(' / ')}`), 'Week 15 · loser advances')),
            [game(slot('Loser 8A game'), slot('Loser 7B game'), 'Week 16 · loser advances'), game(slot('Loser 8B game'), slot('Loser 7A game'), 'Week 16 · loser advances')],
            [game(slot('Week 16 loser'), slot('Week 16 loser'), 'Gulag final · week 17')]
        ];
        const seedTable = letter => {
            const rows = Object.values(now).filter(r => r.div === letter).sort((x, y) => x.seed - y.seed);
            const status = n => n <= 2 ? 'Bye' : n <= 6 ? 'Play-in' : 'Gulag';
            return `<div class="panel" style="margin:0"><h3 class="panel-title" style="margin-bottom:12px">${letter} · ${esc(divNames['AB'.indexOf(letter)] || '')}</h3>
                <div class="table-scroll"><table class="data-table" style="min-width:540px">${SITE.cols('11%', '6%', '29%', '11%', '13%', '13%', '17%')}<thead><tr><th>Seed</th><th></th><th>Manager</th>
                    <th class="num">W-L</th><th class="num">Diff</th><th class="num">PF</th><th>Path</th></tr></thead><tbody>
                ${rows.map(r => `<tr class="${r.seed === 2 || r.seed === 6 ? 'pj-cut' : ''}"><td><b>${r.key}</b></td><td>${move(r)}</td>
                    <td><a class="team-cell" href="${mUrl(r.owner)}"><img src="${GT.logo(r.owner)}" alt=""><b>${esc(r.owner)}</b></a></td>
                    <td class="num">${r.w}-${r.l}${r.t ? '-' + r.t : ''}</td><td class="num">${(r.diff >= 0 ? '+' : '') + GT.pts(r.diff)}</td><td class="num">${GT.pts(r.pf)}</td>
                    <td class="muted">${status(r.seed)}</td></tr>`).join('')}</tbody></table></div></div>`;
        };
        SITE.hero({ title: `${season} Playoff Outlook`, size: 'short', dots: false, image: 'background-14.png',
                    meta: [through ? `Projected from the standings through week ${through}` : 'No games played yet'] });
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">${season} · if the season ended today</div><h2 class="section-title">Bracket Outlook</h2>
                <p class="section-copy" style="max-width:none">Seeds by win %, then ${season >= 2026 ? 'point differential, head-to-head among tied teams' : 'head-to-head among tied teams, point differential'} and points for.
                ${before ? `<span class="pj-up">▲</span> / <span class="pj-dn">▼</span> = moved since week ${played[played.length - 2]}.` : ''}</p></div>${seasonSelect()}</div>
            <div class="card-row two" style="margin-top:22px">${seedTable('A')}${seedTable('B')}</div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:14px">Championship</h3>
                ${bracketBoard(champ, g => g, ['Play-in · Wk 14', 'Quarterfinals · Wk 15', 'Semifinals · Wk 16', 'Final · Wk 17'])}</div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:14px">Gulag <span class="muted" style="font-size:12px">(loser advances)</span></h3>
                ${bracketBoard(gulag, g => g, ['Round 1 · Wk 15', 'Round 2 · Wk 16', 'Gulag Final · Wk 17'])}</div></div>`;
        bindSeason();
    }

    // A real bracket: every later game sits at the vertical midpoint of the two games that feed it,
    // with connector lines between rounds. rounds = [[game, ...] round 1, [game, ...] round 2, ...]
    function bracketBoard(rounds, block, names) {
        const MH = 106, GAP = 18, HEAD = 30;                              // MH matches .bracket-slot .match height
        // fit the panel: shorten the connector gaps first (56px down to 22px), then narrow the boxes (250px down to 190px)
        const n = rounds.length;
        const avail = Math.min(content.clientWidth - 40, 1140) - 46;      // wrap padding, panel padding + border
        const COLGAP = n > 1 ? Math.max(22, Math.min(56, Math.floor((avail - n * 250) / (n - 1)))) : 0;
        const COLW = Math.max(190, Math.min(250, Math.floor((avail - (n - 1) * COLGAP) / n)));
        const centers = [];
        rounds.forEach((list, r) => {
            centers[r] = list.map((_, i) => {
                if (r === 0) return HEAD + i * (MH + GAP) + MH / 2;
                const prev = centers[r - 1];
                if (prev.length === list.length * 2) return (prev[2 * i] + prev[2 * i + 1]) / 2;   // fed by two games
                if (prev.length === list.length) return prev[i];                                   // straight across (byes)
                const top = prev[0], bottom = prev[prev.length - 1];                               // uneven: spread out
                return list.length === 1 ? (top + bottom) / 2 : top + (bottom - top) * i / (list.length - 1);
            });
        });
        const height = Math.max(...centers.flat()) + MH / 2;
        const width = rounds.length * COLW + (rounds.length - 1) * COLGAP;
        const x = r => r * (COLW + COLGAP);
        const name = (r, list) => names ? names[r] : list.length === 1 && r === rounds.length - 1 ? 'Final'
            : list.length === 2 && r === rounds.length - 2 ? 'Semifinals' : `Round ${r + 1}`;
        let lines = '';
        rounds.forEach((list, r) => {
            if (!r) return;
            const prev = centers[r - 1], mid = x(r) - COLGAP / 2;
            list.forEach((_, i) => {
                const feeders = prev.length === list.length * 2 ? [prev[2 * i], prev[2 * i + 1]] : [prev[i]].filter(v => v != null);
                feeders.forEach(fy => { lines += `<path d="M${x(r - 1) + COLW} ${fy} H${mid} V${centers[r][i]} H${x(r)}"/>`; });
            });
        });
        return `<div class="bracket-scroll"><div class="bracket-board" style="width:${width}px;height:${height}px">
            <svg class="bracket-lines" width="${width}" height="${height}" aria-hidden="true">${lines}</svg>
            ${rounds.map((list, r) => `<h4 class="bracket-round" style="left:${x(r)}px;width:${COLW}px">${name(r, list)}</h4>` +
                list.map((g, i) => `<div class="bracket-slot" style="left:${x(r)}px;top:${centers[r][i] - MH / 2}px;width:${COLW}px">${block(g)}</div>`).join('')).join('')}
        </div></div>`;
    }

    // ============================================================ MANAGERS (this season's field)
    function managers() {
        SITE.hero({ title: `${season} Managers`, size: 'short', dots: false, image: 'background-16.png',
                    meta: [`${picture.standings.length} managers`] });
        const byDiv = {};
        picture.divisionStandings.forEach(r => { (byDiv[r.divisionName] = byDiv[r.divisionName] || []).push(r); });
        const groups = Object.keys(byDiv).length ? byDiv : { League: picture.standings };
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">${season} season</div><h2 class="section-title">The Field</h2></div>${seasonSelect()}</div>
            ${Object.entries(groups).map(([name, rows]) => `<h3 class="panel-title" style="margin:26px 0 12px">${esc(name)}</h3>
                <div class="tile-grid">${rows.map(r => `<a class="m-tile" href="${mUrl(r.owner)}"><img src="${GT.logo(r.owner)}" alt="">
                    <div><h3>${esc(r.owner)}</h3><p>${esc(GT.teamName(b, r.owner, season))}</p><p>${r.wins}-${r.losses}${r.ties ? '-' + r.ties : ''} · ${GT.pts(r.pointsFor)} PF</p></div></a>`).join('')}</div>`).join('')}</div>`;
        bindSeason();
    }

    ({ overview, schedule, standings, 'playoff-bracket': bracket, managers })[page]();
})();
