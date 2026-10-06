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
                         tabs: [{ label: 'All Seasons', href: url('pages/past-seasons/index.html'), active: true }] });
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
    const weeks = [...new Set(games.map(g => g.week))];
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
        const wk = games.filter(g => g.week === lastWeek);
        const allScores = games.flatMap(g => [{ n: g.home, v: g.hs, w: g.week }, { n: g.away, v: g.aws, w: g.week }]).filter(x => x.v != null);
        const hi = allScores.reduce((m, x) => x.v > m.v ? x : m, { v: -1 });
        const avg = allScores.reduce((a, x) => a + x.v, 0) / (allScores.length || 1);
        const feature = wk.slice().sort((x, y) => (y.hs + y.aws) - (x.hs + x.aws))[0];
        const first = wk[0];
        SITE.hero({ title: `${season} Season`, image: 'background-7.png',
                    tools: `<label class="hero-season"><span>Season</span>${seasonSelect()}</label>`,
                    meta: [`Grass Touchers FFL · ${picture.standings.length} managers`, `Latest: ${GT.periodLabel(first ? first.period : 'Regular', lastWeek || 0)}`,
                           champs.find(c => c.s === season) ? `Champion: ${esc(champs.find(c => c.s === season).name)}` : 'Champion: to be decided'] });
        const d = feature ? GT.weekDate(b, season, feature.week) : null;
        content.innerHTML = `<div class="wrap page-pad">
            <div class="card-row">
                ${GT.divisionCards(picture, season)}
                <div class="card"><div class="card-head"><span class="card-title">Week ${lastWeek || '-'} Scores</span></div><div class="card-body">
                    <ul class="mini-list score-list">${wk.slice(0, 8).map(g => `<li class="row-link" data-href="${GT.gameHref(g.id)}" title="Open game center"><img src="${GT.logo(g.hs >= g.aws ? g.home : g.away)}" alt="">
                        <span>${GT.managerLink(g.home, season)} v ${GT.managerLink(g.away, season)}</span><span class="res">${Math.round(g.hs)}-${Math.round(g.aws)}</span></li>`).join('')}</ul>
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
                <div class="band-label"><span class="pill pill-dark">Game of the week</span>${esc(GT.periodLabel(feature.period, feature.week))}${d ? ' · ' + GT.fmtDate(d) : ''}</div>
                <div class="scoreboard">
                    <div class="sb-team"><div class="sb-logo"><img src="${GT.logo(feature.home)}" alt=""></div>
                        <div class="sb-name">${esc(GT.teamName(b, feature.home, season))}<small>${GT.managerLink(feature.home, season)}</small></div></div>
                    <div class="sb-scores"><div class="sb-score ${feature.hs > feature.aws ? 'won' : ''}">${GT.pts(feature.hs)}</div><span class="sb-at">AT</span>
                        <div class="sb-score ${feature.aws > feature.hs ? 'won' : ''}">${GT.pts(feature.aws)}</div></div>
                    <div class="sb-team right"><div class="sb-name">${esc(GT.teamName(b, feature.away, season))}<small>${GT.managerLink(feature.away, season)}</small></div>
                        <div class="sb-logo"><img src="${GT.logo(feature.away)}" alt=""></div></div>
                </div>
                <div class="band-foot"><div><h4>${GT.pts(feature.hs + feature.aws)} combined points</h4><p>Highest-scoring game of week ${feature.week}</p></div>
                    <div class="band-actions"><a class="btn btn-accent" href="${url(`pages/past-seasons/game-center.html?id=${feature.id}`)}">Open game center</a></div></div>
            </section>` : ''}
            <section class="split-section">
                <div><div class="eyebrow">${season} season · week ${lastWeek || '-'}</div><h2 class="section-title">This Week's<br>Results</h2>
                    <p class="section-copy">Every matchup from the latest week. Winners in bold.</p><div class="section-tools"></div></div>
                <ul class="list-rows">${wk.map(g => `<li class="row-link" data-href="${GT.gameHref(g.id)}" title="Open game center"><img src="${GT.logo(g.hs >= g.aws ? g.home : g.away)}" alt="">
                    <div class="main"><b>${GT.managerLink(g.home, season)}</b> ${GT.pts(g.hs)} <span class="sub">vs</span> ${GT.pts(g.aws)} <b>${GT.managerLink(g.away, season)}</b></div>
                    <div class="date sub">${GT.fmtDate(GT.weekDate(b, season, g.week))}</div><div class="time sub">Margin ${GT.pts(Math.abs(g.hs - g.aws))}</div>
                    <div class="tag">${esc(GT.periodLabel(g.period, g.week))}</div></li>`).join('') || '<li class="muted">No games yet.</li>'}</ul>
            </section></div>`;
        bindSeason();
    }

    // ============================================================ SCHEDULE
    async function schedule() {
        const week = Number(param('week')) || lastWeek;
        SITE.hero({ title: `${season} Schedule`, size: 'short', dots: false, image: 'background-9.png',
                    meta: [`${weeks.length} weeks · ${games.length} games`] });
        const wk = games.filter(g => g.week === week);
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
            return { top, proj, rec: `${w}-${l}`, rank: (ranks.find(r => r.owner === name) || {}).rank };
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
            const done = g.hs != null && g.aws != null;
            const homeWon = done && g.hs > g.aws, awayWon = done && g.aws > g.hs;
            const favHome = h.proj && a.proj ? h.proj >= a.proj : null;
            const upset = done && favHome != null && ((favHome && awayWon) || (!favHome && homeWon));
            return `<div class="sc-card row-link" data-href="${GT.gameHref(g.id)}" title="Open game center">
                <div class="sc-head"><span class="pill ${done ? 'pill-dark' : 'pill-accent'}">${done ? 'Final' : 'Live'}</span>
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
                    meta: ['Regular season · ranked by record, head-to-head, point differential, points for'] });
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
                        const pick = left.slice().sort((x, y) => (allMet ? h2hOf(y) - h2hOf(x) : 0) || y.diff - x.diff || y.pf - x.pf || x.owner.localeCompare(y.owner))[0];
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
                <p class="section-copy" style="max-width:none">Seeds by win %, then head-to-head among tied teams, point differential and points for.
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
