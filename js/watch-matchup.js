/* Watch, a manager's view: their fantasy matchup for the week of their code's game day, live. Shared by the website's
   Watch page and the app's Watch screen.

   Who plays whom: data/schedule.json (the league's ESPN schedule, owner ids per week). Lineups: league.db's
   fantasy_rosters for that week (the latest saved). Points: never from league.db; every player, D/ST and coach is
   scored from ESPN's game summary with the league's rules (js/live-fantasy.js). A finished game's points are kept on
   the device (localStorage), so each one downloads once; games in progress are re-read on every refresh.
   The matchup score is each side's starters across every game of the week so far. */
(function () {
    const API = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const getJson = url => fetch(url).then(r => { if (!r.ok) throw new Error(`ESPN answered ${r.status}`); return r.json(); });   // plain GET (see nflplus.js)
    const f1 = v => (Math.round((v || 0) * 10) / 10).toFixed(1);
    const STARTER = slot => slot !== 'BE' && slot !== 'IR';
    const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST', 'P', 'HC', 'BE', 'IR'];

    // ---------------------------------------------------------------- the matchup (who, which week, both lineups)
    async function load(who, season) {
        const day = who.date.replace(/-/g, '');
        const [board, sched] = await Promise.all([getJson(`${API}scoreboard?dates=${day}`),
                                                  fetch(SITE.url('data/schedule.json')).then(r => r.ok ? r.json() : null).catch(() => null)]);
        const week = board.week && board.week.number;
        const pair = sched && (sched.weeks[String(week)] || []).find(p => p.map(Number).includes(Number(who.owner)));
        if (!week || !pair) return { week, missing: `No matchup for ${who.name} in week ${week || '?'}.` };
        const oppId = Number(pair.find(id => Number(id) !== Number(who.owner)));
        const rows = await GT.query(`SELECT fr.owner_id AS owner, frp.player_id AS id, frp.slot_position AS slot, frp.pro_team AS team, p.name, p.position
            FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id JOIN players p ON p.player_id = frp.player_id
            WHERE fr.season = $s AND fr.week = (SELECT MAX(week) FROM fantasy_rosters WHERE season = $s AND week <= $w) AND fr.owner_id IN ($a, $b)`,
            { $s: season, $w: week, $a: Number(who.owner), $b: oppId });
        const b = await GT.load();
        const side = id => ({ id, name: b.byId[id] ? b.byId[id].name : `#${id}`, roster: rows.filter(r => r.owner === id)
            .sort((x, y) => SLOT_ORDER.indexOf(x.slot) - SLOT_ORDER.indexOf(y.slot)) });
        return { week, seasonType: board.season && board.season.type, me: side(Number(who.owner)), opp: side(oppId) };
    }

    // ---------------------------------------------------------------- points per game (cached once final)
    const cacheKey = id => `gt-fp-${id}`;
    function cached(id) { try { return JSON.parse(localStorage.getItem(cacheKey(id)) || 'null'); } catch (_) { return null; } }
    // one game's points: { players: { espnId: { pts, how } }, dst: { espnTeamId: {...} }, hc: {...}, state }
    function digest(fp, state) {
        const how = l => l.lines.map(x => `${x.label}${/^(\d|Avg|Win|Loss)/.test(x.label) ? '' : ` ${Number.isInteger(x.qty) ? x.qty : x.qty.toFixed(1)}`}`).join(' · ');
        return { state, players: Object.fromEntries(fp.players.map(p => [p.id, { pts: p.pts, how: how(p) }])),
                 dst: Object.fromEntries(fp.teams.map(t => [t.id, { pts: t.dst.pts, how: how(t.dst) }])),
                 hc: Object.fromEntries(fp.teams.map(t => [t.id, { pts: t.hc.pts, how: how(t.hc) }])) };
    }
    async function gamePoints(eventId, state, rules, summary = null) {
        if (state === 'pre') return null;
        const hit = cached(eventId);
        if (hit && hit.state === 'post') return hit;
        const s = summary || await getJson(`${API}summary?event=${eventId}`);
        const out = digest(LIVEFP.score(s, rules), s.header.competitions[0].status.type.state);
        if (out.state === 'post') { try { localStorage.setItem(cacheKey(eventId), JSON.stringify(out)); } catch (_) { /* storage full: re-read next time */ } }
        return out;
    }

    // the week's games: team abbreviation -> { id, state, teams } (from the week's scoreboard, ~250 KB: re-read at most
    // every 90 seconds; the game being watched is refreshed separately, from its own summary)
    const boards = {};
    async function weekGames(week, seasonType = 2) {
        const memo = boards[`${seasonType}-${week}`];
        if (memo && Date.now() - memo.at < 90000) return memo.byTeam;
        const d = await getJson(`${API}scoreboard?seasontype=${seasonType}&week=${week}`);
        const byTeam = {};
        (d.events || []).forEach(e => {
            const c = e.competitions[0], g = { id: e.id, state: e.status.type.state, detail: e.status.type.shortDetail,
                                               teams: c.competitors.map(x => ({ id: x.team.id, abbr: x.team.abbreviation })) };
            g.teams.forEach(t => { byTeam[t.abbr] = g; });
        });
        boards[`${seasonType}-${week}`] = { at: Date.now(), byTeam };
        return byTeam;
    }

    // a rostered player's points in their game this week (0 before kickoff or on a bye)
    function playerPoints(p, game, pts) {
        if (!game || !pts) return null;
        if (p.id <= -16000) return pts.dst[String(-p.id - 16000)] || { pts: 0, how: '' };
        if (p.id <= -14000) return pts.hc[String(-p.id - 14000)] || { pts: 0, how: '' };
        return pts.players[String(p.id)] || { pts: 0, how: '' };
    }
    // everything the side panel needs: both scores (starters, whole week) and each side's players in the watched game
    async function score(m, rules, watched) {
        const games = await weekGames(m.week, m.seasonType);
        if (watched) Object.values(games).forEach(g => { if (g.id === watched.id) g.state = watched.state; });   // the fresher state
        const ids = [...new Set([...m.me.roster, ...m.opp.roster].map(p => games[p.team]).filter(Boolean).map(g => g.id))];
        const pts = {};
        await Promise.all(ids.map(async id => {
            const g = Object.values(games).find(x => x.id === id);
            pts[id] = await gamePoints(id, g.state, rules, watched && watched.id === id && watched.raw ? watched.raw : null).catch(() => null);
        }));
        const line = p => { const g = games[p.team]; const r = g ? playerPoints(p, g, pts[g.id]) : null;
            return { ...p, game: g || null, pts: r ? r.pts : 0, how: r ? r.how : '', played: !!(g && g.state !== 'pre') }; };
        const side = s => {
            const all = s.roster.map(line), starters = all.filter(p => STARTER(p.slot));
            return { ...s, all, total: starters.reduce((a, p) => a + p.pts, 0), left: starters.filter(p => p.game && p.game.state === 'pre').length,
                     inGame: watched ? all.filter(p => p.game && p.game.id === watched.id) : [] };
        };
        return { me: side(m.me), opp: side(m.opp) };
    }

    // ---------------------------------------------------------------- markup
    const headshot = p => p.id > 0 ? `https://a.espncdn.com/i/headshots/nfl/players/full/${p.id}.png` : SITE.url(`assets/nfl-logos/${String(p.team || 'nfl').toLowerCase()}.png`);
    const nflLogo = abbr => `<img class="gc-nfl" src="${SITE.url(`assets/nfl-logos/${String(abbr || 'nfl').toLowerCase()}.png`)}" alt="${esc(abbr || '')}" onerror="this.src='${SITE.url('assets/nfl-logos/nfl.png')}';this.onerror=null">`;
    const slotText = p => p.slot === 'BE' ? `${p.position} · bench` : p.slot === 'IR' ? `${p.position} · IR` : p.slot;
    const lead = s => s.me.total === s.opp.total ? '' : s.me.total > s.opp.total ? 'me' : 'opp';

    // the header's matchup score (the 35% beside the NFL game): both managers, the week so far, who's left to play
    function boardHtml(m, s, live) {
        const L = lead(s);
        const side = (t, mine, right) => `<div class="wm-side${right ? ' r' : ''}"><span class="sb-logo"><img src="${GT.logo(t.name)}" alt=""></span>
            <span class="wm-who"><b>${esc(t.name)}</b><small>${t.left} yet to play</small></span>
            <span class="wm-pts${(L === 'me') === mine && L ? ' won' : ''}">${f1(t.total)}</span></div>`;
        return `<div class="band-label"><span class="pill ${live ? 'pill-accent' : 'pill-dark'}">${live ? 'Live' : 'Matchup'}</span>Week ${m.week} fantasy</div>
            <div class="wm-board">${side(s.me, true)}${side(s.opp, false, true)}</div>`;
    }

    // each manager's players in the game on screen, side by side (starters first, then by points)
    const row = p => `<div class="wm-row${STARTER(p.slot) ? '' : ' bench'}">
        <span class="fp-shot"><img src="${headshot(p)}" alt="" onerror="this.src='${SITE.url('assets/nfl-logos/nfl.png')}';this.onerror=null"></span>
        <span class="fp-who"><b>${esc(p.name)}</b><small>${esc(slotText(p))} · ${esc(p.team)}</small>
            <em>${esc(p.how) || (p.played ? 'No points yet' : 'Kickoff to come')}</em></span>
        <span class="fp-num">${f1(p.pts)}</span></div>`;
    function inGameHtml(s) {
        const block = t => `<div class="wm-team"><div class="wm-team-h"><img src="${GT.logo(t.name)}" alt=""><b>${esc(t.name)}</b><span>${t.inGame.filter(p => STARTER(p.slot)).length} starting in this game</span></div>
            ${t.inGame.length ? t.inGame.slice().sort((x, y) => (STARTER(y.slot) - STARTER(x.slot)) || y.pts - x.pts).map(row).join('') : '<p class="wm-none">Nobody in this game.</p>'}</div>`;
        return `<div class="wm-cols">${block(s.me)}${block(s.opp)}</div>`;
    }

    // both full rosters in the Game Center's mirrored layout: one row per lineup slot, live points from every game
    function rostersHtml(s) {
        const status = p => !p.game ? 'Bye' : p.game.state === 'pre' ? 'Not yet' : p.game.state === 'post' ? 'Final' : p.game.detail;
        const opp = p => p.game ? (p.game.teams.find(t => t.abbr !== p.team) || {}).abbr : '';
        const cells = (p, mine) => {
            const list = p ? [`<td class="gc-player" title="${esc(p.name)}">${esc(p.name)}</td>`, `<td>${esc(p.position)}</td>`, `<td>${nflLogo(p.team)}</td>`,
                              `<td>${p.game ? nflLogo(opp(p)) : ''}</td>`, `<td class="wm-st${p.game && p.game.state === 'in' ? ' live' : ''}">${esc(status(p))}</td>`, `<td class="num strong">${f1(p.pts)}</td>`]
                           : ['<td class="gc-player">-</td>', '<td></td>', '<td></td>', '<td></td>', '<td></td>', '<td class="num">-</td>'];
            return (mine ? list : list.reverse()).join('');
        };
        const take = (list, used, slot) => { const p = list.find(x => x.slot === slot && !used.has(x)); if (p) used.add(p); return p; };
        const order = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST', 'P', 'HC'];
        const count = (t, slot) => t.all.filter(p => p.slot === slot).length;
        const usedA = new Set(), usedB = new Set();
        const starters = order.flatMap(slot => Array(Math.max(count(s.me, slot), count(s.opp, slot))).fill(slot));
        const win = (a, b) => !a || !b || a.pts === b.pts ? '' : a.pts > b.pts ? 'l' : 'r';
        const slotRow = slot => { const a = take(s.me.all, usedA, slot), b = take(s.opp.all, usedB, slot), w = win(a, b);
            return `<tr>${cells(a, true)}<td class="gc-arw">${w === 'l' ? '◀' : ''}</td><td class="gc-slot">${slot}</td><td class="gc-arw">${w === 'r' ? '▶' : ''}</td>${cells(b, false)}</tr>`; };
        const bench = Math.max(count(s.me, 'BE'), count(s.opp, 'BE'));
        const COLS = SITE.cols('17.5%', '4.5%', '4%', '4%', '8%', '6%', '2.5%', '8%', '2.5%', '6%', '8%', '4%', '4%', '4.5%', '17.5%');
        const head = label => `<thead><tr><th>Player</th><th>Pos</th><th>NFL</th><th>Opp</th><th>Status</th><th class="num">FP</th>
            <th class="gc-arw"></th><th class="gc-slot">${label}</th><th class="gc-arw"></th><th class="num">FP</th><th>Status</th><th>Opp</th><th>NFL</th><th>Pos</th><th class="r">Player</th></tr></thead>`;
        const benchTotal = t => t.all.filter(p => p.slot === 'BE').reduce((a, p) => a + p.pts, 0);
        return `<div class="gc-teams wm-teams"><span class="l"><img src="${GT.logo(s.me.name)}" alt="">${esc(s.me.name)}</span><span>Full rosters</span><span class="r">${esc(s.opp.name)}<img src="${GT.logo(s.opp.name)}" alt=""></span></div>
            <div class="table-scroll"><table class="data-table gc-box wm-box">${COLS}${head('Starters')}<tbody>${starters.map(slotRow).join('')}
                <tr class="gc-total"><td colspan="5"></td><td class="num">${f1(s.me.total)}</td><td class="gc-arw"></td><td class="gc-slot">Total</td><td class="gc-arw"></td><td class="num">${f1(s.opp.total)}</td><td colspan="5"></td></tr></tbody></table></div>
            ${bench ? `<div class="table-scroll"><table class="data-table gc-box wm-box">${COLS}${head('Bench')}<tbody>${Array(bench).fill('BE').map(slotRow).join('')}
                <tr class="gc-total"><td colspan="5"></td><td class="num">${f1(benchTotal(s.me))}</td><td class="gc-arw"></td><td class="gc-slot">Bench</td><td class="gc-arw"></td><td class="num">${f1(benchTotal(s.opp))}</td><td colspan="5"></td></tr></tbody></table></div>` : ''}`;
    }

    window.WMATCH = { load, score, boardHtml, inGameHtml, rostersHtml };
})();
