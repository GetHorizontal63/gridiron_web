/* The Stream Team (NEW/python/stream_team.py): each week's best lineup from players on no fantasy roster.
   'proj' = filled by ESPN's weekly projections, scored with real points (what streaming the wire would have scored);
   'best' = filled by real points (the most the wire could have scored, in hindsight). Regular season and playoffs.
   ST.games(season)   every manager's score (regular season + playoffs) next to both Stream Team scores (season 0 = every season)
   ST.lines(games)    per-manager record and margin against both
   ST.lineup(season, week, kind)   the Stream Team's players for one week */
window.ST = (() => {
    const games = season => GT.query(`
        SELECT m.season, m.week, m.season_period AS period, m.game_id AS gameId, t.owner_id AS id, o.display_name AS name, t.team_score AS pf, t.opponent_score AS pa,
               sp.score AS sp, sp.projected AS spProj, sb.score AS sb
        FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
        JOIN stream_team sp ON sp.season = m.season AND sp.week = m.week AND sp.kind = 'proj'
        JOIN stream_team sb ON sb.season = m.season AND sb.week = m.week AND sb.kind = 'best'
        WHERE ($s = 0 OR m.season = $s) AND t.team_score IS NOT NULL
        ORDER BY m.season, m.week`, { $s: Number(season) || 0 }).catch(() => []);

    const rec = (list, k) => {
        const w = list.filter(g => g.pf > g[k]).length, l = list.filter(g => g.pf < g[k]).length;
        return { w, l, t: list.length - w - l, pct: list.length ? (w + (list.length - w - l) / 2) / list.length : null,
                 margin: list.length ? list.reduce((t, g) => t + g.pf - g[k], 0) / list.length : null };
    };
    function lines(list) {
        const by = new Map();
        list.forEach(g => { if (!by.has(g.id)) by.set(g.id, []); by.get(g.id).push(g); });
        return [...by.entries()].map(([id, l]) => ({ id, name: l[0].name, g: l.length, ppg: l.reduce((t, g) => t + g.pf, 0) / l.length,
                                                     vsProj: rec(l, 'sp'), vsBest: rec(l, 'sb') }))
            .sort((x, y) => (y.vsProj.pct - x.vsProj.pct) || (y.vsProj.margin - x.vsProj.margin));
    }
    const lineup = (season, week, kind = 'proj') => GT.query(`
        SELECT sp.slot, sp.player_id AS pid, p.name, p.position AS pos, sp.projected AS proj, sp.points AS pts
        FROM stream_team_players sp JOIN players p ON p.player_id = sp.player_id
        WHERE sp.season = $s AND sp.week = $w AND sp.kind = $k ORDER BY sp.seq`, { $s: season, $w: week, $k: kind }).catch(() => []);
    const recText = r => `${r.w}-${r.l}${r.t ? '-' + r.t : ''}`;
    return { games, lines, rec, lineup, recText };
})();
