/* NFL player data (data/player_stats, built by NEW/python/build_nfl_player_stats.py) */
window.PS = (() => {
    const BASE = SITE.url('data/player_stats');
    const cache = {};
    const get = path => cache[path] || (cache[path] = fetch(`${BASE}/${path}`).then(r => { if (!r.ok) throw new Error(path); return r.json(); }));
    const index = () => get('index.json').then(d => d.players);
    const games = () => get('games.json').then(d => d.games);
    const player = id => get(`players/${encodeURIComponent(id)}.json`);
    const seasonStats = () => get('season_stats.json').then(d => d.seasons);   // regular-season aggregates (build_nfl_player_stats.py)

    const GROUPS = { QB: ['QB'], RB: ['RB', 'FB', 'HB'], WR: ['WR'], TE: ['TE'], K: ['K', 'PK'], P: ['P'], 'D/ST': ['D/ST'],
                     DEF: ['DE', 'DT', 'NT', 'DL', 'LB', 'OLB', 'ILB', 'MLB', 'CB', 'DB', 'S', 'SAF', 'FS', 'SS'],
                     OL: ['OT', 'T', 'G', 'OG', 'C', 'OL', 'LS'] };
    const groupOf = pos => Object.keys(GROUPS).find(g => GROUPS[g].includes(pos)) || 'OTHER';
    const n = (r, k) => r[k] || 0;
    // stat columns per position group: [header, key or fn]
    const COLS = {
        QB: [['Cmp', 'pass_cmp'], ['Att', 'pass_att'], ['Pass Yds', 'pass_yds'], ['Pass TD', 'pass_td'], ['Int', 'pass_int'], ['Rush Yds', 'rush_yds'], ['Rush TD', 'rush_td']],
        RB: [['Car', 'rush_att'], ['Rush Yds', 'rush_yds'], ['Rush TD', 'rush_td'], ['Tgt', 'rec_tgt'], ['Rec', 'rec'], ['Rec Yds', 'rec_yds'], ['Rec TD', 'rec_td']],
        WR: [['Tgt', 'rec_tgt'], ['Rec', 'rec'], ['Rec Yds', 'rec_yds'], ['Rec TD', 'rec_td'], ['Long', 'rec_lng'], ['Rush Yds', 'rush_yds']],
        K: [['FG', 'fg_made'], ['FGA', 'fg_att'], ['Long', 'fg_lng'], ['XP', 'xp_made'], ['XPA', 'xp_att']],
        P: [['Punts', 'punt'], ['Yds', 'punt_yds'], ['In 20', 'punt_in20'], ['In 10', 'punt_in10'], ['TB', 'punt_tb']],
        DEF: [['Tkl', 'def_tkl'], ['Solo', 'def_solo'], ['Sacks', 'def_sck'], ['TFL', 'def_tfl'], ['PD', 'def_pd'], ['Int', 'def_int'], ['TD', 'def_td']],
        'D/ST': [['PA', 'pts_allowed'], ['YA', 'yds_allowed'], ['Sacks', 'def_sck'], ['Int', 'def_int'], ['FR', 'fum_rec'], ['TD', 'dst_td']],
        OL: [['Snaps', 'off_snaps'], ['Snap %', 'off_pct']]
    };
    COLS.TE = COLS.WR;
    const cols = pos => COLS[groupOf(pos)] || [];
    const nflLogo = team => SITE.url(`assets/nfl-logos/${String(team || 'nfl').toLowerCase()}.png`);
    const side = (row, g) => {
        const home = row.tm === g.home;
        return { home, opp: home ? g.away : g.home, us: home ? g.home_score : g.away_score, them: home ? g.away_score : g.home_score };
    };
    const typeLabel = g => g.type === 'PRE' ? `Pre W${g.week}` : g.type === 'POST' ? (g.round || 'Playoffs') : `W${g.week}`;
    const conditions = g => {
        const indoor = g.roof === 'dome' || g.roof === 'closed';
        const wx = !indoor && g.wx && g.wx.temp != null ? `${Math.round(g.wx.temp)}°F · ${Math.round(g.wx.wind)} mph` : (indoor ? 'Indoors' : '');
        return [g.venue, wx].filter(Boolean).join(' · ');
    };
    // who rostered this player in the league, by season
    const leagueHistory = id => GT.query(`
        SELECT fr.season, o.display_name AS owner, COUNT(*) AS weeks,
               SUM(CASE WHEN frp.slot_position NOT IN ('BE','IR') THEN 1 ELSE 0 END) AS starts,
               SUM(CASE WHEN frp.slot_position NOT IN ('BE','IR') THEN frp.actual_points ELSE 0 END) AS pts
        FROM fantasy_roster_players frp JOIN fantasy_rosters fr ON fr.roster_id = frp.roster_id
        JOIN owners o ON o.owner_id = fr.owner_id
        WHERE frp.player_id = $id GROUP BY fr.season, o.owner_id ORDER BY fr.season DESC, weeks DESC`, { $id: Number(id) });

    return { index, games, player, seasonStats, groupOf, cols, n, nflLogo, side, typeLabel, conditions, leagueHistory };
})();
