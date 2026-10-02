/* Recordbook: the Record Book from the public site (public/js/record-book.js), same records and numbers,
   in the Shakuro Style layout. The calculations below are carried over unchanged; only the output differs:
   results are collected per record key and drawn as cards instead of being written into placeholders.
   Sub pages = the old tabs: League Records, Single Game, Single Season, Record vs. Playoffs, Scorigami. */
(async function () {
    const { esc, url } = SITE;
    const page = document.body.dataset.page;
    const content = document.getElementById('content');
    const TAB_LABEL = { 'league-records': 'League Records', 'single-game': 'Single Game', 'single-season': 'Single Season',
                        'record-vs-playoffs': 'Record vs. Playoffs', scorigami: 'Scorigami' };
    SITE.subHeader({ crumbs: [['Recordbook', url('pages/recordbook/league-records.html')], [TAB_LABEL[page]]],
                     tabs: SITE.sectionTabs('recordbook', page) });
    SITE.hero({ title: 'Record Book', size: 'short', dots: false, image: 'background-4.png', meta: [TAB_LABEL[page]] });
    await GT.load();

    // ------------------------------------------------------------------ record cards (static ones from the old page)
    const STATIC = {
        'league-records': [
            ['Wins & Losses', [
                ['mostWinsOverall', 'Most Career Wins', ''],
                ['mostWinsSeason', 'Most Single-Season Wins', ''],
                ['mostLossesOverall', 'Most Career Losses', ''],
                ['mostLossesSeason', 'Most Single-Season Losses', '']]],
            ['Win Percentage', [
                ['bestWinPctOverall', 'Best Career Win %', 'Minimum 20 games played'],
                ['bestWinPctSeason', 'Best Single-Season Win %', 'Minimum 10 games played'],
                ['worstWinPctOverall', 'Worst Career Win %', 'Minimum 20 games played'],
                ['worstWinPctSeason', 'Worst Single-Season Win %', 'Minimum 10 games played']]],
            ['Weekly Performances', [
                ['mostWeeklyTopScores', 'Jack Rigs the League', 'Most times having highest score in a week'],
                ['mostWeeklyTop3Scores', 'Podium King', 'Most times having a score in the top 3 for a week'],
                ['mostWeeklyWorstScores', "There's Always Next Week", 'Most times having the lowest score in a week'],
                ['mostWeeklyBottom3Scores', 'Basement Dweller', 'Most times having a score in the bottom 3 for a week']]],
            ['Champs and Chumps', [
                ['mostChampionships', 'All Down Hill from Here', 'Most wins in the playoffs during the final week of a season'],
                ['mostChumpionships', "There's Always Next Year", 'Most losses in the losers bracket during the final week of a season'],
                ['mostChampionshipAppearances', 'Someone Needs to be 2nd', 'Most times playing in the championship game'],
                ['mostChumpionshipAppearances', 'Holy Shit', 'Most times playing in the chumpionship game']]],
            ['Streaks', [
                ['longestWinStreak', 'Longest Win Streak', 'Most consecutive weeks with a win (across seasons)'],
                ['longestLosingStreak', 'Longest Losing Streak', 'Most consecutive weeks with a loss (across seasons)'],
                ['longest150PlusStreak', 'Longest 150+ Point Streak', 'Most consecutive games with 150+ points scored'],
                ['longestUnder100Streak', 'Sub 100 Point Streak', 'Most consecutive games scoring under 100 points']]]
        ],
        'single-game': [
            ['Single Game Records', [
                ['highestScore', 'Something is Rigged...', 'Highest single game score by a team all-time'],
                ['lowestScore', 'How Low Can You Go?', 'Lowest single game score by a team all-time'],
                ['largestBlowout', 'On to the Next One', 'Largest point diff between two teams in a single game'],
                ['closestMatchup', 'QB Kneel', 'Smallest point diff between two teams in a single game']]]
        ],
        'single-season': [
            ['Single Season Records', [
                ['highestPointTotal', 'Offensive Powerhouse', 'Most points scored in a single season'],
                ['lowestPointTotal', 'Offensive Struggles', 'Fewest points scored in a single season'],
                ['highestPointDiff', 'Dominant Season', 'Highest point differential in a single season'],
                ['lowestPointDiff', 'Uphill Battle', 'Lowest point differential in a single season']]],
            ['Players', [
                ['mostUniquePlayersOverall', 'The Collector', 'Most different players used across all seasons (min 20 games played)'],
                ['mostUniquePlayersSeason', 'The Gods Shun Thee', 'Most different players used in a single season (min 10 games played)'],
                ['fewestUniquePlayersOverall', 'The Minimalist', 'Fewest different players used across all seasons (min 20 games)'],
                ['fewestUniquePlayersSeason', 'Raw Dogging It', 'Fewest different players used in a single season (min 10 games)']]]
        ]
    };
    const CATEGORIES = { 'league-records': [], 'single-game': [], 'single-season': [] };
    Object.entries(STATIC).forEach(([tab, cats]) => cats.forEach(([title, cards]) =>
        CATEGORIES[tab].push({ title, cards: cards.map(([key, t, s]) => ({ key, title: t, subtitle: s })) })));
    const RESULTS = {};
    const updateRecord = (key, data) => { RESULTS[key] = data; };
    const addRecordCategory = (tab, title, cards, note) => { CATEGORIES[tab].push({ title, cards, note }); };

    let leagueScoreData = [];

    // ================================================================== calculations (unchanged from record-book.js)
    function processLeagueRecords() {
        const teamStats = {};
        const seasonStats = {};
        const weeklyPerformances = {};
        leagueScoreData.forEach(game => {
            if (!game["Team"] || !game["Opponent"]) return;
            const team = game["Team"];
            const opponent = game["Opponent"];
            const teamScore = parseFloat(game["Team Score"]);
            const opponentScore = parseFloat(game["Opponent Score"]);
            const season = game["Season"];
            const week = game["Week"];
            const seasonPeriod = game["Season Period"] || "Regular";
            if (isNaN(teamScore) || isNaN(opponentScore)) return;
            if (!teamStats[team]) {
                teamStats[team] = { wins: 0, losses: 0, winStreak: 0, currentWinStreak: 0, losingStreak: 0, currentLosingStreak: 0,
                    streak150Plus: 0, currentStreak150Plus: 0, streakUnder100: 0, currentStreakUnder100: 0,
                    weeklyTopScores: 0, weeklyTop3Scores: 0, weeklyWorstScores: 0, weeklyBottom3Scores: 0,
                    championships: 0, chumpionships: 0, championshipAppearances: 0, chumpionshipAppearances: 0, gameScores: [] };
            }
            if (!seasonStats[season]) seasonStats[season] = {};
            if (!seasonStats[season][team]) seasonStats[season][team] = { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
            teamStats[team].gameScores.push({ score: teamScore, season, week, opponent, opponentScore });
            seasonStats[season][team].pointsFor += teamScore;
            seasonStats[season][team].pointsAgainst += opponentScore;
            const isWin = teamScore > opponentScore;
            if (isWin) {
                teamStats[team].wins++;
                seasonStats[season][team].wins++;
                teamStats[team].currentWinStreak++;
                teamStats[team].currentLosingStreak = 0;
                teamStats[team].winStreak = Math.max(teamStats[team].winStreak, teamStats[team].currentWinStreak);
            } else if (teamScore < opponentScore) {
                teamStats[team].losses++;
                seasonStats[season][team].losses++;
                teamStats[team].currentLosingStreak++;
                teamStats[team].currentWinStreak = 0;
                teamStats[team].losingStreak = Math.max(teamStats[team].losingStreak, teamStats[team].currentLosingStreak);
            }
            if (teamScore >= 150) {
                teamStats[team].currentStreak150Plus++;
                teamStats[team].streak150Plus = Math.max(teamStats[team].streak150Plus, teamStats[team].currentStreak150Plus);
            } else {
                teamStats[team].currentStreak150Plus = 0;
            }
            if (teamScore < 100) {
                teamStats[team].currentStreakUnder100++;
                teamStats[team].streakUnder100 = Math.max(teamStats[team].streakUnder100, teamStats[team].currentStreakUnder100);
            } else {
                teamStats[team].currentStreakUnder100 = 0;
            }
            const weekKey = `${season}-${week}`;
            if (!weeklyPerformances[weekKey]) weeklyPerformances[weekKey] = [];
            weeklyPerformances[weekKey].push({ team, score: teamScore });
            if (seasonPeriod === "Championship") {
                teamStats[team].championshipAppearances++;
                if (isWin) teamStats[team].championships++;
            } else if (seasonPeriod === "Chumpionship") {
                teamStats[team].chumpionshipAppearances++;
                if (!isWin) teamStats[team].chumpionships++;
            }
        });
        Object.keys(weeklyPerformances).forEach(weekKey => {
            const weekScores = weeklyPerformances[weekKey].sort((a, b) => b.score - a.score);
            if (weekScores.length > 0) {
                teamStats[weekScores[0].team].weeklyTopScores++;
                for (let i = 0; i < Math.min(3, weekScores.length); i++) teamStats[weekScores[i].team].weeklyTop3Scores++;
                teamStats[weekScores[weekScores.length - 1].team].weeklyWorstScores++;
                for (let i = Math.max(0, weekScores.length - 3); i < weekScores.length; i++) teamStats[weekScores[i].team].weeklyBottom3Scores++;
            }
        });
        calculateWinLossRecords(teamStats, seasonStats);
        calculateWinPercentageRecords(teamStats, seasonStats);
        calculateWeeklyPerformanceRecords(teamStats);
        calculateChampionshipRecords(teamStats);
        calculateStreakRecords(teamStats);
        calculateSingleGameRecords();
        calculateSingleSeasonRecords(seasonStats);
    }

    const byValue = (list, dir) => list.sort((a, b) => dir === 'high' ? b.value - a.value : a.value - b.value).slice(0, 3);
    const perSeason = (seasonStats, fn) => {
        const out = [];
        Object.entries(seasonStats).forEach(([season, teams]) => Object.entries(teams).forEach(([team, stats]) => {
            const v = fn(stats); if (v !== undefined) out.push({ team: `${team} (${season})`, value: v });
        }));
        return out;
    };
    function calculateWinLossRecords(teamStats, seasonStats) {
        updateRecord('mostWinsOverall', byValue(Object.entries(teamStats).map(([team, s]) => ({ team, value: s.wins })), 'high'));
        updateRecord('mostWinsSeason', byValue(perSeason(seasonStats, s => s.wins), 'high'));
        updateRecord('mostLossesOverall', byValue(Object.entries(teamStats).map(([team, s]) => ({ team, value: s.losses })), 'high'));
        updateRecord('mostLossesSeason', byValue(perSeason(seasonStats, s => s.losses), 'high'));
    }
    function calculateWinPercentageRecords(teamStats, seasonStats) {
        const pct = s => (s.wins / (s.wins + s.losses)).toFixed(3).replace(/^0(?=\.)/, '');
        const career = Object.entries(teamStats).filter(([, s]) => s.wins + s.losses >= 10).map(([team, s]) => ({ team, value: pct(s) }));
        const season = perSeason(seasonStats, s => s.wins + s.losses >= 10 ? pct(s) : undefined);
        updateRecord('bestWinPctOverall', career.slice().sort((a, b) => parseFloat(b.value) - parseFloat(a.value)).slice(0, 3));
        updateRecord('bestWinPctSeason', season.slice().sort((a, b) => parseFloat(b.value) - parseFloat(a.value)).slice(0, 3));
        updateRecord('worstWinPctOverall', career.slice().sort((a, b) => parseFloat(a.value) - parseFloat(b.value)).slice(0, 3));
        updateRecord('worstWinPctSeason', season.slice().sort((a, b) => parseFloat(a.value) - parseFloat(b.value)).slice(0, 3));
    }
    function calculateStreakRecords(teamStats) {
        const top = field => byValue(Object.entries(teamStats).map(([team, s]) => ({ team, value: s[field] })), 'high');
        updateRecord('longestWinStreak', top('winStreak'));
        updateRecord('longestLosingStreak', top('losingStreak'));
        updateRecord('longest150PlusStreak', top('streak150Plus'));
        updateRecord('longestUnder100Streak', top('streakUnder100'));
    }
    function calculateWeeklyPerformanceRecords(teamStats) {
        const top = field => byValue(Object.entries(teamStats).map(([team, s]) => ({ team, value: s[field] })), 'high');
        updateRecord('mostWeeklyTopScores', top('weeklyTopScores'));
        updateRecord('mostWeeklyTop3Scores', top('weeklyTop3Scores'));
        updateRecord('mostWeeklyWorstScores', top('weeklyWorstScores'));
        updateRecord('mostWeeklyBottom3Scores', top('weeklyBottom3Scores'));
    }
    function calculateChampionshipRecords(teamStats) {
        const top = field => byValue(Object.entries(teamStats).map(([team, s]) => ({ team, value: s[field] })), 'high');
        updateRecord('mostChampionships', top('championships'));
        updateRecord('mostChumpionships', top('chumpionships'));
        updateRecord('mostChampionshipAppearances', top('championshipAppearances'));
        updateRecord('mostChumpionshipAppearances', top('chumpionshipAppearances'));
    }
    async function calculatePlayerRecords() {
        try {
            const rosterData = await LeagueDb.leagueRosterPlayers();
            const teamPlayers = {}, seasonPlayers = {};
            rosterData.forEach(entry => {
                const team = entry.Team, season = entry.Season, player = entry.Player;
                if (!team || !season || !player) return;
                if (!teamPlayers[team]) teamPlayers[team] = new Set();
                teamPlayers[team].add(player);
                const seasonKey = `${team}-${season}`;
                if (!seasonPlayers[seasonKey]) seasonPlayers[seasonKey] = { team, season, players: new Set() };
                seasonPlayers[seasonKey].players.add(player);
            });
            // minimums the subtitles promise (20 games overall, 10 in a season)
            const gamesByTeam = {}, gamesByTeamSeason = {};
            leagueScoreData.forEach(g => {
                if (!g.Team || !g.Opponent || g.Opponent.toLowerCase() === 'bye') return;
                gamesByTeam[g.Team] = (gamesByTeam[g.Team] || 0) + 1;
                const key = `${g.Team}-${g.Season}`;
                gamesByTeamSeason[key] = (gamesByTeamSeason[key] || 0) + 1;
            });
            Object.keys(teamPlayers).forEach(team => { if ((gamesByTeam[team] || 0) < 20) delete teamPlayers[team]; });
            Object.keys(seasonPlayers).forEach(key => { if ((gamesByTeamSeason[key] || 0) < 10) delete seasonPlayers[key]; });
            const overall = () => Object.entries(teamPlayers).map(([team, players]) => ({ team, value: players.size }));
            const season = () => Object.values(seasonPlayers).map(e => ({ team: `${e.team} (${e.season})`, value: e.players.size }));
            updateRecord('mostUniquePlayersOverall', byValue(overall(), 'high'));
            updateRecord('fewestUniquePlayersOverall', byValue(overall(), 'low'));
            updateRecord('mostUniquePlayersSeason', byValue(season(), 'high'));
            updateRecord('fewestUniquePlayersSeason', byValue(season(), 'low'));
        } catch (error) {
            console.error('Error calculating player records:', error);
            ['mostUniquePlayersOverall', 'fewestUniquePlayersOverall', 'mostUniquePlayersSeason', 'fewestUniquePlayersSeason'].forEach(k => updateRecord(k, []));
        }
    }
    function calculateSingleGameRecords() {
        const allScores = [], processedBlowouts = new Set(), processedCloseGames = new Set(), allBlowouts = [], allCloseGames = [];
        leagueScoreData.forEach(game => {
            if (!game["Team"] || !game["Opponent"]) return;
            const teamScore = parseFloat(game["Team Score"]);
            const opponentScore = parseFloat(game["Opponent Score"]);
            const scoreDiff = Math.abs(teamScore - opponentScore);
            const gameId = game["Game ID"];
            if (isNaN(teamScore) || isNaN(opponentScore)) return;
            allScores.push({ team: game["Team"], value: teamScore.toFixed(2) });
            if (gameId && !processedBlowouts.has(gameId)) {
                processedBlowouts.add(gameId);
                const winner = teamScore > opponentScore ? game["Team"] : game["Opponent"];
                const loser = teamScore > opponentScore ? game["Opponent"] : game["Team"];
                allBlowouts.push({ team: `${winner} vs ${loser}`, value: scoreDiff.toFixed(2) });
                if (scoreDiff < 50 && !processedCloseGames.has(gameId)) {
                    processedCloseGames.add(gameId);
                    allCloseGames.push({ team: `${winner} vs ${loser}`, value: scoreDiff.toFixed(2) });
                }
            }
        });
        allScores.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
        updateRecord('highestScore', allScores.slice(0, 3));
        allScores.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
        updateRecord('lowestScore', allScores.slice(0, 3));
        allBlowouts.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
        updateRecord('largestBlowout', allBlowouts.slice(0, 3));
        allCloseGames.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
        updateRecord('closestMatchup', allCloseGames.slice(0, 3));
    }
    function calculateSingleSeasonRecords(seasonStats) {
        const pointTotals = [], pointDiffs = [];
        Object.entries(seasonStats).forEach(([season, teams]) => Object.entries(teams).forEach(([team, stats]) => {
            if (stats.wins + stats.losses < 10) return;   // season in progress (or too few games) says nothing
            pointTotals.push({ team: `${team} (${season})`, value: stats.pointsFor.toFixed(2) });
            pointDiffs.push({ team: `${team} (${season})`, value: (stats.pointsFor - stats.pointsAgainst).toFixed(2) });
        }));
        pointTotals.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
        updateRecord('highestPointTotal', pointTotals.slice(0, 3));
        pointTotals.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
        updateRecord('lowestPointTotal', pointTotals.slice(0, 3));
        pointDiffs.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
        updateRecord('highestPointDiff', pointDiffs.slice(0, 3));
        pointDiffs.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
        updateRecord('lowestPointDiff', pointDiffs.slice(0, 3));
    }

    // Single game, by lineup slot (starters only) and bench. Every game the league has a saved lineup for.
    const SLOTS = [['QB', 'QB'], ['RB', 'RB'], ['WR', 'WR'], ['TE', 'TE'], ['FLEX', 'FLEX'], ['K', 'K'], ['P', 'P'], ['D/ST', 'D/ST'], ['HC', 'Head Coach']];
    async function calculatePositionalAndBenchRecords() {
        const [starts, bench, benchTotals] = await Promise.all([
            LeagueDb.query(`SELECT fr.season, fr.week, o.display_name AS owner, frp.slot_position AS slot, p.name, frp.actual_points AS pts
                            FROM fantasy_roster_players frp JOIN fantasy_rosters fr ON fr.roster_id = frp.roster_id
                            JOIN owners o ON o.owner_id = fr.owner_id JOIN players p ON p.player_id = frp.player_id
                            WHERE frp.actual_points IS NOT NULL AND frp.slot_position NOT IN ('BE', 'IR')`),
            LeagueDb.query(`SELECT fr.season, fr.week, o.display_name AS owner, p.name, frp.actual_points AS pts
                            FROM fantasy_roster_players frp JOIN fantasy_rosters fr ON fr.roster_id = frp.roster_id
                            JOIN owners o ON o.owner_id = fr.owner_id JOIN players p ON p.player_id = frp.player_id
                            WHERE frp.actual_points IS NOT NULL AND frp.slot_position = 'BE'`),
            LeagueDb.query(`SELECT m.season, m.week, o.display_name AS owner, t.bench_score AS pts
                            FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                            WHERE t.bench_score IS NOT NULL`)
        ]);
        const label = x => `${x.owner} (${x.season} Wk ${x.week})${x.name ? ` - ${x.name}` : ''}`;
        const ranked = (list, better) => topN(list.map(x => ({ team: label(x), raw: x.pts, value: x.pts.toFixed(1) })), better);
        const high = [], low = [];
        SLOTS.forEach(([slot, name]) => {
            const list = starts.filter(x => x.slot === slot);
            const key = slot.replace('/', '');
            updateRecord(`posHigh${key}`, ranked(list, 'high'));
            updateRecord(`posLow${key}`, ranked(list, 'low'));
            high.push({ key: `posHigh${key}`, title: `Highest ${name} Score`, subtitle: `Most points by a starter in the ${slot} slot` });
            low.push({ key: `posLow${key}`, title: `Lowest ${name} Score`, subtitle: `Fewest points by a starter in the ${slot} slot` });
        });
        addRecordCategory('single-game', 'Highest by Position', high);
        addRecordCategory('single-game', 'Lowest by Position', low);
        updateRecord('benchHighTotal', ranked(benchTotals, 'high'));
        updateRecord('benchLowTotal', ranked(benchTotals, 'low'));
        updateRecord('benchHighPlayer', ranked(bench, 'high'));
        updateRecord('benchLowPlayer', ranked(bench, 'low'));
        addRecordCategory('single-game', 'Bench', [
            { key: 'benchHighTotal', title: 'Wrong Guys Started', subtitle: 'Highest bench total in a single game' },
            { key: 'benchLowTotal', title: 'Empty Bench', subtitle: 'Lowest bench total in a single game' },
            { key: 'benchHighPlayer', title: 'Best Seat on the Bench', subtitle: 'Most points by a single bench player' },
            { key: 'benchLowPlayer', title: 'Good Thing He Sat', subtitle: 'Fewest points by a single bench player' }
        ]);
    }

    // Transactions and luck. Completed seasons only; grades come from python/transaction_grades.py.
    const GRADE_POINTS = { A: 4, B: 3, C: 2, D: 1, F: 0 };
    const topN = (list, better) => [...list].sort((a, b) => better === 'high' ? b.raw - a.raw : a.raw - b.raw).slice(0, 3);
    async function calculateTransactionAndLuckRecords() {
        try {
            const [completedRows, moves, playerNames] = await Promise.all([
                LeagueDb.query('SELECT DISTINCT season FROM final_placements'),
                LeagueDb.query(`SELECT m.move_id, m.kind, m.season, m.effective_week, m.grade, m.net_total, o.display_name AS owner
                                FROM transaction_moves m JOIN owners o ON o.owner_id = m.owner_id WHERE m.provisional = 0`),
                LeagueDb.query(`SELECT mp.move_id, mp.direction, p.name FROM transaction_move_players mp JOIN players p ON p.player_id = mp.player_id`)
            ]);
            const completed = new Set(completedRows.map(r => r.season));
            const namesByMove = new Map();
            playerNames.forEach(r => {
                const key = `${r.move_id}|${r.direction}`;
                if (!namesByMove.has(key)) namesByMove.set(key, []);
                namesByMove.get(key).push(r.name);
            });
            const career = new Map(), seasonal = new Map();
            const bucket = (map, key, label) => { if (!map.has(key)) map.set(key, { label, PICKUP: [], TRADE: [], DROP: [] }); return map.get(key); };
            moves.forEach(m => {
                bucket(career, m.owner, m.owner)[m.kind].push(m);
                bucket(seasonal, `${m.owner}|${m.season}`, `${m.owner} (${m.season})`)[m.kind].push(m);
            });
            const gpa = list => { const graded = list.filter(m => m.grade);
                return { n: graded.length, value: graded.length ? graded.reduce((s, m) => s + GRADE_POINTS[m.grade], 0) / graded.length : null }; };
            const countRecord = (map, kind) => [...map.values()].map(b => ({ team: b.label, raw: b[kind].length, value: String(b[kind].length) }));
            const gpaRecord = (map, kind, minGraded) => [...map.values()].map(b => ({ b, g: gpa(b[kind]) })).filter(x => x.g.n >= minGraded)
                .map(x => ({ team: x.b.label, raw: x.g.value, value: x.g.value.toFixed(2) }));
            const set = (key, list, better) => updateRecord(key, topN(list, better));
            // luck: actual wins / wins the weekly score ranks predict, x 100
            const weekSize = {};
            const regular = leagueScoreData.filter(g => g['Season Period'] === 'Regular' && g.Team && g.Opponent &&
                g.Opponent.toLowerCase() !== 'bye' && completed.has(g.Season));
            regular.forEach(g => {
                const w = weekSize[`${g.Season}-${g.Week}`] || (weekSize[`${g.Season}-${g.Week}`] = { rows: 0, maxRank: 0 });
                w.rows += 1;
                w.maxRank = Math.max(w.maxRank, Number(g['Score Rank on Week']) || 0);
            });
            const luckCareer = new Map(), luckSeason = new Map();
            regular.forEach(g => {
                const rank = Number(g['Score Rank on Week']);
                const w = weekSize[`${g.Season}-${g.Week}`];
                const n = Math.max(w.rows, w.maxRank);
                if (!(rank >= 1) || !(n > 1)) return;
                const us = Number(g['Team Score']), them = Number(g['Opponent Score']);
                const win = us > them ? 1 : us === them ? 0.5 : 0;
                const expected = (n - rank) / (n - 1);
                const add = (map, key, label) => {
                    const e = map.get(key) || { label, wins: 0, expected: 0, games: 0, seasons: new Set() };
                    e.wins += win; e.expected += expected; e.games += 1; e.seasons.add(g.Season);
                    map.set(key, e);
                };
                add(luckCareer, g.Team, g.Team);
                add(luckSeason, `${g.Team}|${g.Season}`, `${g.Team} (${g.Season})`);
            });
            const luckList = (map, minGames, minSeasons) => [...map.values()]
                .filter(e => e.games >= minGames && e.seasons.size >= minSeasons && e.expected > 0)
                .map(e => ({ team: e.label, raw: 100 * e.wins / e.expected, value: (100 * e.wins / e.expected).toFixed(1) }));
            const moveList = (kind, side) => moves.filter(m => m.kind === kind).map(m => {
                const names = (namesByMove.get(`${m.move_id}|${side}`) || []).slice(0, 2).join(', ');
                const what = names ? ` - ${names}` : '';
                const shown = kind === 'DROP' ? `${(-m.net_total).toFixed(1)}` : `${m.net_total >= 0 ? '+' : ''}${m.net_total.toFixed(1)}`;
                return { team: `${m.owner} (${m.season} Wk ${m.effective_week})${what}`, raw: m.net_total, value: shown };
            });
            addRecordCategory('league-records', 'Transactions (Full History)', [
                { key: 'txMostPickups', title: 'Waiver Wire Regular', subtitle: 'Most waiver and free-agent pickups' },
                { key: 'txMostTrades', title: 'Deal Maker', subtitle: 'Most trades made' },
                { key: 'txMostDrops', title: 'Cut Happy', subtitle: 'Most players dropped outright' },
                { key: 'txBestPickupGpa', title: 'Waiver Wire Wizard', subtitle: 'Best pickup GPA, career (min 25 graded pickups)' },
                { key: 'txWorstPickupGpa', title: 'Waiver Wire Dud', subtitle: 'Worst pickup GPA, career (min 25 graded pickups)' },
                { key: 'txBestTradeGpa', title: 'Trade Shark', subtitle: 'Best trade GPA, career (min 3 trades)' },
                { key: 'txWorstTradeGpa', title: 'Robbed Blind', subtitle: 'Worst trade GPA, career (min 3 trades)' },
                { key: 'txBestDropGpa', title: 'Ruthless Cutter', subtitle: 'Best drop GPA, career (min 15 graded drops)' },
                { key: 'txWorstDropGpa', title: 'Cut Him Too Soon', subtitle: 'Worst drop GPA, career (min 15 graded drops)' }
            ]);
            addRecordCategory('league-records', 'Luck', [
                { key: 'luckBestCareer', title: 'Charmed Life', subtitle: 'Luckiest career: actual wins vs. wins the weekly scores predict (100 = average, min 3 seasons)' },
                { key: 'luckWorstCareer', title: 'Born Under a Bad Sign', subtitle: 'Unluckiest career (100 = average, min 3 seasons)' }
            ]);
            addRecordCategory('single-season', 'Transactions (Single Season)', [
                { key: 'txMostPickupsSeason', title: 'Always on the Wire', subtitle: 'Most pickups in a single season' },
                { key: 'txMostTradesSeason', title: 'Wheeler Dealer', subtitle: 'Most trades in a single season' },
                { key: 'txMostDropsSeason', title: 'Roster Churn', subtitle: 'Most players dropped outright in a single season' },
                { key: 'txBestPickupGpaSeason', title: 'Wire Genius', subtitle: 'Best pickup GPA in a season (min 8 graded pickups)' },
                { key: 'txWorstPickupGpaSeason', title: 'Wire Disaster', subtitle: 'Worst pickup GPA in a season (min 8 graded pickups)' },
                { key: 'txBestTradeGpaSeason', title: 'Fleeced Them', subtitle: 'Best trade GPA in a season (min 2 trades)' },
                { key: 'txWorstTradeGpaSeason', title: 'Fleeced', subtitle: 'Worst trade GPA in a season (min 2 trades)' }
            ]);
            addRecordCategory('single-season', 'Best & Worst Moves', [
                { key: 'txBestPickupEver', title: 'Best Pickup Ever', subtitle: 'Most rest-of-season points gained on one pickup (added minus dropped)' },
                { key: 'txBestTradeEver', title: 'Best Trade Ever', subtitle: 'Most rest-of-season points gained on one side of a trade' },
                { key: 'txWorstTradeEver', title: 'Worst Trade Ever', subtitle: 'Most rest-of-season points lost on one side of a trade' },
                { key: 'txCostliestDrop', title: 'Costliest Drop', subtitle: 'Dropped a player who then scored the most points for the rest of the regular season' }
            ]);
            addRecordCategory('single-season', 'Luck (Single Season)', [
                { key: 'luckBestSeason', title: 'Charmed Season', subtitle: 'Luckiest season (100 = average, min 10 games)' },
                { key: 'luckWorstSeason', title: 'Cursed Season', subtitle: 'Unluckiest season (100 = average, min 10 games)' }
            ]);
            set('txMostPickups', countRecord(career, 'PICKUP'), 'high');
            set('txMostTrades', countRecord(career, 'TRADE'), 'high');
            set('txMostDrops', countRecord(career, 'DROP'), 'high');
            set('txBestPickupGpa', gpaRecord(career, 'PICKUP', 25), 'high');
            set('txWorstPickupGpa', gpaRecord(career, 'PICKUP', 25), 'low');
            set('txBestTradeGpa', gpaRecord(career, 'TRADE', 3), 'high');
            set('txWorstTradeGpa', gpaRecord(career, 'TRADE', 3), 'low');
            set('txBestDropGpa', gpaRecord(career, 'DROP', 15), 'high');
            set('txWorstDropGpa', gpaRecord(career, 'DROP', 15), 'low');
            set('luckBestCareer', luckList(luckCareer, 0, 3), 'high');
            set('luckWorstCareer', luckList(luckCareer, 0, 3), 'low');
            set('txMostPickupsSeason', countRecord(seasonal, 'PICKUP'), 'high');
            set('txMostTradesSeason', countRecord(seasonal, 'TRADE'), 'high');
            set('txMostDropsSeason', countRecord(seasonal, 'DROP'), 'high');
            set('txBestPickupGpaSeason', gpaRecord(seasonal, 'PICKUP', 8), 'high');
            set('txWorstPickupGpaSeason', gpaRecord(seasonal, 'PICKUP', 8), 'low');
            set('txBestTradeGpaSeason', gpaRecord(seasonal, 'TRADE', 2), 'high');
            set('txWorstTradeGpaSeason', gpaRecord(seasonal, 'TRADE', 2), 'low');
            set('luckBestSeason', luckList(luckSeason, 10, 1), 'high');
            set('luckWorstSeason', luckList(luckSeason, 10, 1), 'low');
            set('txBestPickupEver', moveList('PICKUP', 'IN'), 'high');
            set('txBestTradeEver', moveList('TRADE', 'IN'), 'high');
            set('txWorstTradeEver', moveList('TRADE', 'IN'), 'low');
            set('txCostliestDrop', moveList('DROP', 'OUT'), 'low');   // a drop's net is minus what the player scored afterwards
        } catch (error) {
            console.error('Error calculating transaction records:', error);
        }
    }

    // Lineup skill: FP+ and roster efficiency pooled over regular-season weeks (js/roster-metrics.js). Completed seasons only.
    const LINEUP_NOTE = 'FP+ is the points the starters scored divided by their projected points (100 = right on projection). Efficiency is the points they scored divided by what the best lineup on the roster would have scored, swapping in only bench players who beat a same-position starter. Both are pooled over regular-season weeks; completed seasons only.';
    async function calculateLineupRecords() {
        try {
            const [completedRows, metrics] = await Promise.all([LeagueDb.query('SELECT DISTINCT season FROM final_placements'), RosterMetrics.load()]);
            const completed = new Set(completedRows.map(r => r.season));
            const career = new Map(), seasonal = new Map();
            const add = (map, key, label, m) => { const e = map.get(key) || { label, weeks: [], seasons: new Set() }; e.weeks.push(m); map.set(key, e); return e; };
            leagueScoreData.forEach(g => {
                if (g['Season Period'] !== 'Regular' || !g.Team || !g.Opponent || g.Opponent.toLowerCase() === 'bye' || !completed.has(g.Season)) return;
                const m = metrics.get(`${g.Team}|${g.Season}|${g.Week}`);
                if (!m) return;
                add(career, g.Team, g.Team, m).seasons.add(g.Season);
                add(seasonal, `${g.Team}|${g.Season}`, `${g.Team} (${g.Season})`, m).seasons.add(g.Season);
            });
            const rows = (map, minWeeks, minSeasons, field, fmt) => [...map.values()].map(e => ({ e, p: RosterMetrics.pool(e.weeks) }))
                .filter(x => x.p.weeks >= minWeeks && x.e.seasons.size >= minSeasons && x.p[field] != null)
                .map(x => ({ team: x.e.label, raw: x.p[field], value: fmt(x.p[field]) }));
            const idx = v => v.toFixed(1), pct = v => `${v.toFixed(1)}%`;
            addRecordCategory('league-records', 'Lineup Skill (Full History)', [
                { key: 'fpBestCareer', title: 'Beats the Projections', subtitle: 'Best career FP+ (min 3 seasons)' },
                { key: 'fpWorstCareer', title: 'Missed the Mark', subtitle: 'Worst career FP+ (min 3 seasons)' },
                { key: 'effBestCareer', title: 'Lineup Perfectionist', subtitle: 'Best career efficiency (min 3 seasons)' },
                { key: 'effWorstCareer', title: 'Benched the Wrong Guys', subtitle: 'Worst career efficiency (min 3 seasons)' }
            ], LINEUP_NOTE);
            addRecordCategory('single-season', 'Lineup Skill (Single Season)', [
                { key: 'fpBestSeason', title: 'Overachievers', subtitle: 'Best FP+ in a season (min 10 games)' },
                { key: 'fpWorstSeason', title: 'Underachievers', subtitle: 'Worst FP+ in a season (min 10 games)' },
                { key: 'effBestSeason', title: 'Perfect Lineups', subtitle: 'Best efficiency in a season (min 10 games)' },
                { key: 'effWorstSeason', title: 'Left It on the Bench', subtitle: 'Worst efficiency in a season (min 10 games)' }
            ], LINEUP_NOTE);
            const set = (key, list, better) => updateRecord(key, topN(list, better));
            set('fpBestCareer', rows(career, 0, 3, 'fp', idx), 'high');
            set('fpWorstCareer', rows(career, 0, 3, 'fp', idx), 'low');
            set('effBestCareer', rows(career, 0, 3, 'eff', pct), 'high');
            set('effWorstCareer', rows(career, 0, 3, 'eff', pct), 'low');
            set('fpBestSeason', rows(seasonal, 10, 1, 'fp', idx), 'high');
            set('fpWorstSeason', rows(seasonal, 10, 1, 'fp', idx), 'low');
            set('effBestSeason', rows(seasonal, 10, 1, 'eff', pct), 'high');
            set('effWorstSeason', rows(seasonal, 10, 1, 'eff', pct), 'low');
        } catch (error) {
            console.error('Error calculating lineup records:', error);
        }
    }

    // ================================================================== rendering
    // the record holder's logo: the manager name at the start of the label ("Gabe (2021)", "Jack vs Blake", ...)
    const ownerOf = label => String(label || '').split(/[\s(]/)[0];
    const GPA_KEY = /Gpa/;
    const shown = (key, v) => GPA_KEY.test(key) ? v : String(v).replace(/^([+-]?\d+\.\d)\d$/, (m) => Number(m).toFixed(1));
    // "Owner (2019 Wk 7) - Player" reads better as two short lines in the same row: player, then owner and week
    const nameHTML = d => {
        if (!d) return '--';
        const m = String(d.team).match(/^(.+?) \((\d{4}) Wk (\d+)\) - (.+)$/);
        return m ? `<b class="rb-two">${esc(m[4])}</b><small class="rb-two">${esc(m[1])} · ${m[2]} Wk ${m[3]}</small>` : esc(d.team);
    };
    const recordCard = card => {
        const data = (RESULTS[card.key] || []).map(d => ({ ...d, value: shown(card.key, d.value) }));
        const rows = [0, 1, 2].map(i => {
            const d = data[i];
            return `<li class="${i === 0 ? 'rb-holder' : ''}"><span class="rb-rank">${i + 1}</span>
                ${d ? `<img src="${GT.logo(ownerOf(d.team))}" alt="">` : '<span></span>'}
                <span class="rb-name" title="${esc(d ? d.team : '')}">${nameHTML(d)}</span>
                <span class="rb-value">${esc(d ? d.value : '--')}</span></li>`;
        }).join('');
        return `<div class="rb-card" data-key="${card.key}"><h3 class="rb-title" title="${esc(card.title)}">${esc(card.title)}</h3>
            <p class="rb-sub" title="${esc(card.subtitle || '')}">${esc(card.subtitle || '')}</p><ol class="rb-list">${rows}</ol></div>`;
    };
    function renderRecords(tab) {
        content.innerHTML = `<div class="wrap page-pad">${CATEGORIES[tab].map(cat => `
            <section class="rb-category">
                <div class="eyebrow">${esc(TAB_LABEL[tab])}</div><h2 class="rb-cat-title">${esc(cat.title)}</h2>
                <div class="rb-grid">${cat.cards.map(recordCard).join('')}</div>
                ${cat.note ? `<p class="rb-note">${esc(cat.note)}</p>` : ''}
            </section>`).join('')}</div>`;
    }

    // ------------------------------------------------------------------ Record vs. Playoffs (cumulative matrix)
    // Wins down the side, losses across the top. Every team is followed through every week of every completed season;
    // each record it passes through counts once. A cell's number is how many team-seasons were ever at that record;
    // its colour is the share of them that went on to make the Championship bracket.
    function renderRecordOdds(teamRows, scoreRows) {
        const finished = new Set(teamRows.filter(r => r.place != null).map(r => r.season));
        const madeBracket = new Map(teamRows.filter(r => r.place != null).map(r => [`${r.season}|${r.owner}`, r.bracketType === 'championship']));
        const paths = new Map();
        scoreRows.forEach(g => {
            if (g['Season Period'] !== 'Regular' || !finished.has(g.Season) || !g.Team || !g.Opponent) return;
            if (g.Team.toLowerCase() === 'bye' || g.Opponent.toLowerCase() === 'bye') return;
            const us = Number(g['Team Score']), them = Number(g['Opponent Score']);
            if (Number.isNaN(us) || Number.isNaN(them)) return;
            const key = `${g.Season}|${g.Team}`;
            if (!paths.has(key)) paths.set(key, []);
            paths.get(key).push({ week: g.Week, win: us > them, loss: us < them });
        });
        const cells = new Map();
        let maxWins = 0, maxLosses = 0;
        paths.forEach((games, key) => {
            games.sort((a, b) => a.week - b.week);
            let w = 0, l = 0;
            const seen = new Set(['0-0']);
            games.forEach(g => { if (g.win) w += 1; else if (g.loss) l += 1; seen.add(`${w}-${l}`); });
            const made = madeBracket.get(key) === true;
            seen.forEach(rec => {
                const cell = cells.get(rec) || { n: 0, made: 0 };
                cell.n += 1; if (made) cell.made += 1;
                cells.set(rec, cell);
                const [rw, rl] = rec.split('-').map(Number);
                maxWins = Math.max(maxWins, rw); maxLosses = Math.max(maxLosses, rl);
            });
        });
        if (!paths.size) return '<div class="panel"><p class="muted">No completed seasons yet.</p></div>';
        const losses = Array.from({ length: maxLosses + 1 }, (_, i) => i);
        const wins = Array.from({ length: maxWins + 1 }, (_, i) => maxWins - i);
        const shade = share => `hsl(${Math.round(share * 125)}, 52%, 42%)`;      // red (0%) -> amber -> green (100%)
        const body = wins.map(w => `<tr><th class="ro-side">${w}</th>${losses.map(l => {
            const cell = cells.get(`${w}-${l}`);
            if (!cell) return '<td class="ro-empty"></td>';
            const share = cell.made / cell.n, pct = Math.round(share * 100);
            const tip = `${w}-${l}: reached ${cell.n} time${cell.n === 1 ? '' : 's'}; ${cell.made} of those teams made the Championship bracket (${pct}%)`;
            return `<td class="ro-cell" style="background:${shade(share)}" title="${tip}"><b>${cell.n}</b><span>${pct}%</span></td>`;
        }).join('')}</tr>`).join('');
        return `<section class="rb-category">
            <div class="eyebrow">Every team, every week, every completed season</div><h2 class="rb-cat-title">Record vs. Playoffs</h2>
            <div class="panel" style="margin-top:14px"><div class="table-scroll">
                <table class="ro-table">${SITE.cols('52px', ...losses.map(() => '64px'))}
                    <thead><tr><th class="ro-corner" rowspan="2">Wins ↓</th><th colspan="${losses.length}" class="ro-axis">Losses →</th></tr>
                    <tr>${losses.map(l => `<th>${l}</th>`).join('')}</tr></thead>
                    <tbody>${body}</tbody></table></div>
                <div class="ro-legend"><span>Share that made the Championship bracket:</span><span>0%</span><span class="ro-bar"></span><span>100%</span>
                    <span class="ro-key"><b>N</b> = teams that reached the record</span></div>
            </div></section>`;
    }

    // ------------------------------------------------------------------ Scorigami (every final score, canvas)
    // x = LOSING score, y = WINNING score, both rounded down, 50 to 250. A cell lights up once a game ended with that pair.
    const SCORI_MIN = 50, SCORI_MAX = 250, SCORI_N = SCORI_MAX - SCORI_MIN + 1;
    const SCORI_COLORS = ['', 'var(--scori-1)', 'var(--scori-2)', 'var(--scori-3)'];   // 1, 2, 3+ games (theme colours)
    let scorigami = null, scoriLayout = null;
    function renderScorigami(rows) {
        const cells = new Map();
        let games = 0;
        rows.forEach(g => {
            if (!(Number(g['Team Owner ID']) < Number(g['Opponent Owner ID']))) return;   // each game once
            if (!g.Team || !g.Opponent || g.Opponent.toLowerCase() === 'bye' || g.Team.toLowerCase() === 'bye') return;
            const a = Number(g['Team Score']), b = Number(g['Opponent Score']);
            if (Number.isNaN(a) || Number.isNaN(b) || a === b) return;
            const win = Math.floor(Math.max(a, b)), lose = Math.floor(Math.min(a, b));
            if (win < SCORI_MIN || win > SCORI_MAX || lose < SCORI_MIN) return;
            const winnerIsTeam = a > b, key = `${win}-${lose}`;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push({ winner: winnerIsTeam ? g.Team : g.Opponent, loser: winnerIsTeam ? g.Opponent : g.Team,
                win: Math.max(a, b), lose: Math.min(a, b), season: g.Season, week: g.Week, period: g['Season Period'] });
            games += 1;
        });
        scorigami = { cells, games };
        const possible = SCORI_N * (SCORI_N + 1) / 2;
        return `<section class="rb-category">
            <div class="eyebrow">${cells.size.toLocaleString()} different final scores in ${games.toLocaleString()} games</div><h2 class="rb-cat-title">Scorigami</h2>
            <div class="panel" style="margin-top:14px">
                <div class="scori-body"><canvas id="scori-canvas"></canvas><div id="scori-tip" class="scori-tip"></div></div>
                <div class="ro-legend"><span>Times that exact score has happened:</span>
                    <span class="scori-key" style="background:${SCORI_COLORS[1]}"></span><span>1</span>
                    <span class="scori-key" style="background:${SCORI_COLORS[2]}"></span><span>2</span>
                    <span class="scori-key" style="background:${SCORI_COLORS[3]}"></span><span>3+</span>
                    <span class="ro-key">${cells.size.toLocaleString()} of ${possible.toLocaleString()} possible scores reached (${(cells.size / possible * 100).toFixed(1)}%) · scores rounded down · hover a square for its games</span></div>
            </div></section>`;
    }
    function drawScorigami() {
        const canvas = document.getElementById('scori-canvas');
        if (!canvas || !scorigami) return;
        const AX = 46, AY = 34;
        const availW = canvas.parentElement.clientWidth - 8;
        const cell = Math.max(2, Math.min(4.4, (availW - AX - 8) / SCORI_N));        // fills the panel, capped so it stays a sensible height
        const dpr = window.devicePixelRatio || 1;
        const cssW = Math.ceil(AX + SCORI_N * cell + 8), cssH = Math.ceil(AY + SCORI_N * cell + 6);
        canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
        canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        scoriLayout = { cell, AX, AY, top: 6 };
        ctx.clearRect(0, 0, cssW, cssH);
        // a canvas can't read CSS variables, so resolve the theme colours now (redrawn on theme change)
        const dark = document.documentElement.dataset.theme === 'dark';
        const fill = [null, SITE.color('scori-1'), SITE.color('scori-2'), SITE.color('scori-3')];
        const ink = a => (dark ? `rgba(233, 236, 240, ${a})` : `rgba(0, 0, 0, ${a})`);
        const gap = cell >= 5 ? 1 : 0;
        const snap = v => Math.round(v * dpr) / dpr;
        const colX = i => snap(AX + i * cell), rowY = j => snap(scoriLayout.top + j * cell);
        for (let lose = SCORI_MIN; lose <= SCORI_MAX; lose++) {
            for (let win = lose; win <= SCORI_MAX; win++) {
                const g = scorigami.cells.get(`${win}-${lose}`);
                const n = g ? Math.min(3, g.length) : 0;
                ctx.fillStyle = n ? fill[n] : ink(dark ? 0.06 : 0.05);
                const i = lose - SCORI_MIN, j = SCORI_MAX - win;
                ctx.fillRect(colX(i), rowY(j), colX(i + 1) - colX(i) - gap, rowY(j + 1) - rowY(j) - gap);
            }
        }
        ctx.font = '11px Inter, Arial, sans-serif';
        ctx.fillStyle = ink(0.55);
        ctx.strokeStyle = ink(0.25);
        ctx.textBaseline = 'middle';
        for (let v = SCORI_MIN; v <= SCORI_MAX; v += 25) {
            const y = scoriLayout.top + (SCORI_MAX - v) * cell + cell / 2;
            ctx.textAlign = 'right'; ctx.fillText(String(v), AX - 6, y);
            ctx.beginPath(); ctx.moveTo(AX - 3, y); ctx.lineTo(AX, y); ctx.stroke();
            const x = AX + (v - SCORI_MIN) * cell + cell / 2;
            ctx.textAlign = 'center'; ctx.fillText(String(v), x, scoriLayout.top + SCORI_N * cell + 14);
            ctx.beginPath(); ctx.moveTo(x, scoriLayout.top + SCORI_N * cell); ctx.lineTo(x, scoriLayout.top + SCORI_N * cell + 3); ctx.stroke();
        }
        ctx.fillStyle = ink(0.8);
        ctx.font = '700 10px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('LOSING TEAM SCORE →', AX + (SCORI_N * cell) / 2, scoriLayout.top + SCORI_N * cell + 28);
        ctx.save(); ctx.translate(11, scoriLayout.top + (SCORI_N * cell) / 2); ctx.rotate(-Math.PI / 2);
        ctx.fillText('WINNING TEAM SCORE →', 0, 0); ctx.restore();
    }
    function hookScoriTip() {
        const canvas = document.getElementById('scori-canvas'), tip = document.getElementById('scori-tip');
        if (!canvas || !tip) return;
        const show = event => {
            if (!scoriLayout || !scorigami) return;
            const rect = canvas.getBoundingClientRect();
            const px = (event.touches ? event.touches[0].clientX : event.clientX) - rect.left;
            const py = (event.touches ? event.touches[0].clientY : event.clientY) - rect.top;
            const lose = SCORI_MIN + Math.floor((px - scoriLayout.AX) / scoriLayout.cell);
            const win = SCORI_MAX - Math.floor((py - scoriLayout.top) / scoriLayout.cell);
            if (lose < SCORI_MIN || lose > SCORI_MAX || win < SCORI_MIN || win > SCORI_MAX || win < lose) { tip.style.display = 'none'; return; }
            const g = (scorigami.cells.get(`${win}-${lose}`) || []).slice().sort((a, b) => b.season - a.season || b.week - a.week);
            const lines = g.slice(0, 4).map(x => `<div>${esc(x.winner)} ${x.win.toFixed(2)} def. ${esc(x.loser)} ${x.lose.toFixed(2)} <i>${x.season} wk ${x.week}${x.period && x.period !== 'Regular' ? ` · ${esc(x.period)}` : ''}</i></div>`).join('');
            tip.innerHTML = `<b>${win} - ${lose}</b>${g.length
                ? `<span>${g.length} game${g.length === 1 ? '' : 's'}</span>${lines}${g.length > 4 ? `<div><i>and ${g.length - 4} more</i></div>` : ''}`
                : '<span>never happened (a scorigami waiting to happen)</span>'}`;
            tip.style.display = 'block';
            const body = canvas.parentElement.getBoundingClientRect();
            tip.style.left = `${Math.min(px + rect.left - body.left + 16, body.width - tip.offsetWidth - 8)}px`;
            tip.style.top = `${Math.max(4, py + rect.top - body.top - tip.offsetHeight - 10)}px`;
        };
        canvas.addEventListener('mousemove', show);
        canvas.addEventListener('click', show);
        canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    }

    // ================================================================== run only what this sub page needs
    try {
        if (page === 'record-vs-playoffs') {
            const [teamRows, scoreRows] = await Promise.all([LeagueDb.seasonTeamRows(), LeagueDb.scoreRows()]);
            content.innerHTML = `<div class="wrap page-pad">${renderRecordOdds(teamRows, scoreRows)}</div>`;
        } else if (page === 'scorigami') {
            content.innerHTML = `<div class="wrap page-pad">${renderScorigami(await LeagueDb.scoreRows())}</div>`;
            drawScorigami(); hookScoriTip();
            let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(drawScorigami, 100); });
            window.addEventListener('themechange', drawScorigami);
        } else {
            leagueScoreData = await LeagueDb.scoreRows();
            processLeagueRecords();
            if (page === 'single-season') await calculatePlayerRecords();
            if (page === 'single-game') await calculatePositionalAndBenchRecords();
            if (page !== 'single-game') { await calculateTransactionAndLuckRecords(); await calculateLineupRecords(); }
            renderRecords(page);
        }
    } catch (error) {
        console.error('Record book error:', error);
        content.innerHTML = '<div class="wrap"><div class="panel">Error loading data.</div></div>';
    }
})();
