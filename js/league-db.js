/* Browser SQLite access for the GitHub Pages build. */
(function () {
    const DB_URL = window.LEAGUE_DB_URL || '../data/league.db';
    const SQL_WASM_URL = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.wasm';
    let databasePromise;

    function rows(result) {
        if (!result.length) return [];
        const [table] = result;
        return table.values.map(values => Object.fromEntries(
            table.columns.map((column, index) => [column, values[index]])
        ));
    }

    async function openDatabase() {
        if (!databasePromise) {
            databasePromise = (async () => {
                if (typeof initSqlJs !== 'function') {
                    throw new Error('SQLite WASM is not loaded');
                }
                const SQL = await initSqlJs({ locateFile: () => SQL_WASM_URL });
                const response = await fetch(DB_URL);
                if (!response.ok) throw new Error(`Unable to load SQLite database: ${response.status}`);
                return new SQL.Database(new Uint8Array(await response.arrayBuffer()));
            })();
        }
        return databasePromise;
    }

    async function query(sql, params = {}) {
        const database = await openDatabase();
        return rows(database.exec(sql, params));
    }

    // League tiebreak, in order: record, head-to-head among the tied teams,
    // point differential, points for. h2hOf(a, b) returns {w, l, t} for manager a
    // against manager b (or null). Teams level on record are ranked by a
    // mini-league among only the tied teams; teams that never met count as .500.
    // 2019 is the exception: points for comes before point differential.
    function rankByTiebreak(teams, h2hOf, season) {
        const record = t => Number(t.wins) + 0.5 * Number(t.ties || 0);
        const pd = t => Number(t.pointsFor) - Number(t.pointsAgainst);
        const ordered = [];
        [...new Set(teams.map(record))].sort((a, b) => b - a).forEach(level => {
            const group = teams.filter(t => record(t) === level);
            if (group.length > 1) {
                const pct = new Map(group.map(t => {
                    let w = 0, l = 0, tied = 0;
                    group.forEach(o => {
                        if (o === t) return;
                        const r = h2hOf && h2hOf(t.owner, o.owner);
                        if (r) { w += r.w; l += r.l; tied += r.t; }
                    });
                    const games = w + l + tied;
                    return [t, games ? (w + 0.5 * tied) / games : 0.5];
                }));
                const pf = t => Number(t.pointsFor);
                group.sort((a, b) => (pct.get(b) - pct.get(a)) || (Number(season) === 2019
                    ? (pf(b) - pf(a)) || (pd(b) - pd(a))
                    : (pd(b) - pd(a)) || (pf(b) - pf(a))));
            }
            ordered.push(...group);
        });
        return ordered;
    }

    // rows: [{owner, opponent, w, l, t}] -> h2hOf(a, b)
    function h2hLookup(rows) {
        const map = new Map(rows.map(r => [`${r.owner}|${r.opponent}`, { w: Number(r.w), l: Number(r.l), t: Number(r.t) }]));
        return (a, b) => map.get(`${a}|${b}`) || null;
    }

    window.LeagueDb = {
        ready: openDatabase,
        query,
        rankByTiebreak,
        scoreRows: () => query(`
            SELECT
                m.season AS Season,
                m.week AS Week,
                m.season_period AS "Season Period",
                m.game_id AS "Game ID",
                m.league_week AS "League Week",
                team.display_name AS Team,
                opponent.display_name AS Opponent,
                mts.team_score AS "Team Score",
                mts.opponent_score AS "Opponent Score",
                mts.score_diff AS "Score Diff",
                mts.bench_score AS "Bench Score",
                mts.opponent_bench_score AS "Opponent Bench Score",
                mts.bench_score_diff AS "Bench Score Diff",
                mts.score_rank_on_week AS "Score Rank on Week",
                mts.opponent_score_rank_on_week AS "Opponent Score Rank on Week",
                mts.division_score_rank_on_week AS "Division Score Rank on Week",
                mts.opponent_division_score_rank_on_week AS "Opponent Division Score Rank on Week",
                mts.owner_id AS "Team Owner ID",
                mts.opponent_owner_id AS "Opponent Owner ID"
            FROM matchups m
            JOIN matchup_team_stats mts ON mts.game_id = m.game_id
            JOIN owners team ON team.owner_id = mts.owner_id
            JOIN owners opponent ON opponent.owner_id = mts.opponent_owner_id
            ORDER BY m.season, m.week, m.game_id, mts.owner_id
        `),
        gameById: gameId => query(`
            SELECT
                m.season AS Season,
                m.week AS Week,
                m.season_period AS "Season Period",
                m.game_id AS "Game ID",
                m.league_week AS "League Week",
                team.display_name AS Team,
                opponent.display_name AS Opponent,
                mts.team_score AS "Team Score",
                mts.opponent_score AS "Opponent Score",
                mts.score_diff AS "Score Diff",
                mts.bench_score AS "Bench Score",
                mts.opponent_bench_score AS "Opponent Bench Score",
                mts.bench_score_diff AS "Bench Score Diff",
                mts.score_rank_on_week AS "Score Rank on Week",
                mts.opponent_score_rank_on_week AS "Opponent Score Rank on Week",
                mts.division_score_rank_on_week AS "Division Score Rank on Week",
                mts.opponent_division_score_rank_on_week AS "Opponent Division Score Rank on Week"
            FROM matchups m
            JOIN matchup_team_stats mts ON mts.game_id = m.game_id
            JOIN owners team ON team.owner_id = mts.owner_id
            JOIN owners opponent ON opponent.owner_id = mts.opponent_owner_id
            WHERE m.game_id = $gameId
            ORDER BY mts.owner_id
        `, { $gameId: Number(gameId) }),
        divisions: async () => {
            const data = await query(`
                SELECT d.season, d.division_name, o.display_name
                FROM divisions d
                JOIN division_members dm ON dm.division_id = d.division_id
                JOIN owners o ON o.owner_id = dm.owner_id
                ORDER BY d.season, d.division_id, dm.owner_id
            `);
            const divisions = {};
            data.forEach(row => {
                const season = String(row.season);
                divisions[season] ||= {};
                divisions[season][row.division_name] ||= [];
                divisions[season][row.division_name].push(row.display_name);
            });
            return divisions;
        },
        placements: async () => {
            const data = await query(`
                SELECT fp.season, fp.place, o.display_name AS team, fp.note
                FROM final_placements fp
                LEFT JOIN owners o ON o.owner_id = fp.owner_id
                ORDER BY fp.season, fp.place
            `);
            const seasons = {};
            data.forEach(row => {
                seasons[row.season] ||= { year: row.season, placements: [] };
                seasons[row.season].placements.push({
                    place: row.place,
                    team: `${row.team || ''}${row.note || ''}`
                });
            });
            return { seasonPlacements: Object.values(seasons) };
        },
        accolades: async () => {
            const data = await query(`
                SELECT a.season AS year, a.award, o.display_name AS winner
                FROM accolades a
                LEFT JOIN owners o ON o.owner_id = a.owner_id
                ORDER BY a.season, a.accolade_id
            `);
            const seasons = {};
            data.forEach(row => {
                seasons[row.year] ||= { year: row.year, results: [] };
                seasons[row.year].results.push({ award: row.award, winner: row.winner || '' });
            });
            return { awards: Object.values(seasons) };
        },
        teamAbbreviations: async () => {
            const logoByOwner = {
                Anthony: 'anthony', Brennan: 'brennan', Caty: 'caty', Cubby: 'cubby', Devin: 'devin',
                Gabe: 'gabe', Jeffrey: 'jeffrey', Jon: 'jon', Melanie: 'melanie',
                Patric: 'patric', Peter: 'peter', Sam: 'sam', Tucker: 'tucker'
            };
            const owners = await query(`
                SELECT o.owner_id, o.display_name,
                       MIN(m.season) AS first_season, MAX(m.season) AS last_season
                FROM owners o
                LEFT JOIN matchup_team_stats mts ON mts.owner_id = o.owner_id
                LEFT JOIN matchups m ON m.game_id = mts.game_id
                GROUP BY o.owner_id, o.display_name ORDER BY o.display_name
            `);
            return { teams: owners.map(owner => ({
                name: owner.display_name,
                abbreviations: {
                    FFL: logoByOwner[owner.display_name] || 'default',
                    FirstSeason: owner.first_season || 2026,
                    LastSeason: owner.last_season || 'Active',
                    FranchiseID: owner.owner_id
                }
            })) };
        },
        // Every NFL game of one week (ESPN scoreboard, see python/scrape_nfl_games.py).
        nflGames: (season, week) => query(`
            SELECT game_id, status, completed, home_team, away_team, home_score, away_score
            FROM nfl_games WHERE season = $season AND week = $week`, { $season: Number(season), $week: Number(week) }),
        rosterRules: () => query(`
            SELECT season AS Season, qb AS QB, rb AS RB, wr AS WR, te AS TE,
                   flex AS FLEX, dst AS "D/ST", k AS K, p AS P, hc AS HC,
                   bench AS BE, ir AS IR, total_slots
            FROM roster_rules ORDER BY season
        `),
        owners: () => query('SELECT owner_id, display_name FROM owners ORDER BY display_name'),
        fantasyRoster: (season, week) => query(`
            SELECT fr.team_id, fr.team_name, o.display_name AS owner,
                   p.player_id AS playerId, p.name, p.position,
                   COALESCE(frp.pro_team, p.pro_team) AS proTeam,
                   frp.slot_position AS slotPosition, frp.actual_points AS actualPoints,
                   frp.projected_points AS projectedPoints, frp.injury_status AS injuryStatus
            FROM fantasy_rosters fr
            JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
            JOIN players p ON p.player_id = frp.player_id
            LEFT JOIN owners o ON o.owner_id = fr.owner_id
            WHERE fr.season = $season AND fr.week = $week
            ORDER BY fr.team_id, frp.slot_position, p.name
        `, { $season: season, $week: week }).then(rows => {
            const teams = {};
            rows.forEach(row => {
                teams[row.team_id] ||= {
                    team_id: row.team_id,
                    team_name: row.team_name,
                    owner: row.owner,
                    roster: []
                };
                teams[row.team_id].roster.push(row);
            });
            return { year: season, week, teams: Object.values(teams) };
        }),
        leagueRosterPlayers: () => query(`
            SELECT o.display_name AS Team, fr.season AS Season, p.name AS Player
            FROM fantasy_rosters fr
            JOIN owners o ON o.owner_id = fr.owner_id
            JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
            JOIN players p ON p.player_id = frp.player_id
            ORDER BY fr.season, o.display_name, p.name
        `),
        dci: async () => {
            const data = await query(`
                SELECT c.name, c.abbreviation, c.class, c.seasons_marched,
                       GROUP_CONCAT(o.display_name, ', ') AS members
                FROM dci_corps c
                LEFT JOIN dci_corps_members cm ON cm.corps_id = c.corps_id
                LEFT JOIN owners o ON o.owner_id = cm.owner_id
                GROUP BY c.corps_id ORDER BY c.corps_id
            `);
            const result = { DCI_Corps: { World_Class: [], Open_Class: [], All_Age: [] } };
            data.forEach(row => {
                const group = ['World_Class', 'All_Age'].includes(row.class) ? row.class : 'Open_Class';
                result.DCI_Corps[group].push({
                    name: row.name,
                    abbreviation: row.abbreviation,
                    seasons: row.seasons_marched,
                    members: row.members || ''
                });
            });
            return result;
        },
        seasons: () => query('SELECT season FROM seasons ORDER BY season DESC').then(rows => rows.map(r => r.season)),
        // One row per manager per season: division, regular-season record and
        // points, final placement, postseason bracket, and that season's tiebreak.
        // Feeds the standings-history and manager-history pages.
        seasonTeamRows: () => query(`
            SELECT m.season AS season,
                   d.division_id AS divisionId, d.division_name AS divisionName,
                   o.owner_id AS ownerId, o.display_name AS owner,
                   SUM(CASE WHEN mts.team_score > mts.opponent_score THEN 1 ELSE 0 END) AS wins,
                   SUM(CASE WHEN mts.team_score < mts.opponent_score THEN 1 ELSE 0 END) AS losses,
                   SUM(CASE WHEN mts.team_score = mts.opponent_score THEN 1 ELSE 0 END) AS ties,
                   SUM(mts.team_score) AS pointsFor,
                   SUM(mts.opponent_score) AS pointsAgainst,
                   (SELECT fp.place FROM final_placements fp
                     WHERE fp.season = m.season AND fp.owner_id = o.owner_id) AS place,
                   (SELECT b.bracket_type FROM playoff_qualifiers pq
                      JOIN playoff_brackets b ON b.bracket_id = pq.bracket_id
                     WHERE pq.season = m.season AND pq.owner_id = o.owner_id) AS bracketType,
                   (SELECT pr.tiebreak FROM playoff_rules pr WHERE pr.season = m.season) AS tiebreak
            FROM matchup_team_stats mts
            JOIN matchups m ON m.game_id = mts.game_id
            JOIN owners o ON o.owner_id = mts.owner_id
            JOIN division_members dm ON dm.owner_id = o.owner_id
            JOIN divisions d ON d.division_id = dm.division_id AND d.season = m.season
            WHERE m.season_period = 'Regular'
            GROUP BY m.season, o.owner_id
            ORDER BY m.season, d.division_name, o.display_name
        `),
        playoffPicture: async (season) => {
            const [rules, criteria, qualifiers, bracket, placements, standings, divisionStandings, divisionSlots, h2hRows] = await Promise.all([
                query(`SELECT playoff_team_count, qualification_method, regular_season_end_week, notes, tiebreak
                       FROM playoff_rules WHERE season = $season`, { $season: season }),
                query(`SELECT criterion_order, criterion_type, criterion_value, description
                       FROM playoff_rule_criteria WHERE season = $season ORDER BY criterion_order`, { $season: season }),
                query(`SELECT o.display_name AS owner, pq.seed, pq.qualification_reason AS reason,
                              pq.qualification_week AS week, pq.source,
                              b.bracket_name AS bracket, b.bracket_type AS bracketType
                       FROM playoff_qualifiers pq
                       JOIN owners o ON o.owner_id = pq.owner_id
                       LEFT JOIN playoff_brackets b ON b.bracket_id = pq.bracket_id
                       WHERE pq.season = $season ORDER BY b.bracket_type, pq.seed`, { $season: season }),
                query(`SELECT b.bracket_name AS bracket, b.bracket_type AS bracketType,
                              bh.round_number AS roundNumber, bh.slot_in_round AS slotInRound,
                              bh.game_id AS gameId, bh.note,
                              team.display_name AS team, mts.team_score AS teamScore,
                              opponent.display_name AS opponent, mts.opponent_score AS opponentScore
                       FROM bracket_history bh
                       JOIN playoff_brackets b ON b.bracket_id = bh.bracket_id
                       LEFT JOIN matchup_team_stats mts
                              ON mts.game_id = bh.game_id AND mts.owner_id < mts.opponent_owner_id
                       LEFT JOIN owners team ON team.owner_id = mts.owner_id
                       LEFT JOIN owners opponent ON opponent.owner_id = mts.opponent_owner_id
                       WHERE bh.season = $season
                       ORDER BY b.bracket_type, bh.round_number, bh.slot_in_round`, { $season: season }),
                query(`SELECT fp.place, o.display_name AS owner, fp.note
                       FROM final_placements fp
                       LEFT JOIN owners o ON o.owner_id = fp.owner_id
                       WHERE fp.season = $season ORDER BY fp.place`, { $season: season }),
                // Live "if the season ended today" standings, regular season only.
                // Used to show who is actually in playoff position while a season
                // is still in progress, since playoff_qualifiers stays empty until
                // final placements exist.
                query(`SELECT o.display_name AS owner,
                              SUM(CASE WHEN mts.team_score > mts.opponent_score THEN 1 ELSE 0 END) AS wins,
                              SUM(CASE WHEN mts.team_score < mts.opponent_score THEN 1 ELSE 0 END) AS losses,
                              SUM(CASE WHEN mts.team_score = mts.opponent_score THEN 1 ELSE 0 END) AS ties,
                              SUM(mts.team_score) AS pointsFor,
                              SUM(mts.opponent_score) AS pointsAgainst,
                              COUNT(*) AS gamesPlayed
                       FROM matchup_team_stats mts
                       JOIN matchups m ON m.game_id = mts.game_id
                       JOIN owners o ON o.owner_id = mts.owner_id
                       WHERE m.season = $season AND m.season_period = 'Regular'
                       GROUP BY o.owner_id
                       ORDER BY wins DESC, pointsFor DESC`, { $season: season }),
                // Same standings, but grouped by division -- the playoff cutoff is
                // per division in every format except a single-pool season, so an
                // overall ranking can name the wrong teams as "in".
                query(`SELECT d.division_id AS divisionId, d.division_name AS divisionName,
                              o.display_name AS owner,
                              SUM(CASE WHEN mts.team_score > mts.opponent_score THEN 1 ELSE 0 END) AS wins,
                              SUM(CASE WHEN mts.team_score < mts.opponent_score THEN 1 ELSE 0 END) AS losses,
                              SUM(CASE WHEN mts.team_score = mts.opponent_score THEN 1 ELSE 0 END) AS ties,
                              SUM(mts.team_score) AS pointsFor,
                              SUM(mts.opponent_score) AS pointsAgainst,
                              COUNT(*) AS gamesPlayed
                       FROM matchup_team_stats mts
                       JOIN matchups m ON m.game_id = mts.game_id
                       JOIN owners o ON o.owner_id = mts.owner_id
                       JOIN division_members dm ON dm.owner_id = o.owner_id
                       JOIN divisions d ON d.division_id = dm.division_id AND d.season = $season
                       WHERE m.season = $season AND m.season_period = 'Regular'
                       GROUP BY d.division_id, o.owner_id
                       ORDER BY d.division_name, wins DESC, pointsFor DESC`, { $season: season }),
                query(`SELECT division_id AS divisionId, auto_slots AS autoSlots, playin_slots AS playinSlots
                       FROM playoff_division_slots WHERE season = $season`, { $season: season }),
                // Regular-season head-to-head results, for the tiebreak.
                query(`SELECT o.display_name AS owner, opp.display_name AS opponent,
                              SUM(CASE WHEN mts.team_score > mts.opponent_score THEN 1 ELSE 0 END) AS w,
                              SUM(CASE WHEN mts.team_score < mts.opponent_score THEN 1 ELSE 0 END) AS l,
                              SUM(CASE WHEN mts.team_score = mts.opponent_score THEN 1 ELSE 0 END) AS t
                       FROM matchup_team_stats mts
                       JOIN matchups m ON m.game_id = mts.game_id
                       JOIN owners o ON o.owner_id = mts.owner_id
                       JOIN owners opp ON opp.owner_id = mts.opponent_owner_id
                       WHERE m.season = $season AND m.season_period = 'Regular'
                       GROUP BY mts.owner_id, mts.opponent_owner_id`, { $season: season })
            ]);
            // Rank with the league tiebreak (record, head-to-head, point differential,
            // points for). Divisions are ranked separately: the cutoffs are per division.
            const h2hOf = h2hLookup(h2hRows);
            const rankedStandings = rankByTiebreak(standings, h2hOf, season);
            const byDivision = new Map();
            divisionStandings.forEach(r => {
                if (!byDivision.has(r.divisionId)) byDivision.set(r.divisionId, []);
                byDivision.get(r.divisionId).push(r);
            });
            const rankedDivisions = [...byDivision.values()]
                .sort((a, b) => String(a[0].divisionName).localeCompare(String(b[0].divisionName)))
                .flatMap(group => rankByTiebreak(group, h2hOf, season));
            return { rules: rules[0] || null, criteria, qualifiers, bracket, placements, standings: rankedStandings, divisionStandings: rankedDivisions, divisionSlots, h2hOf };
        }
    };
})();
