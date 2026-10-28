/* Managers: Rankings. One rating for every manager-season, and careers built from them.
   Each season's stats become z-scores against that season's league (so 15- and 16-team years and changing scoring rules
   compare fairly), the weighted sum is rescaled so 50 = an average manager-season and every 10 = one standard deviation.
   Careers: the seasons' ratings averaged and pulled toward 50 by two average seasons (a one-year wonder can't top the board),
   the season in progress counted by the share of the regular season played. Regular season games only, playoffs via finish. */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    SITE.subHeader({ crumbs: [['Managers', url('pages/managers/index.html')], ['Rankings']],
                     tabs: [{ label: 'All Managers', href: url('pages/managers/index.html') },
                            { label: 'Rankings', href: url('pages/managers/rankings.html'), active: true },
                            { label: 'Where We Marched', href: url('pages/managers/where-we-marched.html') },
                            { label: 'League Overview', href: url('pages/past-seasons/overview.html') }] });
    SITE.hero({ title: 'Manager Rankings', size: 'short', dots: false, image: 'background-3.png',
                meta: ['Every manager-season and every career on one scale', '50 = an average season'] });

    const [allGames, drafts, moves, keyPicks, moveList] = await Promise.all([
        GT.query(`SELECT m.season, m.week, m.season_period AS period, t.owner_id AS id, o.display_name AS mgr, t.opponent_owner_id AS oppId, op.display_name AS opp,
                         t.team_score AS pf, t.opponent_score AS pa, t.bench_score AS bench
                  FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                  JOIN owners op ON op.owner_id = t.opponent_owner_id
                  WHERE t.team_score IS NOT NULL ORDER BY m.season, m.week`),
        GT.query('SELECT season, owner_id AS id, post_pct AS pct, post_grade AS grade FROM draft_grades'),
        GT.query(`SELECT season, owner_id AS id, SUM(net_started) AS net, COUNT(*) AS n FROM transaction_moves
                  WHERE kind IN ('PICKUP', 'TRADE') AND net_started IS NOT NULL GROUP BY season, owner_id`),
        // each draft's hindsight steal and bust (draft_grades best_pick / worst_pick)
        GT.query(`SELECT dg.season, dg.owner_id AS id, dp.overall_pick AS pick, dp.round, p.name, dp.pos, dp.actual_points AS pts, dp.post_surplus AS sur,
                         dp.overall_pick = dg.best_pick AS best
                  FROM draft_grades dg JOIN draft_picks dp ON dp.season = dg.season AND dp.overall_pick IN (dg.best_pick, dg.worst_pick)
                  JOIN players p ON p.player_id = dp.player_id`),
        // every graded pickup and trade, with the players each way
        GT.query(`SELECT tm.season, tm.owner_id AS id, tm.kind, tm.net_started AS net, tm.effective_week AS wk, co.display_name AS with_,
                         GROUP_CONCAT(CASE WHEN mp.direction = 'IN' THEN p.name END, ', ') AS ins, GROUP_CONCAT(CASE WHEN mp.direction = 'OUT' THEN p.name END, ', ') AS outs
                  FROM transaction_moves tm LEFT JOIN transaction_move_players mp ON mp.move_id = tm.move_id LEFT JOIN players p ON p.player_id = mp.player_id
                  LEFT JOIN owners co ON co.owner_id = tm.counterparty_owner_id
                  WHERE tm.kind IN ('PICKUP', 'TRADE') AND tm.net_started IS NOT NULL GROUP BY tm.move_id`)
    ]);
    const games = allGames.filter(g => g.period === 'Regular');   // the rating reads the regular season; the dossier shows the rest
    const key = (s, id) => `${s}-${id}`;
    const draftBy = Object.fromEntries(drafts.map(d => [key(d.season, d.id), d]));
    const movesBy = Object.fromEntries(moves.map(m => [key(m.season, m.id), m]));

    // the formula: weights add to 1
    const PARTS = [
        { k: 'fin', label: 'Finish', w: 0.25, tip: 'Final place, squared so the top of the table counts most: a title is worth far more than 8th over 9th. The season in progress uses the current standings (record, then points).' },
        { k: 'ap', label: 'All-play', w: 0.25, tip: 'All-play win %: every week, your score against every other team\'s. Strength with the schedule luck taken out.' },
        { k: 'ppg', label: 'Points', w: 0.12, tip: 'Points scored per regular season game.' },
        { k: 'win', label: 'Record', w: 0.10, tip: 'Regular season win % (ties count half).' },
        { k: 'luck', label: 'Luck', w: 0.10, tip: 'Wins over expected: actual wins minus the wins the scores earned (all-play win % each week). Getting the breaks counts.' },
        { k: 'draft', label: 'Draft', w: 0.09, tip: 'Hindsight draft grade percentile (Draft Grades page). No grade = league average.' },
        { k: 'moves', label: 'Moves', w: 0.09, tip: 'Net started points from pickups and trades: points the new players scored in your lineup minus what the departed ones would have.' }
    ];
    const PRIOR = 2;   // average seasons a career is pulled toward 50 by

    const seasons = [...new Set(games.map(g => g.season))].sort((x, y) => y - x);
    const done = s => Object.keys(b.finish).some(k => k.startsWith(`${s}-`));
    const mean = a => a.reduce((t, v) => t + v, 0) / (a.length || 1);
    const sdev = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))) || 1; };

    // one line per manager-season, with raw stats and the per-season z of each part
    const lines = [];
    seasons.forEach(s => {
        const list = games.filter(g => g.season === s), byWeek = {}, out = {};
        list.forEach(g => { (byWeek[g.week] = byWeek[g.week] || []).push(g.pf); });
        list.forEach(g => {
            const o = out[g.id] || (out[g.id] = { id: g.id, mgr: g.mgr, season: s, g: 0, w: 0, l: 0, t: 0, ap: 0, pf: 0 });
            const pool = byWeek[g.week];
            const share = pool.length > 1 ? (pool.filter(v => v < g.pf).length + (pool.filter(v => v === g.pf).length - 1) / 2) / (pool.length - 1) : 0.5;
            o.g++; o.pf += g.pf; o.ap += share;
            (o.log = o.log || []).push({ ...g, share, rank: 1 + pool.filter(v => v > g.pf).length, med: pool.slice().sort((x, y) => x - y)[Math.floor(pool.length / 2)] });
            if (g.pf > g.pa) o.w++; else if (g.pf < g.pa) o.l++; else o.t++;
        });
        const rows = Object.values(out), n = rows.length, live = !done(s);
        rows.forEach(o => {
            o.live = live;
            o.ap /= o.g; o.ppg = o.pf / o.g; o.win = (o.w + o.t / 2) / o.g;
            o.luck = o.w + o.t / 2 - o.ap * o.g;   // wins over the all-play expectation
            const d = draftBy[key(s, o.id)], m = movesBy[key(s, o.id)];
            o.draft = d && d.pct != null ? d.pct : null; o.grade = d ? d.grade : null;
            o.moves = m ? m.net : 0;
            o.place = b.finish[key(s, o.id)] || null;
        });
        if (live) rows.slice().sort((x, y) => y.win - x.win || y.ppg - x.ppg).forEach((o, i) => { o.place = i + 1; });
        rows.forEach(o => { o.fin = o.place ? ((n - o.place) / (n - 1)) ** 2 : null; });
        PARTS.forEach(({ k }) => {
            const vals = rows.map(o => o[k]).filter(v => v != null), m = mean(vals), sd = sdev(vals);
            rows.forEach(o => { (o.z = o.z || {})[k] = o[k] == null ? 0 : (o[k] - m) / sd; });
        });
        rows.forEach(o => { o.raw = PARTS.reduce((t, p) => t + p.w * o.z[p.k], 0); o.n = n; o.lgPpg = mean(rows.map(x => x.ppg)); });
        // each stat's place in that season's league (1 = best), for the dossier
        PARTS.forEach(({ k }) => rows.filter(o => o[k] != null).sort((x, y) => y[k] - x[k]).forEach((o, i) => { (o.rk = o.rk || {})[k] = i + 1; }));
        lines.push(...rows);
    });
    // rescale on completed seasons only, so a half-played year can't stretch the scale
    const scale = sdev(lines.filter(o => !o.live).map(o => o.raw));
    lines.forEach(o => { o.rating = 50 + 10 * o.raw / scale; });
    const fullGames = Math.max(...lines.filter(o => !o.live).map(o => o.g));
    lines.forEach(o => { o.weight = o.live ? Math.min(1, o.g / fullGames) : 1; });

    function careers() {
        const out = {};
        lines.forEach(o => {
            const c = out[o.id] || (out[o.id] = { id: o.id, mgr: o.mgr, list: [], wsum: 0, rsum: 0, g: 0, w: 0, l: 0, t: 0, apg: 0, pf: 0, titles: 0, chumps: 0, places: [] });
            c.list.push(o); c.wsum += o.weight; c.rsum += o.weight * o.rating;
            c.g += o.g; c.w += o.w; c.l += o.l; c.t += o.t; c.apg += o.ap * o.g; c.pf += o.pf;
            if (!o.live) { c.places.push(o.place); if (o.place === 1) c.titles++; if (o.place === o.n) c.chumps++; }
        });
        return Object.values(out).map(c => {
            const peak = c.list.reduce((m, o) => !m || o.rating > m.rating ? o : m, null);
            const z = Object.fromEntries(PARTS.map(p => [p.k, c.list.reduce((t, o) => t + o.weight * o.z[p.k], 0) / c.wsum]));
            return { ...c, z, seasons: c.list.length, rating: (c.rsum + PRIOR * 50) / (c.wsum + PRIOR), value: c.rsum - 50 * c.wsum,
                     peak, ap: c.apg / c.g, ppg: c.pf / c.g, avgPlace: c.places.length ? mean(c.places) : null,
                     active: c.list.some(o => o.season === b.season),
                     first: Math.min(...c.list.map(o => o.season)), last: Math.max(...c.list.map(o => o.season)) };
        });
    }

    const f1 = v => v.toFixed(1);
    const sg = v => { const r = Math.abs(v).toFixed(1); return (r === '0.0' ? '' : v > 0 ? '+' : '−') + r; };
    const pct = v => (v * 100).toFixed(1);
    const recText = (w, l, t) => `${w}-${l}${t ? '-' + t : ''}`;
    const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    const kpi = (l, v, s, tip = '') => `<div class="db-kpi"><span${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</span><b>${v}</b><small>${s}</small></div>`;
    // an attribute on the card: the part's z-score on the rating's scale (50 = average, 10 = one standard deviation)
    const attr = z => Math.max(1, Math.min(99, Math.round(50 + 10 * z)));
    const ABBR = { fin: 'FIN', ap: 'APL', ppg: 'PTS', win: 'REC', luck: 'LCK', draft: 'DRF', moves: 'MOV' };
    // tiers by rank in the current view: top 10% elite, next 20% gold, next 35% silver, the rest bronze
    const TIERS = [[0.10, 'elite', 'Elite'], [0.30, 'gold', 'Gold'], [0.65, 'silver', 'Silver'], [1, 'bronze', 'Bronze']];
    const tierOf = (rank, n) => TIERS.find(([cut]) => rank / n <= cut);
    const PAGE = 24;
    const HEADER = 76;   // the sticky site header plus a gap (the briefing's sticky columns sit below it)
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const narrow = () => matchMedia('(max-width:900px)').matches;   // phones: the dossier opens over the page instead

    let view = param('view') === 'careers' ? 'careers' : 'seasons';
    let season = seasons.includes(Number(param('season'))) ? Number(param('season')) : 0;
    let who = param('who') === 'active' ? 'active' : 'all';
    let shown = PAGE;
    let items = [], pick = null;   // the cards on screen (in order) and the open one
    const SORT_OPTS = {
        seasons: [['rating', 'Rating'], ['place', 'Finish'], ['ap', 'All-play'], ['ppg', 'Points'], ['win', 'Record'], ['luck', 'Luck'], ['draft', 'Draft'], ['moves', 'Moves'], ['season', 'Newest']],
        careers: [['rating', 'Rating'], ['value', 'Value'], ['peak', 'Peak season'], ['titles', 'Titles'], ['seasons', 'Seasons'], ['ap', 'All-play']]
    };
    const sortBy = { seasons: 'rating', careers: 'rating' };

    content.innerHTML = `<div class="wrap page-pad">
        <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">Managers</div><h2 class="section-title">Manager Rankings</h2>
            <p class="section-copy">One rating for how good a manager was: finish, all-play strength, scoring, record, luck, draft and moves, each measured against that season's league. Pick a card for the full file.</p></div>
            <div class="mr-ctl">
                <div class="seg seg-eq" id="mr-view"><button data-v="seasons">Seasons</button><button data-v="careers">Careers</button></div>
                <label class="sx-f" id="mr-season-f"><span>Season</span><select class="select" id="mr-season"><option value="0">All seasons</option>${seasons.map(s =>
                    `<option value="${s}"${s === season ? ' selected' : ''}>${s} season${done(s) ? '' : ' (in progress)'}</option>`).join('')}</select></label>
                <label class="sx-f"><span>Managers</span><select class="select" id="mr-who"><option value="all">All time</option><option value="active"${who === 'active' ? ' selected' : ''}>Active ${b.season}</option></select></label>
                <label class="sx-f"><span>Sort by</span><select class="select" id="mr-sort"></select></label>
            </div></div>
        <div class="db-kpis vn-kpis" id="mr-kpis"></div>
        <div class="mr-stage" id="mr-stage">
            <div class="mr-grid" id="mr-grid"></div>
            <section class="mr-dossier" id="mr-dossier" aria-live="polite" hidden></section>
        </div>
        <div class="mr-more" id="mr-more"></div>
        <div class="panel"><h3 class="panel-title" style="margin-bottom:6px">How the rating works</h3>
            <p class="section-copy mr-copy">Each stat is turned into a z-score against the other managers that season, so a 150-point team in a high-scoring year and a 140-point team in a low one are judged by how far they stood above their league. The weighted z-scores are added and rescaled: <b>50</b> is an average manager-season and every <b>10</b> points is one standard deviation. The seven attributes on each card use the same scale. Careers average a manager's seasons plus two average (50) seasons, so a short run of great years has to keep going to top the board; <b>Value</b> adds up the points above 50, rewarding long, good careers. The ${b.season} season counts only as far as it has been played. Card tiers go by rank: top 10% Elite, next 20% Gold, next 35% Silver, the rest Bronze.</p>
            <div class="mr-parts">${PARTS.map(p => `<div class="mr-part" data-tip="${esc(p.tip)}"><b>${Math.round(p.w * 100)}%</b><span>${ABBR[p.k]} · ${p.label}</span></div>`).join('')}</div></div>
    </div>`;

    const stage = document.getElementById('mr-stage'), grid = document.getElementById('mr-grid'), dossier = document.getElementById('mr-dossier');
    const chip = (cls, text, tip = '') => `<span class="pill ${cls}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${text}</span>`;
    const champChip = n => chip('mr-champ', n > 1 ? `${n}× Champion` : 'Champion');
    const chumpChip = n => chip('mr-chump', n > 1 ? `${n}× Chumpion` : 'Chumpion', 'Last place');
    const attrs = z => `<div class="mr-attrs">${PARTS.map(p => { const v = attr(z[p.k]);
        return `<div class="${v >= 60 ? 'hi' : v < 40 ? 'lo' : ''}" data-tip="${esc(p.label)}: ${v} (${z[p.k] >= 0 ? '+' : '−'}${Math.abs(z[p.k]).toFixed(2)} SD from average)"><b>${v}</b><span>${ABBR[p.k]}</span></div>`; }).join('')}</div>`;
    // one card. rank = place by rating in the current view (tier and # follow it, whatever the sort)
    const card = (x, i, { sub, badge, foot }) => {
        const [, tier, tierLabel] = tierOf(x.rank, x.of);
        return `<article class="mr-card t-${tier}${x.live ? ' is-live' : ''}${x === pick ? ' is-pick' : ''}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(x.mgr)}${x.season && !x.list ? ` ${x.season}` : ''}: open the file">
            <div class="mr-c-head"><div class="mr-ovr"><b>${f1(x.rating)}</b><span>${tierLabel}</span></div>
                <span class="mr-rank">#${x.rank}</span></div>
            <div class="mr-c-id"><img src="${GT.logo(x.mgr)}" alt=""><div><h3>${esc(x.mgr)}</h3><p>${sub}</p></div></div>
            <div class="mr-badge">${badge}</div>
            ${attrs(x.z)}
            <div class="mr-c-foot">${foot}</div></article>`;
    };

    function seasonItems() {
        const pool = lines.filter(o => (!season || o.season === season) && (who === 'all' || b.owners.some(w => w.id === o.id && w.last === b.season)));
        const byRating = pool.slice().sort((x, y) => y.rating - x.rating);
        byRating.forEach((o, i) => { o.rank = i + 1; o.of = pool.length; });
        const k = sortBy.seasons;
        const val = o => k === 'place' ? (o.place == null ? null : -o.place) : k === 'season' ? o.season : o[k];
        const rows = pool.slice().sort((x, y) => { const a = val(x), c = val(y); return (a == null) - (c == null) || (c ?? 0) - (a ?? 0) || y.rating - x.rating; });
        const champs = byRating.filter(o => !o.live && o.place === 1);
        const top = byRating[0], low = byRating[byRating.length - 1];
        const liveTop = lines.filter(o => o.live).sort((x, y) => y.rating - x.rating)[0];   // the season in progress has the fourth tile
        const showLive = liveTop && (!season || season === liveTop.season);
        const last = champs[champs.length - 1];
        document.getElementById('mr-kpis').innerHTML = (top ? kpi('Best season', `${esc(top.mgr)} ${top.season}`, `${f1(top.rating)} · ${recText(top.w, top.l, top.t)}${top.live ? ' so far' : `, ${ord(top.place)}`}`) : '') +
            (low ? kpi('Worst season', `${esc(low.mgr)} ${low.season}`, `${f1(low.rating)} · ${recText(low.w, low.l, low.t)}${low.live ? ' so far' : `, ${ord(low.place)}`}`) : '') +
            (champs.length > 1 ? kpi('Best champion', `${esc(champs[0].mgr)} ${champs[0].season}`, `${f1(champs[0].rating)} · ${recText(champs[0].w, champs[0].l, champs[0].t)}`) +
                (showLive ? '' : kpi('Weakest champion', `${esc(last.mgr)} ${last.season}`, `${f1(last.rating)} · ${recText(last.w, last.l, last.t)}`)) :
                champs.length ? kpi('Champion', esc(champs[0].mgr), `${f1(champs[0].rating)}, ${ord(champs[0].rank)} best this season`) : '') +
            (showLive ? kpi(`${liveTop.season} leader`, esc(liveTop.mgr), `${f1(liveTop.rating)} through ${liveTop.g} games`) : '');
        return rows.map(o => ({ x: o, sub: `${o.season} · ${esc(GT.teamName(b, o.mgr, o.season))}`,
            badge: o.live ? chip('pill-line', `${ord(o.place)} so far`, 'Season in progress: place in the current standings')
                 : o.place === 1 ? champChip(1) : o.place === o.n ? chumpChip(1) : chip('pill-line', `${ord(o.place)} of ${o.n}`),
            foot: `<span>${recText(o.w, o.l, o.t)}</span><span>${f1(o.ppg)} PF/G</span><span>${pct(o.ap)}% AP</span>` }));
    }

    function careerItems() {
        const pool = careers().filter(c => who === 'all' || c.active);
        const byRating = pool.slice().sort((x, y) => y.rating - x.rating);
        byRating.forEach((c, i) => { c.rank = i + 1; c.of = pool.length; });
        PARTS.forEach(({ k }) => pool.slice().sort((x, y) => y.z[k] - x.z[k]).forEach((c, i) => { (c.rk = c.rk || {})[k] = i + 1; }));
        const k = sortBy.careers;
        const val = c => k === 'peak' ? c.peak.rating : c[k];
        const rows = pool.slice().sort((x, y) => val(y) - val(x) || y.rating - x.rating);
        const byValue = pool.slice().sort((x, y) => y.value - x.value);
        const steady = pool.filter(c => c.list.filter(o => !o.live).length >= 3)
            .map(c => ({ c, sd: sdev(c.list.filter(o => !o.live).map(o => o.rating)) })).sort((x, y) => x.sd - y.sd)[0];
        const peak = pool.reduce((m, c) => !m || c.peak.rating > m.peak.rating ? c : m, null);
        document.getElementById('mr-kpis').innerHTML = (byRating[0] ? kpi('Top career', esc(byRating[0].mgr), `${f1(byRating[0].rating)} over ${byRating[0].seasons} season${byRating[0].seasons > 1 ? 's' : ''}`) : '') +
            (byValue[0] ? kpi('Most value', esc(byValue[0].mgr), `${sg(byValue[0].value)} rating points above average`, 'Value: every season\'s rating minus 50, added up.') : '') +
            (peak ? kpi('Highest peak', esc(peak.mgr), `${f1(peak.peak.rating)} in ${peak.peak.season}`) : '') +
            (steady ? kpi('Most consistent', esc(steady.c.mgr), `seasons within ±${f1(steady.sd)} of ${f1(mean(steady.c.list.filter(o => !o.live).map(o => o.rating)))}`, 'Smallest spread of season ratings, three or more completed seasons.') : '');
        return rows.map(c => ({ x: c, sub: `${c.first === c.last ? c.first : `${c.first}-${c.last}`} · ${c.seasons} season${c.seasons > 1 ? 's' : ''}`,
            badge: (c.titles ? champChip(c.titles) : '') + (c.chumps ? chumpChip(c.chumps) : '') +
                   (c.titles || c.chumps ? '' : chip('pill-line', c.avgPlace == null ? 'No finish yet' : `${f1(c.avgPlace)} avg finish`)),
            foot: `<span>${recText(c.w, c.l, c.t)}</span><span data-tip="Best season">Peak ${f1(c.peak.rating)} '${String(c.peak.season).slice(2)}</span><span data-tip="Value: every season's rating minus 50, added up">Value ${sg(c.value)}</span>` }));
    }

    /* ---------- the dossier: a briefing-screen profile of the picked card ---------- */

    // six-axis radar of the attributes; the dashed ring is 50 (average)
    function radar(z) {
        const R = 92, C = 120, n = PARTS.length;
        const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
        const ring = f => PARTS.map((_, i) => pt(i, R * f).map(v => v.toFixed(1)).join(',')).join(' ');
        const shape = PARTS.map((p, i) => pt(i, R * attr(z[p.k]) / 100).map(v => v.toFixed(1)).join(',')).join(' ');
        return `<svg class="mr-radar" viewBox="0 0 240 240" aria-hidden="true">
            ${[0.25, 0.75, 1].map(f => `<polygon class="rg" points="${ring(f)}"/>`).join('')}<polygon class="rg avg" points="${ring(0.5)}"/>
            ${PARTS.map((_, i) => { const [x, y] = pt(i, R); return `<line class="rg" x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('')}
            <polygon class="shape" points="${shape}"/>
            ${PARTS.map((p, i) => { const [x, y] = pt(i, R + 15); return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}">${ABBR[p.k]}</text>`; }).join('')}
        </svg>`;
    }

    // what each attribute means for this pick, in plain numbers
    function attrNote(x, k, career) {
        const r = x.rk && x.rk[k] ? ` · ${ord(x.rk[k])}${career ? ' of careers' : ''}` : '';
        if (career) return { fin: x.avgPlace == null ? 'no finished season' : `${f1(x.avgPlace)} avg finish`, ap: `${pct(x.ap)}% all-play`, ppg: `${f1(x.ppg)} PF/G`,
                             win: recText(x.w, x.l, x.t), luck: 'avg luck', draft: 'avg draft grade', moves: 'avg moves value' }[k] + r;
        return { fin: x.live ? `${ord(x.place)} so far` : `${ord(x.place)} of ${x.n}`, ap: `${pct(x.ap)}%${r}`, ppg: `${f1(x.ppg)}${r}`, win: `${recText(x.w, x.l, x.t)}${r}`, luck: `${sg(x.luck)} wins vs expected${r}`,
                 draft: x.grade ? `${x.grade} · ${Math.round(x.draft)} pct` : 'no grade', moves: `${sg(x.moves)} pts${r}` }[k];
    }

    const POST_LABEL = { 'Post-WC': 'Play-in', 'Post-WB': 'Playoffs', Championship: 'Championship', 'Post-LB': 'Gulag', 'Post-LP': 'Gulag play-in', Chumpionship: 'Chumpionship' };
    const WINNERS = ['Post-WC', 'Post-WB', 'Championship'];
    // placement games ('3rd Place', ...) keep their own name; the bar label is a two-letter code
    const postLabel = p => POST_LABEL[p] || `${p} game`;
    const POST_SHORT = { 'Post-WC': 'PI', 'Post-WB': 'PO', Championship: 'CH', 'Post-LB': 'GU', 'Post-LP': 'GP', Chumpionship: 'CP' };
    const postShort = p => POST_SHORT[p] || `${parseInt(p, 10) || ''}P`;
    const res = g => g.pf > g.pa ? 'W' : g.pf < g.pa ? 'L' : 'T';
    const best = (list, f) => list.reduce((m, v) => m == null || f(v) > f(m) ? v : m, null);
    const firstNames = name => (name || '').split(', ').slice(0, 2).join(', ') + ((name || '').split(', ').length > 2 ? ' +' : '');

    // everything the dossier shows beyond the rating, for one manager-season or one career
    function detail(x, career) {
        const ls = career ? x.list : [x];
        const log = ls.flatMap(o => o.log), all = allGames.filter(g => g.id === x.id && ls.some(o => o.season === g.season));
        const post = all.filter(g => g.period !== 'Regular');
        const benches = log.filter(g => g.bench != null);
        const xw = ls.reduce((t, o) => t + o.ap * o.g, 0);
        const apW = ls.reduce((t, o) => t + o.ap * o.g * (o.n - 1), 0), apG = ls.reduce((t, o) => t + o.g * (o.n - 1), 0);
        const picks = keyPicks.filter(p => p.id === x.id && ls.some(o => o.season === p.season));
        const mv = moveList.filter(m => m.id === x.id && ls.some(o => o.season === m.season));
        const pa = log.reduce((t, g) => t + g.pa, 0);
        return {
            log, all, post, pa, xw, luck: x.w + x.t / 2 - xw, apW, apL: apG - apW,
            high: best(all, g => g.pf), low: best(all, g => -g.pf),
            avgRank: mean(log.map(g => g.rank)), top3: log.filter(g => g.rank <= 3).length,
            bench: benches.length ? mean(benches.map(g => g.bench)) : null,
            steal: best(picks.filter(p => p.best), p => p.sur), bust: best(picks.filter(p => !p.best), p => -p.sur),
            pickups: mv.filter(m => m.kind === 'PICKUP'), trades: mv.filter(m => m.kind === 'TRADE'),
            bestMove: best(mv, m => m.net), worstMove: best(mv, m => -m.net),
            drafts: ls.filter(o => o.draft != null)
        };
    }

    // head-to-head against every opponent across the picked games
    function rivals(all) {
        const by = {};
        all.forEach(g => { const r = by[g.oppId] || (by[g.oppId] = { opp: g.opp, w: 0, l: 0, t: 0, g: 0 }); r.g++; r[res(g).toLowerCase()]++; });
        const list = Object.values(by).map(r => ({ ...r, pct: (r.w + r.t / 2) / r.g }));
        const enough = list.filter(r => r.g >= 4);
        return { owns: best(enough, r => r.pct * 100 + r.g / 100), nemesis: best(enough, r => -r.pct * 100 + r.g / 100), most: best(list, r => r.g + r.pct / 10) };
    }

    // the game log: one bar per game (points, scaled to the best score shown), win or loss, the week's median as a tick
    function gameLog(d, career) {
        const games = career ? d.all : [...d.log, ...d.post];
        const top = Math.max(...games.map(g => g.pf), 1), H = 120;
        let prev = null;
        const bars = games.map((g, i) => {
            const newSeason = career && g.season !== prev, label = career ? (newSeason ? `'${String(g.season).slice(2)}` : '') : (g.period === 'Regular' ? g.week : postShort(g.period));
            prev = g.season;
            const cls = `${res(g) === 'W' ? 'w' : res(g) === 'L' ? 'l' : ''}${g.period !== 'Regular' ? ' po' : ''}${newSeason && i ? ' gap' : ''}${!career && g.period !== 'Regular' && games[i - 1] && games[i - 1].period === 'Regular' ? ' gap' : ''}`;
            const tip = `${g.season} ${g.period === 'Regular' ? `week ${g.week}` : `${postLabel(g.period)} (week ${g.week})`} vs ${g.opp}: ${f1(g.pf)}-${f1(g.pa)} ${res(g)}${g.rank ? ` · ${ord(g.rank)} of the week` : ''}`;
            return `<span class="${cls}" style="--i:${Math.min(i, 60)}" data-tip="${esc(tip)}"><i style="height:${(g.pf / top * H).toFixed(1)}px"></i>${g.med != null && !career ? `<em style="bottom:${(g.med / top * H + 16).toFixed(1)}px"></em>` : ''}<b>${label}</b></span>`;
        }).join('');
        return `<div class="mr-log${career ? ' career' : ''}">${bars}</div>`;
    }

    const tile = (label, value, sub = '', cls = '') => `<div><span>${label}</span><b class="${cls}">${value}</b><small>${sub}</small></div>`;
    const row = (label, value, sub = '') => `<div class="mr-d-row"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const moveText = m => m ? `${m.kind === 'TRADE' ? `Trade with ${esc(m.with_ || '?')}` : 'Pickup'} wk ${m.wk ?? '?'}: ${esc(firstNames(m.ins) || '-')}${m.outs ? ` for ${esc(firstNames(m.outs))}` : ''}` : '';
    const pickText = p => p ? `${esc(p.name)} (${esc(p.pos)}, R${p.round} #${p.pick})` : '-';

    function intel(x, career, d) {
        const parts = PARTS.map(p => ({ p, v: attr(x.z[p.k]) })).sort((a, c) => c.v - a.v);
        const top = parts[0], bottom = parts[parts.length - 1];
        if (career) {
            const done_ = x.list.filter(o => !o.live), low = done_.length ? done_.reduce((m, o) => o.rating < m.rating ? o : m) : null;
            return [`${x.seasons} season${x.seasons > 1 ? 's' : ''} on file, ${x.first === x.last ? x.first : `${x.first} to ${x.last}`}. Career record ${recText(x.w, x.l, x.t)}.`,
                    `${x.titles ? `${x.titles} title${x.titles > 1 ? 's' : ''}` : 'No titles'}${x.chumps ? `, ${x.chumps} Chumpionship${x.chumps > 1 ? 's' : ''}` : ''}. Average finish ${x.avgPlace == null ? 'n/a' : f1(x.avgPlace)}.`,
                    `Peak ${x.peak.season} at ${f1(x.peak.rating)}${low && low !== x.peak ? `; low point ${low.season} at ${f1(low.rating)}` : ''}.`,
                    `${d.luck >= 0 ? 'Won' : 'Lost'} ${f1(Math.abs(d.luck))} more games than the scores earned (all-play expected ${f1(d.xw)}).`,
                    `Strongest: ${top.p.label} (${top.v}). Weakest: ${bottom.p.label} (${bottom.v}).`,
                    `Rated ${ord(x.rank)} of ${x.of} careers. Value ${sg(x.value)}.`];
        }
        return [`${x.live ? `${ord(x.place)} in the ${x.season} standings so far` : `Finished ${ord(x.place)} of ${x.n} in ${x.season}`}${x.place === 1 && !x.live ? '. League champion' : x.place === x.n && !x.live ? '. Chumpion' : ''}.`,
                `${recText(x.w, x.l, x.t)} with a ${pct(x.ap)}% all-play rate, ${ord(x.rk.ap)} in the league.`,
                `${f1(x.ppg)} points a game, ${sg(x.ppg - x.lgPpg)} against the league average.`,
                `${d.luck >= 0 ? 'Won' : 'Lost'} ${f1(Math.abs(d.luck))} more games than the scores earned (${f1(d.xw)} expected).`,
                `Draft ${x.grade ? `graded ${x.grade}` : 'ungraded'}; pickups and trades netted ${sg(x.moves)} started points.`,
                `Strongest: ${top.p.label} (${top.v}). Weakest: ${bottom.p.label} (${bottom.v}).`];
    }

    function renderDossier(x) {
        const career = !!x.list;
        const d = detail(x, career);
        const [, tier, tierLabel] = tierOf(x.rank, x.of);
        const timeline = (career ? x.list : lines.filter(o => o.id === x.id)).slice().sort((a, c) => a.season - c.season);
        const file = career ? `CAREER-${String(x.id).padStart(3, '0')}` : `${x.season}-${String(x.rank).padStart(3, '0')}`;
        const chips = career ? (x.titles ? champChip(x.titles) : '') + (x.chumps ? chumpChip(x.chumps) : '')
                             : x.live ? chip('pill-line', 'In progress') : x.place === 1 ? champChip(1) : x.place === x.n ? chumpChip(1) : '';
        const wb = d.post.filter(g => WINNERS.includes(g.period)), wbRec = { w: wb.filter(g => res(g) === 'W').length, l: wb.filter(g => res(g) === 'L').length };
        const playoffs = career ? new Set(wb.filter(g => g.period !== 'Post-WC').map(g => g.season)).size : null;
        const stats = career ? [
                tile('Record', recText(x.w, x.l, x.t), `${pct((x.w + x.t / 2) / x.g)}% · regular season`),
                tile('Playoffs', `${playoffs}<i>/${x.list.filter(o => !o.live).length}</i>`, `${recText(wbRec.w, wbRec.l, 0)} in the bracket`),
                tile('Titles', x.titles || '0', x.chumps ? `${x.chumps} Chumpionship${x.chumps > 1 ? 's' : ''}` : 'no Chumpionships'),
                tile('PF / G', f1(x.ppg), `${f1(d.pa / d.log.length)} against`),
                tile('All-play', `${Math.round(d.apW)}-${Math.round(d.apL)}`, `${pct(x.ap)}%`),
                tile('Luck', sg(d.luck), `wins over ${f1(d.xw)} expected`, d.luck >= 0 ? 'up' : 'dn'),
                tile('Best week', f1(d.high.pf), `${d.high.season} wk ${d.high.week} vs ${esc(d.high.opp)}`),
                tile('Worst week', f1(d.low.pf), `${d.low.season} wk ${d.low.week} vs ${esc(d.low.opp)}`),
                tile('Avg week rank', f1(d.avgRank), `${d.top3} top-3 weeks`),
                tile('Bench / G', d.bench == null ? '-' : f1(d.bench), 'points left on the bench'),
                tile('Value', sg(x.value), 'rating points above 50', x.value >= 0 ? 'up' : 'dn'),
                tile('Peak', f1(x.peak.rating), `${x.peak.season} season`)]
            : [
                tile('Record', recText(x.w, x.l, x.t), `${pct(x.win)}% · ${ord(x.rk.win)} in the league`),
                tile('Points for', f1(x.pf), `${f1(x.ppg)} a game`),
                tile('Points against', f1(d.pa), `${f1(d.pa / x.g)} a game`),
                tile('Point diff', sg(x.pf - d.pa), `${sg((x.pf - d.pa) / x.g)} a game`, x.pf >= d.pa ? 'up' : 'dn'),
                tile('All-play', `${Math.round(d.apW)}-${Math.round(d.apL)}`, `${pct(x.ap)}% · ${ord(x.rk.ap)}`),
                tile('Luck', sg(d.luck), `wins over ${f1(d.xw)} expected`, d.luck >= 0 ? 'up' : 'dn'),
                tile('Best week', f1(d.high.pf), `wk ${d.high.week} vs ${esc(d.high.opp)}`),
                tile('Worst week', f1(d.low.pf), `wk ${d.low.week} vs ${esc(d.low.opp)}`),
                tile('Avg week rank', f1(d.avgRank), `${d.top3} top-3 weeks`),
                tile('Bench / G', d.bench == null ? '-' : f1(d.bench), 'points left on the bench'),
                tile('vs avg', sg(x.ppg - x.lgPpg), 'points a game over the league', x.ppg >= x.lgPpg ? 'up' : 'dn'),
                tile('Moves', d.pickups.length + d.trades.length, `${d.pickups.length} pickup${d.pickups.length === 1 ? '' : 's'} · ${d.trades.length} trade${d.trades.length === 1 ? '' : 's'}`)];
        const draftBox = career
            ? row('Avg draft percentile', d.drafts.length ? Math.round(mean(d.drafts.map(o => o.draft))) : '-', `${d.drafts.length} graded drafts`) +
              (() => { const top = best(d.drafts, o => o.draft), low = best(d.drafts, o => -o.draft);
                       return top ? row('Best draft', `${top.season} · ${esc(top.grade)}`, `${Math.round(top.draft)} pct`) + row('Worst draft', `${low.season} · ${esc(low.grade)}`, `${Math.round(low.draft)} pct`) : ''; })() +
              row('Steal of a career', pickText(d.steal), d.steal ? `${d.steal.season} · ${f1(d.steal.pts)} pts, ${sg(d.steal.sur)} over the slot` : '') +
              row('Bust of a career', pickText(d.bust), d.bust ? `${d.bust.season} · ${f1(d.bust.pts)} pts, ${sg(d.bust.sur)} vs the slot` : '')
            : row('Grade', x.grade ? esc(x.grade) : '-', x.grade ? `${Math.round(x.draft)} percentile in hindsight` : 'not graded') +
              row('Steal', pickText(d.steal), d.steal ? `${f1(d.steal.pts)} pts, ${sg(d.steal.sur)} over the slot` : '') +
              row('Bust', pickText(d.bust), d.bust ? `${f1(d.bust.pts)} pts, ${sg(d.bust.sur)} vs the slot` : '');
        const wireBox = row('Pickups', d.pickups.length, `${sg(d.pickups.reduce((t, m) => t + m.net, 0))} started pts`) +
                        row('Trades', d.trades.length, `${sg(d.trades.reduce((t, m) => t + m.net, 0))} started pts`) +
                        (d.bestMove ? row('Best move', `${sg(d.bestMove.net)}`, `${career ? `${d.bestMove.season} · ` : ''}${moveText(d.bestMove)}`) : '') +
                        (d.worstMove && d.worstMove !== d.bestMove ? row('Worst move', `${sg(d.worstMove.net)}`, `${career ? `${d.worstMove.season} · ` : ''}${moveText(d.worstMove)}`) : '');
        const r = career ? rivals(d.all) : null;
        const lastBox = career
            ? `<div class="mr-d-h">Rivals</div>${r.owns ? row('Owns', esc(r.owns.opp), `${recText(r.owns.w, r.owns.l, r.owns.t)} head to head`) : ''}
               ${r.nemesis && r.nemesis !== r.owns ? row('Nemesis', esc(r.nemesis.opp), `${recText(r.nemesis.w, r.nemesis.l, r.nemesis.t)} head to head`) : ''}
               ${r.most ? row('Most played', esc(r.most.opp), `${r.most.g} games · ${recText(r.most.w, r.most.l, r.most.t)}`) : ''}
               ${row('Postseason', recText(wbRec.w, wbRec.l, 0), `${playoffs} bracket trip${playoffs === 1 ? '' : 's'}`)}`
            : `<div class="mr-d-h">Postseason</div>${d.post.length ? d.post.map(g => row(postLabel(g.period), `${res(g)} ${f1(g.pf)}-${f1(g.pa)}`, `week ${g.week} vs ${esc(g.opp)}`)).join('')
                : `<p class="mr-d-none">${x.live ? 'Season still in the regular season.' : 'No postseason games.'}</p>`}`;

        dossier.className = `mr-dossier t-${tier}`;
        dossier.innerHTML = `<div class="mr-d-scan" aria-hidden="true"></div><i class="mr-d-c tl"></i><i class="mr-d-c tr"></i><i class="mr-d-c bl"></i><i class="mr-d-c br"></i>
            <div class="mr-d-bar mr-d-s" style="--d:0"><span>GT // ${career ? 'Career file' : 'Season file'}</span><span>File ${file}</span>
                <button class="mr-d-x" id="mr-d-x" type="button" aria-label="Close the file">×</button></div>
            <div class="mr-d-id mr-d-s" style="--d:1">
                <div class="mr-d-logo"><img src="${GT.logo(x.mgr)}" alt=""></div>
                <div class="mr-d-who"><div class="mr-d-eyebrow">${career ? 'Manager career' : `${x.season} season`}</div>
                    <h2 class="mr-d-name" data-name="${esc(x.mgr)}">${esc(x.mgr)}</h2>
                    <p>${career ? `${x.first === x.last ? x.first : `${x.first}-${x.last}`} · ${x.seasons} season${x.seasons > 1 ? 's' : ''}` : esc(GT.teamName(b, x.mgr, x.season))}</p>
                    <div class="mr-d-chips"><span class="pill mr-tier">${tierLabel}</span>${chips}</div></div>
                <div class="mr-d-ovr"><b data-to="${x.rating.toFixed(1)}">${f1(x.rating)}</b><span>Rating</span><small>#${x.rank} of ${x.of} ${career ? 'careers' : 'in view'}</small></div>
            </div>
            <div class="mr-d-grid">
                <div class="mr-d-s" style="--d:2">${radar(x.z)}</div>
                <div class="mr-d-attrs mr-d-s" style="--d:3">${PARTS.map((p, i) => { const v = attr(x.z[p.k]);
                    return `<div class="mr-d-attr" style="--i:${i}"><span class="k">${p.label}</span><b class="${v >= 60 ? 'hi' : v < 40 ? 'lo' : ''}">${v}</b>
                        <span class="trk"><i style="--w:${v}%"></i><em></em></span><small>${esc(attrNote(x, p.k, career))}</small></div>`; }).join('')}</div>
                <div class="mr-d-stats mr-d-s" style="--d:4">${stats.join('')}</div>
            </div>
            <div class="mr-d-sec mr-d-s" style="--d:5"><div class="mr-d-h">${career ? 'Career game log' : 'Game log'} <small>bar = points · green won, red lost${career ? '' : ' · tick = the week\'s median'} · outlined = postseason</small></div>${gameLog(d, career)}</div>
            <div class="mr-d-boxes">
                <div class="mr-d-intel mr-d-s" style="--d:6"><div class="mr-d-h">Intel</div>${intel(x, career, d).map(t => `<p data-t="${esc(t)}">${esc(t)}</p>`).join('')}</div>
                <div class="mr-d-box mr-d-s" style="--d:7"><div class="mr-d-h">Draft room</div>${draftBox}</div>
                <div class="mr-d-box mr-d-s" style="--d:8"><div class="mr-d-h">Wire &amp; trades</div>${wireBox}</div>
                <div class="mr-d-box mr-d-s" style="--d:9">${lastBox}</div>
            </div>
            <div class="mr-d-tl mr-d-s" style="--d:10"><div class="mr-d-h">Season ratings</div>
                <div class="mr-d-bars">${timeline.map((o, i) => `<button type="button" class="${!career && o === x ? 'on' : ''}${o.live ? ' live' : ''}" data-s="${o.season}" style="--i:${i}" data-tip="${o.season}: ${f1(o.rating)}${o.live ? ' (in progress)' : `, ${ord(o.place)}`} · ${recText(o.w, o.l, o.t)}">
                    <em>${f1(o.rating)}</em><i style="--h:${Math.max(4, Math.min(100, (o.rating - 20) / 60 * 100)).toFixed(1)}%"></i><span>'${String(o.season).slice(2)} · ${o.live ? `${ord(o.place)}*` : ord(o.place)}</span></button>`).join('')}</div></div>
            <div class="mr-d-foot mr-d-s" style="--d:11"><a class="btn btn-accent" href="${GT.managerHref(x.mgr, career ? null : x.season)}">Open manager page</a>
                <span class="mr-d-keys">Esc to close · ↑ ↓ to step through · click a season bar to open it</span></div>`;
        document.getElementById('mr-d-x').addEventListener('click', close);
        dossier.querySelectorAll('.mr-d-bars button').forEach(btn => btn.addEventListener('click', () => {
            const s = Number(btn.dataset.s);
            const target = lines.find(o => o.id === x.id && o.season === s);
            if (!target || (!career && target === x)) return;
            view = 'seasons';                                   // a career's year opens that manager-season
            if (season && season !== s) { season = 0; document.getElementById('mr-season').value = '0'; }
            if (who === 'active' && !b.owners.some(w => w.id === target.id && w.last === b.season)) { who = 'all'; document.getElementById('mr-who').value = 'all'; }
            pick = target; draw();
        }));
        play();
    }

    // the briefing sequence: wipe in behind a scan line, then decode the name, count up the rating, type the intel
    let timers = [];
    function play() {
        timers.forEach(clearTimeout); timers = [];
        dossier.classList.remove('run'); void dossier.offsetWidth; dossier.classList.add('run');
        if (calm) return;
        const nameEl = dossier.querySelector('.mr-d-name'), name = nameEl.dataset.name, GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#/';
        let step = 0;
        const decode = () => {
            nameEl.textContent = [...name].map((ch, i) => i < step / 2 || ch === ' ' ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join('');
            if (step++ < name.length * 2) timers.push(setTimeout(decode, 28)); else nameEl.textContent = name;
        };
        timers.push(setTimeout(decode, 180));
        const num = dossier.querySelector('.mr-d-ovr b'), to = Number(num.dataset.to), t0 = performance.now() + 260;
        const count = now => { const k = Math.max(0, Math.min(1, (now - t0) / 700)), e = 1 - (1 - k) ** 3;
            num.textContent = (to * e).toFixed(1); if (k < 1 && dossier.contains(num)) requestAnimationFrame(count); };
        num.textContent = '0.0'; requestAnimationFrame(count);
        let delay = 620;
        dossier.querySelectorAll('.mr-d-intel p').forEach(p => {
            // the untyped rest stays in place, invisible, so the lines never reflow while they type
            const text = p.dataset.t, put = n => { p.innerHTML = `${esc(text.slice(0, n))}<span class="mr-ghost">${esc(text.slice(n))}</span>`; };
            put(0); p.classList.add('typing');
            timers.push(setTimeout(() => {
                let n = 0;
                const type = () => { n = Math.min(text.length, n + 3); put(n);
                    if (n < text.length) timers.push(setTimeout(type, 12)); else p.classList.remove('typing'); };
                type();
            }, delay));
            delay += Math.min(420, text.length * 4 + 60);
        });
    }

    // ease the page (or the list) to a scroll position instead of jumping there
    let glideRaf = 0;
    function glide(top, el = null, ms = 750) {
        cancelAnimationFrame(glideRaf);
        const from = el ? el.scrollTop : scrollY, max = el ? el.scrollHeight - el.clientHeight : document.documentElement.scrollHeight - innerHeight;
        const to = Math.max(0, Math.min(max, top)), t0 = performance.now();
        const set = v => { if (el) el.scrollTop = v; else scrollTo(0, v); };
        if (calm || Math.abs(to - from) < 2) { set(to); return; }
        const ease = k => k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
        const step = now => { const k = Math.min(1, (now - t0) / ms); set(from + (to - from) * ease(k)); if (k < 1) glideRaf = requestAnimationFrame(step); };
        glideRaf = requestAnimationFrame(step);
    }

    // move every card from where it was to where it lands (FLIP), the stagger running down the list
    function flip(mutate) {
        const els = [...grid.children];
        const first = new Map(els.map(e => [e, e.getBoundingClientRect()]));
        mutate();
        if (calm) return;
        let n = 0;
        els.forEach(e => {
            const f = first.get(e), l = e.getBoundingClientRect();
            if (!f || (Math.abs(f.left - l.left) < 1 && Math.abs(f.top - l.top) < 1)) return;
            const onScreen = (l.bottom > 0 && l.top < innerHeight) || (f.bottom > 0 && f.top < innerHeight);
            if (!onScreen) return;
            e.animate([{ transform: `translate(${f.left - l.left}px, ${f.top - l.top}px)`, opacity: 0.6 }, { transform: 'none', opacity: 1 }],
                      { duration: 700, delay: Math.min(n++ * 22, 320), easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'backwards' });
        });
    }

    function select(x) {
        const opening = !stage.classList.contains('is-brief');
        pick = x;
        grid.querySelectorAll('.mr-card').forEach(c => c.classList.toggle('is-pick', items[c.dataset.i].x === x));
        if (opening) {
            flip(() => {
                stage.classList.add('is-brief'); dossier.hidden = false;
                document.body.classList.add('mr-lock');
                // the list holds every card while a file is open
                const have = grid.children.length;
                grid.insertAdjacentHTML('beforeend', items.slice(have).map((it, i) => card(it.x, have + i, it)).join(''));
                moreButton();
            });
            if (!narrow()) glide(stage.getBoundingClientRect().top + scrollY - HEADER);   // the page eases up to the briefing
            reveal(true);
        } else reveal();
        renderDossier(x);
    }
    // keep the picked card in view in the left-hand list
    function reveal(instant) {
        const el = grid.querySelector('.mr-card.is-pick');
        if (!el || narrow()) return;
        const top = el.offsetTop;   // the sticky list is the cards' offset parent
        if (top < grid.scrollTop || top + el.offsetHeight > grid.scrollTop + grid.clientHeight) {
            const to = top - grid.clientHeight / 2 + el.offsetHeight / 2;
            if (instant) grid.scrollTop = to; else glide(to, grid, 450);
        }
    }
    function close() {
        if (!pick) return;
        const was = pick;
        pick = null; timers.forEach(clearTimeout);
        flip(() => {
            stage.classList.remove('is-brief'); dossier.hidden = true; dossier.innerHTML = '';
            document.body.classList.remove('mr-lock');
            grid.scrollTop = 0;
            grid.querySelectorAll('.mr-card.is-pick').forEach(c => c.classList.remove('is-pick'));
            while (grid.children.length > shown) grid.lastElementChild.remove();
            moreButton();
        });
        // ease back to the card that was open (or the grid's top when it was past the first page)
        const el = [...grid.children].find(c => items[c.dataset.i].x === was);
        const r = (el || grid).getBoundingClientRect();
        glide(scrollY + r.top - (el ? innerHeight / 2 - r.height / 2 : HEADER));
        if (el) el.focus({ preventScroll: true });
    }

    function moreButton() {
        document.getElementById('mr-more').innerHTML = !pick && items.length > grid.children.length
            ? `<button class="btn btn-accent" id="mr-more-btn" type="button">Show all ${items.length}</button>` : '';
        const more = document.getElementById('mr-more-btn');
        if (more) more.addEventListener('click', () => { shown = Infinity; draw(); });
    }

    function draw() {
        document.querySelectorAll('#mr-view button').forEach(btn => btn.classList.toggle('on', btn.dataset.v === view));
        document.getElementById('mr-season-f').style.display = view === 'seasons' ? '' : 'none';
        document.getElementById('mr-sort').innerHTML = SORT_OPTS[view].map(([v, l]) => `<option value="${v}"${v === sortBy[view] ? ' selected' : ''}>${l}</option>`).join('');
        items = view === 'seasons' ? seasonItems() : careerItems();
        if (pick && !items.some(it => it.x === pick)) {                   // a career survives a rebuild by its manager
            const same = pick.list && items.find(it => it.x.id === pick.id);
            pick = same ? same.x : null;
        }
        const open = !!pick;
        grid.innerHTML = items.slice(0, open ? items.length : shown).map((it, i) => card(it.x, i, it)).join('');
        moreButton();
        if (open) { stage.classList.add('is-brief'); dossier.hidden = false; renderDossier(pick); reveal(); }
        else { stage.classList.remove('is-brief'); dossier.hidden = true; dossier.innerHTML = ''; document.body.classList.remove('mr-lock'); }
        const u = new URL(location.href);
        u.searchParams.set('view', view);
        if (view === 'seasons' && season) u.searchParams.set('season', season); else u.searchParams.delete('season');
        if (who === 'active') u.searchParams.set('who', 'active'); else u.searchParams.delete('who');
        history.replaceState(null, '', u);
    }

    grid.addEventListener('click', e => { const c = e.target.closest('.mr-card'); if (c) select(items[c.dataset.i].x); });
    grid.addEventListener('keydown', e => { const c = e.target.closest('.mr-card'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(items[c.dataset.i].x); } });
    document.addEventListener('keydown', e => {
        if (!pick || (e.target.closest && e.target.closest('select, input'))) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const i = items.findIndex(it => it.x === pick), j = i + (e.key === 'ArrowDown' ? 1 : -1);
            if (items[j]) select(items[j].x);
        }
    });
    document.querySelectorAll('#mr-view button').forEach(btn => btn.addEventListener('click', () => {
        if (view === btn.dataset.v) return;
        view = btn.dataset.v; shown = PAGE;
        pick = pick && view === 'careers' ? { id: pick.id, list: [] } : null;   // to Careers, the open manager's career stays open
        draw();
    }));
    document.getElementById('mr-season').addEventListener('change', e => { season = Number(e.target.value); shown = PAGE; draw(); });
    document.getElementById('mr-who').addEventListener('change', e => { who = e.target.value; shown = PAGE; draw(); });
    document.getElementById('mr-sort').addEventListener('change', e => { sortBy[view] = e.target.value; draw(); });
    draw();
})();
