/* Game Center: one fantasy matchup. Same data and calculations as the public site's game-details.js
   (box score by lineup slot, position FP+, lineup optimization), restyled, plus top-performer callouts. */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    const gameId = param('id');
    const rows = gameId ? await LeagueDb.gameById(gameId) : [];
    if (!rows.length) {
        SITE.subHeader({ crumbs: [['Past Seasons', url('pages/past-seasons/index.html')], ['Game Center']], tabs: [] });
        SITE.hero({ title: 'Game Center', size: 'short', dots: false, image: 'background-10.png', meta: ['Game not found'] });
        content.innerHTML = '<div class="wrap page-pad"><div class="panel" style="margin-top:34px">That game could not be found.</div></div>';
        return;
    }
    const g0 = rows[0];
    const game = { id: g0['Game ID'], season: g0.Season, week: g0.Week, period: g0['Season Period'],
                   home: g0.Team, away: g0.Opponent, hs: Number(g0['Team Score']), as: Number(g0['Opponent Score']) };
    const label = GT.periodLabel(game.period, game.week);
    document.title = `${game.home} vs ${game.away} · ${game.season} ${label} - Grass Touchers FFL`;

    // ---------------------------------------------------------------- rosters (+ each player's NFL game, as on the public site)
    const [roster, nfl, rules] = await Promise.all([LeagueDb.fantasyRoster(game.season, game.week),
                                                     LeagueDb.nflGames(game.season, game.week), LeagueDb.rosterRules()]);
    const byTeam = new Map();
    nfl.forEach(n => {
        byTeam.set(n.home_team, { opponent: n.away_team, own: n.home_score, opp: n.away_score, completed: !!n.completed });
        byTeam.set(n.away_team, { opponent: n.home_team, own: n.away_score, opp: n.home_score, completed: !!n.completed });
    });
    roster.teams.forEach(t => t.roster.forEach(p => {
        const n = p.proTeam ? byTeam.get(String(p.proTeam).toUpperCase()) : null;
        if (!n) return;
        p.proOpponent = n.opponent;
        if (!n.completed || n.own == null || n.opp == null) return;
        p.outcome = n.own > n.opp ? 'W' : n.own < n.opp ? 'L' : 'T';
        p.scoreDisplay = `${n.own}-${n.opp}`;
    }));
    const find = name => (roster.teams.find(t => (t.owner || '').toLowerCase() === name.toLowerCase()) || {}).roster || [];
    const homeR = find(game.home), awayR = find(game.away);

    // roster slots for the season (closest earlier season if the exact one is missing)
    const ruleRow = rules.filter(r => r.Season <= game.season).sort((x, y) => y.Season - x.Season)[0] || rules[0] || {};
    const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST', 'P', 'HC'];
    // never fewer rows than a team actually started in a slot (a stale rules row once hid every 2026 HC)
    const started = {};
    [homeR, awayR].forEach(r => {
        const c = {};
        r.forEach(p => { if (SLOT_ORDER.includes(p.slotPosition)) c[p.slotPosition] = (c[p.slotPosition] || 0) + 1; });
        Object.entries(c).forEach(([s, n]) => { started[s] = Math.max(started[s] || 0, n); });
    });
    const slots = SLOT_ORDER.flatMap(s => Array(Math.max(Number(ruleRow[s]) || 0, started[s] || 0)).fill(s));
    const benchSlots = Number(ruleRow.BE) || 0, irSlots = Number(ruleRow.IR) || 0;

    // ---------------------------------------------------------------- shared helpers
    const nflLogo = t => t ? `<img class="gc-nfl" src="${url(`assets/nfl-logos/${String(t).toLowerCase() === 'was' ? 'wsh' : String(t).toLowerCase()}.png`)}" alt="${esc(t)}" onerror="this.src='${url('assets/nfl-logos/nfl.png')}';this.onerror=null">` : '';
    const f1 = v => v == null || v === '' ? '-' : Number(v).toFixed(1);
    const fpClass = (a, p) => !a || !p ? '' : a > p ? 'win' : a < p ? 'loss' : '';
    const headshot = p => p.playerId > 0 ? `https://a.espncdn.com/i/headshots/nfl/players/full/${p.playerId}.png` : url(`assets/nfl-logos/${String(p.proTeam || 'nfl').toLowerCase()}.png`);
    const pHref = p => p.playerId > 0 ? url(`pages/players/stats.html?id=${p.playerId}`) : '';
    const mHref = n => url(`pages/managers/overview.html?m=${(b.byName[n.toLowerCase()] || {}).id || n}`);

    // ---------------------------------------------------------------- header
    const LIVE = !!g0.Live;                       // the week in progress: score so far, from the last data update
    const homeWon = !LIVE && game.hs > game.as, awayWon = !LIVE && game.as > game.hs;
    const status = LIVE ? `Live · ${GT.updatedText(g0.Updated)}` : 'Final';
    SITE.subHeader({
        crumbs: [['Past Seasons', url('pages/past-seasons/index.html')],
                 [`${game.season}`, url(`pages/past-seasons/overview.html?season=${game.season}`)], [`${label} Game Center`]],
        tabs: [{ label: 'Matchup', href: '#matchup', active: true }, { label: 'Team Rosters', href: '#rosters' }, { label: 'Roster Analysis', href: '#analysis' }]
    });
    SITE.hero({ title: `${game.home} vs ${game.away}`, size: 'short', dots: false, image: 'background-10.png',
                meta: [`${game.season} · ${esc(label)}`, `${esc(status)} · ${f1(game.hs)} - ${f1(game.as)}`,
                       ...(LIVE ? [`Projected ${f1(g0['Team Projected'])} - ${f1(g0['Opponent Projected'])} · not final until the week's last game`] : [])] });
    const d = GT.weekDate(b, game.season, game.week);
    const scoreboard = `<section class="game-band" id="matchup" style="margin-top:34px">
        <div class="band-label"><span class="pill ${LIVE ? 'pill-accent' : 'pill-dark'}">${esc(LIVE ? 'Live' : 'Final')}</span>${esc(label)}${d ? ' · ' + GT.fmtDate(d) : ''}</div>
        <div class="scoreboard">
            <div class="sb-team"><div class="sb-logo"><img src="${GT.logo(game.home)}" alt=""></div>
                <div class="sb-name"><a href="${mHref(game.home)}">${esc(game.home)}</a><small>${esc(GT.teamName(b, game.home, game.season))}</small></div></div>
            <div class="sb-scores"><div class="sb-score ${homeWon ? 'won' : ''}">${f1(game.hs)}</div><span class="sb-at">VS</span><div class="sb-score ${awayWon ? 'won' : ''}">${f1(game.as)}</div></div>
            <div class="sb-team right"><div class="sb-name"><a href="${mHref(game.away)}">${esc(game.away)}</a><small>${esc(GT.teamName(b, game.away, game.season))}</small></div>
                <div class="sb-logo"><img src="${GT.logo(game.away)}" alt=""></div></div>
        </div></section>`;

    // ---------------------------------------------------------------- top performers (callouts)
    const all = [...homeR.map(p => ({ ...p, owner: game.home })), ...awayR.map(p => ({ ...p, owner: game.away }))];
    const starters = all.filter(p => p.slotPosition !== 'BE' && p.slotPosition !== 'IR' && p.actualPoints != null);
    const top = starters.slice().sort((x, y) => y.actualPoints - x.actualPoints).slice(0, 6);
    const bestOf = name => starters.filter(p => p.owner === name).sort((x, y) => y.actualPoints - x.actualPoints)[0];
    // best bench player, but only one who outscored a starter he could have replaced (same check as Missed Opportunities)
    const benchBest = [...optimization(homeR).missed.map(m => ({ ...m.bench, owner: game.home })),
                       ...optimization(awayR).missed.map(m => ({ ...m.bench, owner: game.away }))]
        .sort((x, y) => (y.actualPoints || 0) - (x.actualPoints || 0))[0];
    // each player's real NFL line for this week, from the player database (loaded after the page draws)
    const statLine = r => {
        const parts = [];
        if (r.pass_att) parts.push(`${r.pass_cmp || 0}/${r.pass_att} · ${r.pass_yds || 0} PYD · ${r.pass_td || 0} PTD`);
        if (r.rush_att) parts.push(`${r.rush_att} RuAtt · ${r.rush_yds || 0} RuYD${r.rush_td ? ` · ${r.rush_td} RuTD` : ''}`);
        if (r.rec) parts.push(`${r.rec} Rec · ${r.rec_yds || 0} ReYD${r.rec_td ? ` · ${r.rec_td} ReTD` : ''}`);
        if (r.fg_att || r.xp_att) parts.push(`${r.fg_made || 0}/${r.fg_att || 0} FG · ${r.xp_made || 0}/${r.xp_att || 0} XP`);
        if (r.punt) parts.push(`${r.punt} punts · ${r.punt_in20 || 0} in 20`);
        if (r.pts_allowed != null) parts.push(`${r.pts_allowed} PA · ${r.def_sck || 0} sacks · ${(r.def_int || 0) + (r.fum_rec || 0)} TO`);
        return parts.slice(0, 2).join(' · ');
    };
    const row = (p, i) => `<a class="fp-row" ${pHref(p) ? `href="${pHref(p)}"` : ''}>
        <span class="fp-shot"><img src="${headshot(p)}" alt="" onerror="this.src='${url('assets/nfl-logos/nfl.png')}';this.onerror=null"></span>
        <span class="fp-who"><b>${esc(p.name)}</b><small>${esc(p.position)} · ${esc(p.owner)}</small><em class="fp-line" data-pid="${p.playerId}" data-team="${esc(p.proTeam || '')}"></em></span>
        <span class="fp-num">${f1(p.actualPoints)}</span></a>`;
    const callout = (title, p, note) => p ? `<div class="fp-callout"><h3>${title}</h3>
        <a class="fp-call" ${pHref(p) ? `href="${pHref(p)}"` : ''}><span class="fp-shot lg"><img src="${headshot(p)}" alt="" onerror="this.src='${url('assets/nfl-logos/nfl.png')}';this.onerror=null"></span>
        <span class="fp-who"><b>${f1(p.actualPoints)} · ${esc(p.name)} · ${esc(p.position)}</b><small>${esc(note)}</small><em class="fp-line" data-pid="${p.playerId}" data-team="${esc(p.proTeam || '')}"></em></span></a></div>` : '';
    const featured = `<section class="fp-section">
        <div class="fp-intro"><div class="eyebrow">${game.season} · ${esc(label)}</div><h2 class="section-title">Top<br>Performers</h2>
            <p class="section-copy">The six best starters in this matchup, with their real NFL game.</p></div>
        <div class="fp-grid">${top.map(row).join('')}</div>
    </section>
    <div class="fp-callouts">
        ${callout(`${esc(game.home)} · Best Start`, bestOf(game.home), GT.teamName(b, game.home, game.season))}
        ${callout(`${esc(game.away)} · Best Start`, bestOf(game.away), GT.teamName(b, game.away, game.season))}
        ${callout('Best Seat on the Bench', benchBest, `Left on ${benchBest ? benchBest.owner : ''}'s bench`)}
    </div>`;

    // ---------------------------------------------------------------- Team Rosters (mirrored box score)
    const nthInSlot = (r, slot, used) => r.find(p => p.slotPosition === slot && !used.has(p.playerId));
    const cells = (p, side) => {
        const name = p ? (pHref(p) ? `<a href="${pHref(p)}">${esc(p.name)}</a>` : esc(p.name)) : '-';
        const res = p && p.scoreDisplay ? `<span class="${p.outcome === 'W' ? 'win' : p.outcome === 'L' ? 'loss' : ''}">${p.scoreDisplay}</span>` : '-';
        const list = [`<td class="gc-player">${name}</td>`, `<td>${p ? esc(p.position) : '-'}</td>`, `<td>${p ? nflLogo(p.proTeam) : ''}</td>`,
                      `<td>${p ? nflLogo(p.proOpponent) : ''}</td>`, `<td>${res}</td>`, `<td class="num">${p ? f1(p.projectedPoints) : '-'}</td>`,
                      `<td class="num strong ${p ? fpClass(p.actualPoints, p.projectedPoints) : ''}">${p ? f1(p.actualPoints) : '-'}</td>`];
        return side === 'home' ? list.join('') : list.reverse().join('');
    };
    const winner = (h, a) => !h || !a || h.actualPoints == null || a.actualPoints == null || h.actualPoints === a.actualPoints ? ''
        : h.actualPoints > a.actualPoints ? 'home' : 'away';
    const slotCells = (slot, won = '') => `<td class="gc-arw">${won === 'home' ? '◀' : ''}</td><td class="gc-slot">${slot}</td><td class="gc-arw">${won === 'away' ? '▶' : ''}</td>`;
    const tot = list => list.reduce((s, p) => s + (Number(p) || 0), 0);
    const totalsRow = (hp, hf, ap, af, labelText) => {
        const fp = (a, p) => p > 0 ? (a / p * 100).toFixed(2) : '0.00';
        return `<tr class="gc-total"><td colspan="4"></td><td class="num ${fpClass(hf, hp)}">${fp(hf, hp)}</td><td class="num">${hp.toFixed(1)}</td><td class="num">${hf.toFixed(1)}</td>
            ${slotCells(labelText)}<td class="num">${af.toFixed(1)}</td><td class="num">${ap.toFixed(1)}</td><td class="num ${fpClass(af, ap)}">${fp(af, ap)}</td><td colspan="4"></td></tr>`;
    };
    const COLS = SITE.cols('17.5%', '4%', '3.5%', '3.5%', '6%', '5%', '5.5%', '2.5%', '5%', '2.5%', '5.5%', '5%', '6%', '3.5%', '3.5%', '4%', '17.5%');
    const head = (slotLabel) => `<thead><tr><th>Player</th><th>Pos</th><th>NFL</th><th>Opp</th><th>Result</th><th class="num">Proj</th><th class="num">FP</th>
        <th class="gc-arw"></th><th class="gc-slot">${slotLabel}</th><th class="gc-arw"></th><th class="num">FP</th><th class="num">Proj</th><th>Result</th><th>Opp</th><th>NFL</th><th>Pos</th><th class="r">Player</th></tr></thead>`;
    const usedH = new Set(), usedA = new Set();
    let starterRows = '';
    slots.forEach(slot => {
        const h = nthInSlot(homeR, slot, usedH), a = nthInSlot(awayR, slot, usedA);
        if (h) usedH.add(h.playerId); if (a) usedA.add(a.playerId);
        starterRows += `<tr>${cells(h, 'home')}${slotCells(slot, winner(h, a))}${cells(a, 'away')}</tr>`;
    });
    const hs = homeR.filter(p => usedH.has(p.playerId)), as = awayR.filter(p => usedA.has(p.playerId));
    starterRows += totalsRow(tot(hs.map(p => p.projectedPoints)), tot(hs.map(p => p.actualPoints)), tot(as.map(p => p.projectedPoints)), tot(as.map(p => p.actualPoints)), 'Totals');
    const hb = homeR.filter(p => p.slotPosition === 'BE'), ab = awayR.filter(p => p.slotPosition === 'BE');
    const hi = homeR.filter(p => p.slotPosition === 'IR'), ai = awayR.filter(p => p.slotPosition === 'IR');
    let benchRows = '';
    for (let i = 0; i < Math.max(benchSlots, hb.length, ab.length); i++) benchRows += `<tr>${cells(hb[i], 'home')}${slotCells('BE')}${cells(ab[i], 'away')}</tr>`;
    if (irSlots || hi.length || ai.length) {
        benchRows += `<tr class="group"><td colspan="17">Injured Reserve (IR)</td></tr>`;
        for (let i = 0; i < Math.max(irSlots, hi.length, ai.length); i++) benchRows += `<tr>${cells(hi[i], 'home')}${slotCells('IR')}${cells(ai[i], 'away')}</tr>`;
    }
    benchRows += totalsRow(tot(hb.map(p => p.projectedPoints)), tot(hb.map(p => p.actualPoints)), tot(ab.map(p => p.projectedPoints)), tot(ab.map(p => p.actualPoints)), 'Totals');
    const teamHead = `<div class="gc-teams"><a href="${mHref(game.home)}"><img src="${GT.logo(game.home)}" alt="">${esc(game.home)}</a>
        <span>Starters</span><a class="r" href="${mHref(game.away)}">${esc(game.away)}<img src="${GT.logo(game.away)}" alt=""></a></div>`;
    const rostersPanel = homeR.length || awayR.length ? `
        <div class="panel" id="rosters"><h3 class="panel-title" style="margin-bottom:14px">Team Rosters</h3>${teamHead}
            <div class="table-scroll"><table class="data-table gc-box" style="min-width:1050px">${COLS}${head('Pos')}<tbody>${starterRows}</tbody></table></div>
            <h3 class="panel-title" style="margin:26px 0 14px">Bench Players</h3>
            <div class="table-scroll"><table class="data-table gc-box" style="min-width:1050px">${COLS}${head('Slot')}<tbody>${benchRows}</tbody></table></div>
        </div>` : '<div class="panel" id="rosters">No roster data for this game.</div>';

    // ---------------------------------------------------------------- Roster Analysis (same calculations as game-details.js)
    function positionStats(r) {
        const by = {};
        r.forEach(p => {
            const pos = p.slotPosition;
            if (pos === 'BE' || pos === 'IR') return;
            (by[pos] = by[pos] || { actual: 0, projected: 0 });
            by[pos].actual += Number(p.actualPoints) || 0;
            by[pos].projected += Number(p.projectedPoints) || 0;
        });
        return by;
    }
    function optimization(r) {
        const roster = r.map(p => ({ ...p, actualPoints: p.actualPoints == null ? 0 : p.actualPoints }));
        const activeByPos = {}, benchByPos = {}, filled = {};
        let actual = 0;
        roster.forEach(p => {
            (activeByPos[p.position] = activeByPos[p.position] || []); (benchByPos[p.position] = benchByPos[p.position] || []);
            if (p.slotPosition !== 'BE' && p.slotPosition !== 'IR') {
                activeByPos[p.position].push(p); actual += Number(p.actualPoints) || 0;
                filled[p.slotPosition] = (filled[p.slotPosition] || 0) + 1;
            } else if (p.slotPosition === 'BE') benchByPos[p.position].push(p);
        });
        const expected = {};
        Object.keys(ruleRow).forEach(k => { if (SLOT_ORDER.includes(k)) expected[k] = Number(ruleRow[k]) || 0; });
        const flexEligible = ['RB', 'WR', 'TE'];
        const active = Object.values(activeByPos).flat(), bench = Object.values(benchByPos).flat();
        active.sort((x, y) => (y.actualPoints || 0) - (x.actualPoints || 0));
        bench.sort((x, y) => (y.actualPoints || 0) - (x.actualPoints || 0));
        const missed = [];
        bench.forEach(bp => {
            const pts = Number(bp.actualPoints) || 0;
            if (pts <= 0) return;
            (activeByPos[bp.position] || []).forEach(ap => { const a = Number(ap.actualPoints) || 0; if (pts > a) missed.push({ bench: bp, active: ap, diff: pts - a }); });
            if (flexEligible.includes(bp.position)) active.filter(p => p.slotPosition === 'FLEX').forEach(fp => {
                const a = Number(fp.actualPoints) || 0;
                if (pts > a && !missed.some(m => m.bench === bp && m.active === fp)) missed.push({ bench: bp, active: fp, diff: pts - a });
            });
            Object.keys(expected).forEach(pos => {
                if ((filled[pos] || 0) < expected[pos] && (bp.position === pos || (pos === 'FLEX' && flexEligible.includes(bp.position))))
                    missed.push({ bench: bp, active: { name: `Empty ${pos} Slot`, position: pos, actualPoints: 0, emptySlot: true }, diff: pts });
            });
        });
        missed.sort((x, y) => y.diff - x.diff);
        const unique = [], usedB = new Set(), usedAct = new Set(), filledEmpty = {};
        missed.forEach(m => {
            if (m.active.emptySlot) {
                const pos = m.active.position;
                if (!usedB.has(m.bench.playerId) && (filled[pos] || 0) + (filledEmpty[pos] || 0) < (expected[pos] || 0)) {
                    unique.push(m); usedB.add(m.bench.playerId); filledEmpty[pos] = (filledEmpty[pos] || 0) + 1;
                }
            } else if (!usedB.has(m.bench.playerId) && !usedAct.has(m.active.playerId)) {
                unique.push(m); usedB.add(m.bench.playerId); usedAct.add(m.active.playerId);
            }
        });
        const left = unique.reduce((s, m) => s + m.diff, 0);
        return { actual, optimal: actual + left, left, score: Math.round(actual / (actual + left) * 100), missed: unique };
    }
    const posTable = (name, r) => {
        const by = positionStats(r);
        return `<div class="panel" style="margin:0"><div class="gc-side"><img src="${GT.logo(name)}" alt=""><h3 class="panel-title">${esc(name)}</h3></div>
            <div class="table-scroll"><table class="data-table">${SITE.cols('25%', '25%', '25%', '25%')}<thead><tr><th>Position</th><th class="num">Points</th><th class="num">Projected</th><th class="num">FP+</th></tr></thead><tbody>
            ${['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'P', 'D/ST', 'HC'].filter(p => by[p]).map(p => { const s = by[p];
                return `<tr><td><b>${p}</b></td><td class="num">${s.actual.toFixed(1)}</td><td class="num">${s.projected.toFixed(1)}</td>
                    <td class="num strong ${fpClass(s.actual, s.projected)}">${s.projected > 0 ? (s.actual / s.projected).toFixed(2) : '0.00'}</td></tr>`; }).join('')}
            </tbody></table></div></div>`;
    };
    const optCard = (name, r) => {
        const o = optimization(r);
        const tier = o.score >= 95 ? 'excellent' : o.score >= 85 ? 'good' : o.score >= 75 ? 'average' : 'poor';
        return `<div class="panel" style="margin:0"><div class="gc-side"><img src="${GT.logo(name)}" alt=""><h3 class="panel-title">${esc(name)}</h3></div>
            <div class="gc-opt"><div class="gc-ring ${tier}" style="--p:${o.score}"><b>${o.score}%</b><span>Efficiency</span></div>
                <ul class="kv"><li><span>Actual points</span><b>${o.actual.toFixed(1)}</b></li><li><span>Optimal points</span><b>${o.optimal.toFixed(1)}</b></li>
                    <li><span>Points left on bench</span><b class="${o.left > 0 ? 'loss' : ''}">${o.left.toFixed(1)}</b></li></ul></div>
            <h4 class="gc-sub">${o.missed.length ? 'Missed Opportunities' : 'Perfect Lineup'}</h4>
            ${o.missed.length ? `<div class="table-scroll"><table class="data-table">${SITE.cols('32%', '12%', '12%', '32%', '12%')}<thead><tr><th>Should have started</th><th>Pos</th><th class="num">Pts</th><th>Over</th><th class="num">Pts</th></tr></thead><tbody>
                ${o.missed.map(m => `<tr><td>${esc(m.bench.name)}</td><td>${esc(m.bench.position)}</td><td class="num win">${f1(m.bench.actualPoints)}</td>
                    <td>${esc(m.active.name)}</td><td class="num">${f1(m.active.actualPoints)}</td></tr>`).join('')}</tbody></table></div>`
                : '<p class="muted">This team started its best possible lineup.</p>'}</div>`;
    };
    const analysisPanel = homeR.length || awayR.length ? `<div id="analysis">
        <div class="panel-head" style="margin-top:44px"><div><div class="eyebrow">Lineup decisions</div><h2 class="section-title">Roster Analysis</h2></div></div>
        <h3 class="gc-h">Position Analysis</h3><div class="card-row two gc-pair">${posTable(game.home, homeR)}${posTable(game.away, awayR)}</div>
        <h3 class="gc-h">Lineup Optimization</h3>
        <p class="section-copy" style="max-width:none;margin:-4px 0 14px">How efficiently each team used its roster. 100% means the team started its best possible lineup.</p>
        <div class="card-row two gc-pair">${optCard(game.home, homeR)}${optCard(game.away, awayR)}</div></div>` : '';

    content.innerHTML = `<div class="wrap page-pad">${scoreboard}${top.length ? featured : ''}${rostersPanel}${analysisPanel}</div>`;
    document.querySelectorAll('.sub-tabs a').forEach(a => a.addEventListener('click', e => {
        const t = document.querySelector(a.getAttribute('href'));
        if (!t) return;
        e.preventDefault();
        document.querySelectorAll('.sub-tabs a').forEach(x => x.classList.toggle('active', x === a));
        window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - 70, behavior: 'smooth' });
    }));

    // ---------------------------------------------------------------- real NFL stat lines for the callouts
    try {
        const games = await PS.games();
        const lines = document.querySelectorAll('.fp-line');
        const ids = [...new Set([...lines].map(e => e.dataset.pid))];
        const files = await Promise.all(ids.map(id => PS.player(id).catch(() => null)));
        const byId = Object.fromEntries(ids.map((id, i) => [id, files[i]]));
        lines.forEach(el => {
            const f = byId[el.dataset.pid];
            if (!f) return;
            const r = f.games.find(x => { const g = games[x.g]; return g && g.season === game.season && g.week === game.week && g.type !== 'PRE'; });
            if (r) el.textContent = statLine(r);
        });
    } catch (_) { /* stat lines are extra; the page is complete without them */ }
})();
