/* Stats: Player Regression. How QBs, RBs, WRs, TEs, kickers and punters age, by years in the league or by age, in real stats and in fantasy
   points re-scored with the current league scoring (data/player_stats/regression.json, NEW/python/player_regression.py).

   The aging curve chains year-over-year ratios: for every player with two seasons in a row (both with enough games), his
   next season over this one is credited to the year he moved from, weighted by the games in the two seasons (harmonic
   mean). Multiplying the average ratios year by year gives the curve (it cannot drop below zero the way added-up point
   changes can); it is drawn at the level of the year with the most players. The positional summary shows the spread:
   the median at each year with bands at 1, 2 and 3 standard deviations. The plain average of everyone at each year is shown too, but it flatters the old years: only players good
   enough to stay in the league are still in it. The season in progress is left out of the curves. */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    SITE.subHeader({ crumbs: [['Stats', url('pages/stats.html')], ['Player Regression']],
                     tabs: SITE.statsTabs('player-regression') });
    const data = await fetch(url('data/player_stats/regression.json')).then(r => r.json()).catch(() => null);
    if (!data) { content.innerHTML = '<div class="wrap"><p class="empty">Player data is not available.</p></div>'; return; }
    const S = data.scoring_season;
    SITE.hero({ title: 'Player Regression', size: 'short', dots: false, image: 'background-15.png',
                meta: [`How every QB, RB, WR, TE, kicker and punter aged, ${data.seasons[0]}-${data.seasons[data.seasons.length - 1]}`, `Fantasy points re-scored with the ${S} league scoring`] });

    const F = Object.fromEntries(data.fields.map((f, i) => [f, i]));
    const rows = data.rows.map(r => Object.fromEntries(data.fields.map((f, i) => [f, r[i]])));
    const complete = new Set(data.complete);
    const nameOf = id => (data.players[id] || [id])[0];
    const per = (k, min) => r => r.g ? r[k] / r.g : null;
    const ratio = (a, b, min, scale = 1) => r => r[b] >= min ? scale * r[a] / r[b] : null;
    // metrics by position: [key, label, value(row), digits, tip]
    const M = {
        fp: ['fp', `Fantasy pts / game (${S} scoring)`, per('fp'), 2, `Every game re-scored with the ${S} league scoring, so all seasons are on the same scale.`],
        snap: ['snap', 'Offensive snap %', r => r.snap, 1, 'Average share of the offense\'s snaps he played.'],
        QB: [['pass_yds', 'Pass yds / game', per('pass_yds'), 1], ['pass_td', 'Pass TD / game', per('pass_td'), 2], ['pass_int', 'INT / game', per('pass_int'), 2],
             ['cmp', 'Completion %', ratio('pass_cmp', 'pass_att', 100, 100), 1, 'Seasons with 100+ attempts.'], ['ypa', 'Yards / attempt', ratio('pass_yds', 'pass_att', 100), 2, 'Seasons with 100+ attempts.'],
             ['rush_yds', 'Rush yds / game', per('rush_yds'), 1]],
        RB: [['rush_att', 'Carries / game', per('rush_att'), 1], ['rush_yds', 'Rush yds / game', per('rush_yds'), 1], ['ypc', 'Yards / carry', ratio('rush_yds', 'rush_att', 50), 2, 'Seasons with 50+ carries.'],
             ['rush_td', 'Rush TD / game', per('rush_td'), 2], ['tgt', 'Targets / game', per('rec_tgt'), 2], ['rec_yds', 'Rec yds / game', per('rec_yds'), 1]],
        WR: [['tgt', 'Targets / game', per('rec_tgt'), 2], ['rec', 'Catches / game', per('rec'), 2], ['rec_yds', 'Rec yds / game', per('rec_yds'), 1],
             ['ypr', 'Yards / catch', ratio('rec_yds', 'rec', 20), 2, 'Seasons with 20+ catches.'], ['catch', 'Catch %', ratio('rec', 'rec_tgt', 30, 100), 1, 'Seasons with 30+ targets.'],
             ['rec_td', 'Rec TD / game', per('rec_td'), 2]]
    };
    M.TE = M.WR;
    M.K = [['fg_made', 'FG made / game', per('fg_made'), 2], ['fg_pct', 'FG %', ratio('fg_made', 'fg_att', 10, 100), 1, 'Seasons with 10+ attempts.'],
           ['fg50', '50+ yd makes / game', per('fg50'), 2], ['xp_pct', 'Extra point %', ratio('xp_made', 'xp_att', 10, 100), 1, 'Seasons with 10+ attempts.']];
    M.P = [['punt', 'Punts / game', per('punt'), 2], ['p_avg', 'Gross average', ratio('punt_yds', 'punt', 20), 2, 'Seasons with 20+ punts.'],
           ['in20', 'Inside-20 %', ratio('punt_in20', 'punt', 20, 100), 1, 'Seasons with 20+ punts.'], ['tb', 'Touchback %', ratio('punt_tb', 'punt', 20, 100), 1, 'Seasons with 20+ punts.']];
    const KICK = new Set(['K', 'P']);
    const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'P'];
    // kickers and punters have no offensive snap share; touchbacks and misses are better low
    const metricsFor = pos => [M.fp, ...M[pos].map(m => m), ...(KICK.has(pos) ? [] : [M.snap])];

    // state (kept in the URL)
    const st = { pos: ['QB', 'RB', 'WR', 'TE', 'K', 'P'].includes(param('pos')) ? param('pos') : 'RB', x: param('x') === 'age' ? 'age' : 'exp',
                 m: param('m') || 'fp', min: Number(param('min')) || 6, player: param('player') || '' };
    const fmt = (v, d = 2) => v == null || isNaN(v) ? '-' : Number(v).toFixed(d);
    const sg = (v, d = 2) => v == null || isNaN(v) ? '-' : `${v > 0 ? '+' : ''}${Number(v).toFixed(d)}`;
    const XL = () => st.x === 'age' ? 'Age' : 'Years in league';
    const xv = r => st.x === 'age' ? r.age : r.exp;

    function model() {
        const metric = metricsFor(st.pos).find(m => m[0] === st.m) || M.fp;
        const val = metric[2];
        const pool = rows.filter(r => r.pos === st.pos && r.g >= st.min && complete.has(r.season) && xv(r) != null && val(r) != null);
        const byKey = new Map(pool.map(r => [`${r.id}|${r.season}`, r]));
        // cross-section: everyone at each x
        const cross = {};
        pool.forEach(r => { const c = cross[xv(r)] || (cross[xv(r)] = { n: 0, sum: 0 }); c.n++; c.sum += val(r); });
        // delta method: the same player one season later
        let step = {};
        pool.forEach(r => {
            const nx = byKey.get(`${r.id}|${r.season + 1}`);
            if (!nx) return;
            const w = 2 * r.g * nx.g / (r.g + nx.g);
            const s = step[xv(r)] || (step[xv(r)] = { n: 0, w: 0, sum: 0, num: 0, den: 0 });     // raw, smoothed below
            s.n++; s.w += w; s.sum += w * (val(nx) - val(r)); s.num += w * val(nx); s.den += w * val(r);
        });
        // ratio = the same players' next season over this one (weighted); mean = the average change in the stat's units
        // smoothed: each year pools its own pairs with the years on either side (small samples at the ends stay usable)
        const raw = step;
        step = {};
        Object.keys(raw).map(Number).forEach(x => {
            const s = { n: 0, w: 0, sum: 0, num: 0, den: 0 };
            [x - 1, x, x + 1].forEach(k => { const r = raw[k]; if (r) { s.n += r.n; s.w += r.w; s.sum += r.sum; s.num += r.num; s.den += r.den; } });
            s.own = raw[x].n;
            step[x] = s;
        });
        Object.values(step).forEach(s => { s.ratio = s.den > 0 ? s.num / s.den : null; s.mean = s.sum / s.w; s.pct = s.ratio == null ? null : s.ratio - 1; });
        // the spread at each year: median and standard deviation of everyone there
        const spread = {};
        pool.forEach(r => { (spread[xv(r)] = spread[xv(r)] || []).push(val(r)); });
        Object.keys(spread).forEach(x => {
            const l = spread[x].sort((a, b) => a - b), n = l.length, m = l.reduce((t, v) => t + v, 0) / n;
            spread[x] = { n, med: n % 2 ? l[(n - 1) / 2] : (l[n / 2 - 1] + l[n / 2]) / 2, sd: Math.sqrt(l.reduce((t, v) => t + (v - m) ** 2, 0) / Math.max(1, n - 1)) };
        });
        const MIN_N = 8;
        const xs = Object.keys(cross).map(Number).sort((a, b) => a - b);
        const lo = xs[0], hi = xs[xs.length - 1];
        // cumulative curve over the run of years with enough pairs, anchored at the year with the most players
        const curve = {};
        let c = 1, started = false;
        for (let x = lo; x <= hi; x++) {
            if (!started) { if (cross[x] && cross[x].n >= MIN_N) { started = true; curve[x] = 1; } else continue; }
            const s = step[x];
            if (!s || s.n < MIN_N || s.ratio == null) break;
            c *= s.ratio; curve[x + 1] = c;
        }
        const cx = Object.keys(curve).map(Number);
        const anchor = cx.slice().sort((a, b) => (cross[b] ? cross[b].n : 0) - (cross[a] ? cross[a].n : 0))[0];
        const scale = anchor != null && cross[anchor] && curve[anchor] ? (cross[anchor].sum / cross[anchor].n) / curve[anchor] : 1;
        cx.forEach(x => { curve[x] *= scale; });
        const higherIsBetter = !['pass_int', 'tb'].includes(st.m);
        const peakX = cx.length ? cx.slice().sort((a, b) => higherIsBetter ? curve[b] - curve[a] : curve[a] - curve[b])[0] : null;
        return { metric, val, pool, cross, step, spread, curve, cx, xs, peakX, MIN_N, higherIsBetter };
    }

    let watchPage = 1, shown = '';                         // shown = the player drawn in Player vs the Curve
    function render() {
        watchPage = 1;                                     // a new view starts the watch list at page 1
        const u = new URL(location.href);
        ['pos', 'x', 'm', 'min'].forEach(k => u.searchParams.set(k, st[k]));
        if (st.player) u.searchParams.set('player', st.player); else u.searchParams.delete('player');
        history.replaceState(null, '', u);
        const md = model(), [mk, mlabel, , digits, mtip] = md.metric;
        const peakV = md.peakX != null ? md.curve[md.peakX] : null;
        const after = n => md.peakX != null && md.curve[md.peakX + n] != null ? md.curve[md.peakX + n] : null;
        const pctOf = v => v == null || !peakV ? '-' : `${Math.round(v / peakV * 100)}%`;
        const decline = md.cx.filter(x => md.peakX != null && x > md.peakX).find(x => md.higherIsBetter ? md.curve[x] < peakV * 0.9 : md.curve[x] > peakV * 1.1);
        const pairs = Object.values(md.step).reduce((t, s) => t + s.own, 0);     // own pairs (n also counts the neighbors pooled in)
        const kpi = (l, v, s, tip = '') => `<div class="db-kpi"><span${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</span><b>${v}</b><small>${s}</small></div>`;
        document.getElementById('rg-kpis').innerHTML =
            kpi('Peak', md.peakX != null ? `${st.x === 'age' ? 'Age' : 'Year'} ${md.peakX}` : '-', `${fmt(peakV, digits)} ${esc(mlabel.toLowerCase())}`, 'Where the aging curve is highest.') +
            kpi('Three years after', pctOf(after(3)), after(3) != null ? `${fmt(after(3), digits)} at ${st.x === 'age' ? 'age' : 'year'} ${md.peakX + 3}` : 'not enough players that far out', 'The curve three years past the peak, as a share of the peak.') +
            kpi('Below 90% of peak', decline != null ? `${st.x === 'age' ? 'Age' : 'Year'} ${decline}` : '-', decline != null ? 'where the decline sets in' : 'never inside the sample') +
            kpi('Sample', md.pool.length.toLocaleString(), `${pairs.toLocaleString()} back-to-back seasons`, `Player-seasons with ${st.min}+ games in complete seasons; the curve is built from the back-to-back pairs.`);
        drawCurve(md);
        drawSteps(md);
        drawWatch(md);
        drawPlayer(md);                                    // picks the default player first,
        drawSummary(md);                                   // so the summary can draw him on top
    }

    // ---------------------------------------------------------------- charts
    const C = () => ({ accent: SITE.color('accent'), red: SITE.color('danger'), ink: SITE.color('ink'), muted: SITE.color('muted'), line: SITE.color('line-strong'),
                       grid: SITE.color('track'), alt: SITE.color('alt') || '#2563eb' });
    const tip = { trigger: 'axis', backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 } };
    const ax = c => ({ axisLabel: { color: c.muted, fontSize: 10 }, axisLine: { lineStyle: { color: c.line } }, splitLine: { lineStyle: { color: c.grid } } });
    const chartOf = id => { const el = document.getElementById(id); return echarts.getInstanceByDom(el) || echarts.init(el); };
    function drawCurve(md) {
        const c = C(), d = md.metric[3];
        const xs = md.xs, ch = chartOf('rg-curve');
        ch.setOption({
            textStyle: { fontFamily: 'Inter, sans-serif' }, animationDurationUpdate: 400,
            legend: { top: 0, left: 'center', textStyle: { color: c.muted, fontSize: 10 } },
            tooltip: { ...tip, valueFormatter: v => v == null ? '-' : Number(v).toFixed(d) },
            grid: [{ left: 48, right: 14, top: 30, height: '62%' }, { left: 48, right: 14, top: '80%', bottom: 26 }],
            xAxis: [{ type: 'category', data: xs, gridIndex: 0, ...ax(c), axisLabel: { show: false }, splitLine: { show: false } },
                    { type: 'category', data: xs, gridIndex: 1, ...ax(c), name: XL(), nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: c.muted, fontSize: 10 }, splitLine: { show: false } }],
            yAxis: [{ type: 'value', gridIndex: 0, scale: true, ...ax(c) }, { type: 'value', gridIndex: 1, ...ax(c), splitNumber: 2, name: 'players', nameTextStyle: { color: c.muted, fontSize: 9 } }],
            series: [
                { name: 'Aging curve', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: xs.map(x => md.curve[x] ?? null), lineStyle: { color: c.accent, width: 3 }, itemStyle: { color: c.accent }, symbolSize: 6, connectNulls: false,
                  markPoint: md.peakX != null ? { symbol: 'pin', symbolSize: 34, itemStyle: { color: c.ink }, label: { color: '#fff', fontSize: 9, formatter: 'peak' }, data: [{ coord: [String(md.peakX), md.curve[md.peakX]] }] } : undefined },
                { name: 'Average of everyone that year', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: xs.map(x => md.cross[x] ? md.cross[x].sum / md.cross[x].n : null), lineStyle: { color: c.line, type: 'dashed', width: 2 }, itemStyle: { color: c.line }, symbolSize: 4 },
                { name: 'Players', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: xs.map(x => md.cross[x] ? md.cross[x].n : 0), itemStyle: { color: c.grid }, barMaxWidth: 16 }
            ]
        }, true);
    }
    // median at each year with bands at 1, 2 and 3 SD (stacked areas between the band edges); the player picked in
    // "Player vs the curve" is drawn on top; legend items switch each band on and off
    function drawSummary(md) {
        const c = C(), d = md.metric[3], ch = chartOf('rg-summary');
        const xs = md.xs.filter(x => md.spread[x] && md.spread[x].n >= 3);
        const floor = 0;                                   // none of these stats go below zero
        const edge = (x, k) => { const s = md.spread[x]; return Math.max(floor, s.med + k * s.sd); };
        const band = (name, k0, k1, op) => [
            { name, type: 'line', stack: name, data: xs.map(x => +edge(x, k0).toFixed(3)), lineStyle: { opacity: 0 }, symbol: 'none', itemStyle: { color: c.accent, opacity: Math.min(1, op * 3) }, silent: true, tooltip: { show: false } },
            { name, type: 'line', stack: name, data: xs.map(x => +(edge(x, k1) - edge(x, k0)).toFixed(3)), lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: c.accent, opacity: op },
              itemStyle: { color: c.accent, opacity: Math.min(1, op * 3) }, silent: true, tooltip: { show: false } }];
        const sel = st.player || shown;
        const mine = sel ? rows.filter(r => r.id === sel && r.pos === st.pos && r.g >= st.min && md.val(r) != null) : [];
        const byX = Object.fromEntries(mine.map(r => [xv(r), r]));
        ch.setOption({
            textStyle: { fontFamily: 'Inter, sans-serif' }, animationDurationUpdate: 400,
            legend: { top: 0, left: 'center', textStyle: { color: c.muted, fontSize: 10 }, data: ['Median', '±1 SD', '±2 SD', '±3 SD', ...(mine.length ? [nameOf(sel)] : [])] },
            tooltip: { ...tip, formatter: ps => { const x = xs[ps[0].dataIndex], s = md.spread[x], me = byX[x];
                return `<b>${XL()} ${x}</b> · ${s.n} player-seasons<br>median ${fmt(s.med, d)} · SD ${fmt(s.sd, d)}<br>` +
                    [1, 2, 3].map(k => `±${k} SD: ${fmt(edge(x, -k), d)} to ${fmt(edge(x, k), d)}`).join('<br>') +
                    (me ? `<br><b>${esc(nameOf(sel))}</b> ${me.season}: ${fmt(md.val(me), d)} (${s.sd ? sg((md.val(me) - s.med) / s.sd, 1) : '-'} SD)` : ''); } },
            grid: { left: 48, right: 14, top: 30, bottom: 30 },
            xAxis: { type: 'category', data: xs, boundaryGap: false, ...ax(c), splitLine: { show: false }, name: XL(), nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: c.muted, fontSize: 10 } },
            yAxis: { type: 'value', ...ax(c), min: 0 },
            series: [
                ...band('±3 SD', -3, -2, 0.06), ...band('±3 SD', 2, 3, 0.06).map(s => ({ ...s, stack: '±3 SD hi' })),
                ...band('±2 SD', -2, -1, 0.12), ...band('±2 SD', 1, 2, 0.12).map(s => ({ ...s, stack: '±2 SD hi' })),
                ...band('±1 SD', -1, 1, 0.22),
                { name: 'Median', type: 'line', data: xs.map(x => +md.spread[x].med.toFixed(3)), lineStyle: { color: c.accent, width: 3 }, itemStyle: { color: c.accent }, symbolSize: 6 },
                ...(mine.length ? [{ name: nameOf(sel), type: 'line', data: xs.map(x => byX[x] ? +md.val(byX[x]).toFixed(3) : null), connectNulls: true,
                                     lineStyle: { color: c.alt, width: 2.5 }, itemStyle: { color: c.alt }, symbolSize: 8 }] : [])
            ]
        }, true);
    }

    function drawSteps(md) {
        const c = C(), d = md.metric[3], ch = chartOf('rg-steps');
        const xs = md.xs.filter(x => md.step[x]);
        ch.setOption({
            textStyle: { fontFamily: 'Inter, sans-serif' }, animationDurationUpdate: 400,
            tooltip: { ...tip, formatter: ps => { const x = Number(ps[0].name), s = md.step[x];
                return `<b>${XL()} ${x} → ${x + 1}</b><br>${s.pct == null ? '-' : `${s.pct >= 0 ? '+' : ''}${(s.pct * 100).toFixed(1)}%`} for the same players (average ${sg(s.mean, d)})<br>${s.own} players moving from this year, ${s.n} with the years either side${s.n < md.MIN_N ? ' (too few: not in the curve)' : ''}`; } },
            grid: { left: 48, right: 14, top: 14, bottom: 30 },
            xAxis: { type: 'category', data: xs, ...ax(c), splitLine: { show: false }, axisLabel: { color: c.muted, fontSize: 10, formatter: v => `${v}→${Number(v) + 1}` } },
            yAxis: { type: 'value', ...ax(c), axisLabel: { color: c.muted, fontSize: 10, formatter: v => `${Math.round(v * 100)}%` } },
            series: [{ type: 'bar', barMaxWidth: 18, data: xs.map(x => { const s = md.step[x], p = s.pct || 0, good = md.higherIsBetter ? p >= 0 : p <= 0;
                return { value: +p.toFixed(4), itemStyle: { color: s.n < md.MIN_N ? c.grid : good ? c.accent : c.red } }; }) }]
        }, true);
    }

    // ---------------------------------------------------------------- regression watch: last complete season -> next
    function drawWatch(md) {
        const d = md.metric[3], last = Math.max(...data.complete), cur = Math.max(...data.seasons);
        const live = cur > last;
        const exp = r => { const s = md.step[xv(r)]; return s && s.n >= md.MIN_N && s.pct != null ? md.val(r) * s.pct : null; };
        const list = rows.filter(r => r.pos === st.pos && r.season === last && r.g >= st.min && md.val(r) != null)
            .sort((a, b) => (md.val(b) - md.val(a)) * (md.higherIsBetter ? 1 : -1))
            .map(r => { const e = exp(r), now = rows.find(x => x.id === r.id && x.season === cur && x.g >= 3);
                        const nv = now ? md.val(now) : null; return { r, e, next: e != null ? md.val(r) + e : null, now, nv }; });
        const verdict = w => {
            if (!live || w.nv == null || w.next == null) return '';
            const better = md.higherIsBetter ? w.nv >= w.next : w.nv <= w.next;
            return `<span class="rg-v ${better ? 'w' : 'l'}" data-tip="${better ? 'Doing better so far than the curve expected' : 'Doing worse so far than the curve expected'}">${better ? 'Ahead' : 'Behind'}</span>`;
        };
        document.getElementById('rg-watch-title').textContent = `Regression Watch: ${st.pos} ${last} → ${last + 1}`;
        const PER = 15, pages = Math.max(1, Math.ceil(list.length / PER));
        watchPage = Math.min(Math.max(1, watchPage), pages);
        const start = (watchPage - 1) * PER;
        document.getElementById('rg-watch').innerHTML = list.slice(start, start + PER).map((w, i) => `<tr class="row-pick" data-id="${w.r.id}">
            <td class="num muted">${start + i + 1}</td><td><b>${esc(nameOf(w.r.id))}</b></td><td class="num">${w.r.exp}</td><td class="num">${w.r.age ?? '-'}</td><td class="num">${fmt(md.val(w.r), d)}</td>
            <td class="num ${w.e == null ? '' : (md.higherIsBetter ? w.e >= 0 : w.e <= 0) ? 'hm-up' : 'hm-down'}">${sg(w.e, d)}</td><td class="num">${fmt(w.next, d)}</td>
            <td class="num">${live ? (w.nv != null ? `${fmt(w.nv, d)} <span class="muted">(${w.now.g} g)</span>` : '<span class="muted">-</span>') : '-'}</td><td>${verdict(w)}</td></tr>`).join('')
            || '<tr><td colspan="9" class="muted">No players.</td></tr>';
        // pager: first, last, and the pages around the current one
        const nums = [...new Set([1, watchPage - 1, watchPage, watchPage + 1, pages])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
        document.getElementById('rg-watch-pager').innerHTML = list.length <= PER ? '' : `
            <span class="pager-info">${start + 1}-${Math.min(start + PER, list.length)} of ${list.length} ${st.pos}s</span>
            <div class="pager-nav"><button data-page="${watchPage - 1}" ${watchPage === 1 ? 'disabled' : ''}>Prev</button>
                ${nums.map((n, k) => `${k && n - nums[k - 1] > 1 ? '<span class="pager-gap">…</span>' : ''}<button data-page="${n}" class="${n === watchPage ? 'on' : ''}">${n}</button>`).join('')}
                <button data-page="${watchPage + 1}" ${watchPage === pages ? 'disabled' : ''}>Next</button></div>`;
        document.querySelectorAll('#rg-watch-pager button[data-page]').forEach(btn => btn.addEventListener('click', () => {
            watchPage = Number(btn.dataset.page); drawWatch(model());
        }));
        document.querySelectorAll('#rg-watch tr.row-pick').forEach(tr => tr.addEventListener('click', () => { st.player = tr.dataset.id; const md = model(); drawPlayer(md); drawSummary(md); document.getElementById('rg-player-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
        document.getElementById('rg-watch-now').textContent = live ? `${cur} so far` : `${cur}`;
    }

    // ---------------------------------------------------------------- one player against the curve
    function drawPlayer(md) {
        const c = C(), d = md.metric[3];
        const mine = id => rows.filter(r => r.id === id && r.pos === st.pos).sort((a, b) => a.season - b.season);
        let id = st.player;
        if (!id || !mine(id).length) {
            // default: the most productive veteran at the position in the last complete season
            const last = Math.max(...data.complete);
            const vet = rows.filter(r => r.pos === st.pos && r.season === last && r.g >= st.min && r.exp >= 6).sort((a, b) => b.fp / b.g - a.fp / a.g)[0];
            id = vet ? vet.id : null;
        }
        const list = id ? mine(id) : [];
        shown = id || '';
        if (id) document.getElementById('rg-psel').value = id;
        if (!list.length) { document.getElementById('rg-player-note').textContent = 'No seasons at this position.'; return; }
        const first = list.find(r => r.g >= st.min && md.val(r) != null) || list[0];
        // the expected path: his first full season, then the average change each year
        const expected = {};
        let v = md.val(first);
        expected[first.season] = v;
        for (let s = first.season + 1; s <= list[list.length - 1].season; s++) {
            const prev = list.find(r => r.season === s - 1);
            const x = prev ? xv(prev) : (xv(first) + (s - first.season - 1));
            const stp = md.step[x];
            v = stp && stp.n >= md.MIN_N && stp.ratio != null && v != null ? v * stp.ratio : null;
            expected[s] = v;
        }
        const ch = chartOf('rg-player-chart');
        ch.setOption({
            textStyle: { fontFamily: 'Inter, sans-serif' }, animationDurationUpdate: 400,
            legend: { top: 0, left: 'center', textStyle: { color: c.muted, fontSize: 10 } },
            tooltip: { ...tip, formatter: ps => { const r = list[ps[0].dataIndex];
                return `<b>${r.season}</b> · ${XL().toLowerCase()} ${xv(r)} · ${r.g} games${complete.has(r.season) ? '' : ' (in progress)'}<br>${ps.map(p => `${p.seriesName}: ${p.value == null ? '-' : Number(p.value).toFixed(d)}`).join('<br>')}`; } },
            grid: { left: 48, right: 14, top: 30, bottom: 26 },
            xAxis: { type: 'category', data: list.map(r => `${r.season}${complete.has(r.season) ? '' : '*'}`), ...ax(c), splitLine: { show: false } },
            yAxis: { type: 'value', scale: true, ...ax(c) },
            series: [
                { name: nameOf(id), type: 'bar', barMaxWidth: 26, itemStyle: { color: c.accent }, data: list.map(r => ({ value: md.val(r) == null ? null : +md.val(r).toFixed(3), itemStyle: { color: r.g >= st.min ? c.accent : c.grid } })) },
                { name: 'Expected from the curve', type: 'line', data: list.map(r => expected[r.season] == null ? null : +expected[r.season].toFixed(3)), lineStyle: { color: c.alt, width: 2.5, type: 'dashed' }, itemStyle: { color: c.alt }, symbolSize: 6 }
            ]
        }, true);
        const lastR = list[list.length - 1], gap = expected[lastR.season] != null && md.val(lastR) != null ? md.val(lastR) - expected[lastR.season] : null;
        const nm = data.players[id] || [];
        document.getElementById('rg-player-note').innerHTML = `${esc(nameOf(id))}: rookie season ${nm[1] || '-'}${nm[3] ? `, round ${nm[3]} pick` : ''}. The dashed line starts at his first season with ${st.min}+ games and follows the curve's percent change for each ${st.x === 'age' ? 'age' : 'year in the league'}.
            ${gap != null ? `In ${lastR.season}${complete.has(lastR.season) ? '' : ' so far'} he is <b>${sg(gap, d)}</b> ${md.higherIsBetter === (gap >= 0) ? 'ahead of' : 'behind'} the curve.` : ''} Grey bars: under ${st.min} games.`;
    }

    // ---------------------------------------------------------------- page
    content.innerHTML = `<div class="wrap page-pad">
        <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">Advanced analytics</div><h2 class="section-title">Aging Curves</h2>
            <p class="section-copy" style="max-width:none">How production changes with years in the league or with age, in real stats and in fantasy points re-scored with the ${S} league scoring.
            The aging curve follows the same players from one season to the next (the average ratio of their next season to this one, chained), so it is not fooled by survivors: the plain average of everyone at a given year (dashed) looks better than it should, because only players good enough to stay are still in the league.
            The season in progress is left out of the curves.</p></div></div>
        <div class="rg-sticky"><div class="sx-bar rg-bar">
            <span class="seg" id="rg-pos">${POSITIONS.map(p => `<button data-v="${p}">${p}</button>`).join('')}</span>
            <span class="seg" id="rg-x"><button data-v="exp">Years in league</button><button data-v="age">Age</button></span>
            <label class="sx-f"><span>Stat</span><select class="select" id="rg-m"></select></label>
            <label class="sx-f"><span>Min games</span><select class="select" id="rg-min">${[1, 4, 6, 8, 10, 12].map(n => `<option value="${n}">${n}+</option>`).join('')}</select></label>
            <label class="sx-f"><span>Player</span><select class="select rg-psel" id="rg-psel"></select></label>
        </div>
        <div class="db-kpis rg-kpis" id="rg-kpis"></div></div>
        <div class="panel"><h3 class="panel-title" style="margin-bottom:8px" data-tip="Solid: the aging curve (the same players' season-to-season ratios, chained, drawn at the level of the year with the most players). Dashed: the plain average of everyone at that year. Bottom: how many players.">The Curve</h3>
            <div id="rg-curve" class="rg-chart"></div></div>
        <div class="panel"><h3 class="panel-title" style="margin-bottom:8px" data-tip="Everyone at each year: the median, with shaded bands at 1, 2 and 3 standard deviations around it (cut off at zero). The player picked below is drawn on top. Click a legend item to hide or show it.">Positional Summary</h3>
            <div id="rg-summary" class="rg-chart"></div></div>
        <div class="panel"><h3 class="panel-title" style="margin-bottom:8px" data-tip="The percent change for the same players from one season to the next, by the year they moved from, pooled with the years on either side. Grey: fewer than 8 players, left out of the curve.">Year Over Year</h3>
            <div id="rg-steps" class="rg-chart-sm"></div></div>
        <div class="panel"><h3 class="panel-title" id="rg-watch-title" style="margin-bottom:12px" data-tip="Everyone at the position in the last complete season with enough games, best first, the change the curve expects next season (his number times the curve's percent change for his year in the league or age), and how the season in progress is going.">Regression Watch</h3>
            <div class="table-scroll"><table class="data-table" style="min-width:820px">${SITE.cols('5%', '22%', '7%', '7%', '12%', '12%', '12%', '12%', '11%')}<thead><tr>
                <th class="num">#</th><th>Player</th><th class="num">Yrs</th><th class="num">Age</th><th class="num">Last season</th><th class="num" data-tip="What the curve expects from his year to the next.">Expected change</th>
                <th class="num">Expected next</th><th class="num" id="rg-watch-now">Now</th><th>Verdict</th></tr></thead><tbody id="rg-watch"></tbody></table></div><div class="pager" id="rg-watch-pager"></div></div>
        <div class="panel" id="rg-player-panel"><h3 class="panel-title" style="margin-bottom:8px" data-tip="Pick the player in the Player dropdown at the top.">Player vs the Curve</h3>
            <div id="rg-player-chart" class="rg-chart-sm"></div><p class="muted rg-note" id="rg-player-note"></p></div>
        <p class="muted hm-foot">Box scores ${data.seasons[0]}-${data.seasons[data.seasons.length - 1]}, regular season only. Years in league counts the rookie season as year 1; age is on September 1.
            Kickers' made field goals score by distance; older box scores without distances use that season's average per make.
            Re-scoring with the ${S} rules matches ESPN on ${data.check.matched.toLocaleString()} of ${data.check.games.toLocaleString()} ${S} games.</p></div>`;
    const sync = () => {
        document.querySelectorAll('#rg-pos button').forEach(b => b.classList.toggle('on', b.dataset.v === st.pos));
        document.querySelectorAll('#rg-x button').forEach(b => b.classList.toggle('on', b.dataset.v === st.x));
        const ms = metricsFor(st.pos);
        if (!ms.some(m => m[0] === st.m)) st.m = 'fp';
        document.getElementById('rg-m').innerHTML = ms.map(m => `<option value="${m[0]}"${m[0] === st.m ? ' selected' : ''}>${esc(m[1])}</option>`).join('');
        document.getElementById('rg-min').value = st.min;
        const ids = [...new Set(rows.filter(r => r.pos === st.pos).map(r => r.id))];
        const last = Math.max(...data.complete);
        const top = rows.filter(r => r.pos === st.pos && r.season === last && r.g >= 6).sort((a, b) => b.fp / b.g - a.fp / a.g).slice(0, 30).map(r => r.id);
        const az = ids.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
        document.getElementById('rg-psel').innerHTML = `<optgroup label="Top ${st.pos}s in ${last}">${top.map(id => `<option value="${id}">${esc(nameOf(id))}</option>`).join('')}</optgroup>
            <optgroup label="Everyone">${az.map(id => `<option value="${id}">${esc(nameOf(id))}</option>`).join('')}</optgroup>`;
    };
    document.getElementById('rg-pos').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.pos = b.dataset.v; st.player = ''; sync(); render(); });
    document.getElementById('rg-x').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.x = b.dataset.v; sync(); render(); });
    document.getElementById('rg-m').addEventListener('change', e => { st.m = e.target.value; render(); });
    document.getElementById('rg-min').addEventListener('change', e => { st.min = Number(e.target.value); render(); });
    const pickPlayer = id => {
        st.player = id;
        const u = new URL(location.href); u.searchParams.set('player', id); history.replaceState(null, '', u);
        const md = model(); drawPlayer(md); drawSummary(md);
    };
    document.getElementById('rg-psel').addEventListener('change', e => pickPlayer(e.target.value));
    window.addEventListener('resize', () => ['rg-curve', 'rg-summary', 'rg-steps', 'rg-player-chart'].forEach(id => { const c = echarts.getInstanceByDom(document.getElementById(id)); c && c.resize(); }));
    window.addEventListener('themechange', () => render());
    sync();
    render();
})();
