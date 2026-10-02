/* Feed: everything happening in the league, newest first (weekly results, high scores, trades, waiver moves) */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    const season = Number(param('season')) || b.season;
    const name = id => (b.byId[id] || {}).name || '';
    SITE.subHeader({ crumbs: [['Stats']],
                     tabs: [{ label: 'All', href: url('pages/stats.html'), active: true },
                            { label: 'News', href: url('pages/stories/news.html') },
                            { label: 'Film Room', href: url('pages/stories/film-room.html') }] });
    SITE.hero({ title: 'The Feed', size: 'short', dots: false, image: 'background-15.png', meta: [`Everything in the ${season} season, newest first`] });

    const [games, moves] = await Promise.all([
        GT.query(`SELECT m.week, m.season_period AS period, a.display_name AS home, h.team_score AS hs, o.display_name AS away, h.opponent_score AS aws
                  FROM matchups m JOIN matchup_team_stats h ON h.game_id = m.game_id AND h.owner_id < h.opponent_owner_id
                  JOIN owners a ON a.owner_id = h.owner_id JOIN owners o ON o.owner_id = h.opponent_owner_id
                  WHERE m.season = $s AND h.team_score IS NOT NULL ORDER BY m.week`, { $s: season }),
        GT.query(`SELECT t.transaction_id AS tid, t.processed_at AS at, t.type, ti.item_type AS item, p.name, p.position AS pos,
                         ti.from_owner_id AS fromId, ti.to_owner_id AS toId
                  FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.transaction_id
                  JOIN players p ON p.player_id = ti.player_id
                  WHERE t.season = $s AND t.status = 'EXECUTED' AND t.type IN ('TRADE_ACCEPT','WAIVER') AND ti.item_type IN ('ADD','DROP','TRADE')
                  ORDER BY t.processed_at DESC`, { $s: season })
    ]);
    const items = [];
    // one recap + one high score per week
    [...new Set(games.map(g => g.week))].forEach(w => {
        const list = games.filter(g => g.week === w);
        const when = GT.weekDate(b, season, w);
        const at = when ? new Date(when.getTime() + 4 * 864e5) : new Date(0);      // the week wraps up on Monday
        const scores = list.flatMap(g => [{ n: g.home, v: g.hs, o: g.away, ov: g.aws }, { n: g.away, v: g.aws, o: g.home, ov: g.hs }]);
        const hi = scores.reduce((m, x) => x.v > m.v ? x : m);
        const wins = scores.filter(x => x.v > x.ov).map(x => x.n);
        items.push({ at, kicker: GT.periodLabel(list[0].period, w), title: `${esc(hi.n)} posts the week's top score, ${GT.pts(hi.v)}`,
                     text: `${esc(hi.n)} ${hi.v > hi.ov ? 'beat' : 'fell to'} ${esc(hi.o)} ${GT.pts(hi.v)}-${GT.pts(hi.ov)}.`,
                     href: url(`pages/managers/overview.html?m=${(b.byName[hi.n.toLowerCase()] || {}).id}`) });
        items.push({ at: new Date(at.getTime() - 1), kicker: `Week ${w} results`, title: `${list.length} games in the books`,
                     text: `Winners: ${wins.map(esc).join(', ')}.`, href: url(`pages/past-seasons/schedule.html?season=${season}&week=${w}`) });
    });
    // trades and waiver claims
    const byTx = new Map();
    moves.forEach(m => { if (!byTx.has(m.tid)) byTx.set(m.tid, []); byTx.get(m.tid).push(m); });
    [...byTx.values()].forEach(list => {
        const t = list[0];
        if (t.type === 'TRADE_ACCEPT') {
            const sides = {};
            list.filter(i => i.item === 'TRADE').forEach(i => { (sides[i.toId] = sides[i.toId] || []).push(i.name); });
            const [a, c] = Object.keys(sides);
            items.push({ at: new Date(t.at), kicker: 'Trade', title: `${esc(name(a))} and ${esc(name(c))} make a deal`,
                         text: `${esc(name(a))} gets ${esc((sides[a] || []).join(', '))}; ${esc(name(c))} gets ${esc((sides[c] || []).join(', '))}.`,
                         href: url('pages/stories/news.html') });
        } else {
            const add = list.find(i => i.item === 'ADD');
            if (add) items.push({ at: new Date(t.at), kicker: 'Waiver claim', title: `${esc(name(add.toId))} claims ${esc(add.name)}`,
                                  text: `${esc(add.pos)}${list.find(i => i.item === 'DROP') ? ` · drops ${esc(list.find(i => i.item === 'DROP').name)}` : ''}`,
                                  href: url('pages/stories/news.html') });
        }
    });
    items.sort((x, y) => y.at - x.at);
    const fmt = d => d.getTime() ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    content.innerHTML = `<div class="wrap page-pad">
        <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">${season} season</div><h2 class="section-title">Latest</h2></div></div>
        <div class="feed">${items.slice(0, 48).map(i => `<a class="story" href="${i.href}"><span class="kicker">${esc(i.kicker)}</span>
            <h3>${i.title}</h3><p>${i.text}</p><span class="meta">${fmt(i.at)}</span></a>`).join('') || '<p class="muted">Nothing yet this season.</p>'}</div></div>`;
})();
