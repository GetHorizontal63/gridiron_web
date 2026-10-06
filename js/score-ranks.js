/* Weekly score ranks (the NEW site's Weekly Score Ranks page, reusable): where every regular-season score landed
   against the whole league that week (1 = highest), win % by score-rank quad (1-4, 5-8, 9-12, 13-16; a 15-team
   week's 13-15 is the last quad), all-play and luck, and the rank distribution matrix.
   SR.teamWeeks(rows)  rows: { season, week, id, name, rank, pf, pa } -> normalised team-weeks (rank, n = teams that week)
   SR.managers(tw)     -> per-manager lines, ranked by all-play (only managers with a full season's games are ranked)
   SR.table(lines, { focus })   the Weekly Scoring Position table
   SR.matrix(lines, { focus })  the Score Rank Distribution heat map */
window.SR = (() => {
    const { esc } = SITE;
    const QUADS = ['1-4', '5-8', '9-12', '13-16'];
    const quadOf = rank => Math.min(3, Math.floor((rank - 1) / 4));
    const pct3 = x => x == null || isNaN(x) ? '-' : x.toFixed(3).replace(/^0(?=\.)/, '');   // .571, 1.000

    function teamWeeks(rows) {
        const per = {};
        rows.forEach(g => { const w = per[`${g.season}|${g.week}`] || (per[`${g.season}|${g.week}`] = { rows: 0, max: 0 }); w.rows++; w.max = Math.max(w.max, Number(g.rank) || 0); });
        return rows.map(g => {
            const w = per[`${g.season}|${g.week}`];
            return { season: g.season, week: g.week, id: g.id, name: g.name, rank: Number(g.rank), n: Math.max(w.rows, w.max),
                     win: g.pf > g.pa ? 1 : g.pf === g.pa ? 0.5 : 0 };
        }).filter(t => t.rank >= 1 && t.n > 1);
    }

    function managers(tw) {
        const by = new Map();
        tw.forEach(t => {
            if (!by.has(t.id)) by.set(t.id, { id: t.id, name: t.name, games: 0, rankSum: 0, top1: 0, top3: 0, bottom3: 0, last: 0, expected: 0, wins: 0, dist: {},
                                              quads: QUADS.map(() => ({ g: 0, w: 0 })) });
            const o = by.get(t.id);
            o.games++; o.rankSum += t.rank;
            if (t.rank === 1) o.top1++;
            if (t.rank <= 3) o.top3++;
            if (t.rank > t.n - 3) o.bottom3++;
            if (t.rank === t.n) o.last++;
            o.expected += (t.n - t.rank) / (t.n - 1);      // share of the league beaten this week
            o.wins += t.win;
            o.dist[t.rank] = (o.dist[t.rank] || 0) + 1;
            const q = o.quads[quadOf(t.rank)]; q.g++; q.w += t.win;
        });
        const list = [...by.values()].map(o => ({ ...o, avgRank: o.rankSum / o.games, allPlay: o.expected / o.games, winPct: o.wins / o.games, luck: o.wins - o.expected }));
        // a handful of games says little, so only managers with a full season's worth are ranked (a short season: the most anyone played)
        const min = Math.min(14, Math.max(0, ...list.map(m => m.games)));
        list.sort((a, b) => ((b.games >= min) - (a.games >= min)) || (b.allPlay - a.allPlay));
        let r = 0;
        list.forEach(m => { m.ranked = m.games >= min; m.pos = m.ranked ? ++r : null; });
        list.min = min;
        list.maxRank = Math.max(1, ...tw.map(t => t.n));
        // league-wide win % in each quad (every team-week in scope)
        list.leagueQuads = QUADS.map((_, k) => { const g = list.reduce((t, m) => t + m.quads[k].g, 0), w = list.reduce((t, m) => t + m.quads[k].w, 0); return { g, w, pct: g ? w / g : null }; });
        return list;
    }

    const quadCell = (q, k) => q.g ? `<td class="num ${q.w / q.g >= 0.5 ? 'win' : 'loss'}" title="${q.w} win${q.w === 1 ? '' : 's'} in ${q.g} week${q.g === 1 ? '' : 's'} ranked ${QUADS[k]}">${pct3(q.w / q.g)}</td>`
                                   : '<td class="num muted">-</td>';

    function table(lines, { focus = null, link = n => esc(n) } = {}) {
        return `<div class="table-scroll"><table class="data-table sr-table" style="min-width:1040px">${SITE.cols('4%', '14%', '5%', '7%', '6%', '6%', '7%', '5%', '8%', '6%', '6%', '6.5%', '6.5%', '6.5%', '6.5%')}
            <thead><tr><th class="num">#</th><th>Manager</th><th class="num">GP</th><th class="num">Avg rank</th><th class="num">Top</th><th class="num">Top 3</th>
                <th class="num">Bottom 3</th><th class="num">Last</th><th class="num">All-play</th><th class="num">PCT</th><th class="num">Luck</th>
                ${QUADS.map(l => `<th class="num" title="Win PCT in weeks the score ranked ${l}">PCT ${l.replace('-', '‑')}</th>`).join('')}</tr></thead><tbody>
            ${lines.map(m => `<tr class="${m.id === focus ? 'me' : ''}"${m.ranked ? '' : ' style="opacity:.55"'}>
                <td class="num muted">${m.pos ?? '-'}</td><td><span class="team-cell"><img src="${GT.logo(m.name)}" alt="">${link(m.name)}</span></td>
                <td class="num">${m.games}</td><td class="num">${m.avgRank.toFixed(1)}</td><td class="num">${m.top1}</td><td class="num">${m.top3}</td>
                <td class="num">${m.bottom3}</td><td class="num">${m.last}</td><td class="num"><b>${pct3(m.allPlay)}</b></td><td class="num">${pct3(m.winPct)}</td>
                <td class="num ${m.luck >= 0 ? 'win' : 'loss'}">${m.luck >= 0 ? '+' : ''}${m.luck.toFixed(1)}</td>${m.quads.map(quadCell).join('')}</tr>`).join('')}
            <tr class="group"><td></td><td>League</td><td colspan="9"></td>${lines.leagueQuads.map(q => `<td class="num">${pct3(q.pct)}</td>`).join('')}</tr>
            </tbody></table></div>`;
    }

    // heat map: weeks at each rank; the shade scale comes from ranked managers so a one-game manager doesn't wash it out
    function matrix(lines, { focus = null, only = null } = {}) {
        const ranks = Array.from({ length: lines.maxRank }, (_, i) => i + 1);
        const pool = lines.filter(m => m.ranked);
        const maxShare = Math.max(0.01, ...(pool.length ? pool : lines).flatMap(m => ranks.map(r => (m.dist[r] || 0) / m.games)));
        const rows = only ? lines.filter(m => only.includes(m.id)) : lines;
        const cell = (m, r) => {
            const c = m.dist[r] || 0, a = c ? Math.min(0.85, 0.1 + 0.75 * ((c / m.games) / maxShare)).toFixed(2) : 0;
            return `<td class="sr-cell" style="background:rgba(var(--accent-rgb),${a});color:${a > 0.55 ? 'var(--on-accent)' : 'var(--ink)'}" title="${esc(m.name)}: ${c} week${c === 1 ? '' : 's'} ranked ${r}">${c || ''}</td>`;
        };
        const nameW = 150, cellW = 38;
        return `<div class="table-scroll"><table class="data-table sr-heat" style="width:${nameW + ranks.length * cellW}px;min-width:100%">
            <colgroup><col style="width:${nameW}px">${ranks.map(() => `<col style="width:${cellW}px">`).join('')}</colgroup>
            <thead><tr><th>Manager</th>${ranks.map(r => `<th class="num">${r}</th>`).join('')}</tr></thead><tbody>
            ${rows.map(m => `<tr class="${m.id === focus ? 'me' : ''}"${m.ranked ? '' : ' style="opacity:.55"'}><td><span class="team-cell"><img src="${GT.logo(m.name)}" alt=""><b>${esc(m.name)}</b></span></td>
                ${ranks.map(r => cell(m, r)).join('')}</tr>`).join('')}</tbody></table></div>`;
    }

    return { QUADS, quadOf, teamWeeks, managers, table, matrix, pct3 };
})();
