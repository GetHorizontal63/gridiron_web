/* The NFL GMs (NEW/python/stream_team.py, table nfl_gm): each week, every NFL team's best legal lineup in this league's
   format from its own players (its D/ST and head coach included).
   'proj' = filled by ESPN's weekly projections, scored with real points (what the team's front office fielded, picked
            the way a manager picks);
   'best' = filled by real points (the most that roster could have scored, in hindsight). A team on its bye has none.
   NG.teams()                          [{ abbr, name }] for the 32 teams (names from their D/ST entries)
   NG.weeks(season)                    every team-week score: { week, team, kind, score, projected }
   NG.lineup(season, week, team, kind) the lineup: [{ slot, pid, name, pos, proj, pts }]
   NG.logo(abbr)                       the team's logo */
window.NG = (() => {
    const CODE = { Q: 'QB', R: 'RB', W: 'WR', T: 'TE', K: 'K', P: 'P', D: 'D/ST', H: 'HC', F: 'FLEX' };
    let teamList;
    const teams = async () => teamList || (teamList = (await GT.query(`SELECT pro_team AS abbr, name FROM players WHERE position = 'D/ST' AND player_id < 0 ORDER BY name`))
        .map(r => ({ abbr: r.abbr, name: r.name.replace(/ D\/ST$/, '') })));
    const weeks = season => GT.query(`SELECT week, team, kind, score, projected FROM nfl_gm WHERE season = $s`, { $s: Number(season) }).catch(() => []);
    async function lineup(season, week, team, kind = 'proj') {
        const [row] = await GT.query(`SELECT lineup FROM nfl_gm WHERE season = $s AND week = $w AND team = $t AND kind = $k`,
                                     { $s: Number(season), $w: Number(week), $t: team, $k: kind }).catch(() => []);
        if (!row || !row.lineup) return [];
        const list = row.lineup.split('|').map(x => { const [pid, proj, pts] = x.slice(1).split(':'); return { slot: CODE[x[0]], pid: Number(pid), proj: Number(proj), pts: Number(pts) }; });
        const names = await GT.query(`SELECT player_id AS id, name, position AS pos FROM players WHERE player_id IN (${list.map(p => p.pid).join(',')})`);
        const by = Object.fromEntries(names.map(n => [n.id, n]));
        return list.map(p => ({ ...p, name: (by[p.pid] || {}).name || '?', pos: (by[p.pid] || {}).pos || '' }));
    }
    const logo = abbr => SITE.url(`assets/nfl-logos/${String(abbr || 'nfl').toLowerCase()}.png`);
    return { teams, weeks, lineup, logo };
})();
