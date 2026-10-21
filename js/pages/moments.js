/* Past Seasons: Historic League Moments. Matchups decided in the last NFL game(s) of the week, replayed play by play
   (NEW/python/build_league_moments.py): each fantasy point is credited on the play that earned it, so the score and
   the win probability can be followed through the game. The replay settles every live player to his ESPN final.
   Without ?id= the page lists every moment. With ?id= it tells one as a scroll story: a sticky stage (scoreboard,
   win probability, the play) follows the story steps, each pinned to a play, either at its snap (the setup) or after
   it (the result); big swings the story doesn't cover get their own cards. Then the lineups that could have avoided it. */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    const rows = await GT.query(`SELECT id, season, week, title, dek, payload FROM league_moments ORDER BY season DESC, week DESC, sort`);
    const moments = rows.map(r => ({ ...r, d: JSON.parse(r.payload) }));
    const f2 = v => v == null || isNaN(v) ? '-' : Number(v).toFixed(2);
    const pct = v => v == null ? '-' : v >= 0.995 && v < 1 ? '>99%' : v > 0 && v < 0.005 ? '<1%' : `${Math.round(v * 100)}%`;
    const mHref = n => url(`pages/managers/overview.html?m=${(b.byName[String(n).toLowerCase()] || {}).id || n}`);
    const label = d => d.period && d.period !== 'Regular' ? `${(GT.PERIOD || {})[d.period] || d.period} · Week ${d.week}` : `Week ${d.week}`;
    const winnerOf = d => { const [a, c] = d.managers; return d.final[a] >= d.final[c] ? [a, c] : [c, a]; };
    const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');                 // story text: **bold** only
    const one = moments.find(m => m.id === param('id'));

    SITE.subHeader({
        crumbs: [['Past Seasons', url('pages/past-seasons/index.html')], ['Historic League Moments', one ? url('pages/past-seasons/moments.html') : null],
                 ...(one ? [[one.title]] : [])].map(c => c[1] === null ? [c[0]] : c),
        tabs: [{ label: 'All Seasons', href: url('pages/past-seasons/index.html') },          // moments span seasons: same tabs as All Seasons
               { label: 'Historic League Moments', href: url('pages/past-seasons/moments.html'), active: true },
               { label: 'Watch', href: url('pages/past-seasons/watch.html') }]
    });
    if (!moments.length) { content.innerHTML = '<div class="wrap"><p class="empty">No moments yet.</p></div>'; return; }
    if (!one) return listPage();
    detailPage(one);

    // Playoff brackets drawn like the Playoff Bracket page (competitions.js bracketBoard): each later game sits between the
    // two games that feed it, with connector lines. Championship: quarterfinals, semifinals, final; Gulag (loser advances):
    // round 1, round 2, Chumpionship. games = a bracket log from python (moment_retro.py / moment_phantom.py).
    // opts.order = first-round order per bracket so each later game's feeders sit side by side;
    // opts.owner = the team to highlight; opts.fresh(g) = true when the pairing never happened for real (footer note).
    function drawBrackets(hostId, games, opts = {}) {
        const order = opts.order || { champ: [0, 2, 1, 3], gulag: [0, 2, 3, 1] };
        const matchBox = g => {
            const fresh = opts.fresh ? opts.fresh(g) : false;
            const row = (n, s) => `<div class="${n === opts.owner ? 'me' : ''}"><img src="${GT.logo(n)}" alt=""><span class="${g.win === n ? 'w' : ''}">${esc(n)}</span><span class="s ${g.win === n ? 'w' : ''}">${f2(s)}</span></div>`;
            return `<div class="match">${row(g.a, g.sa)}${row(g.b, g.sb)}<span class="match-open ${fresh ? 'hm-new' : 'hm-same'}">Week ${g.week}${fresh ? ' · new matchup' : ''}</span></div>`;
        };
        function board(rounds, names) {
            const MH = 106, GAP = 18, HEAD = 30;                              // MH matches .bracket-slot .match height
            const n = rounds.length;
            const avail = Math.min(content.clientWidth - 40, 1140) - 46 - 44;   // wrap, panel and the inner panel's padding
            const COLGAP = n > 1 ? Math.max(22, Math.min(56, Math.floor((avail - n * 250) / (n - 1)))) : 0;
            const COLW = Math.max(190, Math.min(250, Math.floor((avail - (n - 1) * COLGAP) / n)));
            const centers = [];
            rounds.forEach((list, r) => { centers[r] = list.map((_, k) => r === 0 ? HEAD + k * (MH + GAP) + MH / 2 : (centers[r - 1][2 * k] + centers[r - 1][2 * k + 1]) / 2); });
            const height = Math.max(...centers.flat()) + MH / 2, width = n * COLW + (n - 1) * COLGAP, x = r => r * (COLW + COLGAP);
            let lines = '';
            rounds.forEach((list, r) => {
                if (!r) return;
                const mid = x(r) - COLGAP / 2;
                list.forEach((_, k) => [centers[r - 1][2 * k], centers[r - 1][2 * k + 1]].forEach(fy => { lines += `<path d="M${x(r - 1) + COLW} ${fy} H${mid} V${centers[r][k]} H${x(r)}"/>`; }));
            });
            return `<div class="bracket-scroll"><div class="bracket-board" style="width:${width}px;height:${height}px">
                <svg class="bracket-lines" width="${width}" height="${height}" aria-hidden="true">${lines}</svg>
                ${rounds.map((list, r) => `<h4 class="bracket-round" style="left:${x(r)}px;width:${COLW}px">${names[r]}</h4>` +
                    list.map((g, k) => `<div class="bracket-slot" style="left:${x(r)}px;top:${centers[r][k] - MH / 2}px;width:${COLW}px">${matchBox(g)}</div>`).join('')).join('')}
            </div></div>`;
        }
        const of_ = label => games.filter(g => g.label === label);           // in the order they were played
        const qf = of_('Quarterfinal'), g1 = of_('Gulag round 1');
        const champ = [order.champ.map(i => qf[i]), of_('Semifinal'), of_('Final')];
        const gulag = [order.gulag.map(i => g1[i]), of_('Gulag'), of_('Chumpionship')];
        document.getElementById(hostId).innerHTML =
            `<h5 class="hm-bk-t">Championship</h5>${board(champ, ['Quarterfinals · Wk 15', 'Semifinals · Wk 16', 'Final · Wk 17'])}
             <h5 class="hm-bk-t">Gulag <span class="muted">(loser advances)</span></h5>${board(gulag, ['Round 1 · Wk 15', 'Round 2 · Wk 16', 'Chumpionship · Wk 17'])}`;
    }

    // ================================================================ A SEASON WITH ONE MORE TEAM (python/moment_phantom.py)
    function renderPhantom(d) {
        const PH = d.phantom;
        if (PH) {
            const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
            const wk = Object.keys(PH.weekly).map(Number).sort((x, y) => x - y);
            const oppOf = Object.fromEntries(PH.games.map(g => [g.week, g]));
            const playoffOf = Object.fromEntries(PH.bracket.filter(g => g.a === PH.owner || g.b === PH.owner)
                .map(g => [g.week, { opp: g.a === PH.owner ? g.b : g.a, score: g.a === PH.owner ? g.sa : g.sb, opp_score: g.a === PH.owner ? g.sb : g.sa, label: g.label }]));
            const champ = PH.table.find(t => t.place === 1), realChamp = PH.table.find(t => t.real_place === 1);
            const pfRank = 1 + PH.table.filter(t => t.pf > PH.pf).length;
            // who paid for it: every manager who started one of the phantom's NFL players
            const paid = {};
            PH.swaps.forEach(s => {
                const p = paid[s.owner] || (paid[s.owner] = { owner: s.owner, weeks: new Set(), lost: {}, delta: 0, wire: 0, old: 0 });
                p.weeks.add(s.week); p.lost[s.out] = (p.lost[s.out] || 0) + 1; p.delta += s.delta;
                if (s.from === 'his old roster') p.old++; else p.wire++;
            });
            const row = Object.fromEntries(PH.table.map(t => [t.owner, t]));
            const paidRows = Object.values(paid).sort((x, y) => x.delta - y.delta);
            const host = document.getElementById('hm-phantom');
            host.innerHTML = `<div class="hm-regret-head"><div class="eyebrow">The replay</div><h2 class="section-title">${d.season}, With ${esc(PH.owner)}</h2>
                <p class="section-copy">${esc(PH.owner)} starts the best projected ${esc(PH.team)} lineup in this league's format every week. Each week's bye team plays him instead of sitting out.
                Any ${esc(PH.team)} player in another lineup is replaced by the best projected player available at that slot: the waiver wire, plus the non-${esc(PH.team)} players left on ${esc(PH.owner)}'s abandoned roster. Everything else is what really happened.
                Then the standings and both brackets are replayed as a 16-team league: top 8 to the Championship, the rest to the Gulag (loser advances), seeded 1 v 8, 4 v 5, 3 v 6, 2 v 7.</p></div>
                <div class="panel hm-retro-panel">
                    <div class="db-kpis hm-retro-kpis">
                        <div class="db-kpi"><span>${esc(PH.owner)}'s record</span><b>${PH.record[0]}-${PH.record[1]}</b><small>${ord(PH.seed)} seed</small></div>
                        <div class="db-kpi"><span>Points for</span><b>${f2(PH.pf)}</b><small>${ord(pfRank)} of ${PH.table.length}</small></div>
                        <div class="db-kpi"><span>Finish</span><b>${ord(PH.place)}</b><small>of ${PH.table.length}</small></div>
                        <div class="db-kpi"><span>Champion</span><b>${esc(champ.owner)}</b><small>really ${esc(realChamp ? realChamp.owner : '-')}</small></div>
                    </div>
                    <div><h4 class="gc-sub">${esc(PH.owner)}, week by week</h4><div id="hm-ph-chart" class="hm-retro-chart"></div></div>
                    <h4 class="gc-sub">Who paid for it</h4>
                    <div class="table-scroll"><table class="data-table hm-retro-table">${SITE.cols('16%', '30%', '9%', '13%', '16%', '16%')}<thead><tr>
                        <th>Manager</th><th>${esc(PH.team)} starters replaced</th><th class="num">Weeks</th><th class="num" data-tip="Points the replacements scored over (+) or under (-) the ${esc(PH.team)} players they replaced, all season.">Points</th>
                        <th class="num">Record</th><th class="num">Finish</th></tr></thead><tbody>
                        ${paidRows.map(p => { const t = row[p.owner]; return `<tr><td><span class="team-cell"><img src="${GT.logo(p.owner)}" alt=""><span>${esc(p.owner)}</span></span></td>
                            <td data-tip="${esc(Object.entries(p.lost).map(([n, c]) => `${n} (${c})`).join(', '))}">${esc(Object.entries(p.lost).sort((x, y) => y[1] - x[1]).map(([n]) => n).join(', '))}</td>
                            <td class="num">${p.weeks.size}</td><td class="num ${p.delta >= 0 ? 'hm-up' : 'hm-down'}">${p.delta >= 0 ? '+' : ''}${f2(p.delta)}</td>
                            <td class="num">${t.real_wins}-${t.real_losses} → <b>${t.wins}-${t.losses}</b></td><td class="num">${ord(t.real_place)} → <b>${ord(t.place)}</b></td></tr>`; }).join('')}
                    </tbody></table></div>
                    <h4 class="gc-sub">The playoffs</h4>
                    <div id="hm-ph-bracket"></div>
                    <h4 class="gc-sub">Final standings</h4>
                    <div class="table-scroll"><table class="data-table hm-retro-table">${SITE.cols('9%', '25%', '13%', '15%', '13%', '13%', '12%')}<thead><tr>
                        <th>Place</th><th>Team</th><th>Record</th><th class="num">PF</th><th class="num">Seed</th><th class="num">Real place</th><th class="num">Change</th></tr></thead><tbody>
                        ${PH.table.map(t => { const dlt = t.real_place ? t.real_place - t.place : null;
                            return `<tr class="${t.owner === PH.owner ? 'me' : ''}"><td>${ord(t.place)}</td><td><span class="team-cell"><img src="${GT.logo(t.owner)}" alt=""><span>${esc(t.owner)}</span></span></td>
                                <td>${t.wins}-${t.losses}</td><td class="num">${f2(t.pf)}</td><td class="num">${t.seed}</td><td class="num">${t.real_place ? ord(t.real_place) : '<span class="muted">quit</span>'}</td>
                                <td class="num ${dlt > 0 ? 'hm-up' : dlt < 0 ? 'hm-down' : ''}">${dlt == null ? '<span class="muted">new</span>' : dlt ? `${dlt > 0 ? '▲' : '▼'} ${Math.abs(dlt)}` : '-'}</td></tr>`; }).join('')}
                    </tbody></table></div>
                    <p class="muted hm-foot">The real ${d.season} bracket paired teams in a way the standings don't explain, so both brackets here use a standard 1 v 8 seeding. Replacements are picked each week by ESPN's projection, biggest hole first, one team per player.</p>
                </div>`;
            drawBrackets('hm-ph-bracket', PH.bracket, { owner: PH.owner, order: PH.bracket_order });
            const drawPh = () => {
                const el = document.getElementById('hm-ph-chart'); if (!el) return;
                const C = { accent: SITE.color('accent'), red: SITE.color('danger'), ink: SITE.color('ink'), muted: SITE.color('muted'), line: SITE.color('line-strong'), grid: SITE.color('track') };
                const ch = echarts.getInstanceByDom(el) || echarts.init(el);
                const opp = w => oppOf[w] || playoffOf[w];
                ch.setOption({
                    textStyle: { fontFamily: 'Inter, sans-serif' },
                    tooltip: { trigger: 'axis', backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 },
                               formatter: ps => { const w = wk[ps[0].dataIndex], o = opp(w);
                                   return `<b>Week ${w}</b>${o && o.label ? ` · ${esc(o.label)}` : ''}<br>${esc(PH.owner)} ${f2(PH.weekly[w])}${o ? ` vs ${esc(o.opp)} ${f2(o.opp_score)}` : ''}${PH.weekly[w] === 0 ? `<br>${esc(PH.team)} bye week` : ''}`; } },
                    legend: { top: 0, left: 'center', textStyle: { color: C.muted, fontSize: 10 }, data: [PH.owner, 'Opponent'] },
                    grid: { left: 36, right: 10, top: 30, bottom: 24 },
                    xAxis: { type: 'category', data: wk.map(w => `W${w}`), axisLabel: { color: C.muted, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } } },
                    yAxis: { type: 'value', min: 0, axisLabel: { color: C.muted, fontSize: 10 }, splitLine: { lineStyle: { color: C.grid } } },
                    series: [
                        { name: PH.owner, type: 'bar', barMaxWidth: 20, itemStyle: { color: C.accent },
                          data: wk.map(w => { const o = opp(w); return { value: PH.weekly[w], itemStyle: { color: !o || PH.weekly[w] >= o.opp_score ? C.accent : C.line } }; }) },
                        { name: 'Opponent', type: 'scatter', symbol: 'rect', symbolSize: [16, 3], itemStyle: { color: C.red }, data: wk.map(w => (opp(w) || {}).opp_score ?? null) }
                    ]
                }, true);
            };
            drawPh();
            window.addEventListener('themechange', drawPh);
            window.addEventListener('resize', () => { const el = document.getElementById('hm-ph-chart'); const c = el && echarts.getInstanceByDom(el); c && c.resize(); });
        }
    }

    // ================================================================ A COMEBACK SEASON (python/moment_rally.py)
    function renderRally(d) {
        const R = d.rally; if (!R) return;
        const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
        const played = R.weeks.filter(w => w.week > 0), last = played[played.length - 1];
        const tail = played.slice(-8), tailW = tail.filter(w => w.result === 'W').length;
        const clinch = played.find(w => w.odds >= 1 && played.slice(played.indexOf(w)).every(x => x.odds >= 1));
        const H = R.halves || [];
        const sgn = v => `${v >= 0 ? '+' : ''}${f2(v)}`;
        const cmp = (label, a, c, delta, good = null, tip = '') => `<tr><td${tip ? ` data-tip="${esc(tip)}"` : ''}>${label}</td><td class="num">${a}</td><td class="num"><b>${c}</b></td>
            <td class="num ${good == null ? '' : good ? 'hm-up' : 'hm-down'}">${delta}</td></tr>`;
        const host = document.getElementById('hm-rally');
        host.innerHTML = `<div class="hm-regret-head"><div class="eyebrow">The climb</div><h2 class="section-title">${esc(R.owner)}'s Odds, Week by Week</h2>
            <p class="section-copy">Playoff odds after every week: the rest of the real schedule simulated ${R.sims.toLocaleString()} times, each team scoring like its season so far (steadied toward the league average early on). The top ${R.spots} in each division made the Championship bracket; ties went to head-to-head, then point differential, then points for.</p></div>
            <div class="panel hm-retro-panel">
                <div class="db-kpis hm-retro-kpis">
                    <div class="db-kpi"><span>Low point</span><b>${esc(R.low.record)}</b><small>after week ${R.low.week} · ${ord(R.div_size)} of ${R.div_size}</small></div>
                    <div class="db-kpi"><span>Playoff odds</span><b>${pct(R.low.odds)}</b><small>at the bottom</small></div>
                    <div class="db-kpi"><span>Last ${tail.length} games</span><b>${tailW}-${tail.length - tailW}</b><small>${clinch ? `clinched in week ${clinch.week}` : ''}</small></div>
                    <div class="db-kpi"><span>Final</span><b>${esc(last.record)}</b><small>${ord(last.div_rank)} in the ${esc(R.division)}</small></div>
                </div>
                <div><h4 class="gc-sub">Playoff odds after each week</h4><div id="hm-rally-chart" class="hm-retro-chart"></div></div>
                ${H.length === 2 ? `<h4 class="gc-sub">What changed: weeks ${H[0].weeks[0]}-${H[0].weeks[1]} against weeks ${H[1].weeks[0]}-${H[1].weeks[1]}</h4>
                <div class="table-scroll"><table class="data-table hm-retro-table">${SITE.cols('40%', '20%', '20%', '20%')}<thead><tr>
                    <th></th><th class="num">Weeks ${H[0].weeks[0]}-${H[0].weeks[1]}</th><th class="num">Weeks ${H[1].weeks[0]}-${H[1].weeks[1]}</th><th class="num">Change</th></tr></thead><tbody>
                    ${cmp('Record', H[0].record, H[1].record, '')}
                    ${cmp('Points scored per game', f2(H[0].pf), f2(H[1].pf), sgn(H[1].pf - H[0].pf), H[1].pf >= H[0].pf)}
                    ${cmp('Points allowed per game', f2(H[0].pa), f2(H[1].pa), sgn(H[1].pa - H[0].pa), H[1].pa <= H[0].pa)}
                    ${cmp(`${esc(R.owner)}'s weekly score rank (average)`, H[0].rank.toFixed(1), H[1].rank.toFixed(1), '', H[1].rank <= H[0].rank)}
                    ${cmp("Opponent's weekly score rank (average)", H[0].opp_rank.toFixed(1), H[1].opp_rank.toFixed(1), '', H[1].opp_rank >= H[0].opp_rank)}
                    ${cmp('All-play record', H[0].allplay, H[1].allplay, '', null, 'His score each week against all 15 other teams')}
                </tbody></table></div>` : ''}
                <h4 class="gc-sub">The starters</h4>
                <div class="table-scroll"><table class="data-table hm-retro-table">${SITE.cols('28%', '8%', '16%', '16%', '16%', '16%')}<thead><tr>
                    <th>Player</th><th>Pos</th><th class="num">Wks ${H[0].weeks[0]}-${H[0].weeks[1]} starts</th><th class="num">Per start</th><th class="num">Wks ${H[1] ? `${H[1].weeks[0]}-${H[1].weeks[1]}` : ''} starts</th><th class="num">Per start</th></tr></thead><tbody>
                    ${R.players.map(x => { const a = x.a_starts ? x.a_pts / x.a_starts : null, c = x.b_starts ? x.b_pts / x.b_starts : null;
                        return `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.pos || '')}</td><td class="num">${x.a_starts}</td><td class="num">${a == null ? '-' : f2(a)}</td>
                        <td class="num">${x.b_starts}</td><td class="num ${a != null && c != null ? (c > a ? 'hm-up' : 'hm-down') : ''}"><b>${c == null ? '-' : f2(c)}</b></td></tr>`; }).join('')}
                </tbody></table></div>
                <h4 class="gc-sub">Roster moves</h4>
                <div class="table-scroll"><table class="data-table hm-retro-table">${SITE.cols('12%', '20%', '36%', '10%', '11%', '11%')}<thead><tr>
                    <th>Week</th><th>Move</th><th>Player</th><th>Pos</th><th class="num">Starts after</th><th class="num">Points</th></tr></thead><tbody>
                    ${R.moves.map(m => `<tr><td>Week ${m.week}</td><td>${esc(m.move)}</td><td>${esc(m.name)}</td><td>${esc(m.pos || '')}</td>
                        <td class="num">${m.move === 'Dropped' ? '' : m.starts}</td><td class="num">${m.move === 'Dropped' ? '' : f2(m.pts)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No moves.</td></tr>'}
                </tbody></table></div>
                <h4 class="gc-sub">Week by week</h4>
                <div class="table-scroll"><table class="data-table hm-retro-table">${SITE.cols('8%', '15%', '15%', '6%', '13%', '20%', '8%', '7%', '8%')}<thead><tr>
                    <th>Week</th><th>Opponent</th><th class="num">Score</th><th class="num">W/L</th><th class="num" data-tip="Where each score ranked among the week's ${played[0].teams || 16} scores">Weekly rank</th><th>Top starter</th><th class="num">Record</th><th class="num">Div</th><th class="num">Odds</th></tr></thead><tbody>
                    ${played.map(w => `<tr><td>Week ${w.week}</td><td><span class="team-cell"><img src="${GT.logo(w.opp)}" alt=""><span>${esc(w.opp)}</span></span></td>
                        <td class="num">${f2(w.pf)} - ${f2(w.pa)}</td><td class="num ${w.result === 'W' ? 'hm-up' : 'hm-down'}"><b>${w.result}</b></td>
                        <td class="num">${ord(w.rank)} v ${ord(w.opp_rank)}</td><td>${(w.top || [])[0] ? `${esc(w.top[0].name)} <span class="muted">${f2(w.top[0].pts)}</span>` : ''}</td>
                        <td class="num">${esc(w.record)}</td><td class="num">${ord(w.div_rank)}</td><td class="num"><b>${pct(w.odds)}</b></td></tr>`).join('')}
                </tbody></table></div>
            </div>`;
        const draw = () => {
            const el = document.getElementById('hm-rally-chart'); if (!el) return;
            const C = { accent: SITE.color('accent'), red: SITE.color('danger'), muted: SITE.color('muted'), line: SITE.color('line-strong'), grid: SITE.color('track') };
            const ch = echarts.getInstanceByDom(el) || echarts.init(el);
            ch.setOption({
                textStyle: { fontFamily: 'Inter, sans-serif' },
                tooltip: { trigger: 'axis', backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 },
                           formatter: ps => { const w = R.weeks[ps[0].dataIndex];
                               return w.week ? `<b>Week ${w.week}</b> · ${w.result} vs ${esc(w.opp)} ${f2(w.pf)}-${f2(w.pa)}<br>${esc(w.record)} · ${ord(w.div_rank)} in division<br>Playoff odds ${pct(w.odds)}` : `<b>Before the season</b><br>Playoff odds ${pct(w.odds)}`; } },
                grid: { left: 40, right: 12, top: 14, bottom: 24 },
                xAxis: { type: 'category', boundaryGap: false, data: R.weeks.map(w => w.week ? `W${w.week}` : 'Pre'), axisLabel: { color: C.muted, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } } },
                yAxis: { type: 'value', min: 0, max: 1, interval: 0.25, axisLabel: { color: C.muted, fontSize: 10, formatter: v => `${Math.round(v * 100)}%` }, splitLine: { lineStyle: { color: C.grid } } },
                series: [{ type: 'line', smooth: false, symbol: 'circle', symbolSize: 7, lineStyle: { color: C.accent, width: 2.5 },
                           areaStyle: { color: C.accent, opacity: 0.12 },
                           data: R.weeks.map(w => ({ value: w.odds, itemStyle: { color: !w.week ? C.muted : w.result === 'W' ? C.accent : C.red } })),
                           markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: C.line, type: 'dashed' }, data: [{ yAxis: 0.5 }] } }]
            }, true);
        };
        draw();
        window.addEventListener('themechange', draw);
        window.addEventListener('resize', () => { const el = document.getElementById('hm-rally-chart'); const c = el && echarts.getInstanceByDom(el); c && c.resize(); });
    }

    // ================================================================ LIST
    // the hero's meta lines for a moment: the same text on its detail page and its banner in the list
    function ordinal(n) { return n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'); }
    function metaOf(d) {
        const P = d.phantom, RL = d.rally;
        if (RL) { const w = RL.weeks, end = w[w.length - 1];
                  return [`${d.season} season`, `${esc(RL.owner)} ${esc(RL.low.record)} after week ${RL.low.week} · finished ${esc(end.record)} · playoff odds bottomed at ${pct(RL.low.odds)}`]; }
        if (P) return [`${d.season} season`, `${esc(P.owner)} ${P.record[0]}-${P.record[1]} · ${ordinal(P.place)} of ${P.table.length} · champion ${esc(P.table[0].owner)}`];
        const [W, L] = winnerOf(d);
        return [`${d.season} · ${esc(label(d))}`, `${esc(W)} ${f2(d.final[W])} - ${f2(d.final[L])} ${esc(L)} · decided by ${f2(Math.abs(d.final[W] - d.final[L]))}`];
    }

    // Keep a banner title on one line: shrink its text to fit the width (the box height stays fixed)
    function fitBannerTitles() {
        document.querySelectorAll('.hm-banner .hero-title').forEach(h1 => {
            const span = h1.firstElementChild;
            span.style.fontSize = '';
            let size = parseFloat(getComputedStyle(h1).fontSize);
            while (span.scrollWidth > h1.clientWidth && size > 18) span.style.fontSize = `${--size}px`;
        });
    }

    // every moment as a banner: its detail page's hero (photo on its focal point, title, meta), linking to the story
    function listPage() {
        SITE.hero({ title: 'Historic League Moments', size: 'short', dots: false,
                    meta: [`${moments.length} matchups that came down to one moment`, 'Rebuilt snap by snap from NFL game data'] });
        const top = document.getElementById('hero');
        top.style.backgroundImage = 'none';                      // the list's own header is a plain black fill
        top.classList.add('hm-plain');
        content.innerHTML = `<div class="wrap"><div class="hm-list">${moments.map(m => {
            const d = m.d, s = d.story || {};
            const pic = `url('${url(`assets/images/${s.image || 'background-10.png'}`)}'), url('${url('assets/images/background-10.png')}')`;
            return `<a class="hero short hm-banner" href="${url(`pages/past-seasons/moments.html?id=${encodeURIComponent(m.id)}`)}"
                    data-src="${s.image ? url(`assets/images/${s.image}`) : ''}" data-focus="${s.focus || ''}" style="background-image:${pic}">
                <div class="wrap"><h2 class="hero-title"><span>${esc(s.title || m.title || m.id)}</span></h2>
                <div class="hero-meta">${metaOf(d).map(x => `<div>${x}</div>`).join('')}</div></div></a>`;
        }).join('')}</div></div>`;
        document.querySelectorAll('.hm-banner').forEach(el => { if (el.dataset.src) SITE.focusImage(el, el.dataset.src, el.dataset.focus, 0.25); });
        fitBannerTitles();
        window.addEventListener('resize', fitBannerTitles);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBannerTitles);
    }

    // ================================================================ ARTICLE (a season moment: no matchup to replay)
    function articlePage(m) {
        const d = m.d, s = d.story || {}, P = d.phantom;
        SITE.hero({ title: s.title || m.id, size: 'short', dots: false, image: s.image || 'background-10.png', focus: s.focus, fallback: s.image ? 'background-10.png' : '',
                    meta: metaOf(d) });
        content.innerHTML = `<div class="wrap">
            ${s.dek ? `<p class="hm-dek">${esc(s.dek)}</p>` : ''}
            <article class="hm-article">${(s.sections || []).map(sec => `<h3 class="hm-h">${esc(sec.h)}</h3>${sec.p.map(p => `<p>${md(p)}</p>`).join('')}`).join('')}</article>
            ${P ? '<section class="hm-retro" id="hm-phantom"></section>' : ''}
            ${d.rally ? '<section class="hm-retro" id="hm-rally"></section>' : ''}
            <p class="hm-foot"></p></div>`;
        renderPhantom(d);
        renderRally(d);
    }

    // ================================================================ DETAIL
    function detailPage(m) {
        if (!m.d.timeline.length) return articlePage(m);
        const d = m.d, s = d.story || {}, [A, B] = d.managers, [W, L] = winnerOf(d);
        const tl = d.timeline, last = tl.length - 1;
        const margin = Math.abs(d.final[A] - d.final[B]);
        SITE.hero({ title: s.title || m.id, size: 'short', dots: false, image: s.image || 'background-10.png', focus: s.focus, fallback: s.image ? 'background-10.png' : '',
                    meta: metaOf(d) });

        const gameLabel = g => { const p = String(g).split('_'); return `${p[2]} @ ${p[3]}`; };
        const multi = new Set(tl.map(e => e.g)).size > 1;
        const qtr = q => Number(q) >= 5 ? 'OT' : `Q${q}`;
        const clockOf = e => e.desc === 'Kickoff' ? 'Kickoff' : `${multi ? gameLabel(e.g) + ' · ' : ''}${qtr(e.q)} ${e.clock}`;
        const wpA = (i, view) => { const e = tl[i]; return view === 'pre' && e.wp_pre != null ? e.wp_pre : e.wp; };
        const of = (who, p) => who === A ? p : 1 - p;
        const scoreAt = (i, view) => view === 'pre' && i > 0 ? { a: tl[i - 1].a, b: tl[i - 1].b } : { a: tl[i].a, b: tl[i].b };
        const cleanDesc = t => String(t || '').replace(/^\(\d*:\d+\)\s*/, '').replace(/\((No Huddle, )?Shotgun\)\s*|\(No Huddle\)\s*/g, '').trim();
        // a player credited for several things on one play (catch + yards) shows once, with the total
        const whoOf = e => Object.values(e.who.reduce((acc, w) => { const k = w.name + '|' + w.owner; (acc[k] = acc[k] || { name: w.name, owner: w.owner, pts: 0, shadow: w.shadow }).pts += w.pts; return acc; }, {}));
        const whoTxt = e => whoOf(e).map(w => `${w.pts > 0 ? '+' : ''}${f2(w.pts)} ${w.name}`).join(', ');

        // ---------------------------------------------------------------- the steps: story first, then uncovered swings
        const anchor = st => st.at === 'Kickoff' ? 0
            : st.g ? tl.findIndex(e => String(e.g).includes(st.g) && e.desc.includes(st.at))          // a play in one particular game
            : st.at === 'END GAME' ? tl.map(e => e.desc).lastIndexOf('END GAME') : tl.findIndex(e => e.desc.includes(st.at));
        const steps = (s.steps || []).map(st => ({ ...st, i: anchor(st), view: st.view || 'post', kind: 'story' })).filter(st => st.i >= 0);
        const covered = new Set(steps.map(st => st.i));
        tl.forEach((e, i) => {
            if (!i || covered.has(i)) return;
            const sw = e.play_swing || 0, setup = e.setup_swing || 0;
            if (Math.abs(sw) >= 0.12) {
                const up = sw > 0 ? A : B, p0 = of(up, e.wp_pre), p1 = of(up, e.wp);
                steps.push({ i, view: 'post', kind: 'auto', tag: 'Swing', h: e.who.length ? whoOf(e).map(w => `${w.name} ${w.pts > 0 ? '+' : ''}${f2(w.pts)}`).join(' · ') : 'Settled',
                             p: [cleanDesc(e.desc)], note: `${up} ${pct(p0)} → ${pct(p1)}` });
            }
            if (Math.abs(setup) >= 0.2) {
                const up = setup > 0 ? A : B, p0 = of(up, tl[i - 1].wp), p1 = of(up, e.wp_pre);
                steps.push({ i, view: 'pre', kind: 'auto', tag: 'The clock', h: 'Time running out',
                             p: [`No points changed hands, but the clock kept running. With fewer snaps left for the other side to score, ${up} went from ${pct(p0)} to ${pct(p1)}.`] });
            }
        });
        steps.sort((x, y) => x.i - y.i || (x.view === 'pre' ? -1 : 1) - (y.view === 'pre' ? -1 : 1));

        // ---------------------------------------------------------------- page
        const stepHtml = (st, n) => `<article class="hm-step ${st.kind === 'auto' ? 'hm-auto' : ''}" data-n="${n}">
            <div class="hm-step-top"><span class="pill ${st.kind === 'auto' ? 'pill-dark' : 'pill-accent'}">${esc(st.tag || '')}</span><span class="hm-step-clock">${esc(clockOf(tl[st.i]))}${st.view === 'pre' ? ' · at the snap' : ''}</span></div>
            <h3>${esc(st.h || '')}</h3>${(st.p || []).map(p => `<p>${md(p)}</p>`).join('')}${st.note ? `<div class="hm-step-note">${esc(st.note)}</div>` : ''}</article>`;
        const wi = s.whatif;
        content.innerHTML = `<div class="wrap">
            ${s.dek ? `<p class="hm-dek">${esc(s.dek)}</p>` : ''}
            <section class="hm-scrolly">
                <div class="hm-steps">
                    ${steps.map(stepHtml).join('')}
                    ${wi ? `<article class="hm-step hm-whatif" data-n="${steps.length}"><div class="hm-step-top"><span class="pill pill-accent">What if</span></div>
                        <h3>${esc(wi.title)}</h3><p>${md(wi.text)}</p></article>` : ''}
                    <div class="hm-steps-end"></div>
                </div>
                <div class="hm-stage-col"><div class="hm-stage">
                    <div class="hm-board">
                        <div class="hm-side-l"><img src="${GT.logo(A)}" alt=""><div><a href="${mHref(A)}">${esc(A)}</a><b id="hm-sa">-</b></div></div>
                        <div class="hm-mid"><span id="hm-clock">-</span><span id="hm-nfl"></span></div>
                        <div class="hm-side-r"><div><a href="${mHref(B)}">${esc(B)}</a><b id="hm-sb">-</b></div><img src="${GT.logo(B)}" alt=""></div>
                    </div>
                    <div class="hm-prob"><div class="hm-prob-bar"><span id="hm-pa"></span><span id="hm-pb"></span></div>
                        <div class="hm-prob-lbl"><span id="hm-pal">-</span><em>chance to win</em><span id="hm-pbl">-</span></div></div>
                    ${d.shadow ? `<div class="hm-alt"><i></i><span id="hm-alt">-</span></div>` : ''}
                    <div id="hm-chart" class="hm-chart"></div>
                    <div class="hm-live"><div class="hm-live-h"><span>Still playing</span><span>Change</span><span>Now</span><span>Final</span></div><div id="hm-live"></div></div>
                    <div class="hm-play" id="hm-play"></div>
                </div></div>
            </section>
            ${d.ledger ? '<section class="hm-retro" id="hm-ledger"></section>' : ''}
            ${d.retro ? '<section class="hm-retro" id="hm-retro"></section>' : ''}
            <section class="hm-regret" id="hm-regret"></section>
            <details class="panel hm-more"><summary class="panel-title">Every point, play by play</summary><div id="hm-table"></div></details>
            <p class="muted hm-foot">Replayed from nflverse play-by-play with the league's ${d.season} scoring settings; every live player's replayed total matches his ESPN final.
                Win probability is a simulation of the rest of the game after each play (and at the snap before it): players add their projection's share of the time left;
                a D/ST follows the game's next-score odds (opponent points and yards can only cost it, gains need a sack, takeaway or block); a head coach follows the NFL win probability.</p>
            ${d.game_id ? `<p class="hm-foot"><a href="${url(`pages/past-seasons/game-center.html?id=${d.game_id}`)}">Open the game center →</a></p>` : ''}
        </div>`;

        // ---------------------------------------------------------------- stage
        let chart, cur = null;
        const C = {};
        const readColors = () => Object.assign(C, { accent: SITE.color('accent'), red: SITE.color('danger'), ink: SITE.color('ink'), muted: SITE.color('muted'),
                                                     grid: SITE.color('track'), line: SITE.color('line-strong'), surface: SITE.color('surface') });
        // the path: from each result, the drift to the next snap (setup), then the play itself
        const pts = [];
        tl.forEach((e, i) => {
            if (i && e.wp_pre != null) pts.push({ x: i - 0.4, y: of(W, e.wp_pre), i, view: 'pre' });
            pts.push({ x: i, y: of(W, e.wp), i, view: 'post' });
        });
        const upto = (i, view) => pts.filter(p => p.i < i || (p.i === i && (view === 'post' || p.view === 'pre')));
        function drawChart() {
            readColors();
            const el = document.getElementById('hm-chart');
            if (chart) chart.dispose();
            chart = echarts.init(el, null, { renderer: 'canvas' });
            const swings = tl.map((e, i) => ({ e, i })).filter(x => x.i && Math.abs(x.e.play_swing || 0) >= 0.1);
            chart.setOption({
                textStyle: { fontFamily: 'Inter, sans-serif' }, animationDurationUpdate: 450,
                grid: { left: 40, right: 14, top: 22, bottom: 26 },
                xAxis: { type: 'value', min: 0, max: last, interval: 1, axisLine: { lineStyle: { color: C.line } }, splitLine: { show: false }, axisTick: { show: false },
                         axisLabel: { color: C.muted, fontSize: 9, hideOverlap: true, formatter: v => Number.isInteger(v) && tl[v] ? (v === 0 ? 'Start' : `${multi ? String(tl[v].g).split('_')[2] + ' ' : ''}${qtr(tl[v].q)} ${tl[v].clock}`) : '' } },
                yAxis: { type: 'value', min: 0, max: 1, interval: 0.25, axisLabel: { color: C.muted, fontSize: 9, formatter: v => `${Math.round(v * 100)}%` }, splitLine: { lineStyle: { color: C.grid } } },
                series: [
                    { id: 'ghost', type: 'line', data: pts.map(p => [p.x, p.y]), symbol: 'none', lineStyle: { color: C.line, width: 1.5, type: 'dashed', opacity: 0.6 }, silent: true,
                      markLine: { silent: true, symbol: 'none', lineStyle: { color: C.line, type: 'dotted' }, label: { show: false }, data: [{ yAxis: 0.5 }] } },
                    { id: 'path', type: 'line', data: [], symbol: 'none', lineStyle: { color: C.accent, width: 3 }, areaStyle: { color: C.accent, opacity: 0.08 } },
                    { id: 'swings', type: 'scatter', data: [], symbolSize: 8, z: 3 },
                    { id: 'alt', type: 'line', data: [], symbol: 'none', lineStyle: { color: SITE.color('alt'), width: 2.5, type: 'dashed' }, z: 2 },
                    { id: 'now', type: 'effectScatter', data: [], symbolSize: 14, rippleEffect: { scale: 2.6, brushType: 'stroke' }, z: 4,
                      label: { show: true, position: 'top', fontWeight: 800, fontSize: 12, color: C.ink, formatter: p => pct(p.value[1]) } }
                ]
            });
            chart.__swings = swings;
            if (cur) setStage(cur.i, cur.view, true);
        }
        const livers = d.starters.filter(x => x.live).sort((x, y) => (x.owner === A ? 0 : 1) - (y.owner === A ? 0 : 1) || y.actual - x.actual);
        const deltaAt = tl.map(e => { const o = {}; e.who.forEach(w => { const k = w.name + '|' + w.owner; o[k] = (o[k] || 0) + w.pts; }); return o; });
        const keyOf = x => x.name + '|' + x.owner;
        const startOf = Object.fromEntries(livers.map(x => [keyOf(x), x.actual - deltaAt.reduce((t, o) => t + (o[keyOf(x)] || 0), 0)]));
        const valueAt = (x, i, view) => { let v = startOf[keyOf(x)]; for (let k = 0; k <= i; k++) if (k < i || view === 'post') v += deltaAt[k][keyOf(x)] || 0; return v; };
        const endAt = {};
        tl.forEach((e, k) => { if (e.desc.startsWith('END GAME')) endAt[e.g] = k; });
        const gameOf = Object.fromEntries((d.focus || []).flatMap(f => [[f.home, f.game], [f.away, f.game]]));
        const MAXROWS = 6;
        function drawLive(i, view) {
            // with a big slate, only players whose game is still going (or just ended), six at most; a shadow stays pinned
            let rows = livers;
            if (livers.length > MAXROWS) {
                const open = x => { const g = gameOf[x.team]; return !(g in endAt) || endAt[g] >= i; };
                const pinned = livers.filter(x => x.shadow), rest = livers.filter(x => !x.shadow && open(x))
                    .sort((x, y) => (Math.abs(deltaAt[i][keyOf(y)] || 0) > 0) - (Math.abs(deltaAt[i][keyOf(x)] || 0) > 0) || y.proj - x.proj);
                rows = [...pinned, ...rest].slice(0, MAXROWS);
            }
            document.getElementById('hm-live').innerHTML = rows.map(x => {
                const v = valueAt(x, i, view), dv = view === 'post' ? deltaAt[i][keyOf(x)] || 0 : 0;
                return `<div class="hm-live-r ${x.owner === A ? 'a' : 'b'} ${x.shadow ? 'sh' : ''} ${Math.abs(dv) > 0.005 ? 'hit' : ''}">
                    <span><i></i><span class="nm">${esc(x.name)}</span><small>${x.shadow ? 'bench · not counted' : esc(x.slot)} · ${esc(x.team || '')} · ${esc(x.owner)}</small></span>
                    <em class="${dv > 0.005 ? 'up' : dv < -0.005 ? 'down' : ''}">${Math.abs(dv) > 0.005 ? `${dv > 0 ? '+' : ''}${f2(dv)}` : ''}</em>
                    <b>${f2(v)}</b><span class="muted">${f2(x.actual)}</span></div>`;
            }).join('') + (livers.length > MAXROWS ? Array.from({ length: MAXROWS - rows.length }, () => '<div class="hm-live-r blank"></div>').join('') : '');
        }
        function count(id, to) {
            const el = document.getElementById(id), from = Number(el.dataset.v || to), t0 = performance.now();
            el.dataset.v = to;
            const tick = t => { const k = Math.min(1, (t - t0) / 450); el.textContent = f2(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
        }
        function setStage(i, view, force) {
            if (!force && cur && cur.i === i && cur.view === view) return;
            cur = { i, view };
            const e = tl[i], sc = scoreAt(i, view), p = wpA(i, view);
            count('hm-sa', sc.a); count('hm-sb', sc.b);
            document.getElementById('hm-sa').classList.toggle('lead', sc.a > sc.b);
            document.getElementById('hm-sb').classList.toggle('lead', sc.b > sc.a);
            document.getElementById('hm-clock').textContent = clockOf(e);
            document.getElementById('hm-nfl').textContent = (view === 'pre' ? e.nfl_pre : e.nfl) || '';
            document.getElementById('hm-pa').style.width = `${p * 100}%`;
            document.getElementById('hm-pb').style.width = `${(1 - p) * 100}%`;
            document.getElementById('hm-pal').textContent = `${A} ${pct(p)}`;
            document.getElementById('hm-pbl').textContent = `${pct(1 - p)} ${B}`;
            drawLive(i, view);
            if (d.shadow) {
                const ea = (view === 'pre' && i > 0 ? tl[i - 1] : e).alt, sh = d.shadow;
                if (ea) document.getElementById('hm-alt').innerHTML = `${sh.label ? esc(sh.label) : `If he had started <b>${esc(sh.player)}</b> over ${esc(sh.for)}`}: ${esc(sh.owner)} <b>${f2(sh.owner === A ? ea.a : ea.b)}</b> · <b>${pct(of(sh.owner, ea.wp))}</b> to win`;
            }
            const play = document.getElementById('hm-play');
            if (i === 0) play.innerHTML = `<span class="hm-play-k">Before kickoff</span><p>${esc(A)} ${f2(tl[0].a)} · ${esc(B)} ${f2(tl[0].b)}, with ${d.starters.filter(x => x.live).length} players still to play.</p>`;
            else if (view === 'pre') play.innerHTML = `<span class="hm-play-k">At the snap</span><p>${esc(e.sit || 'Next snap')}</p>`;
            else {
                const d1 = e.play_swing || 0, up = d1 >= 0 ? A : B;
                play.innerHTML = `<span class="hm-play-k">The play</span><p data-tip="${esc(cleanDesc(e.desc))}">${esc(cleanDesc(e.desc))}</p>
                    <div class="hm-chips">${whoOf(e).map(w => `<span class="hm-chip ${w.shadow ? 'sh' : w.owner === A ? 'a' : 'b'}">${w.pts > 0 ? '+' : ''}${f2(w.pts)} ${esc(w.name)}${w.shadow ? ' (bench)' : ''}</span>`).join('')}
                    ${Math.abs(d1) >= 0.005 ? `<span class="hm-chip swing">${esc(up)} ${pct(of(up, e.wp_pre))} → ${pct(of(up, e.wp))}</span>` : ''}</div>`;
            }
            if (!chart) return;
            const path = upto(i, view);
            const head = path[path.length - 1];
            chart.setOption({ series: [
                { id: 'path', data: path.map(q => [q.x, q.y]) },
                { id: 'swings', data: chart.__swings.filter(x => x.i <= i && (x.i < i || view === 'post'))
                    .map(x => ({ value: [x.i, of(W, x.e.wp)], itemStyle: { color: of(W, x.e.wp) >= of(W, x.e.wp_pre) ? C.accent : C.red, borderColor: C.surface, borderWidth: 1.5 } })) },
                { id: 'now', data: head ? [{ value: [head.x, head.y], itemStyle: { color: C.ink } }] : [] },
                { id: 'alt', data: d.shadow ? tl.slice(0, (view === 'post' ? i : i - 1) + 1).filter(e => e.alt).map((e, k) => [tl.indexOf(e), of(W, e.alt.wp)]) : [] }
            ] });
        }
        drawChart();
        setStage(0, 'post', true);

        // scroll: the step crossing the middle of the screen drives the stage
        const els = [...document.querySelectorAll('.hm-step')];
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (!en.isIntersecting) return;
                els.forEach(x => x.classList.toggle('on', x === en.target));
                const n = Number(en.target.dataset.n);
                if (n < steps.length) setStage(steps[n].i, steps[n].view);
                else setStage(last, 'post');
            });
        }, { rootMargin: matchMedia('(max-width: 900px)').matches ? '-62% 0px -30% 0px' : '-45% 0px -45% 0px' });
        els.forEach(x => io.observe(x));
        window.addEventListener('themechange', drawChart);
        window.addEventListener('resize', () => chart && chart.resize());
        if (window.ResizeObserver) new ResizeObserver(() => chart && chart.resize()).observe(document.getElementById('hm-chart'));

        // ---------------------------------------------------------------- the lineups that could have avoided it
        // both cards are built from the same row grid (CSS subgrid) and padded to the same table length, so every
        // section lines up across the two managers; the bars share one scale
        const lu = d.lineups || {};
        const FLEXY = new Set(['RB', 'WR', 'TE']);
        const regret = [W, L].filter(who => lu[who]).map(who => {
            const r = lu[who], opp = who === A ? B : A, oppScore = d.final[opp];
            const fa = (r.fa_swaps || []).filter(x => x.from === 'free agent').slice(0, 3);
            // bench swaps as pairs: each player who should have started against the starter he replaces (same position first)
            const outs = r.bench_outs.slice();
            const pairs = r.bench_ins.map(i => {
                let k = outs.findIndex(o => o.pos === i.pos);
                if (k < 0) k = outs.findIndex(o => FLEXY.has(o.pos) && FLEXY.has(i.pos));
                if (k < 0) k = 0;
                return outs.length ? { i, o: outs.splice(k, 1)[0] } : null;
            }).filter(x => x && x.i.pts - x.o.pts > 0.005).sort((x, y) => (y.i.pts - y.o.pts) - (x.i.pts - x.o.pts));
            return { who, r, opp, oppScore, fa, best1: fa[0], pairs, won: who === W, benchM: r.bench_best - oppScore };
        });
        const nPairs = Math.max(1, ...regret.map(g => g.pairs.length)), nFa = Math.max(1, ...regret.map(g => g.fa.length));
        const scaleMax = Math.max(...regret.flatMap(g => [g.r.actual, g.r.bench_best, g.best1 ? g.r.actual + g.best1.gain : 0, g.oppScore])) * 1.04;
        const blank = n => Array.from({ length: n }, () => `<tr class="hm-blank"><td colspan="6">&nbsp;</td></tr>`).join('');
        const regretCard = g => {
            const { who, r, opp, oppScore, fa, best1, pairs, won, benchM } = g;
            const bar = (lbl, v, cls, tip) => `<div class="hm-bar" data-tip="${esc(tip)}"><span class="hm-bar-l">${lbl}</span>
                <span class="hm-bar-t"><i class="${cls}" style="width:${(v / scaleMax * 100).toFixed(1)}%"></i><em style="left:${(oppScore / scaleMax * 100).toFixed(1)}%"></em></span><b>${f2(v)}</b></div>`;
            const verdict = won
                ? (benchM - margin > 0.005 ? `With his best bench, ${esc(who)} wins by <b>${f2(benchM)}</b> instead of ${f2(margin)}.` : `${esc(who)} had already started his best lineup.`)
                : (benchM > 0 ? `With his best bench, ${esc(who)} wins by <b>${f2(benchM)}</b>.` : `Even his best bench comes up ${f2(-benchM)} short.`);
            const faLine = !best1 ? 'No free agent would have helped.'
                : won ? `One waiver pickup, ${esc(best1.in)} (${f2(best1.in_pts)}) for ${esc(best1.out)}, makes it a <b>${f2(margin + best1.gain)}</b>-point win.`
                : best1.gain > margin ? `One waiver pickup, ${esc(best1.in)} (${f2(best1.in_pts)}) for ${esc(best1.out)}, wins it by <b>${f2(best1.gain - margin)}</b>.`
                : `No single waiver pickup closes a ${f2(margin)}-point gap.`;
            return `<div class="panel hm-reg">
                <div class="gc-side"><img src="${GT.logo(who)}" alt=""><h3 class="panel-title">${esc(who)}</h3><span class="pill ${won ? 'pill-accent' : 'pill-dark'}">${won ? 'Won' : 'Lost'} by ${f2(margin)}</span></div>
                <div class="hm-bars">
                    ${bar('Started', r.actual, 'act', `What ${who} actually scored`)}
                    ${bar('Best bench', r.bench_best, 'bench', 'The best legal lineup from his own roster (IR excluded)')}
                    ${bar('+1 pickup', best1 ? r.actual + best1.gain : r.actual, 'fa', best1 ? `His lineup with the single best free-agent swap: ${best1.in} for ${best1.out}` : 'No free-agent swap helps')}
                    <div class="hm-bar-key"><em></em>${esc(opp)} ${f2(oppScore)}</div>
                </div>
                <div class="hm-verdict"><p><span class="hm-v-k">Bench</span><span>${verdict}</span></p><p><span class="hm-v-k">Waivers</span><span>${faLine}</span></p></div>
                <div><h4 class="gc-sub">Should have started</h4>
                <div class="table-scroll"><table class="data-table hm-swaps"><colgroup><col style="width:28%"><col style="width:9%"><col style="width:12%"><col style="width:27%"><col style="width:12%"><col style="width:12%"></colgroup>
                <thead><tr><th>Start</th><th>Pos</th><th class="num">FP</th><th>Instead of</th><th class="num">FP</th><th class="num">Gain</th></tr></thead><tbody>
                ${pairs.map(x => `<tr><td>${esc(x.i.name)}</td><td>${esc(x.i.pos || '')}</td><td class="num">${f2(x.i.pts)}</td><td>${esc(x.o.name)}</td><td class="num">${f2(x.o.pts)}</td><td class="num">+${f2(x.i.pts - x.o.pts)}</td></tr>`).join('')
                  || '<tr><td colspan="6" class="muted">Started his best lineup</td></tr>'}${blank(nPairs - Math.max(1, pairs.length))}</tbody></table></div></div>
                <div><h4 class="gc-sub">On the waiver wire</h4>
                <div class="table-scroll"><table class="data-table hm-swaps"><colgroup><col style="width:30%"><col style="width:11%"><col style="width:12%"><col style="width:33%"><col style="width:14%"></colgroup>
                <thead><tr><th>Free agent</th><th>Pos</th><th class="num">FP</th><th>Instead of</th><th class="num">Gain</th></tr></thead><tbody>
                ${fa.map(x => `<tr><td>${esc(x.in)}</td><td>${esc(x.in_pos || x.slot)}</td><td class="num">${f2(x.in_pts)}</td><td>${esc(x.out)} (${f2(x.out_pts)})</td><td class="num">+${f2(x.gain)}</td></tr>`).join('')
                  || '<tr><td colspan="5" class="muted">No free agent outscored a starter</td></tr>'}${blank(nFa - Math.max(1, fa.length))}</tbody></table></div></div>
            </div>`;
        };
        document.getElementById('hm-regret').innerHTML = `<div class="hm-regret-head"><div class="eyebrow">Paths not taken</div><h2 class="section-title">It Didn't Have to Be This Close</h2>
            <p class="section-copy">Both lineups as set, against the best lineup each manager could have started from his own bench, and the free agents nobody had rostered.</p></div>
            <div class="hm-pair">${regret.map(regretCard).join('')}</div>`;

        // ---------------------------------------------------------------- season ledger for one player (python/moment_ledger.py)
        const LG = d.ledger;
        if (LG) {
            const VERDICT = { cost: ['Cost the game', 'l'], missed: ['His absence cost it', 'l'], saved: ['Won the game', 'w'], none: ['', ''], bench: ['Benched', ''] };
            const started = LG.weeks.filter(r => r.slot !== 'BE' && r.slot !== 'IR' && r.pts != null);
            const wins = started.filter(r => r.result === 'W').length;
            const surname = LG.player.split(' ').slice(-1)[0];
            const host = document.getElementById('hm-ledger');
            const label = r => r.period === 'Regular' ? `Week ${r.week}` : `Week ${r.week} · ${(GT.PERIOD || {})[r.period] || r.period}`;
            host.innerHTML = `<div class="hm-regret-head"><div class="eyebrow">Season ledger</div><h2 class="section-title">The ${esc(surname)} Ledger</h2>
                <p class="section-copy">Every week of ${esc(LG.player)}'s ${d.season}: what he scored against ESPN's projection, how his manager's matchup ended, and whether he decided it.
                <b>Cost the game</b>: he started, and scoring his projection would have flipped the loss. <b>Won the game</b>: his points over projection were more than the winning margin.
                <b>His absence cost it</b>: on injured reserve, and his average to that point, minus what the fill-in scored, would have covered the loss.</p></div>
                <div class="panel hm-retro-panel">
                    <div class="db-kpis hm-retro-kpis">
                        <div class="db-kpi"><span>Starts</span><b>${LG.games}</b><small>${f2(LG.points)} pts · ${f2(LG.proj)} projected</small></div>
                        <div class="db-kpi"><span>Manager's record in his starts</span><b>${wins}-${started.length - wins}</b><small>${esc([...new Set(started.map(r => r.owner))].join(', '))}</small></div>
                        <div class="db-kpi"><span>Games he cost</span><b>${LG.cost}</b><small>by falling short or by missing time</small></div>
                        <div class="db-kpi"><span>Games he won</span><b>${LG.saved}</b><small>by beating his projection</small></div>
                    </div>
                    <div><h4 class="gc-sub">Week by week</h4><div id="hm-ledger-chart" class="hm-retro-chart"></div></div>
                    <div class="hm-ledger">${LG.weeks.map(r => {
                        const [vt, vc] = VERDICT[r.verdict] || ['', ''];
                        const line = r.slot === 'IR' ? `<span class="muted">Injured reserve</span>${r.stand_in ? ` · ${esc(r.stand_in.name)} filled in: ${f2(r.stand_in.pts)}` : ''}`
                            : r.pts == null ? '<span class="muted">No game</span>'
                            : `<b>${f2(r.pts)}</b> <span class="muted">of ${f2(r.proj)} projected</span>${r.needed != null && r.margin > -15 ? ` · needed ${f2(r.needed)}` : ''}`;
                        const note = (LG.notes || {})[String(r.week)];
                        return `<div class="hm-lg-row ${vc} ${r.week === d.week ? 'me' : ''}">
                            <div class="hm-lg-wk"><b>${esc(label(r))}</b><span>vs ${esc(r.opp)}</span></div>
                            <div class="hm-lg-pts">${line}</div>
                            <div class="hm-lg-res"><b class="${r.result === 'W' ? 'w' : 'l'}">${r.result}</b> ${f2(r.score)}-${f2(r.opp_score)}<small>${r.margin > 0 ? '+' : ''}${f2(r.margin)}</small></div>
                            <div class="hm-lg-v">${vt ? `<span class="hm-v ${vc}">${vt}</span>` : ''}</div>
                            ${note || r.quotes.length ? `<div class="hm-lg-more">${note ? `<p>${esc(note)}</p>` : ''}${r.quotes.length ? `<div class="hm-quotes">${r.quotes.map(qq =>
                                `<div class="hm-q"><img src="${GT.logo(qq.who)}" alt=""><div><b>${esc(qq.who)}</b><small>${esc(qq.when || '')}</small><span>${esc(qq.text)}</span></div></div>`).join('')}</div>` : ''}</div>` : ''}
                        </div>`;
                    }).join('')}</div>
                </div>`;
            const drawLedger = () => {
                const el = document.getElementById('hm-ledger-chart'); if (!el) return;
                const C = { accent: SITE.color('accent'), red: SITE.color('danger'), ink: SITE.color('ink'), muted: SITE.color('muted'), line: SITE.color('line-strong'), grid: SITE.color('track') };
                const chart = echarts.getInstanceByDom(el) || echarts.init(el);
                const ax = { axisLabel: { color: C.muted, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } }, splitLine: { lineStyle: { color: C.grid } } };
                const colorOf = r => r.verdict === 'cost' || r.verdict === 'missed' ? C.red : r.verdict === 'saved' ? C.accent : C.line;
                chart.setOption({
                    textStyle: { fontFamily: 'Inter, sans-serif' },
                    tooltip: { trigger: 'axis', backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 },
                               formatter: ps => { const r = LG.weeks[ps[0].dataIndex];
                                   return `<b>${esc(label(r))}</b> vs ${esc(r.opp)}<br>${r.slot === 'IR' ? 'Injured reserve' : `${surname} ${f2(r.pts)} (proj ${f2(r.proj)})`}<br>${r.result} ${f2(r.score)}-${f2(r.opp_score)}`; } },
                    legend: { top: 0, left: 'center', textStyle: { color: C.muted, fontSize: 10 }, data: [`${surname}'s points`, 'Projection'] },
                    grid: { left: 36, right: 10, top: 30, bottom: 24 },
                    xAxis: { type: 'category', data: LG.weeks.map(r => `W${r.week}`), ...ax, splitLine: { show: false } },
                    yAxis: { type: 'value', min: 0, ...ax },
                    series: [
                        { name: `${surname}'s points`, type: 'bar', barMaxWidth: 22, itemStyle: { color: C.line },
                          data: LG.weeks.map(r => ({ value: r.slot === 'IR' ? 0.0001 : r.pts, itemStyle: { color: colorOf(r) } })),
                          label: { show: true, position: 'top', fontSize: 9, color: C.muted, formatter: p => LG.weeks[p.dataIndex].slot === 'IR' ? 'IR' : '' } },
                        { name: 'Projection', type: 'scatter', symbol: 'rect', symbolSize: [16, 3], itemStyle: { color: C.ink }, data: LG.weeks.map(r => r.slot === 'IR' ? null : r.proj) }
                    ]
                }, true);
            };
            drawLedger();
            window.addEventListener('themechange', drawLedger);
            window.addEventListener('resize', () => { const el = document.getElementById('hm-ledger-chart'); const c = el && echarts.getInstanceByDom(el); c && c.resize(); });
        }

        // ---------------------------------------------------------------- season retrospective (python/moment_retro.py)
        const R = d.retro;
        if (R) {
            const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
            const wk = Object.keys(R.actual.weekly).map(Number).sort((x, y) => x - y);
            const typ = Object.entries(R.typical_by_season).map(([s, v]) => `${s} (${f2(v.ppg)} in ${v.games})`).join(', ');
            const host = document.getElementById('hm-retro');
            host.innerHTML = `<div class="hm-regret-head"><div class="eyebrow">Season retrospective</div><h2 class="section-title">If ${esc(R.player.split(' ').slice(-1)[0])} Stays Healthy</h2>
                <p class="section-copy">${esc(R.owner)}'s whole ${d.season} season replayed with ${esc(R.player)} healthy and the roster frozen as it stood in week ${R.from_week}: no trades, no pickups, no drops.
                ${esc(R.player)} starts every game he plays. Everyone else in the lineup is the highest-projected legal choice each week and scores what he really scored. Every other team keeps its real weekly scores, so only results against ${esc(R.owner)} change. Standings, tiebreaks and both brackets are then replayed.</p></div>
                <div class="panel hm-retro-panel">
                    <div class="hm-retro-ctl">
                        <label for="hm-band"><span class="hm-play-k">${esc(R.player)}'s season</span><b id="hm-band-l"></b><small id="hm-band-s"></small></label>
                        <input type="range" id="hm-band" min="0" max="${R.bands.length - 1}" step="1" value="${Math.floor(R.bands.length / 2)}">
                        <div class="hm-band-ticks">${R.bands.map(b => `<span>${Math.round(b.band * 100)}%</span>`).join('')}</div>
                    </div>
                    <p class="hm-retro-verdict" id="hm-retro-verdict"></p>
                    <div class="db-kpis hm-retro-kpis" id="hm-retro-kpis"></div>
                    <div class="hm-retro-charts">
                        <div><h4 class="gc-sub">Week by week</h4><div id="hm-retro-weeks" class="hm-retro-chart"></div></div>
                        <div><h4 class="gc-sub" data-tip="Share of ${R.sims.toLocaleString()} simulated seasons, each drawing ${esc(R.player)}'s weekly scores from his own games at the chosen level">Where ${esc(R.owner)} finishes</h4><div id="hm-retro-dist" class="hm-retro-chart"></div></div>
                    </div>
                    <div id="hm-retro-flips"></div>
                    <div class="hm-bracket-head"><h4 class="gc-sub">The playoffs in this season</h4>
                        <div class="hm-seg" id="hm-bview"><button data-v="alt" class="on">This season</button><button data-v="real">Real ${d.season}</button></div></div>
                    <div id="hm-retro-bracket"></div>
                    <h4 class="gc-sub">Final standings in this season</h4>
                    <div class="table-scroll"><table class="data-table hm-retro-table"><colgroup><col style="width:9%"><col style="width:23%"><col style="width:11%"><col style="width:13%"><col style="width:13%"><col style="width:13%"><col style="width:18%"></colgroup>
                        <thead><tr><th>Place</th><th>Team</th><th>Record</th><th class="num">PF</th><th class="num">Real place</th><th class="num">Change</th><th class="num" data-tip="Share of simulated seasons this team wins the title">Title odds</th></tr></thead>
                        <tbody id="hm-retro-rows"></tbody></table></div>
                    <p class="muted hm-foot">Typical = ${f2(R.typical)} points a game: his ${R.typical_games} games in ${typ}, all under the same QB scoring. ${R.player_team} bye: week ${R.bye.join(', ')}.
                        Checked: replaying the real season through the same code reproduces all ${R.check.teams} real final places${R.check.matched === R.check.teams ? '' : ` (${R.check.matched} matched)`}.</p>
                </div>`;
            let wChart, dChart, bView = 'alt';
            // the playoff brackets (drawBrackets below); "new matchup" marks a pairing that never happened for real
            const realPairs = new Set(R.real_bracket.map(g => `${g.week}:${[g.a, g.b].sort().join('|')}`));
            const drawBracket = b => drawBrackets('hm-retro-bracket', bView === 'real' ? R.real_bracket : b.bracket,
                { owner: R.owner, fresh: g => bView !== 'real' && !realPairs.has(`${g.week}:${[g.a, g.b].sort().join('|')}`) });
            document.getElementById('hm-bview').addEventListener('click', e => {
                const btn = e.target.closest('button'); if (!btn) return;
                bView = btn.dataset.v;
                document.querySelectorAll('#hm-bview button').forEach(x => x.classList.toggle('on', x === btn));
                drawBracket(R.bands[Number(document.getElementById('hm-band').value)]);
            });
            const renderRetro = k => {
                const b = R.bands[k], C = { accent: SITE.color('accent'), ink: SITE.color('ink'), muted: SITE.color('muted'), line: SITE.color('line-strong'), grid: SITE.color('track'), red: SITE.color('danger') };
                document.getElementById('hm-band-l').textContent = `${Math.round(b.band * 100)}% of typical`;
                document.getElementById('hm-band-s').textContent = `${f2(b.ppg)} points a game`;
                const last = b.dist[15], bracket = b.dist.slice(0, 8).reduce((t, x) => t + x, 0);
                const kpi = (label, value, sub) => `<div class="db-kpi"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;
                document.getElementById('hm-retro-kpis').innerHTML =
                    kpi('Record', `${b.record[0]}-${b.record[1]}`, `real ${R.actual.record[0]}-${R.actual.record[1]}`) +
                    kpi('Final place', ord(b.place), `real ${ord(R.actual.place)}`) +
                    kpi('Points for', f2(b.pf), `real ${f2(R.actual.pf)}`) +
                    kpi('Avoids last', pct(1 - last), `avg ${f2(b.sim_wins)} wins · bracket ${pct(bracket)}`);
                // which of his results change
                const flips = wk.filter(w => R.opp[w]).map(w => {
                    const o = R.opp[w], real = R.actual.weekly[w] > o.score, cf = b.weekly[w] > o.score;
                    return real === cf ? null : { w, o, real, cf, s: b.weekly[w], r: R.actual.weekly[w] };
                }).filter(Boolean);
                const moved = b.table.filter(t => t.owner !== R.owner && Math.abs(t.place - t.actual_place) >= 3).sort((x, y) => Math.abs(y.place - y.actual_place) - Math.abs(x.place - x.actual_place));
                document.getElementById('hm-retro-flips').innerHTML = `<div class="hm-flips">
                    <div><h4 class="gc-sub">Results that change</h4>${flips.length ? flips.map(f => `<div class="hm-flip ${f.cf ? 'w' : 'l'}"><b>Week ${f.w}</b>
                        <span>${f.cf ? 'Beats' : 'Loses to'} ${esc(f.o.name)}, ${f2(f.s)}-${f2(f.o.score)}</span><em>really ${f.real ? 'won' : 'lost'} with ${f2(f.r)}</em></div>`).join('')
                        : '<p class="muted">None: every result stays the same.</p>'}</div>
                    <div><h4 class="gc-sub">The ripple</h4>${moved.length ? moved.slice(0, 5).map(t => `<div class="hm-flip ${t.place < t.actual_place ? 'w' : 'l'}"><b>${esc(t.owner)}</b>
                        <span>${ord(t.actual_place)} → ${ord(t.place)}</span><em>${t.wins !== t.actual_wins ? `${t.actual_wins}-${t.wins + t.losses - t.actual_wins} becomes ${t.wins}-${t.losses}` : 'same record, new bracket path'}</em></div>`).join('')
                        : '<p class="muted">No other team moves more than two places.</p>'}</div></div>`;
                const champ = b.table[0], realChamp = b.table.find(t => t.actual_place === 1);
                document.getElementById('hm-retro-verdict').innerHTML = `At ${Math.round(b.band * 100)}% of his typical season, ${esc(R.player)} takes ${esc(R.owner)} from ${R.actual.record[0]}-${R.actual.record[1]} to <b>${b.record[0]}-${b.record[1]}</b>,
                    and he finishes <b>${ord(b.place)}</b> (really ${ord(R.actual.place)}). ${flips.length ? `${flips.length} of his results flip, and` : 'None of his results flip, but'} the league reshuffles behind him:
                    ${champ.owner === realChamp.owner ? `${esc(champ.owner)} still wins the title.` : `<b>${esc(champ.owner)}</b> wins the title instead of ${esc(realChamp.owner)}.`}`;
                drawBracket(b);
                document.getElementById('hm-retro-rows').innerHTML = b.table.map(t => {
                    const dlt = t.actual_place - t.place;
                    return `<tr class="${t.owner === R.owner ? 'me' : ''}"><td>${ord(t.place)}</td><td><span class="team-cell"><img src="${GT.logo(t.owner)}" alt=""><span>${esc(t.owner)}</span></span></td>
                        <td>${t.wins}-${t.losses}</td><td class="num">${f2(t.pf)}</td><td class="num">${ord(t.actual_place)}</td>
                        <td class="num ${dlt > 0 ? 'hm-up' : dlt < 0 ? 'hm-down' : ''}">${dlt ? `${dlt > 0 ? '▲' : '▼'} ${Math.abs(dlt)}` : '-'}</td><td class="num">${pct(t.p_title)}</td></tr>`;
                }).join('');
                const ax = { axisLabel: { color: C.muted, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } }, splitLine: { lineStyle: { color: C.grid } } };
                const tip = { trigger: 'axis', backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 } };
                if (!wChart) wChart = echarts.init(document.getElementById('hm-retro-weeks'));
                wChart.setOption({
                    textStyle: { fontFamily: 'Inter, sans-serif' }, animationDurationUpdate: 400, tooltip: { ...tip, valueFormatter: v => v == null ? '-' : f2(v) },
                    legend: { top: 0, left: 'center', itemGap: 14, textStyle: { color: C.muted, fontSize: 10 } },
                    grid: { left: 40, right: 10, top: 30, bottom: 24 },
                    xAxis: { type: 'category', data: wk.map(w => `W${w}`), ...ax, splitLine: { show: false } },
                    yAxis: { type: 'value', min: 60, ...ax },
                    series: [
                        { name: 'Real', type: 'bar', data: wk.map(w => R.actual.weekly[w]), itemStyle: { color: C.line }, barMaxWidth: 14 },
                        { name: `With ${R.player.split(' ').slice(-1)[0]}`, type: 'line', data: wk.map(w => b.weekly[w]), lineStyle: { color: C.accent, width: 2.5 }, itemStyle: { color: C.accent }, symbolSize: 6 },
                        { name: 'Opponent', type: 'scatter', data: wk.map(w => R.opp[w] ? R.opp[w].score : null), itemStyle: { color: C.red }, symbol: 'rect', symbolSize: [12, 3] }
                    ]
                });
                if (!dChart) dChart = echarts.init(document.getElementById('hm-retro-dist'));
                dChart.setOption({
                    textStyle: { fontFamily: 'Inter, sans-serif' }, animationDurationUpdate: 400,
                    tooltip: { ...tip, formatter: ps => `${ord(Number(ps[0].name))} place: <b>${pct(ps[0].value)}</b>` },
                    grid: { left: 40, right: 10, top: 30, bottom: 24 },
                    xAxis: { type: 'category', data: b.dist.map((_, i) => String(i + 1)), ...ax, splitLine: { show: false } },
                    yAxis: { type: 'value', min: 0, max: 1, ...ax, axisLabel: { color: C.muted, fontSize: 10, formatter: v => `${Math.round(v * 100)}%` } },
                    series: [{ type: 'bar', data: b.dist.map((v, i) => ({ value: v, itemStyle: { color: i + 1 === R.actual.place ? C.ink : i < 8 ? C.accent : C.line } })), barMaxWidth: 18 }]
                });
            };
            const slider = document.getElementById('hm-band');
            slider.addEventListener('input', () => renderRetro(Number(slider.value)));
            renderRetro(Number(slider.value));
            window.addEventListener('resize', () => { wChart && wChart.resize(); dChart && dChart.resize(); });
            window.addEventListener('themechange', () => { wChart && wChart.dispose(); dChart && dChart.dispose(); wChart = dChart = null; renderRetro(Number(slider.value)); });
        }

        // ---------------------------------------------------------------- full table (collapsed)
        const playRows = tl.slice(1).map(e => {
            const dw = of(W, e.wp) - of(W, e.wp_pre);
            return `<tr><td>${esc(clockOf(e))}</td><td data-tip="${esc(e.desc)}">${esc(cleanDesc(e.desc))}</td><td data-tip="${esc(whoTxt(e))}">${esc(whoTxt(e)) || '<span class="muted">Settled to final</span>'}</td>
                <td class="num">${f2(e.a)}</td><td class="num">${f2(e.b)}</td><td class="num">${pct(of(W, e.wp_pre))}</td><td class="num">${pct(of(W, e.wp))}</td>
                <td class="num ${dw > 0.005 ? 'hm-up' : dw < -0.005 ? 'hm-down' : ''}">${Math.abs(dw) < 0.005 ? '-' : `${dw > 0 ? '+' : ''}${Math.round(dw * 100)}`}</td></tr>`;
        }).join('');
        document.getElementById('hm-table').innerHTML = `<div class="table-scroll"><table class="data-table hm-plays">
            <colgroup><col style="width:12%"><col style="width:34%"><col style="width:18%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:8%"></colgroup>
            <thead><tr><th>${multi ? 'Game · ' : ''}Clock</th><th>Play</th><th>Points</th><th class="num">${esc(A)}</th><th class="num">${esc(B)}</th><th class="num">${esc(W)} at snap</th><th class="num">${esc(W)} after</th><th class="num">Change</th></tr></thead>
            <tbody>${playRows}</tbody></table></div>`;
    }
})();
