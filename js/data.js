/* League data for the Shakuro Style pages (reads data/league.db through league-db.js). */
(function () {
    const q = (sql, params) => LeagueDb.query(sql, params);
    const LOGOS = new Set(['anthony', 'armando', 'blake', 'brennan', 'caty', 'cubby', 'devin', 'gabe', 'jack', 'jason', 'jeffrey',
                           'jon', 'justin', 'melanie', 'omar', 'patric', 'peter', 'sam', 'tucker']);
    const PERIOD = {
        Regular: 'Regular', 'Post-WC': 'Play-In', 'Post-WB': 'Playoffs', Championship: 'Championship',
        'Post-LB': 'Gulag', 'Post-LP': 'Gulag Play-In', Chumpionship: 'Chumpionship'
    };
    let base;
    const byNameSync = {};

    function load() {
        if (base) return base;
        base = Promise.all([
            q(`SELECT o.owner_id AS id, o.display_name AS name,
                      MIN(m.season) AS first, MAX(m.season) AS last, COUNT(DISTINCT m.season) AS seasons
               FROM owners o JOIN matchup_team_stats t ON t.owner_id = o.owner_id
               JOIN matchups m ON m.game_id = t.game_id GROUP BY o.owner_id ORDER BY o.display_name`),
            q(`SELECT season, week, MIN(kickoff) AS kickoff FROM nfl_games GROUP BY season, week`),
            q(`SELECT MAX(season) AS season FROM matchups`),
            fetch(SITE.url('data/team_names.json')).then(r => r.ok ? r.json() : {}).catch(() => ({})),
            q(`SELECT d.season, d.division_name AS division, dm.owner_id AS id
               FROM divisions d JOIN division_members dm ON dm.division_id = d.division_id`),
            q(`SELECT season, place, owner_id AS id FROM final_placements`)
        ]).then(([owners, weeks, cur, names, divs, places]) => {
            const kickoff = {};
            weeks.forEach(w => { kickoff[`${w.season}-${w.week}`] = w.kickoff; });
            const division = {};
            divs.forEach(d => { division[`${d.season}-${d.id}`] = d.division; });
            const finish = {};
            places.forEach(p => { finish[`${p.season}-${p.id}`] = p.place; });
            const byId = {}, byName = {};
            owners.forEach(o => { byId[o.id] = o; byName[o.name.toLowerCase()] = o; });
            Object.assign(byNameSync, byName);
            SITE.setSeason(cur[0].season);
            return { owners, byId, byName, kickoff, season: cur[0].season, names, division, finish };
        });
        return base;
    }

    const logo = name => SITE.url(`assets/manager-logos/${LOGOS.has(String(name).toLowerCase()) ? String(name).toLowerCase() : 'default'}.png`);

    // Team name for a season. Never borrowed from another season: a missing name shows as the manager's team
    // instead of last year's name (team names change every year).
    function teamName(b, owner, season) {
        const map = b.names[owner] || {};
        return map[season] || `${owner}'s Team`;
    }

    // Accepts ?m=<owner id> or ?m=<name>
    async function manager(key) {
        const b = await load();
        if (key == null) return null;
        return b.byId[key] || b.byName[String(key).toLowerCase()] || null;
    }

    // Every game for one manager, oldest first
    const games = id => q(`
        SELECT m.game_id AS gameId, m.season, m.week, m.season_period AS period,
               t.team_score AS pf, t.opponent_score AS pa, t.opponent_owner_id AS oppId, opp.display_name AS opp,
               t.score_rank_on_week AS rank, t.bench_score AS bench
        FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id
        JOIN owners opp ON opp.owner_id = t.opponent_owner_id
        WHERE t.owner_id = $id ORDER BY m.season, m.week`, { $id: Number(id) });

    const result = g => g.pf > g.pa ? 'W' : g.pf < g.pa ? 'L' : 'T';
    function record(list) {
        const w = list.filter(g => g.pf > g.pa).length, l = list.filter(g => g.pf < g.pa).length;
        const t = list.length - w - l;
        return { w, l, t, text: `${w}-${l}${t ? '-' + t : ''}`, pct: list.length ? (w + t / 2) / list.length : 0 };
    }
    const sum = (list, k) => list.reduce((a, g) => a + (g[k] || 0), 0);

    function weekDate(b, season, week) {
        const k = b.kickoff[`${season}-${week}`];
        return k ? new Date(k) : null;
    }
    const fmtDate = d => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const fmtTime = d => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    const periodLabel = (period, week) => period === 'Regular' ? `Regular W${week}` : `${PERIOD[period] || period} W${week}`;
    const pts = v => v == null ? '-' : (Math.round(v * 10) / 10).toFixed(1);

    // Draft picks for one manager in one season (from the ESPN draft log)
    const draft = (id, season) => q(`
        SELECT ti.overall_pick AS pick, p.player_id AS pid, p.name, p.position AS pos, p.pro_team AS team
        FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.transaction_id
        JOIN players p ON p.player_id = ti.player_id
        WHERE t.type = 'DRAFT' AND ti.item_type = 'DRAFT' AND t.season = $season AND ti.to_owner_id = $id
        ORDER BY ti.overall_pick`, { $id: Number(id), $season: Number(season) });

    // One manager's lineup for a week
    const roster = (id, season, week) => q(`
        SELECT frp.slot_position AS slot, p.player_id AS playerId, p.name, p.position AS pos,
               COALESCE(frp.pro_team, p.pro_team) AS team, frp.actual_points AS points, frp.projected_points AS proj
        FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
        JOIN players p ON p.player_id = frp.player_id
        WHERE fr.owner_id = $id AND fr.season = $season AND fr.week = $week`,
        { $id: Number(id), $season: Number(season), $week: Number(week) });

    // Player ids on a manager's most recent saved roster of a season
    const latestRosterIds = (id, season) => q(`
        SELECT frp.player_id AS pid FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
        WHERE fr.owner_id = $id AND fr.season = $season
          AND fr.week = (SELECT MAX(week) FROM fantasy_rosters WHERE owner_id = $id AND season = $season)`,
        { $id: Number(id), $season: Number(season) }).then(rows => new Set(rows.map(r => r.pid)));

    const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K', 'P', 'HC', 'BE', 'IR'];
    const slotSort = (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || (b.points || 0) - (a.points || 0);
    const isStarter = r => r.slot !== 'BE' && r.slot !== 'IR';

    const standings = season => LeagueDb.playoffPicture(Number(season));

    // The week in progress, as of the last data update (live_matchups: never counted in standings or records).
    // Same shape as the pages' game rows, plus live: true, projections and when it was updated. Empty when no week is live
    // (or on a database built before live scores existed).
    const liveGames = season => q(`
        SELECT m.game_id AS id, m.week, 'Regular' AS period, h.owner_id AS hid, a.display_name AS home, h.team_score AS hs,
               h.opponent_owner_id AS aid, o.display_name AS away, h.opponent_score AS aws,
               h.team_projected AS hp, h.opponent_projected AS ap, m.updated_at AS updated
        FROM live_matchups m JOIN live_matchup_team_stats h ON h.game_id = m.game_id AND h.owner_id < h.opponent_owner_id
        JOIN owners a ON a.owner_id = h.owner_id JOIN owners o ON o.owner_id = h.opponent_owner_id
        WHERE m.season = $s ORDER BY m.week, m.game_id`, { $s: Number(season) })
        .then(rows => rows.map(r => ({ ...r, live: true }))).catch(() => []);
    const updatedText = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? `updated ${d.toLocaleDateString('en-US', { weekday: 'short' })} ${fmtTime(d)}` : ''; };

    // link to a manager's page for a given season
    const managerHref = (name, season) => {
        const o = base && byNameSync[String(name).toLowerCase()];
        return SITE.url(`pages/managers/overview.html?m=${encodeURIComponent(o ? o.id : name)}${season ? `&season=${season}` : ''}`);
    };
    const managerLink = (name, season, cls = '') => `<a class="mgr-link ${cls}" href="${managerHref(name, season)}">${SITE.esc(name)}</a>`;
    const gameHref = id => SITE.url(`pages/past-seasons/game-center.html?id=${id}`);

    // Two division standings cards (W / L / PDiff): one division each, two per card when there are four,
    // and a single-division season split across both cards. picture = GT.standings(season).
    function divisionCards(picture, season) {
        const esc = SITE.esc;
        const divisions = [];
        picture.divisionStandings.forEach(r => {
            let d = divisions.find(x => x.name === r.divisionName);
            if (!d) divisions.push(d = { name: r.divisionName, rows: [] });
            d.rows.push(r);
        });
        if (divisions.length === 1) {
            const [only] = divisions, half = Math.ceil(only.rows.length / 2);
            divisions.splice(0, 1, { name: `${only.name} · 1-${half}`, rows: only.rows.slice(0, half) },
                                   { name: `${only.name} · ${half + 1}-${only.rows.length}`, rows: only.rows.slice(half) });
        }
        const perCard = Math.max(1, Math.ceil(divisions.length / 2));
        const divTable = d => `<div class="div-block">${d.name ? `<div class="div-name">${esc(d.name)}</div>` : ''}
            <table class="mini-table">${SITE.cols('46%', '13%', '13%', '28%')}<thead><tr><th>Manager</th><th>W</th><th>L</th><th>PDiff</th></tr></thead><tbody>
            ${d.rows.map(r => { const diff = r.pointsFor - r.pointsAgainst;
                return `<tr><td>${managerLink(r.owner, season)}</td><td>${r.wins}</td><td>${r.losses}</td><td class="${diff >= 0 ? 'win' : 'loss'}">${diff >= 0 ? '+' : ''}${pts(diff)}</td></tr>`; }).join('')}</tbody></table></div>`;
        return [0, 1].map(c => {
            const group = divisions.slice(c * perCard, c * perCard + perCard);
            if (!group.length) return '';
            return `<div class="card"><div class="card-head"><span class="card-title">${season} ${group.length === 1 ? esc(group[0].name) : 'Division'} Standings</span></div>
                <div class="card-body">${group.map(d => group.length === 1 ? divTable({ ...d, name: '' }) : divTable(d)).join('')}</div>
                <a class="card-link" href="${SITE.url(`pages/past-seasons/standings.html?season=${season}`)}">Full standings</a></div>`;
        }).join('');
    }

    window.GT = { load, logo, teamName, manager, games, result, record, sum, weekDate, fmtDate, fmtTime,
                  periodLabel, pts, draft, roster, latestRosterIds, slotSort, isStarter, standings, divisionCards, managerHref, managerLink, gameHref, query: q, PERIOD,
                  liveGames, updatedText };
})();
