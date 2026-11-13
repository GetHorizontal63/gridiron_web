/* Stats: FBS Rankings. A weekly power ranking computed the way major college football ranked teams in the early 2000s
   (the 2002-03 BCS standings formula), from week 1 through week N-1 of the full season (playoffs included), then a
   title game in week N between the final No. 1 and No. 2. Alongside: record, SOR, SOS, remaining SOS and FPI.
   ?season= &week= (as of) &m= (manager to trace) */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    SITE.subHeader({ crumbs: [['Stats', url('pages/stats.html')], ['FBS Rankings']], tabs: SITE.statsTabs('fbs-rankings') });
    SITE.hero({ title: 'FBS Rankings', size: 'short', dots: false, image: 'background-15.png',
                meta: ['Weekly power rankings computed the way college football did it in the early 2000s', 'Polls, computers, strength of schedule, losses and quality wins'] });

    const E = await FbsEngine.load();
    const { rows, starters, nameOf, seasons, done, lengthOf, seasonData, titleGame, champOf, Phi, mean, sum, near } = E;

    // ------------------------------------------------------------------ helpers
    const pearson = (xs, ys) => { const mx = mean(xs), my = mean(ys);
        const sxy = sum(xs.map((x, i) => (x - mx) * (ys[i] - my))), sxx = sum(xs.map(x => (x - mx) ** 2)), syy = sum(ys.map(y => (y - my) ** 2));
        return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN; };
    const f1 = v => Number.isFinite(v) ? GT.pts(v) : '-';
    const f2 = v => Number.isFinite(v) ? v.toFixed(2) : '-';
    const sgn = v => Number.isFinite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) : '-';
    const p3 = v => Number.isFinite(v) ? v.toFixed(3).replace(/^0/, '') : '-';
    const odds = v => !Number.isFinite(v) ? '-' : v < 0.001 ? '<0.1%' : v > 0.999 ? '>99.9%' : `${(v * 100).toFixed(1)}%`;
    const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    const rec = t => `${t.w}-${t.l}${t.t ? '-' + t.t : ''}`;
    const half = v => Number.isInteger(v) ? String(v) : v.toFixed(1);
    const who = (name, season) => `<a class="team-cell" href="${GT.managerHref(name, season)}"><img src="${GT.logo(name)}" alt=""><b>${esc(name)}</b></a>`;

    // ------------------------------------------------------------------ state
    const S = { season: seasons.includes(Number(param('season'))) ? Number(param('season')) : seasons[0],
                week: Number(param('week')) || null, focus: param('m') || null, sort: 'rank', dir: 1 };
    let D, V, charts = [];

    const th = (k, label, tip, cls = 'num', attrs = '') => `<th class="${cls} tf-sortable${S.sort === k ? ' tf-on' : ''}" data-sort="${k}" data-tip="${esc(tip)}"${attrs}>${label}<span class="tf-arrow">${S.sort === k ? (S.dir < 0 ? '↓' : '↑') : ''}</span></th>`;
    const SORTS = { rank: t => t.rank, mgr: t => t.mgr, rec: t => -(t.pct * 1000 + t.w), sorR: t => t.sorRank, sorV: t => t.sorP,
                    sosR: t => t.sosRank, sosV: t => t.sos, remR: t => t.remRank, remV: t => t.rem, fpiR: t => t.fpiRank, fpiV: t => t.fpi };
    const HIGH_FIRST = new Set(['sosV', 'remV', 'fpiV']);   // values where bigger ranks first; everything else sorts low to high
    const prevOf = t => { const P = D.byWeek[V.X - 1]; const o = P && P.T.find(x => x.id === t.id); return o ? o.rank : null; };

    function rankings() {
        const key = SORTS[S.sort];
        const list = V.T.slice().sort((x, y) => { const a = key(x), c = key(y);
            if (typeof a === 'string') return S.dir * a.localeCompare(c);
            if (a == null || c == null) return a == null ? (c == null ? 0 : 1) : -1;     // no remaining games always sink
            return S.dir * (a - c) || x.rank - y.rank; });
        const SOR_TIP = 'Strength of record: how hard this record is to match. The chance an average team (FPI 0) would have this record or better against this exact schedule; the rarer, the better the rank.';
        const SOS_TIP = 'Strength of schedule, the BCS way: two-thirds opponents\' record (games against this team removed) plus one-third their opponents\' record. Rank 1 = toughest.';
        const REM_TIP = 'Remaining strength of schedule: the same formula over the regular-season opponents still to play, on their records to date. Rank 1 = toughest road ahead.';
        const FPI_TIP = 'Football Power Index: points a game better (or worse) than an average team, from scoring so far pulled toward average as if it had 4 extra average games. Predictive, not a résumé.';
        const RS = ' rowspan="2"', grp = (label, tip) => `<th class="num fbs-grp" colspan="2" data-tip="${esc(tip)}">${label}</th>`;
        return `<div class="table-scroll"><table class="data-table tf-t fbs-lb" style="min-width:980px">${SITE.cols('6%', '20%', '8%', '8%', '8.5%', '8%', '8.5%', '8%', '8.5%', '8%', '8.5%')}<thead><tr>
            ${th('rank', 'Rank', 'FBS ranking: lowest BCS total ranks first (see The Formula)', 'num', RS)}${th('mgr', 'Team', 'Sort by name', '', RS)}
            ${th('rec', 'Record', 'Overall record, playoff and placement games included', 'num', RS)}
            ${grp('SOR', SOR_TIP)}${grp('SOS', SOS_TIP)}${grp('Rem SOS', REM_TIP)}${grp('FPI', FPI_TIP)}</tr><tr>
            ${th('sorR', 'Rank', 'SOR rank: 1 = the rarest record for an average team to match')}${th('sorV', 'Chance', 'Chance an average team has this record or better against this schedule (lower is more impressive)')}
            ${th('sosR', 'Rank', 'SOS rank: 1 = toughest schedule to date')}${th('sosV', 'Opp %', 'BCS strength of schedule: two-thirds opponent win %, one-third their opponents win %')}
            ${th('remR', 'Rank', 'Remaining SOS rank: 1 = toughest road ahead')}${th('remV', 'Opp %', 'Remaining opponents rated the same way, on their records to date')}
            ${th('fpiR', 'Rank', 'FPI rank: 1 = best scoring team')}${th('fpiV', 'Pts', 'Points a game better or worse than an average team')}</tr></thead><tbody>
            ${list.map(t => { const pr = prevOf(t), mv = pr == null ? 0 : pr - t.rank;
                return `<tr class="${t.mgr === S.focus ? 'tf-sel' : ''}">
                <td class="num" data-tip="${esc(pr == null ? 'First week' : mv ? `${mv > 0 ? 'Up' : 'Down'} ${Math.abs(mv)} from ${ord(pr)} last week` : `Unchanged from last week`)}"><b>${t.rank}</b></td>
                <td>${who(t.mgr, S.season)}</td><td class="num">${rec(t)}</td>
                <td class="num fbs-rk"><b>${t.sorRank}</b></td><td class="num" data-tip="${esc(`An average team has ${rec(t)} or better against this schedule ${odds(t.sorP)} of the time (expects ${t.xwAvg.toFixed(1)} wins)`)}">${odds(t.sorP)}</td>
                <td class="num fbs-rk"><b>${t.sosRank}</b></td><td class="num" data-tip="${esc(`Opponents ${p3(t.or)}, their opponents ${p3(t.oor)}; opponents' FPI ${sgn(t.oppFpi)}`)}">${p3(t.sos)}</td>
                <td class="num fbs-rk">${t.rem == null ? '<span class="muted">-</span>' : `<b>${t.remRank}</b>`}</td><td class="num" data-tip="${esc(t.rem == null ? 'No regular-season games left' : `${t.remN} game${t.remN === 1 ? '' : 's'} left`)}">${t.rem == null ? '<span class="muted">-</span>' : p3(t.rem)}</td>
                <td class="num fbs-rk"><b>${t.fpiRank}</b></td><td class="num ${t.fpi >= 0 ? 'win' : 'loss'}">${sgn(t.fpi)}</td></tr>`; }).join('')}</tbody></table></div>`;
    }

    function formula() {
        const L = V.T.slice().sort((x, y) => x.rank - y.rank), CN = ['Colley', 'Wolfe', 'Elo'];
        const compCell = (t, k) => `<td class="num${t.dropIdx === k ? ' fbs-drop' : ''}" data-tip="${esc(`${CN[k]} rating ${k === 2 ? Math.round(t.ratings[k]) : t.ratings[k].toFixed(3)}${t.dropIdx === k ? ' · this team\'s worst computer rank, dropped' : ''}`)}">${t.comps[k]}</td>`;
        return `<div class="table-scroll"><table class="data-table tf-t" style="min-width:1120px">${SITE.cols('5%', '15%', '7%', '7%', '8%', '7%', '7%', '7%', '8%', '7%', '7%', '7%', '8%')}<thead><tr>
            <th class="num">#</th><th>Team</th>
            <th class="num" data-tip="Media poll stand-in (the AP's role): record first, points for breaking ties">Media</th>
            <th class="num" data-tip="Coaches poll stand-in (the coaches' role): all-play win % (every score against every other score that week)">Coaches</th>
            <th class="num" data-tip="Average of the two poll ranks">Polls</th>
            <th class="num" data-tip="Colley Matrix (a real BCS computer): wins and losses only, solved against the whole schedule">Colley</th>
            <th class="num" data-tip="Wolfe-style Bradley-Terry (a real BCS computer method): the strengths that make the actual results most likely">Wolfe</th>
            <th class="num" data-tip="Billingsley-style Elo: results in order, week by week, no margin of victory">Elo</th>
            <th class="num" data-tip="Average of the best two computer ranks: the worst is dropped, as the BCS did">Comps</th>
            <th class="num" data-tip="SOS rank ÷ 25, scaled from the 117 FBS teams of the era to this league">SOS pts</th>
            <th class="num" data-tip="One point per loss (ties half)">Losses</th>
            <th class="num" data-tip="Quality wins: a win over the No. 1 team (before this credit) takes off 1.0, No. 2 0.8, No. 3 0.6, No. 4 0.4, No. 5 0.2">QW</th>
            <th class="num" data-tip="Polls + computers + SOS points + losses − quality wins. Lowest is No. 1.">Total</th></tr></thead><tbody>
            ${L.map(t => `<tr class="${t.mgr === S.focus ? 'tf-sel' : ''}"><td class="num"><b>${t.rank}</b></td><td>${who(t.mgr, S.season)}</td>
                <td class="num">${t.media}</td><td class="num">${t.coaches}</td><td class="num"><b>${half(t.poll)}</b></td>
                ${compCell(t, 0)}${compCell(t, 1)}${compCell(t, 2)}<td class="num"><b>${half(t.comp)}</b></td>
                <td class="num" data-tip="${esc(`SOS rank ${t.sosRank}`)}">${f2(t.sosPts)}</td><td class="num">${half(t.losses)}</td>
                <td class="num${t.qw ? ' win' : ''}" data-tip="${esc(t.qwList.length ? t.qwList.map(q => `Wk ${q.week} over ${q.mgr} (No. ${q.rk}) −${q.v.toFixed(1)}`).join(' · ') : 'No wins over a top-5 team')}">${t.qw ? '−' + t.qw.toFixed(1) : '0'}</td>
                <td class="num"><b>${f2(t.total)}</b></td></tr>`).join('')}</tbody></table></div>`;
    }

    function tiles() {
        const T = V.T, by = (f, dir = -1) => T.filter(t => Number.isFinite(f(t))).sort((x, y) => dir * (f(x) - f(y)) || x.rank - y.rank)[0];
        const tile = (l, v, s, tip) => `<div class="stat-tile"><div class="v">${v}</div><div class="l" data-tip="${esc(tip)}">${l}</div><div class="s">${s}</div></div>`;
        const one = T.find(t => t.rank === 1);
        const moves = T.map(t => ({ t, mv: prevOf(t) == null ? NaN : prevOf(t) - t.rank }));
        const up = moves.filter(m => Number.isFinite(m.mv)).sort((x, y) => y.mv - x.mv || x.t.rank - y.t.rank)[0];
        const down = moves.filter(m => Number.isFinite(m.mv)).sort((x, y) => x.mv - y.mv || x.t.rank - y.t.rank)[0];
        const sor = by(t => -t.sorP), fpi = by(t => t.fpi), sos = by(t => t.sos), rem = by(t => t.rem == null ? NaN : t.rem);
        const TG = titleGame(D, V.X);
        const title = !TG ? tile('Title game', '-', '-', '') : TG.projected
            ? tile('Title odds', odds(TG.p), `${esc(TG.A.mgr)} over ${esc(TG.C.mgr)} as of week ${V.X}`, `If the season had ended after week ${V.X}: No. 1 against No. 2 in week ${D.N}. The chance No. 1 wins, from the two teams' FPI.`)
            : tile(`Week ${D.N} title game`, TG.winner ? esc(TG.winner.mgr) : '-', TG.winner ? `${f1(Math.max(TG.a, TG.c))}-${f1(Math.min(TG.a, TG.c))} over ${esc((TG.winner === TG.A ? TG.C : TG.A).mgr)}` : 'No score on file', `No. 1 against No. 2 after week ${D.N - 1}, on the scores they posted in week ${D.N}`);
        const NOPREV = 'Needs a previous week';
        return `<div class="stat-tiles tiles-4 tf-tiles fbs-tiles">
            ${tile('No. 1', esc(one.mgr), `${rec(one)} · BCS total ${f2(one.total)}`, 'Lowest BCS total this week')}
            ${title}
            ${tile('Greatest gain', up && up.mv > 0 ? `+${up.mv}` : '-', up && up.mv > 0 ? `${esc(up.t.mgr)} · ${ord(prevOf(up.t))} to ${ord(up.t.rank)}` : V.X > 1 ? 'Nobody moved up' : NOPREV, 'Most places gained since last week')}
            ${tile('Biggest drop off', down && down.mv < 0 ? `−${-down.mv}` : '-', down && down.mv < 0 ? `${esc(down.t.mgr)} · ${ord(prevOf(down.t))} to ${ord(down.t.rank)}` : V.X > 1 ? 'Nobody moved down' : NOPREV, 'Most places lost since last week')}
            ${tile('Best résumé', odds(sor.sorP), `${esc(sor.mgr)} · ${rec(sor)} · SOR No. 1`, 'Strength of record leader: the chance an average team would match this record or better against this schedule')}
            ${tile('Top FPI', sgn(fpi.fpi), `${esc(fpi.mgr)} · points a game over average`, 'Football Power Index leader')}
            ${tile('Toughest schedule', p3(sos.sos), `${esc(sos.mgr)} · opponents and their opponents`, 'Highest BCS strength of schedule to date')}
            ${tile('Toughest road ahead', rem ? p3(rem.rem) : '-', rem ? `${esc(rem.mgr)} · ${rem.remN} regular-season game${rem.remN === 1 ? '' : 's'} left` : 'Regular season complete', 'Highest remaining strength of schedule')}
        </div>`;
    }

    // ------------------------------------------------------------------ the title-game banner
    // Team colour: the dominant saturated colour of the manager's logo (fantasy teams have no colours of their own),
    // falling back to the colour of the NFL team the manager roots for, then the site accent.
    const hexOf = (r, g, c) => '#' + [r, g, c].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const lum = h => { const [r, g, c] = rgbOf(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * c; };
    const mixBlack = (h, k) => hexOf(...rgbOf(h).map(v => v * (1 - k)));
    const logoColor = name => new Promise(res => {
        const img = new Image();
        img.onload = () => { try {
            const cv = document.createElement('canvas'); cv.width = cv.height = 48;
            const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, 48, 48);
            const d = cx.getImageData(0, 0, 48, 48).data, bins = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
            let light = 0, dark = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 200) continue;
                const r = d[i] / 255, g = d[i + 1] / 255, c = d[i + 2] / 255, mx = Math.max(r, g, c), mn = Math.min(r, g, c), l = (mx + mn) / 2;
                const sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
                if (sat < 0.28 || l < 0.12 || l > 0.88) { if (l > 0.82) light++; else if (l < 0.18) dark++; continue; }
                let h = mx === r ? ((g - c) / (mx - mn)) % 6 : mx === g ? (c - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
                h = ((h * 60) + 360) % 360;
                const wt = h >= 12 && h <= 45 && l > 0.45 ? sat * 0.25 : sat;   // skin tones (faces in logos) are rarely the team colour
                const bin = bins[Math.floor(h / 15) % 24]; bin.w += wt; bin.r += d[i] * wt; bin.g += d[i + 1] * wt; bin.b += d[i + 2] * wt;
            }
            const avg = x => hexOf(x.r / x.w, x.g / x.w, x.b / x.w);
            const bi = bins.reduce((m, x, i) => x.w > bins[m].w ? i : m, 0), best = bins[bi];
            // secondary: the strongest hue at least 45 degrees from the primary with a real share of the logo,
            // otherwise white or black (whichever the logo uses more)
            const far = i => { const dh = Math.abs(i - bi) % 24; return Math.min(dh, 24 - dh) >= 3; };
            const si = bins.reduce((m, x, i) => far(i) && (m < 0 || x.w > bins[m].w) ? i : m, -1);
            const second = si >= 0 && bins[si].w >= Math.max(20, best.w * 0.2) ? avg(bins[si]) : (light || dark) ? (light >= dark ? '#ececec' : '#232323') : null;
            res(best.w > 35 ? { p: avg(best), s: second } : (second ? { p: null, s: second } : null));
        } catch (e) { res(null); } };
        img.onerror = () => res(null);
        img.src = GT.logo(name);
    });
    const COLORS = {};
    const colorOf = m => (COLORS[m] && COLORS[m].p) || GT.teamColor(GT.fanTeam(m)) || '#4682b4';
    const secondOf = m => (COLORS[m] && COLORS[m].s) || '#c9ccd2';                // facemask; metal grey when the logo gives nothing

    // a torn-paper edge for the centre strip, the same every time
    // o = the paper's ragged outer edge, i = the strip inside it (a few px in), so a torn white rim shows between them
    const TORN = (() => { let sd = 7; const r = () => (sd = (sd * 9301 + 49297) % 233280) / 233280; const Lo = [], Li = [], Ro = [], Ri = [];
        for (let y = 0; y <= 100; y += 2) { const a = r() * 8, c = r() * 8;
            Lo.push(`${a.toFixed(1)}px ${y}%`); Li.push(`${(a + 3 + r() * 4).toFixed(1)}px ${y}%`);
            Ro.push(`calc(100% - ${c.toFixed(1)}px) ${y}%`); Ri.push(`calc(100% - ${(c + 3 + r() * 4).toFixed(1)}px) ${y}%`); }
        const poly = (L, R) => `polygon(${[...L, ...R.slice().reverse()].join(',')})`;
        return { o: poly(Lo, Ro), i: poly(Li, Ri) }; })();
    // chalk marks: [width, height, path, direction the mark points in degrees (null = no direction)]
    const CHALK = [
        [70, 44, 'M8 34 L20 8 M24 38 L37 6 M41 38 L52 14 M56 32 L63 18', null],                       // slashes
        [100, 56, 'M4 50 C 18 34, 28 52, 42 38 S 68 22, 88 10 M72 7 L88 10 L83 25', -32],            // curvy arrow
        [66, 46, 'M6 40 L60 10 M44 8 L60 10 L54 26', -29],                                           // straight arrow
        [40, 60, 'M30 6 L22 18 M36 24 L24 28 M34 44 L22 38', null],                                  // impact ticks
        [60, 36, 'M30 4 L30 14 M48 10 L42 19 M56 28 L46 28 M12 10 L18 19 M4 28 L14 28', null],       // rays
        [68, 36, 'M4 30 L16 8 L28 30 L40 8 L52 30 L64 8', null],                                     // zigzag
        [36, 36, 'M7 7 L29 29 M29 7 L7 29', null],                                                   // X
        [66, 48, 'M40 8 C 18 4, 4 18, 10 32 C 16 46, 50 46, 58 30 C 64 16, 46 4, 28 10', null],      // loop
        [96, 30, 'M4 10 C 30 4, 60 14, 92 8 M10 22 C 36 16, 64 26, 88 20', null],                    // double underline
        [36, 36, 'M18 4 L18 32 M4 18 L32 18 M8 8 L28 28 M28 8 L8 28', null],                         // asterisk
        [60, 40, 'M4 8 L40 8 M14 20 L56 20 M8 32 L36 32', null]                                      // speed lines
    ];
    // randomness from the browser's cryptographic generator, not Math.random
    const rnd = () => { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; };
    const pick = list => list[Math.floor(rnd() * list.length)];
    let chalkGen = 0;
    // where a new mark may go in one half: clear of the stat boxes, the name block, the seed tag, the body of the helmet
    // and the marks already there. Returns the SVG element, or null when no free spot turns up.
    function chalkMark(half) {
        const layer = half.querySelector('.fbs-chalk'), H = half.getBoundingClientRect();
        if (!layer || !H.width) return null;
        const rel = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left - H.left, y: r.top - H.top, w: r.width, h: r.height }; };
        const avoid = [rel(half.querySelector('.fbs-stats')), rel(half.querySelector('.fbs-name')), rel(half.querySelector('.fbs-tag'))].filter(Boolean);
        const hel = rel(half.querySelector('.fbs-helmet'));
        let cx = H.width / 2, cy = H.height / 2;
        if (hel) { cx = hel.x + hel.w / 2; cy = hel.y + hel.h / 2; avoid.push({ x: cx - hel.w * 0.3, y: cy - hel.h * 0.36, w: hel.w * 0.6, h: hel.h * 0.72 }); }
        [...layer.querySelectorAll('.fbs-mark:not(.fbs-out)')].forEach(m => avoid.push(rel(m)));
        const hit = (p, c) => p.x < c.x + c.w && c.x < p.x + p.w && p.y < c.y + c.h && c.y < p.y + p.h;
        const [w0, h0, d, dir] = pick(CHALK), k = 0.7 + rnd() * 0.6, w = w0 * k, h = h0 * k;
        for (let t = 0; t < 60; t++) {
            const x = 8 + rnd() * (H.width - w - 16), y = 8 + rnd() * (H.height - h - 16);
            if (avoid.some(r => hit({ x: x - 10, y: y - 10, w: w + 20, h: h + 20 }, r))) continue;
            const rot = dir == null ? (rnd() - 0.5) * 60 : Math.atan2(cy - (y + h / 2), cx - (x + w / 2)) * 180 / Math.PI - dir;
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'fbs-mark'); svg.setAttribute('viewBox', `0 0 ${w0} ${h0}`); svg.setAttribute('aria-hidden', 'true');
            svg.style.cssText = `left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${w.toFixed(0)}px;height:${h.toFixed(0)}px;transform:rotate(${rot.toFixed(0)}deg)`;
            svg.innerHTML = `<path d="${d}" pathLength="1" style="animation-duration:${(0.45 + rnd() * 0.7).toFixed(2)}s"/>`;
            layer.appendChild(svg);
            return svg;
        }
        return null;
    }
    function placeHelmets() {
        document.querySelectorAll('.fbs-half').forEach(h => {
            const cv = h.querySelector('.fbs-helmet'), nm = h.querySelector('.fbs-name'), st = h.querySelector('.fbs-stats');
            if (!cv || !nm) return;
            cv.style.left = '';
            if (!st || getComputedStyle(st).display === 'none') return;         // phones: the helmet fills the half
            const H = h.getBoundingClientRect(), N = nm.getBoundingClientRect(), T = st.getBoundingClientRect(), w = cv.offsetWidth;
            const want = N.left + N.width / 2 - H.left - w / 2;
            const lo = h.classList.contains('fbs-l') ? T.right - H.left - 10 : 0;
            const hi = h.classList.contains('fbs-l') ? H.width - w : T.left - H.left - w + 10;
            cv.style.left = `${Math.round(Math.max(lo, Math.min(hi, want)))}px`;
        });
    }
    // banner team names stay on one line: a name too long for it loses a leading "The", "A" or "An" first,
    // and whatever still doesn't fit is cut off at the edge (no ellipsis)
    function fitNames() {
        document.querySelectorAll('.fbs-name b[data-full]').forEach(el => {
            el.textContent = el.dataset.full;
            if (el.scrollWidth > el.clientWidth + 1) { const cut = el.dataset.full.replace(/^(the|a|an)\s+/i, ''); if (cut) el.textContent = cut; }
        });
    }
    // a mark's life: drawn in (its own random speed), held for 3 s, faded out over 5 s, then removed
    const HOLD = 3000, FADE = 5000;
    function retire(m) {
        const draw = parseFloat(m.querySelector('path').style.animationDuration) * 1000 || 700;
        setTimeout(() => { m.classList.add('fbs-out'); setTimeout(() => m.remove(), FADE + 100); }, draw + HOLD);
    }
    // New marks at random moments (0.25-1.5 s apart), each on a random side, in a random free spot; a side already
    // holding 9 visible marks waits. Nothing repeats: every mark is drawn fresh and retires on its own clock.
    function startChalk() {
        const gen = ++chalkGen, halves = [...document.querySelectorAll('.fbs-half')];
        if (!halves.length) return;
        const live = h => h.querySelectorAll('.fbs-mark:not(.fbs-out)').length;
        const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        halves.forEach(h => { const n = 2 + Math.floor(rnd() * 4); for (let i = 0; i < n; i++) { const m = chalkMark(h); if (m && !still) retire(m); } });
        if (still) return;
        const step = () => {
            if (gen !== chalkGen || !halves[0].isConnected) return;     // the page re-rendered: this run ends
            const h = pick(halves);
            if (live(h) < 9) { const m = chalkMark(h); if (m) retire(m); }
            setTimeout(step, 250 + rnd() * 1250);
        };
        setTimeout(step, 250 + rnd() * 1250);
    }

    // every real meeting between the two finalists, newest first
    function headToHead(A, C, season, week) {
        const games = rows.filter(r => r.id === A.id && r.opp === C.id && r.pa != null && (r.season < season || (r.season === season && r.week <= week)))
            .sort((x, y) => y.season - x.season || y.week - x.week);
        let w = 0, l = 0, t = 0;
        games.forEach(g => { if (g.pf > g.pa) w++; else if (g.pf < g.pa) l++; else t++; });
        const lead = w === l ? `Series tied ${w}-${l}${t ? `-${t}` : ''}` : `${esc(w > l ? A.mgr : C.mgr)} leads ${Math.max(w, l)}-${Math.min(w, l)}${t ? `-${t}` : ''}`;
        const line = g => { const won = g.pf > g.pa ? A : g.pf < g.pa ? C : null;
            return `<div class="fbs-h2r" data-tip="${esc(`${g.season} week ${g.week}${g.period !== 'Regular' ? ' (postseason)' : ''}: ${A.mgr} ${f1(g.pf)}, ${C.mgr} ${f1(g.pa)}`)}">
                <span>${g.season} · Wk ${g.week}</span><b>${f1(g.pf)}-${f1(g.pa)}</b>${won ? `<img src="${GT.logo(won.mgr)}" alt="${esc(won.mgr)}">` : '<i>T</i>'}</div>`; };
        return `<div class="fbs-h2h"><span class="fbs-wk">Head to head</span>
            <div class="fbs-h2s">${games.length ? lead : 'Never met'}</div>
            ${games.slice(0, 4).map(line).join('')}</div>`;
    }

    function matchup() {
        const TG = titleGame(D, V.X);
        if (!TG) return '';
        const cA = colorOf(TG.A.mgr), cC = colorOf(TG.C.mgr);     // a team's helmet colour never depends on its opponent
        const dist = (x, y) => Math.hypot(...rgbOf(x).map((v, i) => v - rgbOf(y)[i]));
        const panel = c => { let k = 0, x = c; while (lum(x) > 0.16 && k < 0.8) { k += 0.08; x = mixBlack(c, k); } return x; };   // white text stays readable
        // the comparison boxes: an arrow marks the better team on each line
        const lines = [['FPI', t => sgn(t.fpi), t => t.fpi, 1], ['SOR', t => t.sorRank, t => t.sorRank, -1], ['SOS', t => t.sosRank, t => t.sosRank, -1]];
        const boxes = (t, o, side) => lines.map(([l, show, val, dir]) => {
            const d = dir * (val(t) - val(o)), mark = d > 1e-9 ? (side === 'l' ? '◂' : '▸') : Math.abs(d) <= 1e-9 ? '=' : '';
            return `<div class="fbs-box" data-tip="${esc(l === 'FPI' ? 'FPI: points a game over an average team' : `${l} rank (1 = best)`)}"><b>${show(t)}</b><span>${l}</span>${mark ? `<i>${mark}</i>` : ''}</div>`; }).join('');
        // two near-identical colours: only the No. 2 panel's background goes darker, never the helmet
        const clash = dist(cA, cC) < 90;
        const half = (t, o, seed, color, side) => `<div class="fbs-half fbs-${side}" style="--tc:${side === 'r' && clash ? mixBlack(color, 0.35) : color};--tcd:${side === 'r' && clash ? mixBlack(panel(color), 0.4) : panel(color)}">
            <img class="fbs-wm" src="${GT.logo(t.mgr)}" alt=""><div class="fbs-chalk" aria-hidden="true"></div>
            <span class="fbs-tag">No. ${seed}</span>
            <div class="fbs-stats">${boxes(t, o, side)}</div>
            <canvas class="fbs-helmet" data-color="${color}" data-mask="${secondOf(t.mgr)}" data-logo="${GT.logo(t.mgr)}" data-facing="${side === 'l' ? 'right' : 'left'}" aria-label="${esc(t.mgr)} helmet"></canvas>
            <div class="fbs-name"><span class="fbs-chip">${seed}</span><b data-full="${esc(GT.teamName(b, t.mgr, D.s))}">${esc(GT.teamName(b, t.mgr, D.s))}</b><span class="fbs-who">${esc(t.mgr)} · ${rec(t)}</span></div></div>`;
        const res = (t, pts, won) => `<div class="fbs-res${won ? ' won' : ''}"><img src="${GT.logo(t.mgr)}" alt=""><b>${pts == null ? '-' : f1(pts)}</b></div>`;
        const pA = TG.p;
        const mid = `<div class="fbs-tear" style="clip-path:${TORN.o}"><div class="fbs-mid" style="clip-path:${TORN.i}">
            <span class="fbs-wk">Week ${D.N} · Title game</span><span class="fbs-vsx">VS</span>
            ${TG.projected ? `<span class="fbs-wk">If it ended after week ${V.X}</span>` : `${res(TG.A, TG.a, TG.winner === TG.A)}${res(TG.C, TG.c, TG.winner === TG.C)}<span class="fbs-wk">Final</span>`}
            <div class="fbs-odds" data-tip="Pre-game chances from FPI">
                <div class="fbs-oddbar"><span style="width:${(pA * 100).toFixed(1)}%;background:${cA}"></span><span style="background:${cC}"></span></div>
                <div class="fbs-oddtxt"><span>${odds(pA)}</span><span>${odds(1 - pA)}</span></div></div><div class="fbs-ticks"></div>${headToHead(TG.A, TG.C, D.s, TG.projected ? V.X : D.N)}</div></div>`;
        const champ = champOf(D.s);
        let note;
        if (TG.projected) note = D.complete
            ? `As of week ${V.X}, ${esc(TG.A.mgr)} and ${esc(TG.C.mgr)} were on course to meet in week ${D.N}, with FPI giving ${esc(TG.A.mgr)} a ${odds(TG.p)} chance. Pick week ${D.N - 1} for the title game that was really played.`
            : `The season is still going. If it ended after week ${V.X}, ${esc(TG.A.mgr)} and ${esc(TG.C.mgr)} would meet in week ${D.N}; FPI gives ${esc(TG.A.mgr)} a ${odds(TG.p)} chance.`;
        else if (!TG.winner) note = TG.a == null || TG.c == null ? `No week ${D.N} score on file for one of the finalists.` : `A dead heat in week ${D.N}.`;
        else note = `No. 1 against No. 2 after week ${D.N - 1}, on the scores each really posted in week ${D.N}. ${esc(TG.winner.mgr)} won. `
            + (champ ? (champ === TG.winner.mgr ? 'Same champion as the real bracket.' : `The real bracket crowned ${esc(champ)}.`) : '');
        return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="fbs-chalkf"><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.4"/></filter></svg>
            <section class="fbs-mu">${half(TG.A, TG.C, 1, cA, 'l')}${mid}${half(TG.C, TG.A, 2, cC, 'r')}</section><p class="tf-sub fbs-note">${note}</p>
            <p class="fbs-credit">Helmet model: <a href="https://www.thingiverse.com/thing:3148381" target="_blank" rel="noopener">Football Helmet Detailed</a> by AnWMan, Creative Commons Attribution. Recoloured, with team logos added.</p>`;
    }

    // ------------------------------------------------------------------ 3D helmets (three.js), built from primitives
    const Helmet = (() => {
        const texCache = {};
        const loadTex = src => texCache[src] || (texCache[src] = new Promise(res => new THREE.TextureLoader().load(src, t => res(t), undefined, () => res(null))));
        const P = Math.PI, OPEN = 0.95;
        // the packed model (NEW/python/build_helmet_model.py): pieces with a role, 16-bit positions and indices
        let modelP = null;
        const loadModel = () => modelP || (modelP = fetch(url('assets/models/helmet.bin')).then(r => r.ok ? r.arrayBuffer() : null).then(buf => {
            if (!buf || String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'GTH1') return null;
            const dv = new DataView(buf), lo = [0, 1, 2].map(i => dv.getFloat32(4 + 4 * i, true)), size = [0, 1, 2].map(i => dv.getFloat32(16 + 4 * i, true));
            const n = dv.getUint32(28, true), parts = [], ctr = lo.map((v, i) => v + size[i] / 2), k = 2.5 / Math.max(...size);
            let off = 32;
            for (let j = 0; j < n; j++) {
                const role = dv.getUint32(off, true), vc = dv.getUint32(off + 4, true), ic = dv.getUint32(off + 8, true); off += 12;
                const q = new Uint16Array(buf, off, vc * 3); off += vc * 6; off += (4 - off % 4) % 4;
                const idx = new Uint16Array(buf, off, ic); off += ic * 2; off += (4 - off % 4) % 4;
                const pos = new Float32Array(vc * 3);
                for (let i = 0; i < vc * 3; i++) { const a = i % 3; pos[i] = (lo[a] + q[i] / 65535 * size[a] - ctr[a]) * k; }
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
                g.rotateY(P / 2);                                  // the model faces +Z; the scene's helmets face +X
                g.computeVertexNormals(); g.computeBoundingSphere();
                parts.push({ role, g });
            }
            // logo decals, one per side, measured once on the bare shell (the same for every helmet)
            const shellGeo = parts.find(p => p.role === 0);
            const decals = [];
            if (shellGeo && THREE.DecalGeometry) {
                const shell = new THREE.Mesh(shellGeo.g, new THREE.MeshBasicMaterial()); shell.updateMatrixWorld(true);
                const ray = new THREE.Raycaster();
                [1, -1].forEach(sz => {
                    ray.set(new THREE.Vector3(-0.2, 0.47, 4 * sz), new THREE.Vector3(0, 0, -sz));
                    const hitP = ray.intersectObject(shell)[0];
                    if (!hitP) return;
                    const nrm = hitP.face.normal.clone().transformDirection(shell.matrixWorld);
                    const aim = new THREE.Object3D(); aim.position.copy(hitP.point); aim.lookAt(hitP.point.clone().add(nrm));
                    decals.push({ sz, g: new THREE.DecalGeometry(shell, hitP.point, aim.rotation, new THREE.Vector3(0.95, 0.95, 0.9)) });
                });
            }
            return { parts, decals };
        }).catch(() => null));
        function buildModel(M, color, tex, facingRight, mask) {
            const g = new THREE.Group();
            const mats = [
                new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: 0.3, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }),
                new THREE.MeshPhysicalMaterial({ color: new THREE.Color(mask || '#c9ccd2').convertSRGBToLinear(), roughness: 0.35, metalness: 0.25, clearcoat: 0.6 }),   // painted facemask
                new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.2 })
            ];
            M.parts.forEach(p => g.add(new THREE.Mesh(p.g, mats[p.role] || mats[2])));
            // the logo only on the side the camera sees: +Z for a helmet facing right, -Z for one facing left
            if (tex) M.decals.filter(d => d.sz === (facingRight ? 1 : -1)).forEach(d => g.add(new THREE.Mesh(d.g, new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, alphaTest: 0.05, roughness: 0.3,
                clearcoat: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }))));
            return g;
        }
        function build(color, tex, mask) {
            const g = new THREE.Group();
            const shell = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: 0.32, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.06 });
            const liner = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95, side: THREE.BackSide });
            const metal = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(mask || '#c9ccd2').convertSRGBToLinear(), roughness: 0.35, metalness: 0.25, clearcoat: 0.6 });
            const add = (geo, mat, f) => { const m = new THREE.Mesh(geo, mat); if (f) f(m); g.add(m); return m; };
            // shell: crown, a band around the back and sides (open at the face), jaw flaps and a back skirt
            [[0, 2 * P, 0, 0.42 * P], [P + OPEN, 2 * P - 2 * OPEN, 0.42 * P, 0.24 * P],
             [P + OPEN, 0.85, 0.66 * P, 0.13 * P], [P - OPEN - 0.85, 0.85, 0.66 * P, 0.13 * P], [2 * P - 0.9, 1.8, 0.66 * P, 0.07 * P]]
                .forEach(([ps, pl, ts, tl]) => {
                    const geo = new THREE.SphereGeometry(1, 72, 36, ps, pl, ts, tl);
                    add(geo, shell); add(geo, liner, m => m.scale.setScalar(0.965));
                });
            // centre stripe, front to back over the crown
            const lightShell = lum(color) > 0.45;
            add(new THREE.TorusGeometry(1.008, 0.05, 10, 90, 1.12 * P), new THREE.MeshPhysicalMaterial({ color: lightShell ? 0x1b1b1b : 0xf4f4f4, roughness: 0.3, clearcoat: 1 }),
                m => { m.rotation.z = 0.1 * P; m.scale.z = 1.7; });
            // rubber trim around the face opening: the brow, both sides of the opening and the bottom of the jaw flaps
            const sp = (th, ph, r = 1.0) => new THREE.Vector3(-r * Math.cos(ph) * Math.sin(th), r * Math.cos(th), r * Math.sin(ph) * Math.sin(th));
            const trim = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7 });
            const edge = pts => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.028, 8, false), trim);
            const steps = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
            edge(steps(24, u => sp(0.42 * P, P - OPEN + 2 * OPEN * u)));
            [P - OPEN, P + OPEN].forEach(ph => edge(steps(12, u => sp(0.42 * P + 0.37 * P * u, ph))));
            [[P + OPEN, 0.85], [P - OPEN - 0.85, 0.85]].forEach(([ps, pl]) => edge(steps(12, u => sp(0.79 * P, ps + pl * u))));
            // the logo on both sides, a little behind centre
            if (tex) [P / 2 - 0.12, 1.5 * P + 0.12].forEach(pc => add(new THREE.SphereGeometry(1.01, 28, 28, pc - 0.5, 1.0, 0.4 * P - 0.47, 0.94),
                new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, alphaTest: 0.05, roughness: 0.3, clearcoat: 1, depthWrite: false })));
            // facemask: curved bars bowing out in front of the face opening, joined by uprights
            const bar = pts => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.034, 8, false), metal);
            const at = (y, a) => { const base = Math.sqrt(Math.max(0.05, 1 - y * y)), R = base + (1.2 - base) * Math.cos(a / OPEN * P / 2) ** 0.8;
                return new THREE.Vector3(R * Math.cos(a), y, R * Math.sin(a)); };
            const rows = [-0.06, -0.34, -0.6, -0.84];
            rows.forEach(y => bar(Array.from({ length: 15 }, (_, i) => at(y, -OPEN + (2 * OPEN * i) / 14))));
            [-0.62, -0.25, 0.25, 0.62].forEach(a => bar(rows.map(y => at(y, a))));
            // chin cup
            add(new THREE.SphereGeometry(0.2, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }), m => { m.position.set(0.86, -1.0, 0); m.scale.set(0.7, 0.55, 1.35); });
            g.scale.set(1.12, 1, 1);
            return g;
        }
        function mount(canvas) {
            if (!window.THREE) return false;
            let renderer;
            try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return false; }
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            renderer.outputEncoding = THREE.sRGBEncoding;
            const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
            cam.position.set(0, 0.45, 7.2); cam.lookAt(0, -0.15, 0);
            scene.add(new THREE.HemisphereLight(0xffffff, 0x303030, 0.75));
            const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(3, 5, 6); scene.add(key);
            const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(-5, 2, -4); scene.add(rim);
            const holder = new THREE.Group(); scene.add(holder);
            const facingRight = canvas.dataset.facing === 'right', base = facingRight ? -0.38 : P + 0.38;
            holder.rotation.order = 'YXZ';                     // the lean (z) happens in the helmet's own frame, before the turn (y)
            holder.rotation.set(0.05, base, 0);
            Promise.all([loadTex(canvas.dataset.logo), loadModel()]).then(([tex, M]) => {
                if (tex) tex.encoding = THREE.sRGBEncoding;
                holder.add(M && M.parts.length ? buildModel(M, canvas.dataset.color, tex, facingRight, canvas.dataset.mask) : build(canvas.dataset.color, tex, canvas.dataset.mask));   // built-in helmet if the model is missing
            });
            const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
            // hover: the pointer over the helmet itself (its bounding box, not the empty canvas around it) eases in a
            // small lean back and zoom; leaving eases it out. No idle motion.
            let hover = 0, over = false;
            const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), box = new THREE.Box3();
            canvas.addEventListener('pointermove', e => {
                if (!holder.children.length) return;
                const r = canvas.getBoundingClientRect();
                ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
                ray.setFromCamera(ndc, cam);
                over = ray.ray.intersectsBox(box.setFromObject(holder));
                canvas.style.cursor = over ? 'pointer' : '';
            });
            canvas.addEventListener('pointerleave', () => { over = false; canvas.style.cursor = ''; });
            const frame = now => {
                if (!canvas.isConnected) { renderer.dispose(); renderer.forceContextLoss(); return; }
                const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
                if (w && h && (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr))) { renderer.setSize(w, h, false); cam.aspect = w / h; const k = Math.max(1, 0.95 / cam.aspect); cam.position.set(0, 0.45 * k, 7.2 * k); cam.lookAt(0, -0.15, 0); cam.updateProjectionMatrix(); }
                if (!still) { hover += ((over ? 1 : 0) - hover) * 0.12; holder.rotation.z = hover * 0.16; holder.scale.setScalar(1 + hover * 0.08); }
                renderer.render(scene, cam);
                requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
            return true;
        }
        return { mount };
    })();
    function mountHelmets() {
        document.querySelectorAll('canvas.fbs-helmet').forEach(c => {
            if (!Helmet.mount(c)) c.outerHTML = `<img class="fbs-helmet fbs-flat" src="${c.dataset.logo}" alt="">`;   // no WebGL: the logo instead
        });
    }

    function bracketHistory() {
        const list = seasons.filter(s => done.has(s)).map(s => {
            const Ds = seasonData(s);
            if (!Ds.complete) return null;
            const F = Ds.byWeek[Ds.N - 1], TG = titleGame(Ds), fin = F.T.map(t => b.finish[`${s}-${t.id}`]);
            const ok = fin.every(Number.isFinite);
            const rho = f => ok ? pearson(F.T.map(f), fin) : NaN;
            return { s, Ds, TG, champ: champOf(s), rFbs: rho(t => t.rank), rRec: rho(t => t.media), rFpi: rho(t => t.fpiRank) };
        }).filter(Boolean);
        const avg = k => mean(list.map(x => x[k]).filter(Number.isFinite));
        const same = list.filter(x => x.TG && x.TG.winner && x.TG.winner.mgr === x.champ).length;
        const rhoCell = v => `<td class="num">${Number.isFinite(v) ? v.toFixed(2) : '-'}</td>`;
        return `<p class="tf-sub">The final rankings (after week N − 1) against how each season really finished. ρ is Spearman's rank correlation with the final placement: 1 means the ranking called the finish exactly. The FBS champion matched the real champion in <b>${same} of ${list.length}</b> seasons.</p>
            <div class="table-scroll"><table class="data-table tf-t" style="min-width:1040px">${SITE.cols('8%', '34%', '17%', '17%', '8%', '8%', '8%')}<thead><tr>
            <th class="num">Season</th><th data-tip="Final No. 1 against final No. 2, on their week N scores">Title game</th><th>FBS champion</th><th>Real champion</th>
            <th class="num" data-tip="Spearman ρ: final FBS ranking against final placement"><span class="fbs-rho">ρ</span> FBS</th>
            <th class="num" data-tip="Spearman ρ: record alone (the media poll stand-in) against final placement"><span class="fbs-rho">ρ</span> Record</th>
            <th class="num" data-tip="Spearman ρ: FPI alone against final placement"><span class="fbs-rho">ρ</span> FPI</th></tr></thead><tbody>
            ${list.map(x => { const T = x.TG; const g = T && T.a != null && T.c != null ? `${esc(T.A.mgr)} <b>${f1(T.a)}</b> <span class="muted">vs</span> <b>${f1(T.c)}</b> ${esc(T.C.mgr)}` : '<span class="muted">No score on file</span>';
                return `<tr class="${x.s === S.season ? 'tf-sel' : ''}"><td class="num"><a href="?season=${x.s}">${x.s}</a></td><td>${g} <span class="muted">· wk ${x.Ds.N}</span></td>
                <td>${T && T.winner ? who(T.winner.mgr, x.s) : '-'}</td><td>${x.champ ? who(x.champ, x.s) : '-'}</td>${rhoCell(x.rFbs)}${rhoCell(x.rRec)}${rhoCell(x.rFpi)}</tr>`; }).join('')}
            <tr class="fbs-avg"><td class="num">All</td><td class="muted">Average across seasons</td><td></td><td></td>${rhoCell(avg('rFbs'))}${rhoCell(avg('rRec'))}${rhoCell(avg('rFpi'))}</tr>
            </tbody></table></div>`;
    }

    // ------------------------------------------------------------------ charts
    const tipStyle = { backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 } };
    function drawCharts() {
        charts.forEach(c => c.dispose()); charts = [];
        if (!window.echarts) return;
        const muted = SITE.color('muted'), grid = SITE.color('track'), ink = SITE.color('ink'), faint = SITE.color('line-strong'), accent = SITE.color('accent'), surface = SITE.color('surface');
        const focus = S.focus && V.T.some(t => t.mgr === S.focus) ? S.focus : V.T.find(t => t.rank === 1).mgr;

        const bumpEl = document.getElementById('fbs-bump');
        if (bumpEl) {
            const c = echarts.init(bumpEl); charts.push(c);
            const weeks = D.weeks, mgrs = V.T.map(t => t.mgr);
            const rankAt = (m, w) => { const t = D.byWeek[w].T.find(x => x.mgr === m); return t ? t.rank : null; };
            c.setOption({
                textStyle: { fontFamily: 'Inter, sans-serif' }, animationDuration: 400,
                grid: { left: 110, right: 110, top: 16, bottom: 32 },   // equal margins: the plot sits centred (the right one holds the end label)
                tooltip: { trigger: 'axis', ...tipStyle, axisPointer: { type: 'line', lineStyle: { color: faint } },
                    formatter: ps => { const w = weeks[ps[0].dataIndex], L = D.byWeek[w].T.slice().sort((x, y) => x.rank - y.rank), f = L.find(t => t.mgr === focus);
                        return `<b>Week ${w}${w > D.regEnd ? ' · Post' : ''}</b><br>` + L.slice(0, 5).map(t => `${t.rank}. ${esc(t.mgr)} ${rec(t)}`).join('<br>') +
                            (f && f.rank > 5 ? `<br>${f.rank}. <b>${esc(f.mgr)}</b> ${rec(f)}` : ''); } },
                xAxis: { type: 'category', data: weeks.map(w => `W${w}`), boundaryGap: false, axisLabel: { color: muted }, axisLine: { lineStyle: { color: faint } }, axisTick: { show: false } },
                yAxis: { type: 'value', inverse: true, min: 1, max: V.n, interval: 1, axisLabel: { color: muted, fontSize: 10 }, splitLine: { lineStyle: { color: grid } } },
                series: [
                    ...mgrs.filter(m => m !== focus).map(m => ({ name: m, type: 'line', showSymbol: false, z: 1, cursor: 'pointer',
                        lineStyle: { width: 1.2, color: faint, opacity: 0.8 }, itemStyle: { color: faint }, emphasis: { disabled: true }, data: weeks.map(w => rankAt(m, w)) })),
                    { name: focus, type: 'line', z: 3, symbol: 'circle', symbolSize: 8, showSymbol: true,
                      lineStyle: { width: 2.5, color: accent }, itemStyle: { color: accent, borderColor: surface, borderWidth: 2 },
                      endLabel: { show: true, formatter: '{a}', color: ink, fontSize: 11, fontWeight: 700, distance: 8 }, data: weeks.map(w => rankAt(focus, w)),
                      markLine: { silent: true, symbol: 'none', animation: false, lineStyle: { color: muted, type: 'solid', width: 1 },
                                  label: { formatter: 'As of', color: muted, fontSize: 10, position: 'insideEndTop' }, data: [{ xAxis: `W${V.X}` }] } }
                ]
            });
            c.on('click', p => { if (p.seriesName && p.seriesName !== focus) setFocus(p.seriesName); });
        }

        const scEl = document.getElementById('fbs-scatter');
        if (scEl) {
            const c = echarts.init(scEl); charts.push(c);
            const pts = V.T.slice().sort((x, y) => (x.mgr === focus) - (y.mgr === focus)).map(t => ({ name: t.mgr, value: [Number(t.fpi.toFixed(2)), Number(t.resume.toFixed(2))], t,
                symbolSize: t.mgr === focus ? 13 : 9,
                itemStyle: { color: t.mgr === focus ? accent : SITE.color('ink-2'), borderColor: surface, borderWidth: 2 },
                label: { color: t.mgr === focus ? ink : muted, fontWeight: t.mgr === focus ? 700 : 500 } }));
            // a label that would run into the next point to its right goes on the left instead
            const span = k => { const m = Math.max(1, ...pts.map(p => Math.abs(p.value[k]))) * 1.1, step = k ? 1 : 5; return Math.ceil(m / step) * step; };   // symmetric, on round numbers
            // a label that would run into the next point to its right goes on the left instead (widths in chart units)
            const xu = 2 * span(0) / Math.max(200, scEl.clientWidth - 86), yu = 2 * span(1) / Math.max(150, scEl.clientHeight - 66);
            // greedy, in pixels: right of the point if that box hits no point and no label already placed, else left
            const PX = p => [(p.value[0] + span(0)) / xu, (span(1) - p.value[1]) / yu];
            const hit = (a, c) => a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3];
            const dots = pts.map(p => { const [x, y] = PX(p); return [x - 6, y - 6, x + 6, y + 6]; }), placed = [];
            pts.slice().sort((a, c) => c.value[0] - a.value[0]).forEach(p => {
                const [x, y] = PX(p), w = p.name.length * 6.2 + 4;
                const box = side => side === 'right' ? [x + 7, y - 7, x + 7 + w, y + 7] : [x - 7 - w, y - 7, x - 7, y + 7];
                const free = side => !dots.some(d => hit(d, box(side))) && !placed.some(b => hit(b, box(side)));
                const side = free('right') || !free('left') ? 'right' : 'left';
                p.label.position = side; placed.push(box(side));
            });
            c.setOption({
                textStyle: { fontFamily: 'Inter, sans-serif' }, animationDuration: 400,
                grid: { left: 56, right: 30, top: 20, bottom: 46 },
                tooltip: { trigger: 'item', ...tipStyle, formatter: p => { const t = p.data.t;
                    return `<b>${esc(t.mgr)}</b> · No. ${t.rank}<br>${rec(t)} · an average team expects ${t.xwAvg.toFixed(1)} wins on this schedule<br>Résumé ${sgn(t.resume)} wins · FPI ${sgn(t.fpi)}`; } },
                xAxis: { type: 'value', name: 'FPI (points a game over average)', nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: muted, fontSize: 10 },
                         min: -span(0), max: span(0), axisLabel: { color: muted, formatter: v => sgn(v) }, splitLine: { lineStyle: { color: grid } } },
                yAxis: { type: 'value', name: 'Wins over an average team', nameLocation: 'middle', nameGap: 38, nameTextStyle: { color: muted, fontSize: 10 },
                         min: -span(1), max: span(1), axisLabel: { color: muted, formatter: v => sgn(v) }, splitLine: { lineStyle: { color: grid } } },
                series: [{ type: 'scatter', data: pts, cursor: 'pointer', label: { show: true, formatter: '{b}', position: 'right', fontSize: 10 }, labelLayout: { hideOverlap: true },
                           markLine: { silent: true, symbol: 'none', animation: false, label: { show: false }, lineStyle: { color: faint, type: 'dashed', width: 1 }, data: [{ xAxis: 0 }, { yAxis: 0 }] } }]
            });
            c.on('click', p => { if (p.data && p.data.t) setFocus(p.data.t.mgr); });
        }
    }

    // ------------------------------------------------------------------ page
    function render() {
        D = seasonData(S.season);
        if (!D.weeks.length) { content.innerHTML = '<div class="wrap page-pad"><div class="panel" style="margin-top:34px"><p class="muted">No games played yet this season.</p></div></div>'; return; }
        if (!D.weeks.includes(S.week)) S.week = D.last;
        V = D.byWeek[S.week];
        const label = `Week ${S.week}${S.week > D.regEnd ? ' · Post' : ''}`;
        const focusName = S.focus && V.T.some(t => t.mgr === S.focus) ? S.focus : V.T.find(t => t.rank === 1).mgr;
        content.innerHTML = `<div class="wrap page-pad">
            ${matchup()}
            <div class="tf-top fbs-sticky"><div class="tf-top-text"><div class="eyebrow">${S.season} · as of ${esc(label)} · ${D.complete ? 'final season' : 'season in progress'}</div><h2 class="section-title">FBS Rankings</h2>
                <p class="section-copy">Ranked every week from week 1 to week ${D.N - 1} the way college football did it in the early 2000s: polls, computers, schedule strength and losses, with credit for quality wins. Week ${D.N} pits No. 1 against No. 2.</p></div>
                <div class="tf-ctl">
                    <label>Season<select class="select" id="fbs-season">${seasons.map(s => `<option value="${s}"${s === S.season ? ' selected' : ''}>${s} season</option>`).join('')}</select></label>
                    <label>As of<select class="select" id="fbs-week">${D.weeks.map(w => `<option value="${w}"${w === S.week ? ' selected' : ''}>Week ${w}${w > D.regEnd ? ' · Post' : ''}</option>`).join('')}</select></label>
                    <label>Manager<select class="select" id="fbs-focus">${V.T.slice().sort((x, y) => x.mgr.localeCompare(y.mgr)).map(t => `<option${t.mgr === focusName ? ' selected' : ''}>${esc(t.mgr)}</option>`).join('')}</select></label>
                </div></div>
            ${tiles()}
            <div class="panel"><h3 class="panel-title">Rankings</h3><p class="tf-sub">Click any heading to sort; hover a heading for its definition and a cell for the numbers behind it. SOR, SOS, Rem SOS and FPI each show the rank, then the value behind it.</p>${rankings()}</div>
            <div class="panel"><h3 class="panel-title">The Formula</h3><p class="tf-sub">Every piece of each team's BCS total for ${esc(label)}. Lowest total is No. 1. A struck-through computer rank is that team's worst, dropped from its average.</p>${formula()}</div>
            <div class="panel"><div class="tf-head"><div><h3 class="panel-title">The Race, Week by Week</h3><p class="tf-sub">Every team's ranking through ${S.season}. Pick a manager, or click a line, to trace it.</p></div></div>
                <div id="fbs-bump" class="tf-chart fbs-bump" role="img" aria-label="FBS ranking by week for every manager"></div></div>
            <div class="panel"><h3 class="panel-title">Résumé vs Power</h3><p class="tf-sub">Right = scores like a better team (FPI). Up = more wins than an average team would expect against the same schedule (the record SOR rewards). Top right is good and has the record to show for it; bottom right is good but hasn't been rewarded; top left has won more than its scoring suggests.</p>
                <div id="fbs-scatter" class="tf-chart" role="img" aria-label="FPI against wins over an average team, every manager"></div></div>
            <div class="panel"><h3 class="panel-title">Rankings vs the Real Bracket</h3>${bracketHistory()}</div>
            <div class="panel tf-method"><h3 class="panel-title">How It's Calculated</h3><ul>
                <li><b>Games.</b> Every game played through the as-of week counts, playoff, Gulag and placement games included. Rankings run from week 1 to week N − 1, where N is the length of the full season (${D.N} weeks in ${S.season}).</li>
                <li><b>The formula.</b> The BCS standings of 2002-03: poll average + computer average + strength-of-schedule rank ÷ 25 + losses − quality wins. Lowest total ranks first; ties go to the better poll average, then computers.</li>
                <li><b>Polls.</b> There are no voters, so two stand-ins play their parts. The media poll ranks by record, with points for breaking ties, the way writers vote. The coaches' poll ranks by all-play win %: how often each score would have beaten every other score that week.</li>
                <li><b>Computers.</b> From 2002 the BCS computers could not use margin of victory, so these three use wins and losses only. Colley Matrix solves (2 + games) × rating − Σ opponent ratings = 1 + (wins − losses) ÷ 2. Wolfe is a Bradley-Terry model: the strengths that make the real results most likely (each team gets one win and one loss against a neutral anchor so an unbeaten team stays finite). Elo is Billingsley-style: results in order, week by week, K = 32. Each team's worst computer rank is dropped and the other two averaged, as the BCS dropped its lowest computer.</li>
                <li><b>Strength of schedule.</b> The BCS formula: two-thirds opponents' winning percentage (their games against this team removed) plus one-third opponents' opponents'. Ties go to the schedule whose opponents score more (higher average FPI). In a closed schedule they all tie: once every team has played each division rival twice (2023-25), the opponents' records without their games against you total exactly .500 for everyone, so the final regular-season week ranks schedules by the opponents' scoring alone. The rank is divided by 25 and scaled from the 117 teams of the era to this league (× 117 ÷ ${V.n}), so it carries the same weight it did then.</li>
                <li><b>Quality wins.</b> In 2002-03 a win over a top-10 team took up to a full point off. Scaled to a league this size it is the top 5: beating the No. 1 team (ranked before this credit) is −1.0, No. 2 −0.8, No. 3 −0.6, No. 4 −0.4, No. 5 −0.2, every time it happens.</li>
                <li><b>FPI.</b> Points a game better or worse than an average team: (points for + 4 × league average) ÷ (games + 4) − league average, so early weeks lean on average.</li>
                <li><b>SOR.</b> Each game's chance an average team would have won it: Φ(−opponent FPI ÷ σ), with σ the game-to-game spread of a margin (√2 × the spread of one score, ${f1(V.sigG)} this week). Those chances give the distribution of an average team's wins against this schedule; SOR is the chance of this many wins or more, and rank 1 is the rarest record.</li>
                <li><b>Rem SOS.</b> The same SOS formula over the regular-season opponents still to play, on their records to date${S.season === seasons[0] && !D.complete ? ' (the rest of the schedule comes from the league schedule on file)' : ''}. Blank once the regular season is over.</li>
                <li><b>Title game.</b> The final No. 1 and No. 2 after week ${D.N - 1}, on the scores they really posted in week ${D.N} (a finalist without a game that week is scored on its starting lineup). The pre-game chance is Φ((FPI₁ − FPI₂) ÷ σ).</li>
            </ul></div></div>`;
        bind();
        mountHelmets();
        fitNames(); placeHelmets();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitNames(); placeHelmets(); });   // re-measure once the display font is in
        startChalk();
        drawCharts();
    }

    function sync() {
        const u = new URL(location.href);
        u.searchParams.set('season', S.season); u.searchParams.set('week', S.week);
        if (S.focus) u.searchParams.set('m', S.focus); else u.searchParams.delete('m');
        history.replaceState(null, '', u);
    }
    const keepY = fn => { const y = window.scrollY; fn(); render(); sync(); window.scrollTo(0, y); };
    function setFocus(m) { keepY(() => { S.focus = m; }); }
    function bind() {
        const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
        on('fbs-season', 'change', e => keepY(() => { S.season = Number(e.target.value); S.week = null; }));
        on('fbs-week', 'change', e => keepY(() => { S.week = Number(e.target.value); }));
        on('fbs-focus', 'change', e => setFocus(e.target.value));
        document.querySelectorAll('.fbs-lb th[data-sort]').forEach(h => h.addEventListener('click', () => keepY(() => {
            const k = h.dataset.sort; if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = HIGH_FIRST.has(k) ? -1 : 1; } })));
    }

    // team colours come from the logos: read them all once before the first render
    await Promise.all([...new Set(Object.values(nameOf))].map(async m => { COLORS[m] = await logoColor(m); }));
    try {
        render(); sync();
        window.addEventListener('resize', () => { charts.forEach(c => c.resize()); fitNames(); placeHelmets(); });
        // the controls block pins under the site header once scrolled to; the shadow shows only while it is pinned
        const stuck = () => { const el = document.querySelector('.fbs-sticky'); if (el) el.classList.toggle('is-stuck', el.getBoundingClientRect().top <= 61 && window.scrollY > 0); };
        window.addEventListener('scroll', stuck, { passive: true });
        window.addEventListener('themechange', drawCharts);
    } catch (error) {
        console.error('FBS rankings error:', error);
        content.innerHTML = '<div class="wrap"><div class="panel">Error loading data.</div></div>';
    }
})();
