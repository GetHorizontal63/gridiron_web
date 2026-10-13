/* Player Compare: up to four players side by side.
   Look back      what they actually scored over a season (or a week range) or their careers: totals, per game, floor,
                  ceiling, boom / bust, head to head, cumulative points and scoring distributions.
   Rest of season for pickups and trades: each player's remaining NFL schedule, projected week by week from
                  (1) their recent scoring, steadied by their preseason projection while the sample is small,
                  (2) how much each opponent gives up to the position (this season counted twice, last season once),
                  (3) their own history against that opponent, when there is enough of it.
                  Players can be split into Side A / Side B for trade totals.
   Weekly points are ESPN's, scored with the league's rules (league.db player_week_points). */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    const MAX = 4;
    const COLORS = ['#3b7a57', '#2e86de', '#e67e22', '#8e44ad'];
    const f1 = v => v == null || isNaN(v) ? '-' : GT.pts(v);
    const pc = v => v == null || isNaN(v) ? '-' : `${Math.round(v * 100)}%`;
    const q = (s, x) => { if (!s.length) return null; const i = (s.length - 1) * x, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
    const meanOf = l => l.length ? l.reduce((t, v) => t + v, 0) / l.length : null;
    const sdOf = l => { const m = meanOf(l); return l.length > 1 ? Math.sqrt(l.reduce((t, v) => t + (v - m) ** 2, 0) / (l.length - 1)) : null; };

    // ---------------------------------------------------------------- the player pool (anyone at a fantasy position, newest seasons first)
    const latest = (await GT.query('SELECT MAX(season) AS s FROM player_values'))[0].s;
    const pool = await GT.query(`
        SELECT p.player_id AS id, p.name, v.pos, MAX(v.season) AS last, t.team
        FROM player_values v JOIN players p ON p.player_id = v.player_id LEFT JOIN player_team t ON t.player_id = v.player_id
        WHERE v.pos IN ('QB','RB','WR','TE','K','P','D/ST','HC') GROUP BY p.player_id ORDER BY MAX(v.season) DESC, p.name`).catch(() => []);
    const byId = Object.fromEntries(pool.map(p => [p.id, p]));
    const label = p => `${p.name} · ${p.pos}${p.team ? ' · ' + p.team : ''}${p.last < latest ? ` (last ${p.last})` : ''}`;

    // ---------------------------------------------------------------- state (kept in the URL so a comparison can be shared)
    const st = {
        mode: param('mode') === 'ros' ? 'ros' : 'back',
        ids: (param('ids') || '').split(',').map(Number).filter(id => byId[id]).slice(0, MAX),
        side: Object.fromEntries((param('sides') || '').split(',').filter(Boolean).map(x => x.split(':')).map(([id, s]) => [Number(id), s === 'B' ? 'B' : 'A'])),
        span: param('span') || 'career', from: Number(param('from')) || null, to: Number(param('to')) || null
    };
    const syncUrl = () => {
        const u = new URL(location.href);
        const set = (k, v) => { if (v == null || v === '' ) u.searchParams.delete(k); else u.searchParams.set(k, v); };
        set('ids', st.ids.join(',')); set('mode', st.mode === 'ros' ? 'ros' : null);
        set('sides', st.ids.filter(id => st.side[id] === 'B').map(id => `${id}:B`).join(',') || null);
        set('span', st.mode === 'back' && st.span !== 'career' ? st.span : null);
        set('from', st.from); set('to', st.to);
        history.replaceState(null, '', u);
    };

    SITE.subHeader({ crumbs: [['Players', url('pages/players/index.html')], ['Compare']], tabs: SITE.sectionTabs('players', 'compare', st.ids[0]) });
    SITE.hero({ title: 'Player Compare', size: 'short', dots: false, image: 'background-6.png',
                meta: ['Look back at what players scored, or project the rest of the season against their schedules'] });

    content.innerHTML = `<div class="wrap page-pad">
        <div class="db-slicers cmp-bar">
            <div class="sx-f"><span>Mode</span><div class="seg" id="cmp-mode">
                <button data-m="back" data-tip="What the players actually scored over a season, a week range or their careers.">Look back</button>
                <button data-m="ros" data-tip="Project each player's remaining schedule from recent scoring, the opponents' points allowed to the position, and the player's history against them. Use Side A / Side B for trades.">Rest of season</button></div></div>
            <label class="sx-f sx-q"><span>Add a player</span><input type="search" id="cmp-add" list="cmp-list" placeholder="Search a name..." autocomplete="off"></label>
            <datalist id="cmp-list">${pool.map(p => `<option value="${esc(label(p))}"></option>`).join('')}</datalist>
            <span id="cmp-opts" class="cmp-opts"></span>
            <span class="db-note" id="cmp-note"></span>
        </div>
        <div class="cmp-chips" id="cmp-chips"></div>
        <div id="cmp-out"></div>
    </div>`;
    const byLabel = Object.fromEntries(pool.map(p => [label(p), p.id]));
    const addInput = document.getElementById('cmp-add');
    addInput.addEventListener('change', () => {
        const id = byLabel[addInput.value];
        addInput.value = '';
        if (!id || st.ids.includes(id) || st.ids.length >= MAX) return;
        st.ids.push(id); st.side[id] = st.side[id] || 'A';
        render();
    });
    document.querySelectorAll('#cmp-mode button').forEach(btn => btn.addEventListener('click', () => { st.mode = btn.dataset.m; st.from = st.to = null; render(); }));

    // ---------------------------------------------------------------- data for the chosen players (loaded once per player set)
    let cache = { key: '', rows: [] };
    async function weeks() {
        const key = st.ids.join(',');
        if (cache.key !== key) {
            cache = { key, rows: st.ids.length ? await GT.query(`SELECT season, week, player_id AS id, points AS pts, projected AS proj, opp FROM player_week_points
                                                                 WHERE player_id IN (${st.ids.map(Number).join(',')}) AND points IS NOT NULL ORDER BY season, week`) : [] };
        }
        return cache.rows;
    }
    // boom / bust by weekly FP+ (js/fpplus.js), classified league-wide per position over the seasons shown
    async function classes(positions, seasons) {
        if (!positions.length || !seasons.length) return {};
        const rows = await GT.query(`SELECT w.season, w.week, w.player_id AS id, w.points AS pts, w.projected AS proj, v.pos
            FROM player_week_points w JOIN player_values v ON v.season = w.season AND v.player_id = w.player_id
            WHERE w.points IS NOT NULL AND v.pos IN (${positions.map(p => `'${p.replace(/'/g, '')}'`).join(',')}) AND w.season IN (${seasons.map(Number).join(',')})`);
        return Object.fromEntries(positions.map(pos => [pos, FPP.classify(rows.filter(r => r.pos === pos))]));
    }

    const charts = [];
    const mount = (id, option) => {
        const ch = echarts.init(document.getElementById(id));
        ch.setOption({ textStyle: { fontFamily: 'Inter, sans-serif' }, animationDuration: 300, ...option });
        charts.push(ch);
    };
    window.addEventListener('resize', () => charts.forEach(c => c.resize()));
    const C = () => ({ ink: SITE.color('ink'), muted: SITE.color('muted'), grid: SITE.color('track'), line: SITE.color('line-strong'), win: SITE.color('win'), loss: SITE.color('loss') });
    const tipStyle = { backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 } };
    const legend = c => ({ type: 'scroll', top: 0, left: 'center', textStyle: { color: c.muted, fontSize: 10 }, itemWidth: 10, itemHeight: 10 });

    // ---------------------------------------------------------------- chips (players chosen; sides in rest-of-season mode)
    function chips() {
        document.getElementById('cmp-chips').innerHTML = st.ids.map((id, i) => {
            const p = byId[id];
            return `<div class="cmp-chip" style="--c:${COLORS[i]}">
                <img src="${id > 0 ? `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png` : url(`assets/nfl-logos/${String(p.team || 'nfl').toLowerCase()}.png`)}" alt="" onerror="this.src='${url('assets/nfl-logos/nfl.png')}';this.onerror=null">
                <div><a href="${url(`pages/players/stats.html?id=${id}`)}"><b>${esc(p.name)}</b></a><small>${esc(p.pos)}${p.team ? ' · ' + esc(p.team) : ''}</small></div>
                ${st.mode === 'ros' ? `<span class="seg cmp-side" data-id="${id}" data-tip="Trade sides: put the players you would give up on one side and the ones you would get on the other. Totals compare the two.">
                    <button data-s="A" class="${st.side[id] !== 'B' ? 'on' : ''}">A</button><button data-s="B" class="${st.side[id] === 'B' ? 'on' : ''}">B</button></span>` : ''}
                <button class="cmp-x" data-id="${id}" aria-label="Remove">×</button></div>`;
        }).join('') + (st.ids.length < MAX ? `<div class="cmp-chip empty">${st.ids.length ? 'Add up to ' + (MAX - st.ids.length) + ' more' : 'Add two to four players to compare'}</div>` : '');
        document.querySelectorAll('.cmp-x').forEach(x => x.addEventListener('click', () => { st.ids = st.ids.filter(id => id !== Number(x.dataset.id)); render(); }));
        document.querySelectorAll('.cmp-side button').forEach(btn => btn.addEventListener('click', () => { st.side[Number(btn.closest('.cmp-side').dataset.id)] = btn.dataset.s; render(); }));
    }

    async function render() {
        syncUrl();
        document.querySelectorAll('#cmp-mode button').forEach(btn => btn.classList.toggle('on', btn.dataset.m === st.mode));
        chips();
        charts.splice(0).forEach(c => c.dispose());
        const out = document.getElementById('cmp-out');
        if (!st.ids.length) { document.getElementById('cmp-opts').innerHTML = ''; out.innerHTML = '<div class="panel"><p class="muted">Search for a player above to start a comparison.</p></div>'; return; }
        out.innerHTML = '<div class="loading" style="margin:24px 0">Comparing...</div>';
        const rows = await weeks();
        if (st.mode === 'back') await lookBack(rows, out); else await restOfSeason(rows, out);
    }

    // ================================================================ LOOK BACK
    async function lookBack(rows, out) {
        const seasons = [...new Set(rows.map(r => r.season))].sort((x, y) => y - x);
        if (st.span !== 'career' && !seasons.includes(Number(st.span))) st.span = 'career';
        const single = st.span !== 'career';
        const inSeason = single ? rows.filter(r => r.season === Number(st.span)) : rows;
        const wks = [...new Set(inSeason.map(r => r.week))].sort((x, y) => x - y);
        const from = single ? (st.from && wks.includes(st.from) ? st.from : wks[0]) : null, to = single ? (st.to && wks.includes(st.to) ? st.to : wks[wks.length - 1]) : null;
        document.getElementById('cmp-opts').innerHTML = `
            <label class="sx-f"><span>Span</span><select class="select" id="cmp-span"><option value="career">Career</option>${seasons.map(s => `<option value="${s}"${String(s) === String(st.span) ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
            ${single ? `<label class="sx-f"><span>From</span><select class="select" id="cmp-from">${wks.map(w => `<option${w === from ? ' selected' : ''}>${w}</option>`).join('')}</select></label>
                        <label class="sx-f"><span>To</span><select class="select" id="cmp-to">${wks.map(w => `<option${w === to ? ' selected' : ''}>${w}</option>`).join('')}</select></label>` : ''}`;
        document.getElementById('cmp-span').addEventListener('change', e => { st.span = e.target.value; st.from = st.to = null; render(); });
        if (single) {
            document.getElementById('cmp-from').addEventListener('change', e => { st.from = Number(e.target.value); render(); });
            document.getElementById('cmp-to').addEventListener('change', e => { st.to = Number(e.target.value); render(); });
        }
        const shown = single ? inSeason.filter(r => r.week >= Math.min(from, to) && r.week <= Math.max(from, to)) : rows;
        const spanText = single ? `${st.span}, weeks ${Math.min(from, to)}-${Math.max(from, to)}` : 'career';
        document.getElementById('cmp-note').textContent = `${spanText} · ${shown.length} player-weeks`;
        const positions = [...new Set(st.ids.map(id => byId[id].pos))];
        const CL = await classes(positions, single ? [Number(st.span)] : [...new Set(shown.map(r => r.season))]);
        const players = st.ids.map((id, i) => {
            const p = byId[id], mine = shown.filter(r => r.id === id), v = mine.map(r => r.pts).sort((x, y) => x - y), C = CL[p.pos];
            const mx = C ? FPP.mix(mine, C) : null;
            return { id, i, p, mine, v, n: v.length, tot: v.reduce((t, x) => t + x, 0), avg: meanOf(v), med: q(v, 0.5), floor: q(v, 0.1), ceil: q(v, 0.9), sd: sdOf(v),
                     fpp: C ? FPP.period(mine, C) : null, mx, boom: mx ? mx.side(1) : null, bust: mx ? mx.side(-1) : null };
        });
        // head to head: weeks every chosen player played; who scored the most
        const key = r => `${r.season}|${r.week}`;
        const common = [...new Set(shown.map(key))].filter(k => st.ids.every(id => shown.some(r => r.id === id && key(r) === k)));
        const top = Object.fromEntries(st.ids.map(id => [id, 0]));
        common.forEach(k => { const best = shown.filter(r => key(r) === k).sort((x, y) => y.pts - x.pts)[0]; top[best.id]++; });
        const col = (100 - 22) / Math.max(1, players.length);
        const rowsDef = [
            ['Games', p => p.n, v => v, 'Weeks with a recorded stat in this span.'],
            ['Total points', p => p.tot, f1, 'Fantasy points over the span (ESPN points, league scoring).'],
            ['Per game', p => p.avg, f1, 'Average points per week played.'],
            ['Median', p => p.med, f1, 'The middle week: half scored more, half less.'],
            ['Floor', p => p.floor, f1, '10th-percentile week: only 1 week in 10 was worse.'],
            ['Ceiling', p => p.ceil, f1, '90th-percentile week: only 1 week in 10 was better.'],
            ['Volatility', p => p.sd, f1, 'Standard deviation of weekly points: higher = bigger swings, lower = steadier. Lower is better here.', true],
            ['FP+', p => p.fpp, v => v == null ? '-' : String(Math.round(v)), 'FP+ over the span: (points / projection) ÷ (the position\'s points / projection in the same weeks) × 100. 100 = performed to projection exactly as well as the position; 120 = 20% better.'],
            ['Boom rate', p => p.boom, pc, `Share of projected weeks with a weekly FP+ at least 0.5 standard deviations above the position average (every boom tier). ${FPP.TIP}`],
            ['Bust rate', p => p.bust, pc, `Share of projected weeks with a weekly FP+ at least 0.5 standard deviations below the position average (every bust tier). Lower is better. ${FPP.TIP}`, true],
            ['Top scorer', p => common.length ? top[p.id] / common.length : null, pc, `Of the ${common.length} weeks every player here played, the share in which this player scored the most.`]
        ];
        const best = (fn, low) => { const vals = players.map(fn).filter(v => v != null); return vals.length ? (low ? Math.min(...vals) : Math.max(...vals)) : null; };
        out.innerHTML = `
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">Side by Side</h3>
                <div class="table-scroll"><table class="data-table" style="min-width:${260 + players.length * 150}px">${SITE.cols('22%', ...players.map(() => `${col}%`))}
                <thead><tr><th>${esc(spanText)}</th>${players.map(p => `<th class="num" style="color:${COLORS[p.i]}">${esc(p.p.name)}</th>`).join('')}</tr></thead><tbody>
                ${rowsDef.map(([name, fn, fmt, tip, low]) => { const bst = best(fn, low);
                    return `<tr><td data-tip="${esc(tip)}">${name}</td>${players.map(p => { const v = fn(p); return `<td class="num">${v != null && v === bst && players.length > 1 ? `<b>${fmt(v)}</b>` : fmt(v)}</td>`; }).join('')}</tr>`; }).join('')}
                </tbody></table></div>
                <p class="an-note">Bold = best of the group. Boom / bust by weekly FP+ in standard deviations from each position's average (${positions.map(pos => CL[pos] ? `${esc(pos)} avg ${Math.round(CL[pos].mean)}, 1 SD = ${Math.round(CL[pos].sd)}` : esc(pos)).join(' · ')}); weeks projected under 30% of the position's median projection are left out.</p></div>
            <div class="db-grid" style="margin-top:14px">
                <section class="db-tile s7"><header><h3 data-tip="Points added up week by week through the span. A steeper line = scoring faster.">Cumulative Points</h3><p>${single ? 'Week by week' : 'Every week played, oldest first'}</p></header><div class="db-chart" id="cmp-cum"></div></section>
                <section class="db-tile s5"><header><h3 data-tip="How often each weekly score happened, as a smooth curve. Tall and narrow = consistent; wide and flat = boom or bust.">Scoring Distribution</h3><p>Share of weeks at each score</p></header><div class="db-chart" id="cmp-kde"></div></section>
                ${single ? `<section class="db-tile s12"><header><h3 data-tip="Each player's score each week, side by side. Hover a week for the opponents.">Week by Week</h3><p>${esc(st.span)} weeks ${Math.min(from, to)}-${Math.max(from, to)}</p></header><div class="db-chart" id="cmp-weeks"></div></section>` : ''}
            </div>`;
        const c = C();
        const series = players.map(p => {
            let run = 0;
            const pts = single ? wks.filter(w => w >= Math.min(from, to) && w <= Math.max(from, to)).map(w => { const r = p.mine.find(x => x.week === w); run += r ? r.pts : 0; return [`W${w}`, +run.toFixed(1)]; })
                               : p.mine.map((r, k) => { run += r.pts; return [k + 1, +run.toFixed(1)]; });
            return { name: p.p.name, type: 'line', showSymbol: false, data: pts, lineStyle: { color: COLORS[p.i], width: 2.5 }, itemStyle: { color: COLORS[p.i] } };
        });
        mount('cmp-cum', { grid: { left: 46, right: 14, top: 30, bottom: 30 }, legend: legend(c), tooltip: { ...tipStyle, trigger: 'axis' },
            xAxis: single ? { type: 'category', axisLabel: { color: c.muted, fontSize: 10 } } : { type: 'value', name: 'Games played', nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: c.muted }, axisLabel: { color: c.muted }, splitLine: { show: false } },
            yAxis: { type: 'value', axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.grid } } }, series });
        const all = players.flatMap(p => p.v), lo = Math.floor(Math.min(0, ...all)), hi = Math.ceil(Math.max(10, ...all));
        const xs = Array.from({ length: 61 }, (_, i) => lo + (hi - lo) * i / 60);
        const kde = v => { if (v.length < 2) return xs.map(() => 0); const bw = Math.max(0.8, 1.06 * (sdOf(v) || 1) * Math.pow(v.length, -0.2));
                           return xs.map(x => +(v.reduce((t, s) => t + Math.exp(-0.5 * ((x - s) / bw) ** 2), 0) / (v.length * bw * Math.sqrt(2 * Math.PI)) * 100).toFixed(3)); };
        mount('cmp-kde', { grid: { left: 40, right: 14, top: 30, bottom: 30 }, legend: legend(c), tooltip: { ...tipStyle, trigger: 'axis', valueFormatter: v => `${v.toFixed(2)}%` },
            xAxis: { type: 'value', min: lo, max: hi, axisLabel: { color: c.muted }, splitLine: { show: false } },
            yAxis: { type: 'value', axisLabel: { color: c.muted, formatter: v => `${v}%` }, splitLine: { lineStyle: { color: c.grid } } },
            series: players.map(p => ({ name: p.p.name, type: 'line', smooth: true, symbol: 'none', data: xs.map((x, k) => [x, kde(p.v)[k]]),
                                        lineStyle: { color: COLORS[p.i], width: 2 }, itemStyle: { color: COLORS[p.i] }, areaStyle: { color: COLORS[p.i], opacity: 0.08 } })) });
        if (single) {
            const ws = wks.filter(w => w >= Math.min(from, to) && w <= Math.max(from, to));
            mount('cmp-weeks', { grid: { left: 40, right: 14, top: 30, bottom: 26 }, legend: legend(c),
                tooltip: { ...tipStyle, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => `<b>${ps[0].name}</b><br>` + ps.map(x => { const r = players[x.seriesIndex].mine.find(m => `W${m.week}` === x.name); return `${x.marker}${esc(x.seriesName)}: ${r ? `${GT.pts(r.pts)} vs ${r.opp || '?'}` : 'did not play'}`; }).join('<br>') },
                xAxis: { type: 'category', data: ws.map(w => `W${w}`), axisLabel: { color: c.muted, fontSize: 10 } },
                yAxis: { type: 'value', axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.grid } } },
                series: players.map(p => ({ name: p.p.name, type: 'bar', barMaxWidth: 14, itemStyle: { color: COLORS[p.i] }, data: ws.map(w => { const r = p.mine.find(m => m.week === w); return r ? r.pts : null; }) })) });
        }
    }

    // ================================================================ REST OF SEASON
    async function restOfSeason(rows, out) {
        const season = latest;
        const games = await GT.query('SELECT week, home_team AS h, away_team AS a, completed FROM nfl_games WHERE season = $s', { $s: season });
        const nflWeeks = [...new Set(games.map(g => g.week))].sort((x, y) => x - y).filter(w => w <= 18);
        const done = nflWeeks.filter(w => games.filter(g => g.week === w).every(g => g.completed));
        const next = (done.length ? Math.max(...done) : 0) + 1;
        const remaining = nflWeeks.filter(w => w >= next);
        if (!remaining.length) { document.getElementById('cmp-opts').innerHTML = ''; out.innerHTML = `<div class="panel"><p class="muted">The ${season} NFL regular season is over: nothing left to project.</p></div>`; return; }
        const from = st.from && remaining.includes(st.from) ? st.from : remaining[0];
        const to = st.to && remaining.includes(st.to) ? st.to : (remaining.includes(17) ? 17 : remaining[remaining.length - 1]);
        document.getElementById('cmp-opts').innerHTML = `
            <label class="sx-f"><span>From week</span><select class="select" id="cmp-from">${remaining.map(w => `<option${w === from ? ' selected' : ''}>${w}</option>`).join('')}</select></label>
            <label class="sx-f"><span>Through</span><select class="select" id="cmp-to" data-tip="The league's fantasy playoffs run weeks 14-17; week 18 is never played in fantasy.">${remaining.map(w => `<option${w === to ? ' selected' : ''}>${w}</option>`).join('')}</select></label>`;
        document.getElementById('cmp-from').addEventListener('change', e => { st.from = Number(e.target.value); render(); });
        document.getElementById('cmp-to').addEventListener('change', e => { st.to = Number(e.target.value); render(); });
        const span = remaining.filter(w => w >= Math.min(from, to) && w <= Math.max(from, to));
        const opp = (team, w) => { const g = games.find(x => x.week === w && (x.h === team || x.a === team)); return g ? { team: g.h === team ? g.a : g.h, home: g.h === team } : null; };

        // opponent strength: points allowed to the position per game, this season x2 and last season x1, vs the league average; shrunk toward 1
        const positions = [...new Set(st.ids.map(id => byId[id].pos))];
        const dvp = await GT.query(`SELECT season, week, defense, pos, points FROM defense_vs_position WHERE season IN ($s, $p) AND pos IN (${positions.map(p => `'${p.replace(/'/g, '')}'`).join(',')})`, { $s: season, $p: season - 1 });
        const strength = {};
        positions.forEach(pos => {
            const rowsP = dvp.filter(r => r.pos === pos), w = r => r.season === season ? 2 : 1;
            const lg = rowsP.reduce((t, r) => t + w(r) * r.points, 0) / Math.max(1e-9, rowsP.reduce((t, r) => t + w(r), 0));
            const teams = [...new Set(rowsP.map(r => r.defense))];
            strength[pos] = { lg, by: Object.fromEntries(teams.map(d => {
                const mine = rowsP.filter(r => r.defense === d), n = mine.reduce((t, r) => t + w(r), 0);
                const raw = mine.reduce((t, r) => t + w(r) * r.points, 0) / n / lg;
                return [d, { f: (n * raw + 3) / (n + 3), n }];
            })) };
        });
        // preseason projection per game (steadies a small sample), newest season the player has one
        const projRows = await GT.query(`SELECT player_id AS id, season, proj_points AS proj FROM player_values WHERE player_id IN (${st.ids.join(',')}) AND proj_points > 0 ORDER BY season DESC`);
        const players = st.ids.map((id, i) => {
            const p = byId[id], mine = rows.filter(r => r.id === id && !(r.season === season && r.week >= next));
            const recent = mine.slice(-12).map(r => r.pts);                       // last 12 games played, any season
            const pr = projRows.find(r => r.id === id && r.season === season) || projRows.find(r => r.id === id);
            const prior = pr ? pr.proj / 17 : (recent.length ? meanOf(recent) : 0);
            const base = (recent.reduce((t, v) => t + v, 0) + 4 * prior) / (recent.length + 4);
            const careerAvg = meanOf(mine.map(r => r.pts)) || base;
            const weeksOut = span.map(w => {
                const o = p.team ? opp(p.team, w) : null;
                if (!o) return { w, bye: true, pts: 0 };
                const sf = (strength[p.pos] && strength[p.pos].by[o.team]) || { f: 1, n: 0 };
                const vs = mine.filter(r => r.opp === o.team);
                const h = vs.length && careerAvg > 0 ? meanOf(vs.map(r => r.pts)) / careerAvg : 1;
                const wt = vs.length / (vs.length + 4);
                const factor = (1 - wt) * sf.f + wt * h;
                return { w, opp: o.team, home: o.home, f: sf.f, vsN: vs.length, vsAvg: vs.length ? meanOf(vs.map(r => r.pts)) : null, factor, pts: base * factor };
            });
            const played = weeksOut.filter(x => !x.bye);
            return { id, i, p, base, recentN: recent.length, prior, weeks: weeksOut, total: weeksOut.reduce((t, x) => t + x.pts, 0),
                     sos: played.length ? meanOf(played.map(x => x.f)) : null, byes: weeksOut.filter(x => x.bye).length, side: st.side[id] === 'B' ? 'B' : 'A',
                     playoffs: weeksOut.filter(x => x.w >= 14 && x.w <= 17).reduce((t, x) => t + x.pts, 0) };
        });
        const sides = ['A', 'B'].map(s => ({ s, list: players.filter(p => p.side === s) })).filter(x => x.list.length);
        document.getElementById('cmp-note').textContent = `${season} · weeks ${span[0]}-${span[span.length - 1]} · ${span.length} weeks left`;
        const col = (100 - 14) / Math.max(1, players.length);
        const oppCell = x => x.bye ? '<span class="muted">BYE</span>' : `<span class="muted">${x.home ? 'vs' : '@'} ${esc(x.opp)}</span> <b>${f1(x.pts)}</b>`;
        const oppTip = (p, x) => x.bye ? `${p.p.name}: bye week` : `${p.p.name} ${x.home ? 'vs' : '@'} ${x.opp}: base ${f1(p.base)} × ${x.factor.toFixed(2)} = ${f1(x.pts)}. ${x.opp} allows ${Math.round(x.f * 100)}% of the league-average ${p.p.pos} points${x.vsN ? `; ${p.p.name} has averaged ${f1(x.vsAvg)} in ${x.vsN} game${x.vsN === 1 ? '' : 's'} against them` : ''}.`;
        const sosText = v => v == null ? '-' : v >= 1.08 ? 'Easy' : v <= 0.92 ? 'Hard' : 'Average';
        out.innerHTML = `
            <div class="cmp-cards" style="grid-template-columns:repeat(${Math.max(2, players.length)},minmax(0,1fr))">${players.map(p => `
                <div class="cmp-card" style="--c:${COLORS[p.i]}">
                    <span>${esc(p.p.name)}${st.mode === 'ros' && sides.length > 1 ? ` · Side ${p.side}` : ''}</span>
                    <b data-tip="Projected fantasy points over weeks ${span[0]}-${span[span.length - 1]}: the sum of the weekly projections below.">${f1(p.total)}</b>
                    <small data-tip="Base = average of the last ${p.recentN} games played, steadied by the preseason projection (${f1(p.prior)} per game) as if it were 4 more games.">base ${f1(p.base)} / game · ${p.byes ? `${p.byes} bye` : 'no bye'}</small>
                    <small data-tip="Schedule strength: the average opponent's points allowed to the position vs the league average. 110 = opponents give up 10% more than average (easier).">schedule ${p.sos == null ? '-' : Math.round(p.sos * 100)} · ${sosText(p.sos)}</small>
                    <small data-tip="Projected points in the fantasy playoff weeks (14-17) inside the chosen range.">playoff weeks ${f1(p.playoffs)}</small></div>`).join('')}</div>
            ${sides.length > 1 ? `<div class="panel cmp-trade"><h3 class="panel-title" data-tip="Each side's projected total over the chosen weeks. The difference is what the trade gains or loses on paper.">Trade Totals</h3>
                <div class="cmp-sides">${sides.map(x => `<div><span>Side ${x.s}</span><b>${f1(x.list.reduce((t, p) => t + p.total, 0))}</b><small>${x.list.map(p => esc(p.p.name)).join(', ')}</small></div>`).join('<em>vs</em>')}</div>
                <p class="an-note">${(() => { const [a, c] = sides.map(x => x.list.reduce((t, p) => t + p.total, 0)); const d = a - c; return Math.abs(d) < 5 ? 'Close to even on projected points.' : `Side ${d > 0 ? 'A' : 'B'} projects ${f1(Math.abs(d))} more points over these weeks.`; })()}</p></div>` : ''}
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px" data-tip="Each cell: the opponent and the projected points. Hover a cell for how it was worked out.">Week by Week Projection</h3>
                <div class="table-scroll"><table class="data-table" style="min-width:${200 + players.length * 160}px">${SITE.cols('14%', ...players.map(() => `${col}%`))}
                <thead><tr><th>Week</th>${players.map(p => `<th class="num" style="color:${COLORS[p.i]}">${esc(p.p.name)}</th>`).join('')}</tr></thead><tbody>
                ${span.map(w => `<tr${w >= 14 && w <= 17 ? ' class="cmp-po"' : ''}><td>Week ${w}${w >= 14 && w <= 17 ? ' <span class="muted" data-tip="A fantasy playoff week (14-17).">· playoffs</span>' : ''}</td>
                    ${players.map(p => { const x = p.weeks.find(y => y.w === w); return `<td class="num" data-tip="${esc(oppTip(p, x))}">${oppCell(x)}</td>`; }).join('')}</tr>`).join('')}
                <tr class="group"><td>Total</td>${players.map(p => `<td class="num">${f1(p.total)}</td>`).join('')}</tr></tbody></table></div></div>
            <div class="db-grid" style="margin-top:14px">
                <section class="db-tile s12"><header><h3 data-tip="Projected points each remaining week; bars at zero are bye weeks.">Projected Points by Week</h3><p>Shaded: fantasy playoff weeks</p></header><div class="db-chart" id="cmp-ros"></div></section>
            </div>
            <p class="an-note">How the projection works: base = the last 12 games played (any season), steadied by the player's preseason ESPN projection as if it were 4 more games.
            Each week multiplies the base by the opponent's points allowed to the position (vs the league average; ${season} counts twice, ${season - 1} once, pulled toward average until there are enough games)
            and, when the player has faced that opponent before, blends in how they did against them (their weight grows with every meeting). Teams are as of the latest ESPN data, so a traded player is projected on their new team's schedule.</p>`;
        const c = C();
        mount('cmp-ros', { grid: { left: 40, right: 14, top: 30, bottom: 26 }, legend: legend(c),
            tooltip: { ...tipStyle, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => `<b>${ps[0].name}</b><br>` + ps.map(x => { const y = players[x.seriesIndex].weeks.find(z => `W${z.w}` === x.name); return `${x.marker}${esc(x.seriesName)}: ${y.bye ? 'bye' : `${GT.pts(y.pts)} ${y.home ? 'vs' : '@'} ${y.opp}`}`; }).join('<br>') },
            xAxis: { type: 'category', data: span.map(w => `W${w}`), axisLabel: { color: c.muted, fontSize: 10 } },
            yAxis: { type: 'value', axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.grid } } },
            series: players.map((p, k) => ({ name: p.p.name, type: 'bar', barMaxWidth: 16, itemStyle: { color: COLORS[p.i] }, data: p.weeks.map(x => +x.pts.toFixed(1)),
                markArea: k === 0 && span.some(w => w >= 14 && w <= 17) ? { silent: true, itemStyle: { color: c.line, opacity: 0.12 },
                    data: [[{ xAxis: `W${Math.max(14, span[0])}` }, { xAxis: `W${Math.min(17, span[span.length - 1])}` }]] } : undefined })) });
    }

    render();
})();
