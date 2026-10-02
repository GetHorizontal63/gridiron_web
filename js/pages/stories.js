/* Stories: News (transactions), Features (league record book), Highlights (top performances), Film Room (weekly recaps) */
(async function () {
    const { esc, url, param } = SITE;
    const page = document.body.dataset.page;
    const content = document.getElementById('content');
    const b = await GT.load();
    const seasons = (await GT.query('SELECT DISTINCT season FROM matchups ORDER BY season DESC')).map(r => r.season);
    const season = Number(param('season')) || b.season;
    const name = id => (b.byId[id] || {}).name || '';
    const mHref = n => url(`pages/managers/overview.html?m=${encodeURIComponent((b.byName[String(n).toLowerCase()] || {}).id || n)}`);
    const mLink = n => `<a href="${mHref(n)}"><b>${esc(n)}</b></a>`;
    const dateText = s => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const TITLES = { news: 'News', features: 'Features', highlights: 'Highlights', 'film-room': 'Film Room' };

    SITE.subHeader({ crumbs: [['Recordbook', url('pages/stories/news.html')], [TITLES[page]]],
                     tabs: SITE.sectionTabs('stories', page).map(t => ({ ...t, href: `${t.href}?season=${season}` })) });
    const story = (kicker, title, text, meta, href) =>
        `<${href ? `a href="${href}"` : 'div'} class="story"><span class="kicker">${esc(kicker)}</span><h3>${title}</h3>${text ? `<p>${text}</p>` : ''}<span class="meta">${esc(meta)}</span></${href ? 'a' : 'div'}>`;
    const seasonPick = () => `<select class="select" id="season-pick">${seasons.map(s => `<option value="${s}"${s === season ? ' selected' : ''}>${s} season</option>`).join('')}</select>`;
    const bind = () => { const el = document.getElementById('season-pick'); if (el) el.addEventListener('change', e => {
        const u = new URL(location.href); u.searchParams.set('season', e.target.value); location.href = u; }); };
    const head = (eyebrow, title, tools = '') => `<div class="panel-head" style="margin-top:34px">
        <div><div class="eyebrow">${eyebrow}</div><h2 class="section-title">${title}</h2></div>${tools}</div>`;

    // every game once (lower owner id first)
    const allGames = () => GT.query(`
        SELECT m.season, m.week, m.season_period AS period, a.display_name AS home, h.team_score AS hs, o.display_name AS away, h.opponent_score AS aws
        FROM matchups m JOIN matchup_team_stats h ON h.game_id = m.game_id AND h.owner_id < h.opponent_owner_id
        JOIN owners a ON a.owner_id = h.owner_id JOIN owners o ON o.owner_id = h.opponent_owner_id
        WHERE h.team_score IS NOT NULL ORDER BY m.season, m.week`);

    // ============================================================ NEWS: trades, waiver claims, free-agent moves
    async function news() {
        SITE.hero({ title: 'League News', size: 'short', dots: false, image: 'background-2.png', meta: [`${season} transactions, newest first`] });
        const items = await GT.query(`
            SELECT t.transaction_id AS tid, t.processed_at AS at, t.type, ti.item_type AS item, p.name, p.position AS pos,
                   ti.from_owner_id AS fromId, ti.to_owner_id AS toId
            FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.transaction_id
            JOIN players p ON p.player_id = ti.player_id
            WHERE t.season = $s AND t.status = 'EXECUTED' AND t.type IN ('TRADE_ACCEPT','WAIVER','FREEAGENT')
              AND ti.item_type IN ('ADD','DROP','TRADE')
            ORDER BY t.processed_at DESC`, { $s: season });
        const byTx = new Map();
        items.forEach(i => { if (!byTx.has(i.tid)) byTx.set(i.tid, []); byTx.get(i.tid).push(i); });
        const cards = [...byTx.values()].slice(0, 60).map(list => {
            const t = list[0];
            if (t.type === 'TRADE_ACCEPT') {
                const sides = {};
                list.filter(i => i.item === 'TRADE').forEach(i => { (sides[i.toId] = sides[i.toId] || []).push(`${i.name} (${i.pos})`); });
                const [a, c] = Object.keys(sides);
                return story('Trade', `${esc(name(a))} and ${esc(name(c))} make a deal`,
                    `${esc(name(a))} gets ${esc((sides[a] || []).join(', '))}. ${esc(name(c))} gets ${esc((sides[c] || []).join(', '))}.`, dateText(t.at));
            }
            const add = list.find(i => i.item === 'ADD'), drop = list.find(i => i.item === 'DROP');
            const who = add ? name(add.toId) : name(drop.fromId);
            return story(t.type === 'WAIVER' ? 'Waiver claim' : 'Free agent', `${esc(who)} ${add ? `adds ${esc(add.name)}` : `drops ${esc(drop.name)}`}`,
                add && drop ? `${esc(add.name)} (${esc(add.pos)}) in, ${esc(drop.name)} (${esc(drop.pos)}) out.` : '', dateText(t.at));
        });
        content.innerHTML = `<div class="wrap page-pad">${head(`${season} season`, 'Moves', seasonPick())}
            <div class="feed">${cards.join('') || '<p class="muted">No transactions this season.</p>'}</div></div>`;
        bind();
    }

    // ============================================================ FEATURES: the record book
    async function features() {
        SITE.hero({ title: 'Record Book', size: 'short', dots: false, image: 'background-4.png', meta: ['League records since 2019'] });
        const g = await allGames();
        const scores = g.flatMap(x => [{ ...x, n: x.home, v: x.hs, o: x.away }, { ...x, n: x.away, v: x.aws, o: x.home }]);
        const top = scores.slice().sort((x, y) => y.v - x.v).slice(0, 10);
        const low = scores.filter(x => x.period === 'Regular').sort((x, y) => x.v - y.v).slice(0, 10);
        const blow = g.slice().sort((x, y) => Math.abs(y.hs - y.aws) - Math.abs(x.hs - x.aws)).slice(0, 10);
        const close = g.filter(x => x.hs !== x.aws).sort((x, y) => Math.abs(x.hs - x.aws) - Math.abs(y.hs - y.aws)).slice(0, 10);
        const winner = x => x.hs > x.aws ? x.home : x.away, loser = x => x.hs > x.aws ? x.away : x.home;
        const table = (title, list, cell, value) => `<div class="panel"><h3 class="panel-title" style="margin-bottom:12px">${title}</h3>
            <div class="table-scroll"><table class="data-table">${SITE.cols('7%', '50%', '15%', '28%')}<thead><tr><th class="num">#</th><th>Game</th><th class="num">Points</th><th>When</th></tr></thead><tbody>
            ${list.map((x, i) => `<tr><td class="num">${i + 1}</td><td>${cell(x)}</td><td class="num"><b>${value(x)}</b></td>
                <td class="muted">${x.season} · ${esc(GT.periodLabel(x.period, x.week))}</td></tr>`).join('')}</tbody></table></div></div>`;
        const t1 = top[0], b1 = blow[0];
        content.innerHTML = `<div class="wrap page-pad">${head('Since 2019', 'Record Book')}
            <div class="feed">
                ${t1 ? story('Record', `${esc(t1.n)} drops ${GT.pts(t1.v)}`, `The highest score in league history, against ${esc(t1.o)} in ${t1.season} week ${t1.week}.`, 'All-time high', mHref(t1.n)) : ''}
                ${b1 ? story('Blowout', `A ${GT.pts(Math.abs(b1.hs - b1.aws))}-point beating`, `${esc(winner(b1))} over ${esc(loser(b1))}, ${b1.season} week ${b1.week}.`, 'Largest margin', mHref(winner(b1))) : ''}
                ${story('Milestones', `${scores.filter(x => x.v >= 200).length} two-hundred-point games`, 'Every score of 200 or more since 2019.', 'All seasons')}
            </div>
            ${table('Highest Scores', top, x => `${mLink(x.n)} <span class="muted">vs ${esc(x.o)}</span>`, x => GT.pts(x.v))}
            ${table('Largest Margins', blow, x => `${mLink(winner(x))} <span class="muted">over ${esc(loser(x))}</span>`, x => GT.pts(Math.abs(x.hs - x.aws)))}
            ${table('Closest Games', close, x => `${mLink(winner(x))} <span class="muted">over ${esc(loser(x))}</span>`, x => GT.pts(Math.abs(x.hs - x.aws)))}
            ${table('Lowest Scores · Regular Season', low, x => `${mLink(x.n)} <span class="muted">vs ${esc(x.o)}</span>`, x => GT.pts(x.v))}</div>`;
    }

    // ============================================================ HIGHLIGHTS: best starts and weekly high scores
    async function highlights() {
        SITE.hero({ title: 'Highlights', size: 'short', dots: false, image: 'background-6.png', meta: [`${season} top performances`] });
        const [starts, weekly] = await Promise.all([
            GT.query(`SELECT fr.week, o.display_name AS owner, p.player_id AS pid, p.name, p.position AS pos, frp.actual_points AS pts
                      FROM fantasy_roster_players frp JOIN fantasy_rosters fr ON fr.roster_id = frp.roster_id
                      JOIN owners o ON o.owner_id = fr.owner_id JOIN players p ON p.player_id = frp.player_id
                      WHERE fr.season = $s AND frp.slot_position NOT IN ('BE','IR') AND frp.actual_points IS NOT NULL
                      ORDER BY frp.actual_points DESC LIMIT 15`, { $s: season }),
            GT.query(`SELECT m.week, m.season_period AS period, o.display_name AS owner, t.team_score AS pts
                      FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                      WHERE m.season = $s AND t.score_rank_on_week = 1 ORDER BY m.week`, { $s: season })
        ]);
        const pHref = x => x.pid > 0 ? url(`pages/players/stats.html?id=${x.pid}`) : '';
        content.innerHTML = `<div class="wrap page-pad">${head(`${season} season`, 'Top Performances', seasonPick())}
            <div class="feed">${starts.slice(0, 6).map(x => story(`Week ${x.week} · ${x.pos}`, `${esc(x.name)}: ${GT.pts(x.pts)}`,
                `Started by ${esc(x.owner)}.`, 'Best starts of the season', pHref(x))).join('')}</div>
            <section class="split-section"><div><div class="eyebrow">${season} season</div><h2 class="section-title">Weekly<br>High Scores</h2>
                <p class="section-copy">The top-scoring manager of every week.</p></div>
                <ul class="list-rows">${weekly.map(w => `<li><img src="${GT.logo(w.owner)}" alt=""><div class="main">${mLink(w.owner)}</div>
                    <div class="date sub">${GT.fmtDate(GT.weekDate(b, season, w.week))}</div><div class="time sub"><b>${GT.pts(w.pts)}</b></div>
                    <div class="tag">${esc(GT.periodLabel(w.period, w.week))}</div></li>`).join('') || '<li class="muted">No games yet.</li>'}</ul></section>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">Best Starts of ${season}</h3>
                <div class="table-scroll"><table class="data-table">${SITE.cols('36%', '10%', '24%', '14%', '16%')}<thead><tr><th>Player</th><th>Pos</th><th>Manager</th><th class="num">Week</th><th class="num">Pts</th></tr></thead><tbody>
                ${starts.map(x => `<tr><td>${pHref(x) ? `<a href="${pHref(x)}"><b>${esc(x.name)}</b></a>` : `<b>${esc(x.name)}</b>`}</td><td>${esc(x.pos)}</td><td>${mLink(x.owner)}</td>
                    <td class="num">${x.week}</td><td class="num"><b>${GT.pts(x.pts)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No lineups saved.</td></tr>'}
                </tbody></table></div></div></div>`;
        bind();
    }

    // ============================================================ FILM ROOM: a recap of every week
    async function filmRoom() {
        SITE.hero({ title: 'Film Room', size: 'short', dots: false, image: 'background-10.png', meta: [`${season} week-by-week recaps`] });
        const g = (await allGames()).filter(x => x.season === season);
        const weeks = [...new Set(g.map(x => x.week))].sort((a, c) => c - a);
        const winner = x => x.hs > x.aws ? x.home : x.away, loser = x => x.hs > x.aws ? x.away : x.home;
        const recaps = weeks.map(w => {
            const list = g.filter(x => x.week === w);
            const scores = list.flatMap(x => [{ n: x.home, v: x.hs }, { n: x.away, v: x.aws }]);
            const hi = scores.reduce((m, x) => x.v > m.v ? x : m), lo = scores.reduce((m, x) => x.v < m.v ? x : m);
            const close = list.reduce((m, x) => Math.abs(x.hs - x.aws) < Math.abs(m.hs - m.aws) ? x : m);
            const blow = list.reduce((m, x) => Math.abs(x.hs - x.aws) > Math.abs(m.hs - m.aws) ? x : m);
            const avg = scores.reduce((a, x) => a + x.v, 0) / scores.length;
            return story(GT.periodLabel(list[0].period, w), `${esc(hi.n)} leads the week with ${GT.pts(hi.v)}`,
                `${esc(winner(close))} edged ${esc(loser(close))} by ${GT.pts(Math.abs(close.hs - close.aws))}. ` +
                `${esc(winner(blow))} beat ${esc(loser(blow))} by ${GT.pts(Math.abs(blow.hs - blow.aws))}. ` +
                `League average ${GT.pts(avg)}; low score ${esc(lo.n)} ${GT.pts(lo.v)}.`,
                GT.fmtDate(GT.weekDate(b, season, w)) || `Week ${w}`, url(`pages/past-seasons/schedule.html?season=${season}&week=${w}`));
        });
        content.innerHTML = `<div class="wrap page-pad">${head(`${season} season`, 'Weekly Recaps', seasonPick())}
            <div class="feed">${recaps.join('') || '<p class="muted">No games yet.</p>'}</div></div>`;
        bind();
    }

    ({ news, features, highlights, 'film-room': filmRoom })[page]();
})();
