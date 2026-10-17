/* Trade Calculator: two to four teams, current rosters (the latest saved week of the current season).
   Player value  = PPG (what he has scored this season, weeks he played) blended 50/50 with Proj PPG (ESPN's weekly
                   projection, averaged over the last three weeks, so an injury or a role change shows up right away).
   Positional rank = his value against every player at the position this season.
   Roster fit    = each team's best possible starting lineup (the season's roster rules, FLEX = RB/WR/TE) before and
                   after the trade. A player is worth what he adds to *this* lineup, so a fourth good WR adds little.
   Impact        = change in starting lineup PPG + a quarter of the change in depth (bench value over replacement).
   Over the roster limit after the trade, the team drops its least valuable bench players (shown). */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    await GT.load();
    const POS_COLOR = { QB: '#d1495b', RB: '#2e86ab', WR: '#3b7a57', TE: '#edae49', K: '#8e7dbe', P: '#7a8b99', 'D/ST': '#4a4e69', HC: '#c06c84' };
    const posChip = pos => pos ? `<span class="pchip" style="background:${POS_COLOR[pos] || '#888'}" title="${esc(pos)}">${esc(pos === 'D/ST' ? 'D' : pos)}</span>` : '';
    const f1 = v => v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1);
    const sg = v => `${v > 0.05 ? '+' : v < -0.05 ? '' : '±'}${f1(Math.abs(v) < 0.05 ? 0 : v)}`;
    const cls = v => v > 0.05 ? 'win' : v < -0.05 ? 'loss' : '';
    const MAX = 4;

    // ---------------------------------------------------------------- data: season, week, rules, rosters, every player's value
    const season = (await GT.query('SELECT MAX(season) AS s FROM fantasy_rosters'))[0].s;
    const week = (await GT.query('SELECT MAX(week) AS w FROM fantasy_rosters WHERE season = ?', [season]))[0].w;
    const RR = (await GT.query('SELECT * FROM roster_rules WHERE season = ?', [season]))[0];
    const SLOTS = [['QB', RR.qb, ['QB']], ['RB', RR.rb, ['RB']], ['WR', RR.wr, ['WR']], ['TE', RR.te, ['TE']], ['FLEX', RR.flex, ['RB', 'WR', 'TE']],
                   ['D/ST', RR.dst, ['D/ST']], ['K', RR.k, ['K']], ['P', RR.p, ['P']], ['HC', RR.hc, ['HC']]].filter(s => s[1] > 0);
    const ACTIVE_MAX = (RR.total_slots || 22) - (RR.ir || 0);
    const weeks = await GT.query(`
        SELECT w.player_id AS id, w.week, w.points, w.projected, COALESCE(v.pos, p.position) AS pos, p.name, COALESCE(t.team, p.pro_team) AS team
        FROM player_week_points w JOIN players p ON p.player_id = w.player_id
        LEFT JOIN player_values v ON v.player_id = w.player_id AND v.season = w.season
        LEFT JOIN player_team t ON t.player_id = w.player_id
        WHERE w.season = ? AND w.week <= ?`, [season, week]);
    const P = {};
    weeks.forEach(r => {
        const p = P[r.id] || (P[r.id] = { id: r.id, name: r.name, pos: r.pos, team: r.team, pts: [], proj: [], wk: {} });
        if (r.points != null) p.wk[r.week] = r.points;
        if (r.points != null && (r.points !== 0 || r.projected > 0)) p.pts.push(r.points);
        if (r.projected != null) p.proj.push([r.week, r.projected]);
    });
    const avg = l => l.length ? l.reduce((t, v) => t + v, 0) / l.length : null;
    Object.values(P).forEach(p => {
        p.ppg = avg(p.pts); p.g = p.pts.length;
        p.pproj = avg(p.proj.sort((x, y) => y[0] - x[0]).slice(0, 3).map(x => x[1]));
        p.val = p.ppg == null ? (p.pproj || 0) : p.pproj == null ? p.ppg : (p.ppg + p.pproj) / 2;
    });
    // positional rank + replacement level: the best player at the position who would not start on any team
    const NT = (await GT.query('SELECT COUNT(DISTINCT owner_id) AS n FROM fantasy_rosters WHERE season = ? AND week = ?', [season, week]))[0].n || 16;
    const byPos = {};
    Object.values(P).filter(p => POS_COLOR[p.pos]).forEach(p => (byPos[p.pos] = byPos[p.pos] || []).push(p));
    Object.values(byPos).forEach(l => { l.sort((x, y) => y.val - x.val); l.forEach((p, i) => { p.rank = i + 1; }); });
    const starters = {};
    SLOTS.filter(s => s[0] !== 'FLEX').forEach(([s, n, ok]) => { starters[ok[0]] = n * NT; });
    const flexPool = ['RB', 'WR', 'TE'].flatMap(pos => (byPos[pos] || []).slice(starters[pos] || 0)).sort((x, y) => y.val - x.val).slice(0, (RR.flex || 0) * NT);
    flexPool.forEach(p => { starters[p.pos] = (starters[p.pos] || 0) + 1; });
    const REPL = Object.fromEntries(Object.entries(byPos).map(([pos, l]) => [pos, (l[starters[pos] || 0] || l[l.length - 1] || { val: 0 }).val]));
    Object.values(P).forEach(p => { p.vor = p.val - (REPL[p.pos] || 0); });

    // finished regular-season games so far: replayed with the traded rosters for the record to date
    const GAMES = await GT.query(`
        SELECT m.week, s.owner_id AS oid, s.opponent_owner_id AS opp, s.team_score AS pf, s.opponent_score AS pa, o.display_name AS oppName
        FROM matchups m JOIN matchup_team_stats s ON s.game_id = m.game_id JOIN owners o ON o.owner_id = s.opponent_owner_id
        WHERE m.season = ? AND m.season_period = 'Regular' AND s.team_score IS NOT NULL ORDER BY m.week`, [season]);
    const SCHED = await fetch(url('data/schedule.json')).then(r => r.json()).catch(() => null);
    const LAST = GAMES.reduce((m, g) => Math.max(m, g.week), 0);
    const REMAIN = SCHED && SCHED.season === season ? Object.entries(SCHED.weeks).map(([w, list]) => [Number(w), list]).filter(([w]) => w > LAST) : [];
    const oppOf = (oid, list) => { const g = list.find(x => x[0] === oid || x[1] === oid); return g ? (g[0] === oid ? g[1] : g[0]) : null; };
    // win chance from the gap between two projected lineups (one game's margin spread: ~28 points a team, as the playoff odds use)
    const erf = x => { const s = Math.sign(x), a = Math.abs(x), k = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * k - 1.453152027) * k) + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-a * a)); };
    const winP = d => 0.5 * (1 + erf(d / (28 * Math.SQRT2) / Math.SQRT2));
    const rosterRows = await GT.query(`
        SELECT r.owner_id AS oid, o.display_name AS owner, f.player_id AS id, f.slot_position AS slot, f.injury_status AS inj,
               p.name, p.position AS pos
        FROM fantasy_rosters r JOIN owners o ON o.owner_id = r.owner_id JOIN fantasy_roster_players f ON f.roster_id = r.roster_id
        LEFT JOIN players p ON p.player_id = f.player_id
        WHERE r.season = ? AND r.week = ?`, [season, week]);
    const TEAMS = {};
    rosterRows.forEach(r => {
        const t = TEAMS[r.oid] || (TEAMS[r.oid] = { oid: r.oid, owner: r.owner, players: [] });
        // no points this season (hurt since week 1): on the roster at no value
        const p = P[r.id] || (P[r.id] = { id: r.id, name: r.name || `Player ${r.id}`, pos: r.pos, val: 0, vor: 0, ppg: null, pproj: null, g: 0 });
        p.oid = r.oid; p.slot = r.slot; p.ir = r.slot === 'IR'; p.inj = r.inj && r.inj !== 'ACTIVE' ? r.inj : null;
        t.players.push(p);
    });
    const teamList = Object.values(TEAMS).sort((x, y) => x.owner.localeCompare(y.owner));
    // the team's actual lineup, the way the rest of the site shows rosters: starters in slot order, then Bench, then IR
    const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K', 'P', 'HC', 'BE', 'IR'];
    const slotIdx = p => { const i = SLOT_ORDER.indexOf(p.slot); return i < 0 ? 8.5 : i; };
    teamList.forEach(t => t.players.sort((x, y) => slotIdx(x) - slotIdx(y) || POS_ORDER(x) - POS_ORDER(y) || y.val - x.val));
    function POS_ORDER(p) { const i = ['QB', 'RB', 'WR', 'TE', 'D/ST', 'K', 'P', 'HC'].indexOf(p.pos); return i < 0 ? 9 : i; }

    // best lineup from a set of players (dedicated slots first, best value; FLEX takes the best RB/WR/TE left)
    function lineup(players, v = p => p.val, withIr = false) {
        const pool = players.filter(p => withIr || !p.ir).sort((x, y) => v(y) - v(x)), used = new Set(), out = [];
        SLOTS.forEach(([slot, n, ok]) => {
            for (let i = 0; i < n; i++) {
                const p = pool.find(x => !used.has(x) && ok.includes(x.pos));
                if (p) used.add(p);
                out.push({ slot: n > 1 ? `${slot}${i + 1}` : slot, p: p || null });
            }
        });
        const total = out.reduce((t, s) => t + (s.p ? v(s.p) : 0), 0);
        const depth = pool.filter(p => !used.has(p)).reduce((t, p) => t + Math.max(0, p.vor), 0);
        return { out, total, depth, used };
    }
    // position-group strength: the best N at each position (N = its dedicated starting slots), ranked across the league
    const GROUPS = ['QB', 'RB', 'WR', 'TE'];
    const NEED = Object.fromEntries(GROUPS.map(g => [g, (SLOTS.find(s => s[0] === g) || [0, 1])[1]]));
    const groupVal = players => Object.fromEntries(GROUPS.map(g => [g, players.filter(p => !p.ir && p.pos === g).map(p => p.val)
        .sort((x, y) => y - x).slice(0, NEED[g]).reduce((t, v) => t + v, 0)]));
    const BASE = Object.fromEntries(teamList.map(t => [t.oid, groupVal(t.players)]));

    // ---------------------------------------------------------------- state (in the URL so a trade can be shared)
    const st = {
        teams: (param('t') || '').split(',').map(Number).filter(id => TEAMS[id]).slice(0, MAX),
        moves: Object.fromEntries((param('p') || '').split(',').filter(Boolean).map(x => x.split(':').map(Number)).filter(([id, to]) => P[id] && TEAMS[to]))
    };
    while (st.teams.length < 2) { const t = teamList.find(x => !st.teams.includes(x.oid)); st.teams.push(t.oid); }
    const clean = () => {
        Object.keys(st.moves).forEach(id => { const p = P[id], to = st.moves[id]; if (!st.teams.includes(p.oid) || !st.teams.includes(to) || to === p.oid) delete st.moves[id]; });
    };
    const sync = () => {
        const u = new URL(location.href);
        u.searchParams.set('t', st.teams.join(','));
        const m = Object.entries(st.moves).map(([id, to]) => `${id}:${to}`).join(',');
        if (m) u.searchParams.set('p', m); else u.searchParams.delete('p');
        history.replaceState(null, '', u);
    };

    SITE.subHeader({ crumbs: [['Players', url('pages/players/index.html')], ['Trade Calculator']],
                     tabs: [{ label: 'All Players', href: url('pages/players/index.html') }, { label: 'Trade Calculator', href: url('pages/players/trade-calculator.html'), active: true }] });
    SITE.hero({ title: 'Trade Calculator', size: 'short', dots: false, image: 'background-6.png',
                meta: [`${season} rosters as of week ${week}`, 'Value = PPG + projected PPG · lineup fit · positional rank'] });

    content.innerHTML = `<div class="wrap page-pad">
        <div class="db-slicers tc-bar">
            ${[0, 1, 2, 3].map(i => `<label class="sx-f"><span>Team ${i + 1}</span><select class="select tc-team" data-i="${i}"></select></label>`).join('')}
            <span class="tc-btns"><button class="btn btn-black" id="tc-clear">Clear trade</button></span>
        </div>
        <div class="tc-cols" id="tc-cols"></div>
        <div id="tc-result"></div></div>`;
    const selects = [...content.querySelectorAll('.tc-team')];

    function render() {
        clean(); sync();
        selects.forEach((s, i) => {
            const cur = st.teams[i];
            s.innerHTML = (i >= 2 ? `<option value="">None</option>` : '') + teamList.filter(t => t.oid === cur || !st.teams.includes(t.oid))
                .map(t => `<option value="${t.oid}"${t.oid === cur ? ' selected' : ''}>${esc(t.owner)}</option>`).join('');
            s.disabled = i > st.teams.length;
        });
        const n = st.teams.length;
        document.getElementById('tc-cols').style.setProperty('--n', n);
        document.getElementById('tc-cols').innerHTML = st.teams.map(oid => teamPanel(TEAMS[oid])).join('');
        document.getElementById('tc-result').innerHTML = result();
    }

    const SLOT_COLOR = { ...POS_COLOR, FLEX: '#3d7f8c', BE: '#8a9097', IR: '#7b1e2b' };
    const slotChip = s => `<span class="tc-slotchip" style="background:${SLOT_COLOR[s] || '#8a9097'}">${esc(s)}</span>`;
    function teamPanel(t) {
        const slim = st.teams.length > 3;   // four rosters side by side: Rank and Value only, so names keep their room
        const ncol = slim ? 5 : 7;
        const row = (slot, p) => p ? `<tr class="tc-row${st.moves[p.id] != null ? ' on' : ''}" data-id="${p.id}" draggable="true">
                <td class="c"><span class="tc-box">${st.moves[p.id] != null ? '&#10003;' : ''}</span></td>
                <td>${slotChip(slot)}</td>
                <td><b>${esc(p.name)}</b>${p.inj && !p.ir ? ` <em class="tc-tag" title="${esc(p.inj)}">${esc(p.inj[0])}</em>` : ''}</td>
                <td class="num">${p.rank ? `${esc(p.pos === 'D/ST' ? 'D' : p.pos)}${p.rank}` : '-'}</td>
                ${slim ? '' : `<td class="num">${f1(p.ppg)}</td><td class="num muted">${f1(p.pproj)}</td>`}<td class="num"><b>${f1(p.val)}</b></td></tr>`
            : `<tr class="tc-empty" data-oid="${t.oid}"><td></td><td>${slotChip(slot)}</td><td colspan="${ncol - 2}" class="muted">Empty</td></tr>`;
        // fill each slot from the saved lineup, then pad to the season's slot counts
        const fill = (slot, n) => {
            const list = t.players.filter(p => p.slot === slot);
            return [...list, ...Array(Math.max(0, n - list.length)).fill(null)].map(p => row(slot, p)).join('');
        };
        const known = new Set([...SLOTS.map(s => s[0]), 'BE', 'IR']);
        const odd = t.players.filter(p => !known.has(p.slot)).map(p => row(p.slot || 'BE', p)).join('');
        const group = label => `<tr class="group"><td colspan="${ncol}">${label}</td></tr>`;
        const lu = lineup(t.players);
        return `<section class="panel tc-team-panel" data-oid="${t.oid}">
            <div class="tc-head"><img src="${GT.logo(t.owner)}" alt=""><div><h3 class="panel-title">${esc(t.owner)}</h3>
                <small>Best lineup ${f1(lu.total)} PPG</small></div></div>
            <table class="data-table tc-table"><colgroup><col style="width:24px"><col style="width:46px"><col><col style="width:48px">${slim ? '' : '<col style="width:40px"><col style="width:40px">'}<col style="width:50px"></colgroup>
                <thead><tr><th></th><th>Slot</th><th>Player</th><th class="num">Rank</th>${slim ? '' : '<th class="num">PPG</th><th class="num">Proj</th>'}<th class="num">Value</th></tr></thead>
                <tbody>${SLOTS.map(([s, n]) => fill(s, n)).join('')}${odd}
                ${group('Bench')}${fill('BE', RR.bench || 0)}
                ${RR.ir ? `${group('IR')}${fill('IR', RR.ir)}` : ''}</tbody></table></section>`;
    }

    function result() {
        const ids = Object.keys(st.moves).map(Number);
        if (!ids.length) return '';
        const after = Object.fromEntries(st.teams.map(o => [o, TEAMS[o].players.filter(p => st.moves[p.id] == null)]));
        ids.forEach(id => after[st.moves[id]].push(P[id]));
        const rows = st.teams.map(oid => {
            const t = TEAMS[oid], before = lineup(t.players);
            let roster = after[oid].slice(), drops = [];
            let lu = lineup(roster);
            const over = roster.filter(p => !p.ir).length - ACTIVE_MAX;
            if (over > 0) {
                drops = roster.filter(p => !p.ir && !lu.used.has(p)).sort((x, y) => x.val - y.val).slice(0, over);
                roster = roster.filter(p => !drops.includes(p)); lu = lineup(roster);
            }
            const dStart = lu.total - before.total, dDepth = lu.depth - before.depth;
            const sent = t.players.filter(p => st.moves[p.id] != null), got = ids.map(id => P[id]).filter(p => st.moves[p.id] === oid);
            // who joins / leaves the best starting lineup
            const ins = [...lu.used].filter(p => !before.used.has(p)).sort((x, y) => y.val - x.val);
            const outs = [...before.used].filter(p => !lu.used.has(p)).sort((x, y) => y.val - x.val);
            return { t, oid, sent, got, drops, before, lu, roster, dStart, dDepth, impact: dStart + dDepth / 4, ins, outs };
        });
        // record to date: each week, a trade team's real score moves by (best lineup from the new roster - best lineup
        // from today's roster) on that week's actual points; an opponent in the trade moves the same way
        const wkPts = w => p => (p.wk && p.wk[w]) || 0;
        const DELTA = {};
        rows.forEach(r => {
            DELTA[r.oid] = {};
            [...new Set(GAMES.filter(g => g.oid === r.oid).map(g => g.week))].forEach(w => {
                DELTA[r.oid][w] = lineup(r.roster, wkPts(w), true).total - lineup(TEAMS[r.oid].players, wkPts(w), true).total;
            });
        });
        const rec = list => { const w = list.filter(x => x > 0).length, l = list.filter(x => x < 0).length, tie = list.length - w - l; return `${w}-${l}${tie ? `-${tie}` : ''}`; };
        rows.forEach(r => {
            const games = GAMES.filter(g => g.oid === r.oid).map(g => {
                const pf = g.pf + (DELTA[r.oid][g.week] || 0), pa = g.pa + ((DELTA[g.opp] || {})[g.week] || 0);
                return { ...g, npf: pf, npa: pa };
            });
            r.recBefore = rec(games.map(g => g.pf - g.pa)); r.recAfter = rec(games.map(g => g.npf - g.npa));
            r.flips = games.filter(g => Math.sign(g.pf - g.pa) !== Math.sign(g.npf - g.npa));
        });
        // position ranks before and after: every team in the trade as it would be afterwards
        const AFTER = { ...BASE };
        rows.forEach(r => { AFTER[r.oid] = groupVal(r.roster); });
        const rankIn = (table, oid, g) => 1 + teamList.filter(t => t.oid !== oid && table[t.oid][g] > table[oid][g]).length;
        rows.forEach(r => { r.groups = GROUPS.map(g => ({ g, from: rankIn(BASE, r.oid, g), to: rankIn(AFTER, r.oid, g) })).filter(x => x.from !== x.to); });
        // rest of the regular season on ESPN's schedule: each game's win chance from the projected lineups, before and after
        const PROJ0 = Object.fromEntries(teamList.map(x => [x.oid, lineup(x.players).total]));
        const PROJ1 = { ...PROJ0 }; rows.forEach(r => { PROJ1[r.oid] = r.lu.total; });
        rows.forEach(r => {
            r.ros = REMAIN.map(([w, list]) => { const o = oppOf(r.oid, list); return o == null ? null : { w, o, p0: winP(PROJ0[r.oid] - PROJ0[o]), p1: winP(PROJ1[r.oid] - PROJ1[o]) }; }).filter(Boolean);
            r.ew0 = r.ros.reduce((s, g) => s + g.p0, 0); r.ew1 = r.ros.reduce((s, g) => s + g.p1, 0);
            const wl = s => s.split('-').map(Number);
            const [w0, l0] = wl(r.recBefore), [w1, l1] = wl(r.recAfter), n = r.ros.length;
            r.fin0 = `${w0 + Math.round(r.ew0)}-${l0 + n - Math.round(r.ew0)}`; r.fin1 = `${w1 + Math.round(r.ew1)}-${l1 + n - Math.round(r.ew1)}`;
        });
        const best = rows.slice().sort((x, y) => y.impact - x.impact);
        const spread = best[0].impact - best[best.length - 1].impact;
        const verdict = spread < 1 ? 'Even trade' : `${esc(best[0].t.owner)} wins this trade`;
        const sub = spread < 1 ? 'Every team lands within a point per week' : `+${f1(best[0].impact)} impact per week · ${rows.length > 2 ? `${esc(best[best.length - 1].t.owner)} gives up the most` : `${f1(spread)} point swing`}`;
        const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.impact)));
        const pl = p => `<span class="pnm">${posChip(p.pos)}<span>${esc(p.name)}</span></span><b>${f1(p.val)}</b>`;
        const dest = p => st.teams.length > 2 ? `<select class="tc-to" data-id="${p.id}">${st.teams.filter(o => o !== p.oid).map(o => `<option value="${o}"${st.moves[p.id] === o ? ' selected' : ''}>to ${esc(TEAMS[o].owner)}</option>`).join('')}</select>` : '';
        const pc = v => `${Math.round(v * 100)}%`;
        const stat = (label, from, to, delta, dcls) => `<div class="tc-stat"><span>${label}</span><b>${from} &rarr; ${to}</b><em class="${dcls}">${delta}</em></div>`;
        // one card per analytic, one column per team inside it
        const card = (eyebrow, title, body) => `<section class="panel tc-an"><div class="eyebrow">${eyebrow}</div><h3 class="panel-title">${title}</h3>
            <div class="tc-cards" style="--n:${rows.length}">${rows.map(r => `<div class="tc-card"><div class="tc-card-head"><img src="${GT.logo(r.t.owner)}" alt=""><b>${esc(r.t.owner)}</b></div>${body(r)}</div>`).join('')}</div></section>`;
        // a list for team r, padded with blank rows to the longest list across the teams so every column lines up
        const padded = (lists, r, none) => {
            const n = Math.max(1, ...lists.map(l => l.length)), mine = lists[rows.indexOf(r)];
            const out = mine.length ? mine.slice() : [`<div class="tc-chg muted">${none}</div>`];
            while (out.length < n) out.push('<div class="tc-chg tc-blank"></div>');
            return out.join('');
        };
        const flipped = r => r.flips.filter(g => g.npf > g.npa).length - r.flips.filter(g => g.npf < g.npa).length;
        return `<section class="panel tc-verdict"><div class="tc-v-head"><div><div class="eyebrow">Verdict</div><h2 class="section-title">${verdict}</h2><small>${sub}</small></div>
            <div class="tc-bars">${best.map(r => `<div class="tc-bar-row"><span>${esc(r.t.owner)}</span><div class="tc-bar-track"><i class="${r.impact >= 0 ? 'pos' : 'neg'}" style="width:${Math.abs(r.impact) / maxAbs * 50}%"></i></div><b class="${cls(r.impact)}">${sg(r.impact)}</b></div>`).join('')}</div></div></section>
        ${card('The deal', 'Players moving', r => `
            <div class="tc-sub">Gets</div>${padded(rows.map(x => x.got.map(p => `<div class="tc-pl">${pl(p)}</div>`)), r, 'Nothing')}
            <div class="tc-sub">Gives</div>${padded(rows.map(x => x.sent.map(p => `<div class="tc-pl">${pl(p)}${dest(p)}</div>`)), r, 'Nothing')}
            ${rows.some(x => x.drops.length) ? `<div class="tc-sub">Must drop</div>${padded(rows.map(x => x.drops.map(p => `<div class="tc-pl">${pl(p)}</div>`)), r, 'Nobody')}` : ''}`)}
        ${card(`Through week ${LAST} and projected to week ${LAST + REMAIN.length}`, 'Record', r => `
            <div class="tc-stats">
                ${stat('To date', r.recBefore, r.recAfter, r.flips.length ? `${r.flips.length} flip${r.flips.length > 1 ? 's' : ''}` : 'No change', cls(flipped(r)))}
                ${stat('Remaining', `${r.ew0.toFixed(1)} W`, `${r.ew1.toFixed(1)} W`, sg(r.ew1 - r.ew0), cls(r.ew1 - r.ew0))}
                ${stat('Projected', r.fin0, r.fin1, '', '')}
            </div>`)}
        ${rows.some(x => x.flips.length) ? card(`Weeks 1-${LAST} replayed with the new rosters`, 'Games That Flip', r => padded(rows.map(x => x.flips.map(g =>
            `<div class="tc-chg"><span class="tc-slot">W${g.week}</span><span class="tc-who">vs ${esc(g.oppName)} · ${f1(g.pf)}-${f1(g.pa)} &rarr; ${f1(g.npf)}-${f1(g.npa)}</span><em class="${g.npf > g.npa ? 'win' : 'loss'}">${g.npf > g.npa ? 'W' : 'L'}</em></div>`)), r, 'No games flip')) : ''}
        ${card(`Weeks ${LAST + 1}-${LAST + REMAIN.length} on the ESPN schedule`, 'Remaining Schedule', r => `<div class="tc-sub">Win chance, now &rarr; after the trade</div>${padded(rows.map(x => x.ros.map(g =>
            `<div class="tc-chg"><span class="tc-slot">W${g.w}</span><span class="tc-who">vs ${esc(TEAMS[g.o] ? TEAMS[g.o].owner : '')}</span><span class="tc-pp">${pc(g.p0)} &rarr; ${pc(g.p1)}</span><em class="${cls((g.p1 - g.p0) * 100)}">${sg((g.p1 - g.p0) * 100).replace('.0', '')}</em></div>`)), r, 'No schedule on file')}`)}
        ${card('Best possible lineup', 'Starting Lineup', r => `
            <div class="tc-stats">
                ${stat('Lineup PPG', f1(r.before.total), f1(r.lu.total), sg(r.dStart), cls(r.dStart))}
                ${stat('Bench depth', f1(r.before.depth), f1(r.lu.depth), sg(r.dDepth), cls(r.dDepth))}
            </div>`)}
        ${card('Who starts after the trade', 'Lineup Changes', r => `
            <div class="tc-sub">Into the lineup</div>${padded(rows.map(x => x.ins.map(p => `<div class="tc-chg"><span class="tc-slot win">IN</span><span class="tc-who">${posChip(p.pos)} ${esc(p.name)}</span><em>${f1(p.val)}</em></div>`)), r, 'Nobody')}
            <div class="tc-sub">Out of the lineup</div>${padded(rows.map(x => x.outs.map(p => `<div class="tc-chg"><span class="tc-slot loss">OUT</span><span class="tc-who">${posChip(p.pos)} ${esc(p.name)}</span><em>${f1(p.val)}</em></div>`)), r, 'Nobody')}`)}
        ${card(`Starters at each position against all ${teamList.length} teams`, 'Position Ranks', r => GROUPS.map(g => {
            const from = rankIn(BASE, r.oid, g), to = rankIn(AFTER, r.oid, g);
            return `<div class="tc-chg"><span class="tc-slot">${posChip(g)}</span><span class="tc-who">${ord(from)} &rarr; ${ord(to)}</span><em class="${cls(from - to)}">${to < from ? '&#9650;' : to > from ? '&#9660;' : ''}</em></div>`; }).join(''))}`;
    }
    function ord(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

    // ---------------------------------------------------------------- events
    content.addEventListener('change', e => {
        const s = e.target.closest('.tc-team');
        if (s) {
            const i = Number(s.dataset.i), v = Number(s.value);
            if (v) st.teams[i] = v; else st.teams.splice(i);
            st.teams = st.teams.filter(Boolean);
            render(); return;
        }
        const to = e.target.closest('.tc-to');
        if (to) { st.moves[to.dataset.id] = Number(to.value); render(); }
    });
    content.addEventListener('click', e => {
        if (e.target.closest('.tc-to')) return;
        const row = e.target.closest('.tc-row');
        if (row) {
            const p = P[row.dataset.id];
            if (st.moves[p.id] != null) delete st.moves[p.id];
            else st.moves[p.id] = st.teams.find((o, i) => o !== p.oid && i === (st.teams.indexOf(p.oid) + 1) % st.teams.length) || st.teams.find(o => o !== p.oid);
            render(); return;
        }
        if (e.target.closest('#tc-clear')) { st.moves = {}; render(); }
    });
    // drag a player onto another team's player: the two swap. Onto an empty slot or the team's panel: he goes there alone.
    let drag = null;
    const target = e => {
        const row = e.target.closest('.tc-row'), panel = e.target.closest('.tc-team-panel');
        if (!drag || !panel) return null;
        const to = Number(panel.dataset.oid);
        if (to === drag.oid) return null;
        return { el: row || e.target.closest('.tc-empty') || panel, to, p: row ? P[row.dataset.id] : null };
    };
    const unmark = () => content.querySelectorAll('.tc-drop').forEach(x => x.classList.remove('tc-drop'));
    content.addEventListener('dragstart', e => {
        const row = e.target.closest('.tc-row'); if (!row) return;
        drag = P[row.dataset.id];
        e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(drag.id));
        requestAnimationFrame(() => row.classList.add('tc-dragging'));
    });
    content.addEventListener('dragover', e => {
        const tg = target(e); if (!tg) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        if (!tg.el.classList.contains('tc-drop')) { unmark(); tg.el.classList.add('tc-drop'); }
    });
    content.addEventListener('dragleave', e => { if (!content.contains(e.relatedTarget)) unmark(); });
    content.addEventListener('drop', e => {
        const tg = target(e); if (!tg) return;
        e.preventDefault();
        st.moves[drag.id] = tg.to;
        if (tg.p) st.moves[tg.p.id] = drag.oid;
        drag = null; render();
    });
    content.addEventListener('dragend', () => { drag = null; unmark(); content.querySelectorAll('.tc-dragging').forEach(x => x.classList.remove('tc-dragging')); });
    render();
})();
