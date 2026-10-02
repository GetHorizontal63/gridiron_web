// FP+ and roster efficiency for one team-week, defined exactly as in the Game Log (js/game-search.js).
//   FP+        = points scored by the starters / their projected points
//   Efficiency = points scored by the starters / points had every bench player who beat a same-position starter swapped in
const RosterMetrics = (() => {
    const isBench = p => p.slotPosition === 'BE' || p.slotPosition === 'IR';

    function weekOf(roster) {
        const active = roster.filter(p => !isBench(p));
        const bench = roster.filter(isBench);
        const actual = active.reduce((s, p) => s + (parseFloat(p.actualPoints) || 0), 0);
        const projected = active.reduce((s, p) => s + (parseFloat(p.projectedPoints) || 0), 0);

        const options = [];
        const emptyChecked = new Set();
        bench.forEach(b => {
            const benchPts = parseFloat(b.actualPoints) || 0;
            if (benchPts <= 0) return;
            const same = active.filter(p => p.position === b.position);
            same.forEach(a => {
                const activePts = parseFloat(a.actualPoints) || 0;
                if (benchPts > activePts) options.push({ bench: b, active: a, gain: benchPts - activePts });
            });
            if (!same.length && !emptyChecked.has(b.position)) {
                options.push({ bench: b, active: null, gain: benchPts });
                emptyChecked.add(b.position);
            }
        });
        options.sort((x, y) => y.gain - x.gain);

        const usedBench = new Set();
        const usedActive = new Set();
        let gain = 0;
        options.forEach(o => {
            if (usedBench.has(o.bench.playerId)) return;
            if (o.active && usedActive.has(o.active.playerId)) return;
            usedBench.add(o.bench.playerId);
            if (o.active) usedActive.add(o.active.playerId);
            gain += o.gain;
        });
        return { actual, projected, optimal: actual + gain };
    }

    // Every team-week's metrics, keyed "owner|season|week".
    async function load() {
        const rows = await LeagueDb.query(`
            SELECT o.display_name AS owner, fr.season, fr.week, p.player_id AS playerId, p.position,
                   frp.slot_position AS slotPosition, frp.actual_points AS actualPoints,
                   frp.projected_points AS projectedPoints
            FROM fantasy_rosters fr
            JOIN owners o ON o.owner_id = fr.owner_id
            JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
            JOIN players p ON p.player_id = frp.player_id`);
        const rosters = new Map();
        rows.forEach(r => {
            const key = `${r.owner}|${r.season}|${r.week}`;
            if (!rosters.has(key)) rosters.set(key, []);
            rosters.get(key).push(r);
        });
        const metrics = new Map();
        rosters.forEach((roster, key) => metrics.set(key, weekOf(roster)));
        return metrics;
    }

    // FP+ and efficiency over many team-weeks, pooled (total points over total projected / best-possible
    // points) so big weeks count for more than a percentage average would. Weeks with no projection or
    // no scoring on file are skipped.
    function pool(weeks) {
        let act = 0, proj = 0, effAct = 0, best = 0, n = 0;
        weeks.forEach(m => {
            if (!m || !(m.actual > 0)) return;
            n += 1;
            if (m.projected > 0) { act += m.actual; proj += m.projected; }
            if (m.optimal > 0) { effAct += m.actual; best += m.optimal; }
        });
        return { fp: proj ? 100 * act / proj : null, eff: best ? 100 * effAct / best : null, left: best - effAct, weeks: n };
    }

    return { weekOf, load, pool };
})();
