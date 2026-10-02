/* Stat Finder: a league-history stats explorer (manager seasons and careers, every game, head to head,
   player seasons and games, drafts, roster moves). Filter, sort by any column, page 25 at a time, export CSV. */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    const PER_PAGE = 25;
    const name = id => (b.byId[id] || {}).name || '';
    const PLAYOFF = ['Post-WC', 'Post-WB', 'Championship'];
    const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    const f1 = v => v == null || isNaN(v) ? '-' : GT.pts(v);
    const pct = v => v == null || isNaN(v) ? '-' : `${(v * 100).toFixed(1)}%`;
    const sgn = v => v == null || isNaN(v) ? '-' : `${v > 0 ? '+' : ''}${GT.pts(v)}`;
    const recText = r => `${r.w}-${r.l}${r.t ? '-' + r.t : ''}`;
    const mgrCell = (n, season) => {
        const o = b.byName[String(n).toLowerCase()];
        return `<a class="team-cell" href="${url(`pages/managers/overview.html?m=${o ? o.id : ''}${season ? `&season=${season}` : ''}`)}"><img src="${GT.logo(n)}" alt=""><b>${esc(n)}</b></a>`;
    };
    const playerCell = (pid, n) => pid > 0 ? `<a href="${url(`pages/players/stats.html?id=${pid}`)}"><b>${esc(n)}</b></a>` : `<b>${esc(n)}</b>`;

    // ---------------------------------------------------------------- shared data: every team game
    const games = await GT.query(`
        SELECT m.game_id AS gameId, m.season, m.week, m.season_period AS period, t.owner_id AS id, o.display_name AS mgr,
               t.opponent_owner_id AS oppId, x.display_name AS opp, t.team_score AS pf, t.opponent_score AS pa,
               t.score_rank_on_week AS rank, t.bench_score AS bench
        FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id
        JOIN owners o ON o.owner_id = t.owner_id LEFT JOIN owners x ON x.owner_id = t.opponent_owner_id
        WHERE t.team_score IS NOT NULL ORDER BY m.season, m.week`);
    const weekPool = {};                                   // every score that week, for all-play
    games.forEach(g => { (weekPool[`${g.season}|${g.week}`] = weekPool[`${g.season}|${g.week}`] || []).push(g.pf); });
    games.forEach(g => {
        const pool = weekPool[`${g.season}|${g.week}`];
        g.apW = pool.filter(v => v < g.pf).length + (pool.filter(v => v === g.pf).length - 1) / 2;
        g.apN = pool.length - 1;
    });
    const periodOf = {};                                   // season|week|owner -> period, for lineup rows
    games.forEach(g => { periodOf[`${g.season}|${g.week}|${g.id}`] = g.period; });
    const allSeasons = [...new Set(games.map(g => g.season))].sort((x, y) => y - x);

    // aggregate a list of games into a stat line
    const line = list => {
        const r = { g: list.length, w: 0, l: 0, t: 0, pf: 0, pa: 0, hi: null, lo: null, apW: 0, apN: 0, top3: 0, bench: 0 };
        list.forEach(g => {
            if (g.pf > g.pa) r.w++; else if (g.pf < g.pa) r.l++; else r.t++;
            r.pf += g.pf; r.pa += g.pa || 0; r.apW += g.apW; r.apN += g.apN; r.bench += g.bench || 0;
            if (g.rank && g.rank <= 3) r.top3++;
            r.hi = r.hi == null ? g.pf : Math.max(r.hi, g.pf); r.lo = r.lo == null ? g.pf : Math.min(r.lo, g.pf);
        });
        r.pct = r.g ? (r.w + r.t / 2) / r.g : null; r.diff = r.pf - r.pa; r.ppg = r.g ? r.pf / r.g : null;
        r.papg = r.g ? r.pa / r.g : null; r.ap = r.apN ? r.apW / r.apN : null;
        return r;
    };

    // ---------------------------------------------------------------- views
    // column: [key, label, width %, numeric?, render(row) -> html, csv(row) -> text]
    const C = (k, label, w, num, render, csv) => ({ k, label, w, num, render: render || (r => esc(r[k] ?? '-')), csv: csv || (r => r[k] ?? '') });
    let lineupRows = null, draftRows = null, moveRows = null;
    const lineups = async () => lineupRows || (lineupRows = (await GT.query(`
        SELECT fr.season, fr.week, fr.owner_id AS id, o.display_name AS mgr, frp.player_id AS pid, p.name, p.position AS pos,
               frp.slot_position AS slot, frp.actual_points AS pts, frp.projected_points AS proj, COALESCE(frp.pro_team, p.pro_team) AS nfl
        FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
        JOIN players p ON p.player_id = frp.player_id JOIN owners o ON o.owner_id = fr.owner_id
        WHERE frp.actual_points IS NOT NULL`)).map(r => ({ ...r, period: periodOf[`${r.season}|${r.week}|${r.id}`] || 'None',
                                                          started: r.slot !== 'BE' && r.slot !== 'IR' })));

    const VIEWS = {
        'manager-seasons': {
            label: 'Manager Seasons', filters: ['season', 'period', 'manager', 'min'], minLabel: 'Min games', minDefault: 10, sort: ['ppg', -1],
            note: 'One row per manager per season. All-play % is the record against every team that played that week.',
            cols: [C('season', 'Season', 6, false), C('mgr', 'Manager', 13, false, r => mgrCell(r.mgr, r.season)),
                   C('team', 'Team', 13, false), C('g', 'G', 5, true), C('pct', 'Record', 8, true, r => recText(r), r => recText(r)),
                   C('pctv', 'Win %', 6, true, r => pct(r.pct), r => r.pct), C('pf', 'PF', 8, true, r => f1(r.pf)), C('pa', 'PA', 8, true, r => f1(r.pa)),
                   C('diff', 'Diff', 7, true, r => sgn(r.diff)), C('ppg', 'PF / G', 7, true, r => `<b>${f1(r.ppg)}</b>`, r => r.ppg),
                   C('hi', 'High', 6, true, r => f1(r.hi)), C('ap', 'All-play', 7, true, r => pct(r.ap), r => r.ap),
                   C('finish', 'Finish', 6, true, r => r.finish ? ord(r.finish) : '-')],
            rows: f => {
                const groups = {};
                games.filter(g => inRange(g.season, f) && inPeriod(g.period, f) && (!f.manager || g.id === f.manager))
                    .forEach(g => { (groups[`${g.season}|${g.id}`] = groups[`${g.season}|${g.id}`] || []).push(g); });
                return Object.values(groups).map(list => {
                    const g0 = list[0], r = line(list);
                    return { ...r, pctv: r.pct, season: g0.season, mgr: g0.mgr, team: GT.teamName(b, g0.mgr, g0.season), finish: b.finish[`${g0.season}-${g0.id}`] };
                }).filter(r => r.g >= (f.min || 0));
            }
        },
        'manager-careers': {
            label: 'Manager Careers', filters: ['season', 'period', 'min'], minLabel: 'Min games', minDefault: 25, sort: ['pctv', -1],
            note: 'Every game in the chosen seasons added up per manager. Titles and average finish use final standings.',
            cols: [C('mgr', 'Manager', 12, false, r => mgrCell(r.mgr, 'career')), C('seasons', 'Seasons', 7, true), C('g', 'G', 5, true),
                   C('pct', 'Record', 9, true, r => recText(r), r => recText(r)), C('pctv', 'Win %', 7, true, r => pct(r.pct), r => r.pct),
                   C('pf', 'PF', 9, true, r => f1(r.pf)), C('pa', 'PA', 9, true, r => f1(r.pa)), C('diff', 'Diff', 8, true, r => sgn(r.diff)),
                   C('ppg', 'PF / G', 7, true, r => `<b>${f1(r.ppg)}</b>`, r => r.ppg), C('hi', 'High', 7, true, r => f1(r.hi)),
                   C('ap', 'All-play', 7, true, r => pct(r.ap), r => r.ap), C('titles', 'Titles', 6, true),
                   C('avgFin', 'Avg fin', 7, true, r => r.avgFin == null ? '-' : r.avgFin.toFixed(1))],
            rows: f => {
                const groups = {};
                games.filter(g => inRange(g.season, f) && inPeriod(g.period, f)).forEach(g => { (groups[g.id] = groups[g.id] || []).push(g); });
                return Object.entries(groups).map(([id, list]) => {
                    const r = line(list), seasons = [...new Set(list.map(g => g.season))];
                    const places = seasons.map(s => b.finish[`${s}-${id}`]).filter(Boolean);
                    return { ...r, pctv: r.pct, mgr: list[0].mgr, seasons: seasons.length, titles: places.filter(p => p === 1).length,
                             avgFin: places.length ? places.reduce((a, p) => a + p, 0) / places.length : null };
                }).filter(r => r.g >= (f.min || 0));
            }
        },
        'games': {
            label: 'Games', filters: ['season', 'period', 'manager', 'result'], sort: ['pf', -1],
            note: 'Every team score. Click a row for the game center.',
            cols: [C('season', 'Season', 6, false), C('week', 'Week', 6, true), C('round', 'Round', 15, false),
                   C('mgr', 'Manager', 14, false, r => mgrCell(r.mgr, r.season)), C('opp', 'Opponent', 14, false, r => r.opp ? mgrCell(r.opp, r.season) : '-'),
                   C('pf', 'PF', 8, true, r => `<b>${f1(r.pf)}</b>`), C('pa', 'PA', 8, true, r => f1(r.pa)), C('margin', 'Margin', 8, true, r => sgn(r.margin)),
                   C('res', 'Result', 6, false, r => `<span class="${r.res === 'W' ? 'win' : r.res === 'L' ? 'loss' : ''}">${r.res}</span>`),
                   C('rank', 'Wk rank', 7, true, r => r.rank ? ord(r.rank) : '-'), C('bench', 'Bench', 8, true, r => f1(r.bench))],
            href: r => url(`pages/past-seasons/game-center.html?id=${r.gameId}`),
            rows: f => games.filter(g => inRange(g.season, f) && inPeriod(g.period, f) && (!f.manager || g.id === f.manager))
                .map(g => ({ ...g, round: GT.periodLabel(g.period, g.week).replace(/ W\d+$/, ''), margin: g.pf - g.pa,
                             res: g.pf > g.pa ? 'W' : g.pf < g.pa ? 'L' : 'T' }))
                .filter(r => !f.result || r.res === f.result)
        },
        'head-to-head': {
            label: 'Head to Head', filters: ['season', 'period', 'manager', 'min'], minLabel: 'Min games', sort: ['g', -1],
            note: 'Every pairing of managers. Pick a manager to see one rivalry list.',
            cols: [C('mgr', 'Manager', 17, false, r => mgrCell(r.mgr)), C('opp', 'Opponent', 17, false, r => mgrCell(r.opp)),
                   C('g', 'G', 7, true), C('pct', 'Record', 10, true, r => recText(r), r => recText(r)), C('pctv', 'Win %', 8, true, r => pct(r.pct), r => r.pct),
                   C('ppg', 'PF / G', 10, true, r => f1(r.ppg)), C('papg', 'PA / G', 10, true, r => f1(r.papg)),
                   C('margin', 'Avg margin', 9, true, r => sgn(r.margin)), C('lastKey', 'Last met', 12, true, r => r.last, r => r.last)],
            rows: f => {
                const groups = {};
                games.filter(g => g.oppId && inRange(g.season, f) && inPeriod(g.period, f) && (!f.manager || g.id === f.manager))
                    .forEach(g => { (groups[`${g.id}|${g.oppId}`] = groups[`${g.id}|${g.oppId}`] || []).push(g); });
                return Object.values(groups).map(list => {
                    const r = line(list), z = list[list.length - 1];
                    return { ...r, pctv: r.pct, mgr: z.mgr, opp: z.opp, margin: r.g ? r.diff / r.g : null,
                             lastKey: z.season * 100 + z.week, last: `${z.season} W${z.week}` };
                }).filter(r => r.g >= (f.min || 0));
            }
        },
        'player-seasons': {
            label: 'Player Seasons', filters: ['season', 'period', 'manager', 'pos', 'q', 'min'], minLabel: 'Min starts', sort: ['pts', -1],
            note: 'What each NFL player scored in league lineups: started points only, with every manager who started the player combined.',
            cols: [C('season', 'Season', 6, false), C('name', 'Player', 20, false, r => playerCell(r.pid, r.name)), C('pos', 'Pos', 6, false),
                   C('mgrs', 'Started by', 18, false), C('starts', 'Starts', 7, true), C('pts', 'Points', 9, true, r => `<b>${f1(r.pts)}</b>`),
                   C('pps', 'Per start', 8, true, r => f1(r.pps)), C('best', 'Best', 8, true, r => f1(r.best)),
                   C('proj', 'Projected', 9, true, r => f1(r.proj)), C('vsProj', '+/- proj', 9, true, r => sgn(r.vsProj))],
            async: true,
            rows: async f => {
                const groups = {};
                (await lineups()).filter(r => r.started && inRange(r.season, f) && inPeriod(r.period, f) && (!f.manager || r.id === f.manager) && posOk(r.pos, f) && nameOk(r.name, f))
                    .forEach(r => { (groups[`${r.season}|${r.pid}`] = groups[`${r.season}|${r.pid}`] || []).push(r); });
                return Object.values(groups).map(list => {
                    const z = list[0], pts = list.reduce((t, r) => t + r.pts, 0), proj = list.reduce((t, r) => t + (r.proj || 0), 0);
                    return { season: z.season, pid: z.pid, name: z.name, pos: z.pos, mgrs: [...new Set(list.map(r => r.mgr))].join(', '),
                             starts: list.length, pts, pps: pts / list.length, best: Math.max(...list.map(r => r.pts)), proj, vsProj: pts - proj };
                }).filter(r => r.starts >= (f.min || 0));
            }
        },
        'player-games': {
            label: 'Player Games', filters: ['season', 'period', 'manager', 'pos', 'q', 'lineup'], sort: ['pts', -1],
            note: 'Every player in every league lineup, week by week. Use Lineup to include the bench.',
            cols: [C('season', 'Season', 6, false), C('week', 'Week', 6, true), C('name', 'Player', 22, false, r => playerCell(r.pid, r.name)),
                   C('pos', 'Pos', 6, false), C('slot', 'Slot', 7, false), C('mgr', 'Manager', 17, false, r => mgrCell(r.mgr, r.season)),
                   C('pts', 'Points', 9, true, r => `<b>${f1(r.pts)}</b>`), C('proj', 'Projected', 9, true, r => f1(r.proj)),
                   C('vsProj', '+/- proj', 9, true, r => sgn(r.vsProj)), C('nfl', 'NFL', 9, false)],
            async: true,
            rows: async f => (await lineups()).filter(r => inRange(r.season, f) && inPeriod(r.period, f) && (!f.manager || r.id === f.manager)
                    && posOk(r.pos, f) && nameOk(r.name, f) && (f.lineup === 'all' || (f.lineup === 'bench' ? !r.started : r.started)))
                .map(r => ({ ...r, vsProj: r.proj == null ? null : r.pts - r.proj }))
        },
        'drafts': {
            label: 'Drafts', filters: ['season', 'manager', 'pos', 'q', 'round'], sort: ['pick', 1],
            note: 'Every draft pick, with what the player then scored in that manager\'s starting lineup that season.',
            cols: [C('season', 'Season', 6, false), C('pick', 'Pick', 6, true), C('round', 'Round', 6, true),
                   C('mgr', 'Manager', 16, false, r => mgrCell(r.mgr, r.season)), C('name', 'Player', 24, false, r => playerCell(r.pid, r.name)),
                   C('pos', 'Pos', 6, false), C('nfl', 'NFL', 7, false), C('starts', 'Starts', 9, true),
                   C('pts', 'Pts started', 10, true, r => `<b>${f1(r.pts)}</b>`), C('pps', 'Per start', 10, true, r => f1(r.pps))],
            async: true,
            rows: async f => {
                if (!draftRows) {
                    const [picks, teams] = await Promise.all([GT.query(`
                        SELECT t.season, ti.overall_pick AS pick, ti.to_owner_id AS id, o.display_name AS mgr, p.player_id AS pid, p.name,
                               p.position AS pos, p.pro_team AS nfl
                        FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.transaction_id
                        JOIN players p ON p.player_id = ti.player_id JOIN owners o ON o.owner_id = ti.to_owner_id
                        WHERE t.type = 'DRAFT' AND ti.item_type = 'DRAFT'`), GT.query('SELECT season, num_teams AS n FROM seasons')]);
                    const nTeams = Object.fromEntries(teams.map(t => [t.season, t.n]));
                    const started = {};
                    (await lineups()).filter(r => r.started).forEach(r => {
                        const k = `${r.season}|${r.id}|${r.pid}`, s = started[k] || (started[k] = { starts: 0, pts: 0 });
                        s.starts++; s.pts += r.pts;
                    });
                    draftRows = picks.map(p => {
                        const s = started[`${p.season}|${p.id}|${p.pid}`] || { starts: 0, pts: 0 };
                        return { ...p, round: Math.ceil(p.pick / (nTeams[p.season] || 16)), starts: s.starts, pts: s.pts, pps: s.starts ? s.pts / s.starts : null };
                    });
                }
                return draftRows.filter(r => inRange(r.season, f) && (!f.manager || r.id === f.manager) && posOk(r.pos, f) && nameOk(r.name, f)
                                             && (!f.round || r.round === Number(f.round)));
            }
        },
        'moves': {
            label: 'Roster Moves', filters: ['season', 'manager', 'kind', 'q'], sort: ['net', -1],
            note: 'Pickups, drops and trades with the points each side went on to score (net started points) and the move grade.',
            cols: [C('season', 'Season', 6, false), C('week', 'Week', 6, true), C('mgr', 'Manager', 14, false, r => mgrCell(r.mgr, r.season)),
                   C('kind', 'Move', 8, false, r => esc(r.kind[0] + r.kind.slice(1).toLowerCase())), C('ins', 'Players in', 19, false), C('outs', 'Players out', 19, false),
                   C('netTotal', 'Net pts', 9, true, r => sgn(r.netTotal)), C('net', 'Net started', 11, true, r => `<b>${sgn(r.net)}</b>`),
                   C('gradeKey', 'Grade', 8, true, r => r.grade ? `<b>${r.grade}</b>` : '-', r => r.grade || '')],
            async: true,
            rows: async f => {
                if (!moveRows) moveRows = (await GT.query(`
                    SELECT m.move_id, m.season, m.effective_week AS week, m.owner_id AS id, o.display_name AS mgr, m.kind, m.grade,
                           m.net_total AS netTotal, m.net_started AS net,
                           (SELECT GROUP_CONCAT(p.name, ', ') FROM transaction_move_players mp JOIN players p ON p.player_id = mp.player_id
                             WHERE mp.move_id = m.move_id AND mp.direction = 'IN') AS ins,
                           (SELECT GROUP_CONCAT(p.name, ', ') FROM transaction_move_players mp JOIN players p ON p.player_id = mp.player_id
                             WHERE mp.move_id = m.move_id AND mp.direction = 'OUT') AS outs
                    FROM transaction_moves m JOIN owners o ON o.owner_id = m.owner_id WHERE m.provisional = 0`))
                    .map(r => ({ ...r, gradeKey: r.grade ? 'FDCBA'.indexOf(r.grade) : -1, ins: r.ins || '', outs: r.outs || '' }));
                return moveRows.filter(r => inRange(r.season, f) && (!f.manager || r.id === f.manager) && (!f.kind || r.kind === f.kind)
                                            && nameOk(`${r.ins} ${r.outs}`, f));
            }
        }
    };

    // ---------------------------------------------------------------- filters
    const inRange = (s, f) => s >= f.from && s <= f.to;
    const inPeriod = (p, f) => f.period === 'all' ? true : f.period === 'playoffs' ? PLAYOFF.includes(p) : p === 'Regular';
    const FLEX = ['RB', 'WR', 'TE'];
    const posOk = (pos, f) => !f.pos || (f.pos === 'FLEX' ? FLEX.includes(pos) : pos === f.pos);
    const nameOk = (n, f) => !f.q || String(n).toLowerCase().includes(f.q.toLowerCase());

    const viewKey = VIEWS[param('view')] ? param('view') : 'manager-seasons';
    const view = VIEWS[viewKey];
    const managers = b.owners.slice().sort((x, y) => x.name.localeCompare(y.name));
    const f = { from: allSeasons[allSeasons.length - 1], to: allSeasons[0], period: 'regular', manager: 0, pos: '', q: '', min: view.minDefault || 0, lineup: 'started', result: '', round: '', kind: '' };
    let sort = { key: view.sort[0], dir: view.sort[1] };
    let page = 1;

    SITE.subHeader({ crumbs: [['Stats', url('pages/stats.html')], ['Stat Finder']],      // the dataset is the active tab
                     tabs: Object.entries(VIEWS).map(([k, v]) => ({ label: v.label, href: url(`pages/stat-finder.html?view=${k}`), active: k === viewKey })) });
    SITE.hero({ title: 'Stat Finder', size: 'short', dots: false, image: 'background-15.png',
                meta: [`Every game, season, lineup, draft pick and roster move since ${allSeasons[allSeasons.length - 1]}`] });

    const opt = (v, label, cur) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
    const CONTROLS = {
        season: () => `<label class="sx-f"><span>From</span><select class="select" data-f="from">${allSeasons.slice().reverse().map(s => opt(s, s, f.from)).join('')}</select></label>
                       <label class="sx-f"><span>To</span><select class="select" data-f="to">${allSeasons.map(s => opt(s, s, f.to)).join('')}</select></label>`,
        period: () => `<label class="sx-f"><span>Games</span><select class="select" data-f="period">${opt('regular', 'Regular season', f.period)}${opt('playoffs', 'Playoffs', f.period)}${opt('all', 'All games', f.period)}</select></label>`,
        manager: () => `<label class="sx-f"><span>Manager</span><select class="select" data-f="manager">${opt(0, 'All managers', f.manager)}${managers.map(m => opt(m.id, m.name, f.manager)).join('')}</select></label>`,
        pos: () => `<label class="sx-f"><span>Position</span><select class="select" data-f="pos">${opt('', 'All', f.pos)}${['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'P', 'D/ST', 'HC'].map(p => opt(p, p, f.pos)).join('')}</select></label>`,
        lineup: () => `<label class="sx-f"><span>Lineup</span><select class="select" data-f="lineup">${opt('started', 'Starters', f.lineup)}${opt('bench', 'Bench', f.lineup)}${opt('all', 'Everyone', f.lineup)}</select></label>`,
        result: () => `<label class="sx-f"><span>Result</span><select class="select" data-f="result">${opt('', 'Any', f.result)}${opt('W', 'Wins', f.result)}${opt('L', 'Losses', f.result)}${opt('T', 'Ties', f.result)}</select></label>`,
        round: () => `<label class="sx-f"><span>Round</span><select class="select" data-f="round">${opt('', 'All', f.round)}${Array.from({ length: 20 }, (_, i) => opt(i + 1, i + 1, f.round)).join('')}</select></label>`,
        kind: () => `<label class="sx-f"><span>Move</span><select class="select" data-f="kind">${opt('', 'All', f.kind)}${opt('PICKUP', 'Pickups', f.kind)}${opt('DROP', 'Drops', f.kind)}${opt('TRADE', 'Trades', f.kind)}</select></label>`,
        min: () => `<label class="sx-f"><span>${view.minLabel}</span><select class="select" data-f="min">${[0, 5, 10, 14, 25, 50, 75, 100].map(n => opt(n, n ? `${n}+` : 'Any', f.min)).join('')}</select></label>`,
        q: () => `<label class="sx-f sx-q"><span>Player</span><input type="search" data-f="q" placeholder="Search..." value="${esc(f.q)}" autocomplete="off"></label>`
    };
    content.innerHTML = `<div class="wrap page-pad">
        <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">Stat Finder</div><h2 class="section-title">${esc(view.label)}</h2>
            <p class="section-copy" style="max-width:none">${esc(view.note)}</p></div>
            <button class="btn btn-black" id="sx-csv">Export CSV</button></div>
        <div class="sx-bar">${view.filters.map(k => CONTROLS[k]()).join('')}<button class="sx-reset" id="sx-reset">Reset</button></div>
        <div class="panel sx-panel"><div class="table-scroll"><table class="data-table sx-table">${SITE.cols(...view.cols.map(c => `${c.w}%`))}
            <thead><tr>${view.cols.map(c => `<th class="${c.num ? 'num' : ''} sx-sort" data-k="${c.k}">${esc(c.label)}</th>`).join('')}</tr></thead>
            <tbody id="sx-rows"><tr><td colspan="${view.cols.length}" class="muted">Loading...</td></tr></tbody></table></div>
            <div class="pager" id="pager"></div></div></div>`;

    let rows = [];
    async function refresh() {
        rows = await view.rows(f);
        page = 1; render();
    }
    function sorted() {
        const k = sort.key, d = sort.dir;
        return rows.slice().sort((x, y) => {
            const a = x[k], c = y[k];
            if (a == null && c == null) return 0;
            if (a == null) return 1;
            if (c == null) return -1;
            return (typeof a === 'string' ? a.localeCompare(c) : a - c) * d;
        });
    }
    function render() {
        const list = sorted();
        const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
        page = Math.min(Math.max(1, page), pages);
        const start = (page - 1) * PER_PAGE;
        document.getElementById('sx-rows').innerHTML = list.slice(start, start + PER_PAGE).map(r =>
            `<tr${view.href ? ` class="row-link" data-href="${view.href(r)}"` : ''}>${view.cols.map(c => `<td class="${c.num ? 'num' : ''}${c.k === sort.key ? ' sx-on' : ''}"${c.num ? '' : ` title="${esc(c.csv(r))}"`}>${c.render(r)}</td>`).join('')}</tr>`).join('')
            || `<tr><td colspan="${view.cols.length}" class="muted">Nothing matches these filters.</td></tr>`;
        document.querySelectorAll('.sx-sort').forEach(th => {
            th.classList.toggle('asc', th.dataset.k === sort.key && sort.dir === 1);
            th.classList.toggle('desc', th.dataset.k === sort.key && sort.dir === -1);
        });
        renderPager(list.length, pages, start);
    }
    function renderPager(count, pages, start) {
        const nums = [...new Set([1, pages, ...Array.from({ length: 5 }, (_, i) => page - 2 + i)])].filter(n => n >= 1 && n <= pages).sort((x, y) => x - y);
        let html = '', prev = 0;
        nums.forEach(n => { if (n - prev > 1) html += '<span class="pager-gap">…</span>'; html += `<button data-page="${n}" class="${n === page ? 'on' : ''}">${n}</button>`; prev = n; });
        document.getElementById('pager').innerHTML = count ? `
            <span class="pager-info">${(start + 1).toLocaleString()}-${Math.min(start + PER_PAGE, count).toLocaleString()} of ${count.toLocaleString()}</span>
            <div class="pager-nav"><button data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Prev</button>${html}
                <button data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>Next</button></div>` : '';
        document.querySelectorAll('#pager button[data-page]').forEach(btn => btn.addEventListener('click', () => { page = Number(btn.dataset.page); render(); }));
    }

    // ---------------------------------------------------------------- events
    document.querySelectorAll('.sx-sort').forEach(th => th.addEventListener('click', () => {
        const k = th.dataset.k;
        if (sort.key === k) sort.dir = -sort.dir;
        else sort = { key: k, dir: view.cols.find(c => c.k === k).num ? -1 : 1 };     // numbers start high, text starts A-Z
        page = 1; render();
    }));
    let timer;
    document.querySelectorAll('[data-f]').forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => {
        const k = el.dataset.f;
        f[k] = ['from', 'to', 'manager', 'min'].includes(k) ? Number(el.value) : el.value;
        if (f.from > f.to) { const t = f.from; f.from = f.to; f.to = t; document.querySelector('[data-f="from"]').value = f.from; document.querySelector('[data-f="to"]').value = f.to; }
        clearTimeout(timer); timer = setTimeout(refresh, el.tagName === 'INPUT' ? 200 : 0);
    }));
    document.getElementById('sx-reset').addEventListener('click', () => { location.href = url(`pages/stat-finder.html?view=${viewKey}`); });
    document.getElementById('sx-csv').addEventListener('click', () => {
        const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        const csv = [view.cols.map(c => q(c.label)).join(','), ...sorted().map(r => view.cols.map(c => q(c.csv(r))).join(','))].join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = `grass-touchers-${viewKey}-${f.from}-${f.to}.csv`;
        a.click(); URL.revokeObjectURL(a.href);
    });
    refresh();
})();
