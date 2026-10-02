/* Manager pages: Overview, Schedule & Results, Roster History, Manager Stats History */
(async function () {
    const { esc, url, param } = SITE;
    const page = document.body.dataset.page;
    const content = document.getElementById('content');
    const b = await GT.load();
    const mgr = await GT.manager(param('m') || localStorage.getItem('gt-last-manager'));
    if (!mgr) { location.href = url('pages/managers/index.html'); return; }
    localStorage.setItem('gt-last-manager', mgr.id);

    const all = await GT.games(mgr.id);
    const seasons = [...new Set(all.map(g => g.season))].sort((x, y) => y - x);
    const CAREER = param('season') === 'career';
    const season = CAREER ? 0 : Number(param('season')) || seasons[0];
    const label = CAREER ? 'Career' : season;            // shown wherever the season number was
    const sq = CAREER ? 'career' : season;               // value for ?season= links
    const span = `${seasons[seasons.length - 1]}-${seasons[0]}`;
    const inSeason = CAREER ? all : all.filter(g => g.season === season);
    const reg = inSeason.filter(g => g.period === 'Regular');
    const team = GT.teamName(b, mgr.name, CAREER ? seasons[0] : season);
    const division = b.division[`${season}-${mgr.id}`];
    const finish = b.finish[`${season}-${mgr.id}`];
    const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    const mlink = (p, extra = '') => url(`pages/managers/${p}.html?m=${mgr.id}${extra}`);
    document.title = `${mgr.name} · ${team} - Grass Touchers`;

    // ---- sub header + hero (same on every manager page)
    SITE.subHeader({
        crumbs: [['Managers', url('pages/managers/index.html')], [mgr.name]],
        tabs: SITE.sectionTabs('managers', page, mgr.id)
    });
    const rec = GT.record(reg);
    const titles = seasons.filter(s => b.finish[`${s}-${mgr.id}`] === 1).length;
    const status = CAREER ? `Career · ${span} · ${seasons.length} seasons${titles ? ` · ${titles}x champion` : ''}` :
        finish ? `${season} final · ${ord(finish)} place` :
        reg.length ? `${season} regular season · week ${Math.max(...reg.map(g => g.week))}` : `${season} season`;
    const seasonSelect = (id, value, list = seasons, cls = 'select') =>
        `<select class="${cls}" id="${id}"><option value="career"${CAREER ? ' selected' : ''}>Career</option>${list.map(s => `<option value="${s}"${s === value ? ' selected' : ''}>${s} season</option>`).join('')}</select>`;
    const onSeason = id => document.getElementById(id).addEventListener('change', e => {
        const u = new URL(location.href); u.searchParams.set('season', e.target.value); location.href = u;
    });
    SITE.hero({
        tools: `<label class="hero-season"><span>Season</span>${seasonSelect('hero-season', season, seasons, 'select')}</label>`,
        title: team, logo: GT.logo(mgr.name), size: page === 'overview' ? '' : 'compact', dots: page === 'overview',
        image: `background-${(mgr.id % 18) + 1}.png`,
        meta: [`Manager ${esc(mgr.name)}${division ? ' · ' + esc(division) : ''}`, esc(status),
               `Record: ${rec.text}${reg.length ? ` · ${GT.pts(GT.sum(reg, 'pf') / reg.length)} pts / game` : ''}`]
    });
    onSeason('hero-season');

    function resultRow(g) {
        const d = GT.weekDate(b, g.season, g.week);
        const r = GT.result(g);
        return `<li>
            <img src="${GT.logo(g.opp)}" alt="">
            <div class="main"><span class="res ${r === 'W' ? 'win' : r === 'L' ? 'loss' : ''}">${r}</span>${GT.pts(g.pf)}-${GT.pts(g.pa)}
                <span class="sub">vs</span> <b>${esc(g.opp)}</b></div>
            <div class="date sub">${GT.fmtDate(d)}${CAREER ? `, ${g.season}` : ''}</div>
            <div class="time sub">${g.rank ? `#${g.rank} of the week` : ''}</div>
            <div class="tag">${esc(GT.periodLabel(g.period, g.week))}</div>
        </li>`;
    }

    // ============================================================ OVERVIEW
    async function overview() {
        const [picks, stand, seasonAgg, onRoster] = await Promise.all([
            CAREER ? Promise.all(seasons.map(s => GT.draft(mgr.id, s).then(list => list[0] ? { ...list[0], season: s } : null))).then(l => l.filter(Boolean))
                   : GT.draft(mgr.id, season),
            CAREER ? null : GT.standings(season),
            GT.query(`SELECT t.owner_id AS id, COUNT(*) AS gp,
                        SUM(t.team_score > t.opponent_score) AS w, SUM(t.team_score = t.opponent_score) AS ti,
                        SUM(t.team_score) AS pf, SUM(t.opponent_score) AS pa, MAX(t.team_score) AS hi,
                        SUM(t.score_rank_on_week <= 3) AS top3, SUM(t.bench_score) AS bench
                      FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id
                      WHERE ($s = 0 OR m.season = $s) AND m.season_period = 'Regular' GROUP BY t.owner_id`, { $s: season }),
            CAREER ? new Set() : GT.latestRosterIds(mgr.id, season)
        ]);
        // career: leave out managers with under a quarter of the longest career (a 2-1 record shouldn't top the all-time table)
        if (CAREER) {
            const minGp = Math.round(Math.max(...seasonAgg.map(r => r.gp)) * 0.25);
            for (let i = seasonAgg.length - 1; i >= 0; i--) if (seasonAgg[i].gp < minGp && seasonAgg[i].id !== mgr.id) seasonAgg.splice(i, 1);
        }
        const last = inSeason[inSeason.length - 1];
        const recent = all.filter(g => CAREER || g.season <= season).slice(-8).reverse();   // last eight games up to the season shown

        // card 1: recent results (no future schedule is published yet)
        const card1 = `<div class="card"><div class="card-head"><span class="card-title">Recent Results</span></div>
            <div class="card-body">${recent.length ? `<ul class="mini-list">${recent.map(g => {
                const r = GT.result(g);
                return `<li><img src="${GT.logo(g.opp)}" alt=""><span>vs ${esc(g.opp)}</span>
                    <span class="when">${GT.fmtDate(GT.weekDate(b, g.season, g.week)) || 'Wk ' + g.week}</span>
                    <span class="res ${r === 'W' ? 'win' : 'loss'}">${r} ${GT.pts(g.pf)}</span></li>`;
            }).join('')}</ul>` : '<div class="card-empty">No games yet.</div>'}</div>
            <a class="card-link" href="${mlink('schedule', `&season=${sq}`)}">Full schedule</a></div>`;

        // card 2: draft picks
        const card2 = `<div class="card"><div class="card-head"><span class="card-title">${CAREER ? 'First Pick Each Season' : `${season} Draft Picks`}</span></div>
            <div class="card-body">${picks.length ? `<ul class="mini-list pick-list">${picks.slice(0, 8).map(p => {
                const gone = onRoster.size && !onRoster.has(p.pid);      // traded or dropped since the draft
                return `<li class="${gone ? 'gone' : ''}"${gone ? ' title="No longer on the roster"' : ''}><span class="pk">${CAREER ? `'${String(p.season).slice(2)}` : p.pick}</span><span class="nm">${esc(p.name)}</span><span class="pos">${esc(p.pos)}</span><span class="when">${esc(p.team || '')}</span></li>`;
            }).join('')}</ul>`
                : '<div class="card-empty">No draft on record.</div>'}</div>
            <a class="card-link" href="${mlink('roster-history', `&season=${sq}`)}">All draft picks</a></div>`;

        // card 3: division standings (career: all-time regular season, top 8 by win %, this manager always shown)
        let tableRows;
        if (CAREER) {
            const allTime = seasonAgg.map(r => ({ owner: b.byId[r.id] ? b.byId[r.id].name : '', wins: r.w, losses: r.gp - r.w - r.ti,
                                                  pointsFor: r.pf, pointsAgainst: r.pa, pct: r.gp ? (r.w + r.ti / 2) / r.gp : 0 }))
                .sort((x, y) => y.pct - x.pct);
            tableRows = allTime.slice(0, 8);
            if (!tableRows.some(r => r.owner === mgr.name)) tableRows[7] = allTime.find(r => r.owner === mgr.name) || tableRows[7];
        } else {
            const divRows = stand.divisionStandings.filter(r => r.divisionName === division);
            tableRows = divRows.length ? divRows : stand.standings.slice(0, 8);
        }
        const card3 = `<div class="card"><div class="card-head"><span class="card-title">${CAREER ? 'All-Time Standings' : `${season} ${esc(division || 'League')} Standings`}</span></div>
            <div class="card-body"><table class="mini-table"><colgroup><col><col style="width:11%"><col style="width:11%"><col style="width:20%"><col style="width:20%"></colgroup>
            <thead><tr><th>Manager</th><th>W</th><th>L</th><th>PF</th><th>PA</th></tr></thead><tbody>
            ${tableRows.map(r => `<tr class="${r.owner === mgr.name ? 'me' : ''}"><td>${esc(r.owner)}</td><td>${r.wins}</td><td>${r.losses}</td>
                <td>${Math.round(r.pointsFor)}</td><td>${Math.round(r.pointsAgainst)}</td></tr>`).join('')}
            </tbody></table></div>
            <a class="card-link" href="${CAREER ? url('pages/recordbook/league-records.html') : url(`pages/past-seasons/standings.html?season=${season}`)}">${CAREER ? 'League records' : 'Full standings'}</a></div>`;

        // card 4: manager stats with league ranks
        const me = seasonAgg.find(r => r.id === mgr.id);
        const rank = (key, desc = true) => me ? 1 + seasonAgg.filter(r => desc ? r[key] > me[key] : r[key] < me[key]).length : '-';
        seasonAgg.forEach(r => { r.pct = r.gp ? (r.w + r.ti / 2) / r.gp : 0; r.ppg = r.gp ? r.pf / r.gp : 0; r.papg = r.gp ? r.pa / r.gp : 0; r.diff = r.pf - r.pa; if (CAREER) { r.diff /= r.gp || 1; r.bench /= r.gp || 1; } });
        const kv = (label, value, rk) => `<li><span>${label}</span><b>${value}</b><span class="rk">${rk ? ord(rk) : '-'}</span></li>`;
        const card4 = `<div class="card"><div class="card-head"><span class="card-title">${label} Manager Stats</span></div>
            <div class="card-body">${me ? `<ul class="kv kv-cols"><li class="head"><span>Stat</span><span>Value</span><span>League</span></li>
                ${kv('Record', `${me.w}-${me.gp - me.w - me.ti}${me.ti ? '-' + me.ti : ''}`, rank('pct'))}
                ${kv('Points / game', GT.pts(me.ppg), rank('ppg'))}
                ${kv('Allowed / game', GT.pts(me.papg), rank('papg', false))}
                ${kv(CAREER ? 'Differential / game' : 'Point differential', (me.diff >= 0 ? '+' : '') + GT.pts(me.diff), rank('diff'))}
                ${kv('High score', GT.pts(me.hi), rank('hi'))}
                ${kv('Top-3 weeks', me.top3, rank('top3'))}
                ${kv(CAREER ? 'Bench / game' : 'Bench points', CAREER ? GT.pts(me.bench) : Math.round(me.bench), rank('bench'))}
            </ul>` : '<div class="card-empty">No regular-season games.</div>'}</div>
            <a class="card-link" href="${mlink('stats-history', CAREER ? '&season=career' : '')}">Full stats history</a></div>`;

        // featured game band: most recent matchup
        let band = '';
        if (last) {
            const [mine, theirs] = await Promise.all([GT.roster(mgr.id, last.season, last.week), GT.roster(last.oppId, last.season, last.week)]);
            const top = list => list.filter(GT.isStarter).sort((x, y) => (y.points || 0) - (x.points || 0))[0];
            const t1 = top(mine), t2 = top(theirs);
            const won = last.pf > last.pa, d = GT.weekDate(b, last.season, last.week);
            const margin = Math.abs(last.pf - last.pa);
            band = `<section class="game-band">
                <div class="band-label"><span class="pill pill-dark">Final</span>${esc(GT.periodLabel(last.period, last.week))}${d ? ' · ' + GT.fmtDate(d) : ''}</div>
                <div class="scoreboard">
                    <div class="sb-team"><div class="sb-logo"><img src="${GT.logo(mgr.name)}" alt=""></div>
                        <div class="sb-name">${esc(team)}<small>${esc(mgr.name)} · ${rec.text}</small></div></div>
                    <div class="sb-scores"><div class="sb-score ${won ? 'won' : ''}">${GT.pts(last.pf)}</div><span class="sb-at">AT</span>
                        <div class="sb-score ${!won ? 'won' : ''}">${GT.pts(last.pa)}</div></div>
                    <div class="sb-team right"><div class="sb-name">${esc(GT.teamName(b, last.opp, last.season))}<small>${esc(last.opp)}</small></div>
                        <div class="sb-logo"><img src="${GT.logo(last.opp)}" alt=""></div></div>
                </div>
                <div class="band-foot">
                    <div><h4>${won ? 'Won' : last.pf < last.pa ? 'Lost' : 'Tied'} by ${GT.pts(margin)}</h4>
                        <p>${t1 ? `Top scorer ${esc(t1.name)} ${GT.pts(t1.points)}` : ''}${t2 ? ` · ${esc(last.opp)}: ${esc(t2.name)} ${GT.pts(t2.points)}` : ''}${last.rank ? ` · #${last.rank} score of the week` : ''}</p></div>
                    <div class="band-actions">
                        <a class="btn btn-accent" href="${url(`pages/past-seasons/game-center.html?id=${last.gameId}`)}">Open game center</a>
                        <a class="btn btn-black" href="${mlink('roster-history', `&season=${last.season}&week=${last.week}`)}">View lineup</a>
                    </div>
                </div></section>`;
        }

        content.innerHTML = `<div class="wrap page-pad">
            <div class="card-row">${card1}${card2}${card3}${card4}</div>
            ${band}
            ${await featuredPlayers()}
            <section class="split-section">
                <div><div class="eyebrow">${CAREER ? `Career · last ${Math.min(17, all.length)} games` : `${season} season`}</div><h2 class="section-title">Schedule &amp;<br>Results</h2>
                    <p class="section-copy">Regular season and playoffs. Dates are the Thursday each NFL week kicks off.</p>
                    ${CAREER ? `<a class="card-link" href="${mlink('schedule', '&season=career')}">Every game</a>` : ''}</div>
                <ul class="list-rows">${(CAREER ? all.slice(-17).reverse() : inSeason).map(resultRow).join('') || '<li class="muted">No games this season.</li>'}</ul>
            </section></div>`;
    }


    // ============================================================ FEATURED PLAYERS (this manager's season)
    async function featuredPlayers() {
        const [rows, best] = await Promise.all([
            GT.query(`SELECT p.player_id AS pid, p.name, p.position AS pos, COALESCE(MAX(frp.pro_team), p.pro_team) AS team,
                             COUNT(*) AS starts, SUM(frp.actual_points) AS pts
                      FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                      JOIN players p ON p.player_id = frp.player_id
                      WHERE fr.owner_id = $id AND ($s = 0 OR fr.season = $s) AND frp.slot_position NOT IN ('BE','IR') AND frp.actual_points IS NOT NULL
                      GROUP BY p.player_id ORDER BY pts DESC LIMIT 6`, { $id: mgr.id, $s: season }),
            GT.query(`SELECT p.player_id AS pid, p.name, p.position AS pos, COALESCE(frp.pro_team, p.pro_team) AS team, fr.season, fr.week, frp.actual_points AS pts
                      FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                      JOIN players p ON p.player_id = frp.player_id
                      WHERE fr.owner_id = $id AND ($s = 0 OR fr.season = $s) AND frp.slot_position NOT IN ('BE','IR') AND frp.actual_points IS NOT NULL
                      ORDER BY frp.actual_points DESC LIMIT 1`, { $id: mgr.id, $s: season })
        ]);
        if (!rows.length) return '';
        const shot = r => r.pid > 0 ? `https://a.espncdn.com/i/headshots/nfl/players/full/${r.pid}.png` : url(`assets/nfl-logos/${String(r.team || 'nfl').toLowerCase()}.png`);
        const href = r => r.pid > 0 ? `href="${url(`pages/players/stats.html?id=${r.pid}`)}"` : '';
        const fallback = `onerror="this.src='${url('assets/nfl-logos/nfl.png')}';this.onerror=null"`;
        const row = r => `<a class="fp-row" ${href(r)}><span class="fp-shot"><img src="${shot(r)}" alt="" ${fallback}></span>
            <span class="fp-who"><b>${esc(r.name)}</b><small>${esc(r.pos)} · ${esc(r.team || '')}</small><em>${r.starts} start${r.starts === 1 ? '' : 's'} · ${GT.pts(r.pts / r.starts)} per start</em></span>
            <span class="fp-num">${GT.pts(r.pts)}</span></a>`;
        const call = (title, r, line) => r ? `<div class="fp-callout"><h3>${title}</h3>
            <a class="fp-call" ${href(r)}><span class="fp-shot lg"><img src="${shot(r)}" alt="" ${fallback}></span>
            <span class="fp-who"><b>${esc(r.name)} · ${esc(r.pos)}</b><small>${esc(line)}</small></span></a></div>` : '';
        const top = rows[0], mostStarts = rows.slice().sort((x, y) => y.starts - x.starts || y.pts - x.pts)[0];
        return `<section class="fp-section with-photo">
            <div><div class="eyebrow">${CAREER ? `Career · ${span}` : `${season} roster`}</div><h2 class="section-title">Featured Players</h2>
                <div class="fp-photo" style="background-image:url('${url(`assets/images/background-${(mgr.id % 18) + 1}.png`)}')"><img src="${GT.logo(mgr.name)}" alt=""></div></div>
            <div><div class="fp-grid">${rows.map(row).join('')}</div>
                <a class="card-link" href="${mlink('roster-history', `&season=${sq}`)}">View full roster</a></div>
        </section>
        <div class="fp-callouts">
            ${call(`${label} Points Leader`, top, `${GT.pts(top.pts)} pts in ${top.starts} starts`)}
            ${call(`${label} Best Game`, best[0], best[0] ? `${GT.pts(best[0].pts)} pts · ${CAREER ? `${best[0].season} ` : ''}week ${best[0].week}` : '')}
            ${call(`${label} Most Starts`, mostStarts, `${mostStarts.starts} starts · ${GT.pts(mostStarts.pts)} pts`)}
        </div>`;
    }

    // ============================================================ SCHEDULE & RESULTS
    function schedule() {
        const rows = inSeason;
        const allReg = all.filter(g => g.period === 'Regular');
        const hi = rows.length ? Math.max(...rows.map(g => g.pf)) : null;
        const tile = (v, l, s = '') => `<div class="stat-tile"><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
        // head to head, all seasons
        const h2h = {};
        all.forEach(g => { (h2h[g.opp] = h2h[g.opp] || []).push(g); });
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:40px">
                <div><div class="eyebrow">${CAREER ? `Career · ${span}` : `${season} season`}</div><h2 class="section-title">Schedule &amp; Results</h2>
                    <p class="section-copy" style="max-width:none">Every ${esc(mgr.name)} matchup, regular season and playoffs.</p></div>
            </div>
            <div class="stat-tiles tiles-4">
                ${tile(GT.record(reg).text, 'Regular season')}
                ${CAREER ? tile(titles, 'Championships', `${seasons.length} seasons`) : tile(finish ? ord(finish) : '-', 'Final place')}
                ${tile(GT.pts(GT.sum(rows, 'pf')), 'Points for')}
                ${tile(hi == null ? '-' : GT.pts(hi), 'High score')}
            </div>
            ${CAREER ? seasons.map(s => {
                const list = all.filter(g => g.season === s), place = b.finish[`${s}-${mgr.id}`];
                return `<div class="eyebrow" style="margin:30px 0 10px">${s} season · ${GT.record(list.filter(g => g.period === 'Regular')).text}${place ? ` · ${ord(place)} place` : ''}</div>
                    <ul class="list-rows">${list.map(resultRow).join('')}</ul>`;
            }).join('') : `<ul class="list-rows" style="margin-top:22px">${rows.map(resultRow).join('') || '<li class="muted">No games this season.</li>'}</ul>`}
            <div class="panel"><div class="panel-head"><h3 class="panel-title">Head to Head · All Seasons</h3>
                <span class="muted">Career record ${GT.record(allReg).text} regular season</span></div>
                <div class="table-scroll"><table class="data-table">${SITE.cols('26%', '11%', '13%', '11%', '13%', '13%', '13%')}<thead><tr><th>Opponent</th><th class="num">Games</th><th class="num">Record</th>
                    <th class="num">Win %</th><th class="num">PF / G</th><th class="num">PA / G</th><th class="num">Last met</th></tr></thead><tbody>
                ${Object.entries(h2h).sort((x, y) => y[1].length - x[1].length).map(([opp, list]) => {
                    const r = GT.record(list), lastG = list[list.length - 1];
                    return `<tr><td><div class="team-cell"><img src="${GT.logo(opp)}" alt="">${esc(opp)}</div></td><td class="num">${list.length}</td>
                        <td class="num">${r.text}</td><td class="num">${(r.pct * 100).toFixed(0)}%</td>
                        <td class="num">${GT.pts(GT.sum(list, 'pf') / list.length)}</td><td class="num">${GT.pts(GT.sum(list, 'pa') / list.length)}</td>
                        <td class="num">${lastG.season} W${lastG.week}</td></tr>`;
                }).join('')}</tbody></table></div></div></div>`;
    }

    // ============================================================ ROSTER HISTORY
    async function rosterHistory() {
        const weeks = [...new Set(inSeason.map(g => g.week))].sort((x, y) => x - y);
        const week = Number(param('week')) || weeks[weeks.length - 1];
        const [lineup, picks, starts, moves] = await Promise.all([
            week && !CAREER ? GT.roster(mgr.id, season, week) : [],
            CAREER ? Promise.all(seasons.map(s => GT.draft(mgr.id, s).then(list => list.slice(0, 3).map(x => ({ ...x, season: s }))))).then(l => l.flat())
                   : GT.draft(mgr.id, season),
            GT.query(`SELECT p.name, p.position AS pos, COUNT(*) AS starts, SUM(frp.actual_points) AS pts
                      FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                      JOIN players p ON p.player_id = frp.player_id
                      WHERE fr.owner_id = $id AND ($s = 0 OR fr.season = $s) AND frp.slot_position NOT IN ('BE','IR')
                      GROUP BY p.player_id ORDER BY pts DESC LIMIT ${CAREER ? 24 : 12}`, { $id: mgr.id, $s: season }),
            GT.query(`SELECT t.processed_at AS at, t.type, ti.item_type AS item, p.name, p.position AS pos,
                             ti.from_owner_id AS fromId, ti.to_owner_id AS toId
                      FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.transaction_id
                      JOIN players p ON p.player_id = ti.player_id
                      WHERE ($s = 0 OR t.season = $s) AND t.status = 'EXECUTED' AND ti.item_type IN ('ADD','DROP','TRADE')
                        AND (ti.from_owner_id = $id OR ti.to_owner_id = $id)
                      ORDER BY t.processed_at DESC LIMIT 40`, { $id: mgr.id, $s: season })
        ]);
        const game = inSeason.find(g => g.week === week);
        lineup.sort(GT.slotSort);
        const starters = lineup.filter(GT.isStarter), bench = lineup.filter(r => !GT.isStarter(r));
        const row = r => `<tr><td><b>${esc(r.slot)}</b></td><td>${playerLink(r)}</td><td>${esc(r.pos)}</td><td>${esc(r.team || '')}</td>
            <td class="num">${GT.pts(r.points)}</td><td class="num muted">${GT.pts(r.proj)}</td></tr>`;
        const moveText = m => {
            const who = id => esc(b.byId[id] ? b.byId[id].name : '');
            if (m.item === 'TRADE') return m.toId === mgr.id ? `Traded for from ${who(m.fromId)}` : `Traded to ${who(m.toId)}`;
            return m.item === 'ADD' ? (m.type === 'WAIVER' ? 'Waiver claim' : 'Free agent add') : 'Dropped';
        };
        const lineupPanel = CAREER ? '' : `
            <div class="panel" style="margin-top:34px"><div class="panel-head">
                <div><div class="eyebrow">${season} · week ${week || '-'}</div><h3 class="panel-title">Lineup</h3></div>
                <div class="section-tools" style="margin:0">
                    <select class="select" id="roster-week">${weeks.map(w => `<option value="${w}"${w === week ? ' selected' : ''}>Week ${w}</option>`).join('')}</select></div>
                </div>
                ${game ? `<p class="muted" style="margin-bottom:12px">${GT.result(game)} ${GT.pts(game.pf)}-${GT.pts(game.pa)} vs ${esc(game.opp)} · ${esc(GT.periodLabel(game.period, game.week))}</p>` : ''}
                <div class="table-scroll"><table class="data-table">${SITE.cols('10%', '38%', '10%', '12%', '15%', '15%')}<thead><tr><th>Slot</th><th>Player</th><th>Pos</th><th>NFL</th><th class="num">Pts</th><th class="num">Proj</th></tr></thead>
                <tbody>${starters.map(row).join('')}${bench.length ? `<tr class="group"><td colspan="6">Bench</td></tr>${bench.map(row).join('')}` : ''}
                ${lineup.length ? '' : '<tr><td colspan="6" class="muted">No lineup saved for this week.</td></tr>'}</tbody></table></div></div>`;
        content.innerHTML = `<div class="wrap page-pad">${lineupPanel}
            <div class="card-row two" style="margin-top:${CAREER ? 34 : 18}px">
                <div class="panel" style="margin:0"><h3 class="panel-title" style="margin-bottom:12px">${CAREER ? 'Top 3 Picks Each Season' : `${season} Draft`}</h3>
                    <div class="table-scroll"><table class="data-table">${CAREER ? SITE.cols('15%', '15%', '45%', '12%', '13%') : SITE.cols('15%', '55%', '15%', '15%')}<thead><tr>${CAREER ? '<th>Season</th>' : ''}<th class="num">Pick</th><th>Player</th><th>Pos</th><th>NFL</th></tr></thead><tbody>
                    ${picks.map(p => `<tr>${CAREER ? `<td>${p.season}</td>` : ''}<td class="num">${p.pick}</td><td>${esc(p.name)}</td><td>${esc(p.pos)}</td><td>${esc(p.team || '')}</td></tr>`).join('') || `<tr><td colspan="${CAREER ? 5 : 4}" class="muted">No draft on record.</td></tr>`}
                    </tbody></table></div></div>
                <div class="panel" style="margin:0"><h3 class="panel-title" style="margin-bottom:12px">${CAREER ? 'Career ' : ''}Top Starters</h3>
                    <div class="table-scroll"><table class="data-table">${SITE.cols('52%', '14%', '17%', '17%')}<thead><tr><th>Player</th><th>Pos</th><th class="num">Starts</th><th class="num">Pts</th></tr></thead><tbody>
                    ${starts.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.pos)}</td><td class="num">${s.starts}</td><td class="num">${GT.pts(s.pts)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No lineups saved.</td></tr>'}
                    </tbody></table></div></div>
            </div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">${CAREER ? 'Latest 40 Transactions' : `${season} Transactions`}</h3>
                <div class="table-scroll"><table class="data-table">${SITE.cols('15%', '35%', '38%', '12%')}<thead><tr><th>Date</th><th>Move</th><th>Player</th><th>Pos</th></tr></thead><tbody>
                ${moves.map(m => `<tr><td>${m.at ? new Date(m.at).toLocaleDateString('en-US', CAREER ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' }) : ''}</td><td>${moveText(m)}</td><td>${esc(m.name)}</td><td>${esc(m.pos)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No transactions.</td></tr>'}
                </tbody></table></div></div></div>`;
        if (!CAREER) document.getElementById('roster-week').addEventListener('change', e => {
            const u = new URL(location.href); u.searchParams.set('week', e.target.value); location.href = u;
        });
    }
    const playerLink = r => r.playerId > 0 ? `<a href="${url(`pages/players/stats.html?id=${r.playerId}`)}"><b>${esc(r.name)}</b></a>` : `<b>${esc(r.name)}</b>`;

    // ============================================================ MANAGER STATS HISTORY
    async function statsHistory() {
        const accolades = await GT.query(`SELECT season, award FROM accolades WHERE owner_id = $id ORDER BY season`, { $id: mgr.id });
        const allReg = all.filter(g => g.period === 'Regular');
        const career = GT.record(allReg);
        const places = seasons.map(s => b.finish[`${s}-${mgr.id}`]).filter(Boolean);
        const titles = places.filter(p => p === 1).length;
        // seasons that reached the championship side: play-in, playoffs or the title game
        const playoffTrips = new Set(all.filter(g => ['Post-WC', 'Post-WB', 'Championship'].includes(g.period)).map(g => g.season)).size;
        const tile = (v, l, s = '') => `<div class="stat-tile"><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
        const bySeason = seasons.map(s => {
            const list = all.filter(g => g.season === s), r = list.filter(g => g.period === 'Regular');
            const post = list.filter(g => g.period !== 'Regular');
            return { s, r, post, rec: GT.record(r), pf: GT.sum(r, 'pf'), pa: GT.sum(r, 'pa'),
                     hi: r.length ? Math.max(...r.map(g => g.pf)) : 0, place: b.finish[`${s}-${mgr.id}`],
                     div: b.division[`${s}-${mgr.id}`], awards: accolades.filter(a => a.season === s).map(a => a.award) };
        });
        content.innerHTML = `<div class="wrap page-pad">
            <div class="stat-tiles tiles-7" style="margin-top:34px">
                ${tile(seasons.length, 'Seasons', `${mgr.first}-${mgr.last}`)}
                ${tile(career.text, 'Regular season', `${(career.pct * 100).toFixed(1)}% wins`)}
                ${tile(titles, 'Championships')}
                ${tile(playoffTrips, 'Playoff trips', `of ${seasons.length} seasons`)}
                ${tile(places.length ? (places.reduce((a, p) => a + p, 0) / places.length).toFixed(1) : '-', 'Average finish')}
                ${tile(GT.pts(GT.sum(allReg, 'pf') / (allReg.length || 1)), 'Points / game')}
                ${tile(allReg.length ? GT.pts(Math.max(...allReg.map(g => g.pf))) : '-', 'Career high')}
            </div>
            <section class="an-section" id="analytics"><div class="loading">Comparing against the field...</div></section>
            <div class="panel"><div class="panel-head"><h3 class="panel-title">Season by Season</h3></div>
                <div class="table-scroll"><table class="data-table" style="min-width:1000px">${SITE.cols('6%', '17%', '13%', '7%', '7%', '7%', '7%', '6%', '6%', '7%', '6%', '11%')}<thead><tr><th>Season</th><th>Team</th><th>Division</th><th class="num">Record</th>
                    <th class="num">PF</th><th class="num">PA</th><th class="num">Diff</th><th class="num">PF / G</th><th class="num">High</th>
                    <th class="num">Playoffs</th><th class="num">Finish</th><th>Awards</th></tr></thead><tbody>
                ${bySeason.map(x => `<tr><td><a href="${mlink('schedule', `&season=${x.s}`)}"><b>${x.s}</b></a></td><td>${esc(GT.teamName(b, mgr.name, x.s))}</td><td>${esc(x.div || '')}</td>
                    <td class="num">${x.rec.text}</td><td class="num">${GT.pts(x.pf)}</td><td class="num">${GT.pts(x.pa)}</td>
                    <td class="num ${x.pf >= x.pa ? 'win' : 'loss'}">${(x.pf >= x.pa ? '+' : '') + GT.pts(x.pf - x.pa)}</td>
                    <td class="num">${x.r.length ? GT.pts(x.pf / x.r.length) : '-'}</td><td class="num">${GT.pts(x.hi)}</td>
                    <td class="num">${x.post.length ? GT.record(x.post).text : '-'}</td><td class="num"><b>${x.place ? ord(x.place) : '-'}</b></td>
                    <td class="muted">${esc(x.awards.join(', '))}</td></tr>`).join('')}
                </tbody></table></div></div></div>`;
        managerAnalytics();
    }

    // ============================================================ VS THE FIELD (this season, every manager)
    async function managerAnalytics() {
        const host = document.getElementById('analytics');
        const [weeks, slots, moves, metrics] = await Promise.all([
            GT.query(`SELECT o.display_name AS owner, m.season, m.week, t.team_score AS pf, t.opponent_score AS pa, t.score_rank_on_week AS rank
                      FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                      WHERE ($s = 0 OR m.season = $s) AND m.season_period = 'Regular' AND t.team_score IS NOT NULL`, { $s: season }),
            GT.query(`SELECT o.display_name AS owner, frp.slot_position AS slot, COUNT(DISTINCT fr.week) AS weeks, SUM(frp.actual_points) AS pts
                      FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id JOIN owners o ON o.owner_id = fr.owner_id
                      WHERE ($s = 0 OR fr.season = $s) AND frp.slot_position NOT IN ('BE','IR') AND frp.actual_points IS NOT NULL
                      GROUP BY o.owner_id, frp.slot_position`, { $s: season }),
            GT.query(`SELECT o.display_name AS owner, m.kind, m.grade FROM transaction_moves m JOIN owners o ON o.owner_id = m.owner_id
                      WHERE ($s = 0 OR m.season = $s) AND m.provisional = 0`, { $s: season }),
            typeof RosterMetrics !== 'undefined' ? RosterMetrics.load().catch(() => null) : null
        ]);
        if (!weeks.length) { host.innerHTML = ''; return; }
        // ---- every manager's season line
        const owners = [...new Set(weeks.map(w => w.owner))];
        const byWeek = {};
        weeks.forEach(w => { w.key = `${w.season}|${w.week}`; (byWeek[w.key] = byWeek[w.key] || []).push(w); });
        const nWeek = w => byWeek[w].length;
        const GPA = { A: 4, B: 3, C: 2, D: 1, F: 0 };
        const line = owner => {
            const mine = weeks.filter(w => w.owner === owner).sort((a, b) => a.season - b.season || a.week - b.week);
            const pts = mine.map(w => w.pf).sort((a, b) => a - b), n = pts.length;
            const mean = pts.reduce((a, b) => a + b, 0) / n;
            const q = f => pts[Math.min(n - 1, Math.round(f * (n - 1)))];
            const wins = mine.filter(w => w.pf > w.pa).length + mine.filter(w => w.pf === w.pa).length / 2;
            const allPlay = mine.reduce((t, w) => t + byWeek[w.key].filter(o => o.owner !== owner && o.pf < w.pf).length
                                                   + byWeek[w.key].filter(o => o.owner !== owner && o.pf === w.pf).length / 2, 0);
            const allPlayGames = mine.reduce((t, w) => t + nWeek(w.key) - 1, 0);
            const pooled = metrics ? RosterMetrics.pool(mine.map(w => metrics.get(`${owner}|${w.season}|${w.week}`)).filter(Boolean)) : null;
            const mv = moves.filter(m => m.owner === owner);
            const gpa = kind => { const g = mv.filter(m => m.kind === kind && m.grade); return g.length ? g.reduce((t, m) => t + GPA[m.grade], 0) / g.length : null; };
            const slotPts = {};
            slots.filter(r => r.owner === owner).forEach(r => { slotPts[r.slot] = r.pts / n; });
            return { owner, n, ppg: mean, pa: mine.reduce((t, w) => t + w.pa, 0) / n, ceil: q(0.9), floor: q(0.1),
                     vol: Math.sqrt(pts.reduce((t, x) => t + (x - mean) ** 2, 0) / n) / mean,
                     top3: mine.filter(w => w.rank && w.rank <= 3).length / n * 100,
                     bot3: mine.filter(w => w.rank && w.rank > nWeek(w.key) - 3).length / n * 100,
                     win: wins / n * 100, allPlay: allPlayGames ? allPlay / allPlayGames * 100 : null,
                     eff: pooled ? pooled.eff : null, fp: pooled ? pooled.fp : null,
                     pickups: mv.filter(m => m.kind === 'PICKUP').length, trades: mv.filter(m => m.kind === 'TRADE').length,
                     pickupGpa: gpa('PICKUP'), tradeGpa: gpa('TRADE'), slotPts, weekly: mine };
        };
        let field = owners.map(line);
        const me = field.find(f => f.owner === mgr.name);
        if (!me) { host.innerHTML = `<p class="muted">No ${season} regular-season games for ${esc(mgr.name)}.</p>`; return; }
        // career: compare against managers with at least a quarter of the longest career (the manager shown always counts)
        const minGames = CAREER ? Math.round(Math.max(...field.map(f => f.n)) * 0.25) : 0;
        if (CAREER) field = field.filter(f => f.n >= minGames || f === me);
        me.luck = me.allPlay != null ? me.win - me.allPlay : null;
        field.forEach(f => { f.luck = f.allPlay != null ? f.win - f.allPlay : null; });
        const f1 = v => v == null ? '-' : v.toFixed(1), f2 = v => v == null ? '-' : v.toFixed(2), pc = v => v == null ? '-' : `${v.toFixed(1)}%`;
        const sg = v => v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
        // [label, key, higherIsBetter, format, category] -- category 'luck' is shown but left out of the grades
        const M = [
            ['Points / game', 'ppg', true, f1, 'score'], ['Ceiling (90th pct week)', 'ceil', true, f1, 'score'], ['Floor (10th pct week)', 'floor', true, f1, 'score'],
            ['Top-3 weeks', 'top3', true, pc, 'score'], ['Bottom-3 weeks', 'bot3', false, pc, 'score'], ['Volatility', 'vol', false, f2, 'score'],
            ['All-play win %', 'allPlay', true, pc, 'results'], ['Actual win %', 'win', true, pc, 'results'],
            ['Luck (win % − all-play %)', 'luck', true, sg, 'luck'], ['Points against / game', 'pa', false, f1, 'luck'],
            ['Lineup efficiency', 'eff', true, pc, 'lineup'], ['FP+ (vs projections)', 'fp', true, f1, 'lineup'],
            ['Pickups', 'pickups', true, v => String(v ?? '-'), 'moves'], ['Pickup GPA', 'pickupGpa', true, f2, 'moves'],
            ['Trades', 'trades', true, v => String(v ?? '-'), 'moves'], ['Trade GPA', 'tradeGpa', true, f2, 'moves']
        ];
        const rows = M.map(([label, k, hb, fmt, cat]) => ({ label, cat, shown: fmt(me[k]), p: AN.percentile(me[k], field.map(f => f[k]), hb) }));
        const grade = cats => AN.grade(rows.filter(r => cats.includes(r.cat)).map(r => r.p));
        const SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST', 'P', 'HC'].filter(sl => field.some(f => f.slotPts[sl]));
        const slotRows = SLOTS.map(sl => ({ label: `${sl} points / week`, shown: f1(me.slotPts[sl] ?? 0), p: AN.percentile(me.slotPts[sl] ?? 0, field.map(f => f.slotPts[sl] ?? 0), true) }));
        const block = (title, list) => `<div class="an-block"><h4>${title}</h4>${list.map(r => AN.bar(r.label, r.shown, r.p)).join('')}</div>`;
        // weekly score vs the league average, as bars
        const chart = (() => {
            const W = 1060, H = 190, L = 40, R = 10, T = 14, B = 26;
            const mean = list => list.reduce((t, x) => t + x.pf, 0) / list.length;
            const items = CAREER
                ? seasons.slice().reverse().map(s => {
                    const mineS = me.weekly.filter(w => w.season === s);
                    if (!mineS.length) return null;
                    const wins = mineS.filter(w => w.pf > w.pa).length;
                    return { x: s, pf: mean(mineS), pa: mean(mineS.map(w => ({ pf: w.pa }))), won: wins * 2 > mineS.length,
                             avg: mean(weeks.filter(w => w.season === s)), tip: `${s}: ${mean(mineS).toFixed(1)} per game, ${wins}-${mineS.length - wins}` };
                }).filter(Boolean)
                : me.weekly.map(w => ({ x: w.week, pf: w.pf, pa: w.pa, won: w.pf > w.pa, avg: mean(byWeek[w.key]),
                                        tip: `Week ${w.week}: ${w.pf.toFixed(1)} (${w.pf > w.pa ? 'W' : 'L'} vs ${w.pa.toFixed(1)})` }));
            const avgs = items.map(i => i.avg);
            const max = Math.max(...items.map(i => i.pf), ...avgs) * 1.08;
            const bw = (W - L - R) / items.length;
            const y = v => T + (1 - v / max) * (H - T - B);
            let svg = '';
            [0, 0.25, 0.5, 0.75, 1].forEach(f => { const v = max * f; svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="an-grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="an-t">${Math.round(v)}</text>`; });
            items.forEach((w, i) => {
                const x = L + i * bw;
                svg += `<rect x="${(x + bw * 0.18).toFixed(1)}" y="${y(w.pf).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${(H - B - y(w.pf)).toFixed(1)}" class="${w.won ? 'an-bar-w' : 'an-bar-l'}"><title>${w.tip}, league average ${avgs[i].toFixed(1)}</title></rect>
                        <text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="an-t">${w.x}</text>`;
            });
            svg += `<polyline points="${avgs.map((a, i) => `${(L + i * bw + bw / 2).toFixed(1)},${y(a).toFixed(1)}`).join(' ')}" class="an-avg-line"/>`;
            return `<div class="an-chart"><div class="an-strip-label">${CAREER ? `Season by season · bars = ${esc(mgr.name)} points per game (green winning record, grey losing) · line = league average`
                                                       : `Week by week · bars = ${esc(mgr.name)} (green win, grey loss) · line = league average`}</div>
                <svg viewBox="0 0 ${W} ${H}" class="an-svg">${svg}</svg></div>`;
        })();
        host.innerHTML = `
            <div class="panel-head"><div><div class="eyebrow">${CAREER ? `Career regular season (${span}) · vs ${field.length} managers with ${minGames}+ games` : `${season} regular season · vs all ${field.length} managers`}</div><h2 class="section-title">Vs The Field</h2></div></div>
            <div class="an-top"><div class="an-grades">
                ${AN.gradeBadge('Overall', grade(['score', 'results', 'lineup']))}${AN.gradeBadge('Scoring', grade(['score']))}
                ${AN.gradeBadge('Lineup', grade(['lineup']))}${AN.gradeBadge('Roster moves', grade(['moves']))}${AN.gradeBadge('Positional', AN.grade(slotRows.map(r => r.p)))}</div>
                <div class="an-rank"><b>#${field.slice().sort((a, b) => b.ppg - a.ppg).findIndex(f => f.owner === mgr.name) + 1}</b><span>in points per game<br>of ${field.length} managers</span></div></div>
            <div class="an-cols">${block('Scoring', rows.filter(r => r.cat === 'score'))}${block('Results & Luck', rows.filter(r => r.cat === 'results' || r.cat === 'luck'))}</div>
            <div class="an-cols">${block('Lineup & Roster Moves', rows.filter(r => r.cat === 'lineup' || r.cat === 'moves'))}${block('Positional Strength', slotRows)}</div>
            ${chart}
            ${AN.strip(field.map(f => f.allPlay), [{ label: mgr.name, value: me.allPlay, color: AN.color(rows.find(r => r.label === 'All-play win %').p) }],
                       { label: CAREER ? 'Career all-play win %, every qualified manager' : `All-play win %, every manager in ${season}`, fmt: v => `${v.toFixed(0)}%` })}
            ${AN.legend()}
            <p class="an-note">Percentiles compare ${esc(mgr.name)} with ${CAREER ? `every manager's pooled regular seasons (${span}); managers need ${minGames}+ games to count` : `every manager in the ${season} regular season`}. Luck rows are shown but left out of the grades. All-play win % is the record against every other team every week. Lineup efficiency and FP+ match the Recordbook.</p>`;
    }

    ({ overview, schedule, 'roster-history': rosterHistory, 'stats-history': statsHistory })[page]();
})();
