/* Landing page: Game Center strip (a week's matchups), featured games from the most recent week
   (highest scoring / biggest blowout / closest loss, rotating), division standings, top starters, champions */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    document.getElementById('hero').classList.add('hidden');            // the landing page uses its own feature block
    const b = await GT.load();
    const season = Number(param('season')) || b.season;

    const games = await GT.query(`
        SELECT m.game_id AS id, m.week, m.season_period AS period, h.owner_id AS hid, a.display_name AS home, h.team_score AS hs,
               h.opponent_owner_id AS aid, o.display_name AS away, h.opponent_score AS aws
        FROM matchups m JOIN matchup_team_stats h ON h.game_id = m.game_id AND h.owner_id < h.opponent_owner_id
        JOIN owners a ON a.owner_id = h.owner_id JOIN owners o ON o.owner_id = h.opponent_owner_id
        WHERE m.season = $s ORDER BY m.week, m.game_id`, { $s: season });
    const weeks = [...new Set(games.map(g => g.week))];
    const latest = weeks[weeks.length - 1];
    let week = Number(param('week')) || latest;
    if (!weeks.includes(week)) week = latest;

    // top starters per manager for a week (Game Center footers use the picked week; everything else the latest)
    const startersFor = w => GT.query(`
        SELECT fr.owner_id AS id, p.player_id AS pid, p.name, frp.actual_points AS pts
        FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
        JOIN players p ON p.player_id = frp.player_id
        WHERE fr.season = $s AND fr.week = $w AND frp.slot_position NOT IN ('BE','IR') AND frp.actual_points IS NOT NULL
        ORDER BY frp.actual_points DESC`, { $s: season, $w: w });
    const [pickedStarters, latestStarters] = await Promise.all([startersFor(week), week === latest ? null : startersFor(latest)]);
    const recentStarters = latestStarters || pickedStarters;
    const topIn = (list, id) => list.find(t => t.id === id);
    const final = g => g.hs != null && g.aws != null;
    const mHref = id => url(`pages/managers/overview.html?m=${id}&season=${season}`);
    const weekLabel = w => { const g = games.find(x => x.week === w); return GT.periodLabel(g ? g.period : 'Regular', w); };

    // ---------------------------------------------------------------- Game Center strip (manager names)
    const wk = games.filter(g => g.week === week);
    const prevW = weeks[weeks.indexOf(week) - 1], nextW = weeks[weeks.indexOf(week) + 1];
    const wkLink = w => `?season=${season}&week=${w}`;
    const card = g => {
        const hw = g.hs > g.aws, aw = g.aws > g.hs;
        const top = [topIn(pickedStarters, g.hid), topIn(pickedStarters, g.aid)].filter(Boolean).sort((x, y) => y.pts - x.pts)[0];
        const row = (id, name, score, won) => `<div class="gc-team${won ? ' won' : ''}">
            <img src="${GT.logo(name)}" alt=""><a href="${mHref(id)}" class="gc-name">${esc(name)}</a>
            <span class="gc-mark">${won ? '▸' : ''}</span><span class="gc-score">${score == null ? '-' : GT.pts(score)}</span></div>`;
        return `<div class="gc-card row-link" data-href="${GT.gameHref(g.id)}" title="Open game center">
            <div class="gc-top"><span class="pill ${final(g) ? 'pill-dark' : 'pill-accent'}">${final(g) ? 'Final' : 'Live'}</span><span class="gc-label">${esc(weekLabel(g.week))}</span></div>
            ${row(g.hid, g.home, g.hs, hw)}${row(g.aid, g.away, g.aws, aw)}
            <a class="gc-foot" href="${url(`pages/past-seasons/game-center.html?id=${g.id}`)}">${top ? `Top scorer ${esc(top.name)} ${GT.pts(top.pts)}` : 'Open game center'} →</a>
        </div>`;
    };
    const strip = `<section class="gc"><div class="wrap">
        <div class="gc-bar">
            <span class="gc-title">Game Center:</span>
            ${prevW ? `<a class="gc-arrow" href="${wkLink(prevW)}" aria-label="Previous week">‹</a><a class="gc-week" href="${wkLink(prevW)}">Week ${prevW}</a>` : '<span class="gc-arrow off">‹</span>'}
            <span class="gc-week on">Week ${week}</span>
            ${nextW ? `<a class="gc-week" href="${wkLink(nextW)}">Week ${nextW}</a><a class="gc-arrow" href="${wkLink(nextW)}" aria-label="Next week">›</a>` : '<span class="gc-arrow off">›</span>'}
            <span class="gc-season">${season} season · ${wk.length} games</span>
        </div>
        <div class="gc-cards scroll-x">${wk.map(card).join('')}</div>
    </div></section>`;

    // ---------------------------------------------------------------- featured games, most recent week
    const recent = games.filter(g => g.week === latest && final(g));
    const margin = g => Math.abs(g.hs - g.aws);
    const pick = (list, score) => list.slice().sort((x, y) => score(y) - score(x))[0];
    const SLIDES = recent.length ? [
        { label: 'Highest scoring', game: pick(recent, g => g.hs + g.aws), image: 'background-9.png' },
        { label: 'Biggest blowout', game: pick(recent, g => margin(g)), image: 'background-7.png' },
        { label: 'Closest loss', game: pick(recent.filter(g => g.hs !== g.aws), g => -margin(g)) || recent[0], image: 'background-16.png' }
    ] : [];
    const slide = ({ label, game: g, image }, i) => {
        const homeWon = g.hs >= g.aws;
        const [wId, wName, wPts, lId, lName, lPts] = homeWon ? [g.hid, g.home, g.hs, g.aid, g.away, g.aws] : [g.aid, g.away, g.aws, g.hid, g.home, g.hs];
        const m = wPts - lPts;
        const verb = m < 5 ? 'holds off' : m < 15 ? 'defeats' : m < 35 ? 'beats' : 'routs';
        const weekScores = recent.flatMap(x => [x.hs, x.aws]).sort((x, y) => y - x);
        const rank = weekScores.indexOf(wPts) + 1;
        const top = [topIn(recentStarters, wId), topIn(recentStarters, lId)].filter(Boolean).sort((x, y) => y.pts - x.pts)[0];
        const max = Math.max(wPts, lPts) || 1;
        const bar = (name, pts, won) => `<div class="ft-team${won ? ' won' : ''}"><a class="ft-name" href="${GT.managerHref(name, season)}">${esc(name)}</a>
            <span class="ft-bar"><span style="width:${(pts / max * 100).toFixed(1)}%"></span></span>
            <span class="ft-mark">${won ? '▸' : ''}</span><span class="ft-score">${GT.pts(pts)}</span></div>`;
        return `<div class="ft-slide${i === 0 ? ' on' : ''}" data-i="${i}">
            <div class="ft-bg" style="background-image:url('${url('assets/images/' + image)}')"></div>
            <div class="wrap ft-inner">
            <div class="ft-photo">
                <span class="pill pill-accent ft-tag">${esc(label)} · Week ${g.week}</span>
                <div class="ft-stats">
                    <div><b>Final</b><span>Status</span></div>
                    <div><b>${GT.pts(m)}</b><span>Margin</span></div>
                    <div><b>${GT.pts(wPts + lPts)}</b><span>Combined points</span></div>
                    <div><b>${top ? `${esc(top.name.split(' ').slice(-1)[0])} · ${GT.pts(top.pts)}` : '-'}</b><span>Top scorer</span></div>
                </div>
            </div>
            <div class="ft-panel">
                <div class="ft-kicker">Final · Grass Touchers · ${esc(weekLabel(g.week))}</div>
                <h2 class="ft-head"><a href="${mHref(wId)}">${esc(wName)}</a> ${verb} <a href="${mHref(lId)}">${esc(lName)}</a></h2>
                <p class="ft-copy">${esc(wName)} put up ${GT.pts(wPts)}${rank === 1 ? ', the top score of the week,' : ''} to beat ${esc(lName)} by ${GT.pts(m)}.</p>
                <div class="ft-teams">${bar(wName, wPts, true)}${bar(lName, lPts, false)}</div>
                <div class="ft-actions">
                    <a class="btn btn-accent" href="${url(`pages/past-seasons/game-center.html?id=${g.id}`)}">Open game center</a>
                    <a class="btn btn-white" href="${url(`pages/managers/roster-history.html?m=${wId}&season=${season}&week=${g.week}`)}">View lineups</a>
                </div>
            </div>
            </div>
        </div>`;
    };
    const feature = SLIDES.length ? `<section class="feature"><div class="ft-carousel" id="ft">
        ${SLIDES.map(slide).join('')}
        <div class="wrap ft-nav-wrap"><div class="ft-nav" role="tablist">${SLIDES.map((s, i) => `<button class="${i === 0 ? 'on' : ''}" data-i="${i}" role="tab">${esc(s.label)}</button>`).join('')}</div></div>
    </div></section>` : '';

    // ---------------------------------------------------------------- division standings, top starters, champions
    const [picture, champs] = await Promise.all([
        GT.standings(season),
        GT.query(`SELECT fp.season, o.display_name AS name FROM final_placements fp JOIN owners o ON o.owner_id = fp.owner_id
                  WHERE fp.place = 1 ORDER BY fp.season DESC`)
    ]);
    const nm = id => (b.byId[id] || {}).name || '';
    const divCards = GT.divisionCards(picture, season);
    const cards = `<div class="card-row home-cards">
        ${divCards}
        <div class="card"><div class="card-head"><span class="card-title">Week ${latest} Top Starters</span></div><div class="card-body">
            <ul class="mini-list">${recentStarters.slice(0, 8).map(t => `<li><img src="${GT.logo(nm(t.id))}" alt=""><span>${esc(t.name)}</span>
                <span class="when">${GT.managerLink(nm(t.id), season)}</span><span class="res">${GT.pts(t.pts)}</span></li>`).join('')}</ul>
            </div><a class="card-link" href="${url(`pages/stories/highlights.html?season=${season}`)}">Highlights</a></div>
        <div class="card"><div class="card-head"><span class="card-title">Champions</span></div><div class="card-body">
            <ul class="mini-list">${champs.slice(0, 8).map(c => `<li><img src="${GT.logo(c.name)}" alt=""><span>${GT.managerLink(c.name, c.season)}</span>
                <span class="when"></span><span class="res">${c.season}</span></li>`).join('')}</ul>
            </div><a class="card-link" href="${url(`pages/past-seasons/playoff-bracket.html?season=${season - 1}`)}">Playoff brackets</a></div>
    </div>`;

    content.innerHTML = strip + feature + `<div class="wrap page-pad">${cards}</div>`;

    // ---------------------------------------------------------------- carousel: tabs + auto-advance (pauses on hover)
    const ft = document.getElementById('ft');
    if (ft) {
        let current = 0, timer;
        const show = i => {
            current = (i + SLIDES.length) % SLIDES.length;
            ft.querySelectorAll('.ft-slide').forEach(s => s.classList.toggle('on', +s.dataset.i === current));
            ft.querySelectorAll('.ft-nav button').forEach(btn => btn.classList.toggle('on', +btn.dataset.i === current));
        };
        const start = () => { clearInterval(timer); timer = setInterval(() => show(current + 1), 8000); };
        ft.querySelectorAll('.ft-nav button').forEach(btn => btn.addEventListener('click', () => { show(+btn.dataset.i); start(); }));
        ft.addEventListener('mouseenter', () => clearInterval(timer));
        ft.addEventListener('mouseleave', start);
        start();
    }
})();
