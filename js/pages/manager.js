/* Manager pages: Overview, Schedule & Results, Roster History, Manager Stats History, Vs the NFL, Draft Tendencies, Rivalries */
(async function () {
    const { esc, url, param } = SITE;
    const page = document.body.dataset.page;
    const content = document.getElementById('content');
    const b = await GT.load();
    const mgr = await GT.manager(param('m') || localStorage.getItem('gt-last-manager'));
    if (!mgr) { location.href = url('pages/managers/index.html'); return; }
    localStorage.setItem('gt-last-manager', mgr.id);

    const all = await GT.games(mgr.id);
    const seasons = [...new Set(all.map(g => g.season))].sort((x, y) => y - x);
    // Draft Tendencies and Rivalries are career summaries: always the whole career, no season picker
    const CAREER_ONLY = ['draft-tendencies', 'rivalry'].includes(page);
    const CAREER = CAREER_ONLY || param('season') === 'career';
    const season = CAREER ? 0 : Number(param('season')) || seasons[0];
    const label = CAREER ? 'Career' : season;            // shown wherever the season number was
    const sq = CAREER ? 'career' : season;               // value for ?season= links
    const span = `${seasons[seasons.length - 1]}-${seasons[0]}`;
    const inSeason = CAREER ? all : all.filter(g => g.season === season);
    const reg = inSeason.filter(g => g.period === 'Regular');
    const team = GT.teamName(b, mgr.name, CAREER ? seasons[0] : season);
    const division = b.division[`${season}-${mgr.id}`];
    const finish = b.finish[`${season}-${mgr.id}`];
    const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    const mlink = (p, extra = '') => url(`pages/managers/${p}.html?m=${mgr.id}${extra}`);
    document.title = `${mgr.name} · ${team} - Grass Touchers`;

    // ---- sub header + hero (same on every manager page)
    SITE.subHeader({
        crumbs: [['Managers', url('pages/managers/index.html')], [mgr.name]],
        tabs: SITE.sectionTabs('managers', page, mgr.id)
    });
    const rec = GT.record(reg);
    const titles = seasons.filter(s => b.finish[`${s}-${mgr.id}`] === 1).length;
    const status = CAREER ? `Career · ${span} · ${seasons.length} seasons${titles ? ` · ${titles}x champion` : ''}` :
        finish ? `${season} final · ${ord(finish)} place` :
        reg.length ? `${season} regular season · week ${Math.max(...reg.map(g => g.week))}` : `${season} season`;
    const seasonSelect = (id, value, list = seasons, cls = 'select') =>
        `<select class="${cls}" id="${id}"><option value="career"${CAREER ? ' selected' : ''}>Career</option>${list.map(s => `<option value="${s}"${s === value ? ' selected' : ''}>${s} season</option>`).join('')}</select>`;
    const onSeason = id => document.getElementById(id).addEventListener('change', e => {
        const u = new URL(location.href); u.searchParams.set('season', e.target.value); location.href = u;
    });
    SITE.hero({
        tools: CAREER_ONLY ? '' : `<label class="hero-season"><span>Season</span>${seasonSelect('hero-season', season, seasons, 'select')}</label>`,
        title: team, logo: GT.logo(mgr.name), size: page === 'overview' ? '' : 'compact', dots: page === 'overview',
        image: `background-${(mgr.id % 18) + 1}.png`,
        meta: [`Manager ${esc(mgr.name)}${division ? ' · ' + esc(division) : ''}`, esc(status),
               `Record: ${rec.text}${reg.length ? ` · ${GT.pts(GT.sum(reg, 'pf') / reg.length)} pts / game` : ''}`]
    });
    if (!CAREER_ONLY) onSeason('hero-season');

    // position chips: the same size everywhere, one or two letters, one color per position
    const POS_COLOR = { QB: '#d1495b', RB: '#2e86ab', WR: '#3b7a57', TE: '#edae49', K: '#8e7dbe', P: '#7a8b99', 'D/ST': '#4a4e69', HC: '#c06c84' };
    const POS_ABBR = { 'D/ST': 'D' };
    const posChip = pos => pos ? `<span class="pchip" style="background:${POS_COLOR[pos] || '#888'}" title="${esc(pos)}">${esc(POS_ABBR[pos] || pos)}</span>` : '';

    function resultRow(g) {
        const d = GT.weekDate(b, g.season, g.week);
        const r = GT.result(g);
        return `<li>
            <img src="${GT.logo(g.opp)}" alt="">
            <div class="main"><span class="res ${r === 'W' ? 'win' : r === 'L' ? 'loss' : ''}">${r}</span>${GT.pts(g.pf)}-${GT.pts(g.pa)}
                <span class="sub">vs</span> <b>${esc(g.opp)}</b></div>
            <div class="date sub">${GT.fmtDate(d)}${CAREER ? `, ${g.season}` : ''}</div>
            <div class="time sub">${g.rank ? `#${g.rank} of the week` : ''}</div>
            <div class="tag">${esc(GT.periodLabel(g.period, g.week))}</div>
        </li>`;
    }

    // ============================================================ OVERVIEW
    async function overview() {
        const [picks, stand, seasonAgg, onRoster] = await Promise.all([
            CAREER ? Promise.all(seasons.map(s => GT.draft(mgr.id, s).then(list => list[0] ? { ...list[0], season: s } : null))).then(l => l.filter(Boolean))
                   : GT.draft(mgr.id, season),
            CAREER ? null : GT.standings(season),
            GT.query(`SELECT t.owner_id AS id, COUNT(*) AS gp,
                        SUM(t.team_score > t.opponent_score) AS w, SUM(t.team_score = t.opponent_score) AS ti,
                        SUM(t.team_score) AS pf, SUM(t.opponent_score) AS pa, MAX(t.team_score) AS hi,
                        SUM(t.score_rank_on_week <= 3) AS top3, SUM(t.bench_score) AS bench
                      FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id
                      WHERE ($s = 0 OR m.season = $s) AND m.season_period = 'Regular' GROUP BY t.owner_id`, { $s: season }),
            CAREER ? new Set() : GT.latestRosterIds(mgr.id, season)
        ]);
        // career: leave out managers with under a quarter of the longest career (a 2-1 record shouldn't top the all-time table)
        if (CAREER) {
            const minGp = Math.round(Math.max(...seasonAgg.map(r => r.gp)) * 0.25);
            for (let i = seasonAgg.length - 1; i >= 0; i--) if (seasonAgg[i].gp < minGp && seasonAgg[i].id !== mgr.id) seasonAgg.splice(i, 1);
        }
        const last = inSeason[inSeason.length - 1];
        const recent = all.filter(g => CAREER || g.season <= season).slice(-8).reverse();   // last eight games up to the season shown

        // card 1: recent results (no future schedule is published yet)
        const card1 = `<div class="card"><div class="card-head"><span class="card-title">Recent Results</span></div>
            <div class="card-body">${recent.length ? `<ul class="mini-list">${recent.map(g => {
                const r = GT.result(g);
                return `<li><img src="${GT.logo(g.opp)}" alt=""><span>vs ${esc(g.opp)}</span>
                    <span class="when">${GT.fmtDate(GT.weekDate(b, g.season, g.week)) || 'Wk ' + g.week}</span>
                    <span class="res ${r === 'W' ? 'win' : 'loss'}">${r} ${GT.pts(g.pf)}</span></li>`;
            }).join('')}</ul>` : '<div class="card-empty">No games yet.</div>'}</div>
            <a class="card-link" href="${mlink('schedule', `&season=${sq}`)}">Full schedule</a></div>`;

        // card 2: draft picks
        const card2 = `<div class="card"><div class="card-head"><span class="card-title">${CAREER ? 'First Pick Each Season' : `${season} Draft Picks`}</span></div>
            <div class="card-body">${picks.length ? `<ul class="mini-list pick-list">${picks.slice(0, 8).map(p => {
                const gone = onRoster.size && !onRoster.has(p.pid);      // traded or dropped since the draft
                return `<li class="${gone ? 'gone' : ''}"${gone ? ' title="No longer on the roster"' : ''}><span class="pk">${CAREER ? `'${String(p.season).slice(2)}` : p.pick}</span><span class="nm">${esc(p.name)}</span><span class="pos">${esc(p.pos)}</span><span class="when">${esc(p.team || '')}</span></li>`;
            }).join('')}</ul>`
                : '<div class="card-empty">No draft on record.</div>'}</div>
            <a class="card-link" href="${mlink('roster-history', `&season=${sq}`)}">All draft picks</a></div>`;

        // card 3: division standings (career: all-time regular season, top 8 by win %, this manager always shown)
        let tableRows;
        if (CAREER) {
            const allTime = seasonAgg.map(r => ({ owner: b.byId[r.id] ? b.byId[r.id].name : '', wins: r.w, losses: r.gp - r.w - r.ti,
                                                  pointsFor: r.pf, pointsAgainst: r.pa, pct: r.gp ? (r.w + r.ti / 2) / r.gp : 0 }))
                .sort((x, y) => y.pct - x.pct);
            tableRows = allTime.slice(0, 8);
            if (!tableRows.some(r => r.owner === mgr.name)) tableRows[7] = allTime.find(r => r.owner === mgr.name) || tableRows[7];
        } else {
            const divRows = stand.divisionStandings.filter(r => r.divisionName === division);
            tableRows = divRows.length ? divRows : stand.standings.slice(0, 8);
        }
        const card3 = `<div class="card"><div class="card-head"><span class="card-title">${CAREER ? 'All-Time Standings' : `${season} ${esc(division || 'League')} Standings`}</span></div>
            <div class="card-body"><table class="mini-table"><colgroup><col><col style="width:11%"><col style="width:11%"><col style="width:20%"><col style="width:20%"></colgroup>
            <thead><tr><th>Manager</th><th>W</th><th>L</th><th>PF</th><th>PA</th></tr></thead><tbody>
            ${tableRows.map(r => `<tr class="${r.owner === mgr.name ? 'me' : ''}"><td>${esc(r.owner)}</td><td>${r.wins}</td><td>${r.losses}</td>
                <td>${Math.round(r.pointsFor)}</td><td>${Math.round(r.pointsAgainst)}</td></tr>`).join('')}
            </tbody></table></div>
            <a class="card-link" href="${CAREER ? url('pages/recordbook/league-records.html') : url(`pages/past-seasons/standings.html?season=${season}`)}">${CAREER ? 'League records' : 'Full standings'}</a></div>`;

        // card 4: manager stats with league ranks
        const me = seasonAgg.find(r => r.id === mgr.id);
        const rank = (key, desc = true) => me ? 1 + seasonAgg.filter(r => desc ? r[key] > me[key] : r[key] < me[key]).length : '-';
        seasonAgg.forEach(r => { r.pct = r.gp ? (r.w + r.ti / 2) / r.gp : 0; r.ppg = r.gp ? r.pf / r.gp : 0; r.papg = r.gp ? r.pa / r.gp : 0; r.diff = r.pf - r.pa; if (CAREER) { r.diff /= r.gp || 1; r.bench /= r.gp || 1; } });
        const kv = (label, value, rk) => `<li><span>${label}</span><b>${value}</b><span class="rk">${rk ? ord(rk) : '-'}</span></li>`;
        const card4 = `<div class="card"><div class="card-head"><span class="card-title">${label} Manager Stats</span></div>
            <div class="card-body">${me ? `<ul class="kv kv-cols"><li class="head"><span>Stat</span><span>Value</span><span>League</span></li>
                ${kv('Record', `${me.w}-${me.gp - me.w - me.ti}${me.ti ? '-' + me.ti : ''}`, rank('pct'))}
                ${kv('Points / game', GT.pts(me.ppg), rank('ppg'))}
                ${kv('Allowed / game', GT.pts(me.papg), rank('papg', false))}
                ${kv(CAREER ? 'Differential / game' : 'Point differential', (me.diff >= 0 ? '+' : '') + GT.pts(me.diff), rank('diff'))}
                ${kv('High score', GT.pts(me.hi), rank('hi'))}
                ${kv('Top-3 weeks', me.top3, rank('top3'))}
                ${kv(CAREER ? 'Bench / game' : 'Bench points', CAREER ? GT.pts(me.bench) : Math.round(me.bench), rank('bench'))}
            </ul>` : '<div class="card-empty">No regular-season games.</div>'}</div>
            <a class="card-link" href="${mlink('stats-history', CAREER ? '&season=career' : '')}">Full stats history</a></div>`;

        // featured game band: most recent matchup
        let band = '';
        if (last) {
            const [mine, theirs] = await Promise.all([GT.roster(mgr.id, last.season, last.week), GT.roster(last.oppId, last.season, last.week)]);
            const top = list => list.filter(GT.isStarter).sort((x, y) => (y.points || 0) - (x.points || 0))[0];
            const t1 = top(mine), t2 = top(theirs);
            const won = last.pf > last.pa, d = GT.weekDate(b, last.season, last.week);
            const margin = Math.abs(last.pf - last.pa);
            band = `<section class="game-band">
                <div class="band-label"><span class="pill pill-dark">Final</span>${esc(GT.periodLabel(last.period, last.week))}${d ? ' · ' + GT.fmtDate(d) : ''}</div>
                <div class="scoreboard">
                    <div class="sb-team"><div class="sb-logo"><img src="${GT.logo(mgr.name)}" alt=""></div>
                        <div class="sb-name">${esc(team)}<small>${esc(mgr.name)} · ${rec.text}</small></div></div>
                    <div class="sb-scores"><div class="sb-score ${won ? 'won' : ''}">${GT.pts(last.pf)}</div><span class="sb-at">AT</span>
                        <div class="sb-score ${!won ? 'won' : ''}">${GT.pts(last.pa)}</div></div>
                    <div class="sb-team right"><div class="sb-name">${esc(GT.teamName(b, last.opp, last.season))}<small>${esc(last.opp)}</small></div>
                        <div class="sb-logo"><img src="${GT.logo(last.opp)}" alt=""></div></div>
                </div>
                <div class="band-foot">
                    <div><h4>${won ? 'Won' : last.pf < last.pa ? 'Lost' : 'Tied'} by ${GT.pts(margin)}</h4>
                        <p>${t1 ? `Top scorer ${esc(t1.name)} ${GT.pts(t1.points)}` : ''}${t2 ? ` · ${esc(last.opp)}: ${esc(t2.name)} ${GT.pts(t2.points)}` : ''}${last.rank ? ` · #${last.rank} score of the week` : ''}</p></div>
                    <div class="band-actions">
                        <a class="btn btn-accent" href="${url(`pages/past-seasons/game-center.html?id=${last.gameId}`)}">Open game center</a>
                        <a class="btn btn-black" href="${mlink('roster-history', `&season=${last.season}&week=${last.week}`)}">View lineup</a>
                    </div>
                </div></section>`;
        }

        content.innerHTML = `<div class="wrap page-pad">
            <div class="card-row">${card1}${card2}${card3}${card4}</div>
            ${band}
            ${await featuredPlayers()}
            ${await scoreRanks()}
            <section class="an-section" id="mgr-stream"></section>
            <section class="split-section">
                <div><div class="eyebrow">${CAREER ? `Career · last ${Math.min(17, all.length)} games` : `${season} season`}</div><h2 class="section-title">Schedule &amp;<br>Results</h2>
                    <p class="section-copy">Regular season and playoffs. Dates are the Thursday each NFL week kicks off.</p>
                    ${CAREER ? `<a class="card-link" href="${mlink('schedule', '&season=career')}">Every game</a>` : ''}</div>
                <ul class="list-rows">${(CAREER ? all.slice(-17).reverse() : inSeason).map(resultRow).join('') || '<li class="muted">No games this season.</li>'}</ul>
            </section></div>`;
        streamTeam();
    }

    // ============================================================ VS THE STREAM TEAM (could the waiver wire have beaten this manager?)
    async function streamTeam() {
        const host = document.getElementById('mgr-stream');
        if (!host || !window.ST) return;
        const field = await ST.games(season);
        const mine = field.filter(g => g.id === mgr.id);
        if (!mine.length) return;
        const lines = ST.lines(field);
        const me = lines.find(l => l.id === mgr.id);
        const qualified = CAREER ? lines.filter(l => l === me || l.g >= Math.max(...lines.map(x => x.g)) * 0.25) : lines;   // career: skip very short careers
        const rankOf = k => 1 + qualified.filter(l => l[k].margin > me[k].margin).length;
        const pct = r => r.pct == null ? '-' : r.pct.toFixed(3).replace(/^0/, '');
        const sg = v => v == null ? '-' : `${v >= 0 ? '+' : ''}${GT.pts(v)}`;
        const lost = mine.filter(g => g.pf < g.sp).sort((x, y) => (x.pf - x.sp) - (y.pf - y.sp));
        const tile = (v, l, s, tip) => `<div class="stat-tile"><div class="v">${v}</div><div class="l" data-tip="${esc(tip)}">${l}</div><div class="s">${s}</div></div>`;
        const ST_TIP = `The Stream Team: each week, the best legal lineup from players on nobody's roster that week (bench and IR count as taken), picked by ESPN's weekly projections and scored with what those players really scored. It is what a manager streaming the waiver wire on projections alone would have put up. A win = the manager outscored it that week.`, BW_TIP = `The Best Wire: the same free agents, but the lineup is picked with hindsight by what they actually scored. It is the most the waiver wire could have produced that week, a ceiling nobody could have set in advance.`;
        host.innerHTML = `<div class="panel-head"><div><div class="eyebrow">${CAREER ? `Career · ${span}` : `${season}`} · regular season + playoffs</div><h2 class="section-title">Vs the Stream Team</h2>
                <p class="section-copy" style="max-width:none">Each week's best lineup from players on nobody's roster: the Stream Team picks it on ESPN's projections, the Best Wire with hindsight.
                Did ${esc(mgr.name)} outplay what was sitting in free agency?</p></div>
                <a class="card-link" href="${url(`pages/past-seasons/overview.html?season=${CAREER ? seasons[0] : season}#season-stream`)}">League vs the Stream Team</a></div>
            <div class="stat-tiles" style="grid-template-columns:repeat(5,minmax(0,1fr))">
                ${tile(ST.recText(me.vsProj), 'Vs Stream Team', `${pct(me.vsProj)} · ${ord(rankOf('vsProj'))} of ${qualified.length} by margin`, `Weeks won-lost against the Stream Team (regular season and playoffs). ${ST_TIP} The rank compares average margins with every other manager in the same span.`)}
                ${tile(sg(me.vsProj.margin), 'Avg margin', 'points a week over the Stream Team', 'Average points a week this manager scored over (+) or under (-) the Stream Team.')}
                ${tile(ST.recText(me.vsBest), 'Vs Best Wire', `${pct(me.vsBest)} · ${ord(rankOf('vsBest'))} of ${qualified.length} by margin`, `Weeks won-lost against the Best Wire. ${BW_TIP}`)}
                ${tile(sg(me.vsBest.margin), 'Margin vs best', 'points a week vs the hindsight wire', 'Average points a week over (+) or under (-) the Best Wire. Nearly every manager is negative: it is a hindsight ceiling.')}
                ${tile(lost.length, 'Weeks the wire won', lost[0] ? `worst: ${CAREER ? lost[0].season + ' ' : ''}W${lost[0].week} by ${GT.pts(lost[0].sp - lost[0].pf)}` : 'never lost to it', 'Weeks the Stream Team outscored this manager, and the biggest of those losses.')}
            </div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:6px">${CAREER ? 'Season by Season' : 'Week by Week'}</h3>
                <p class="muted" style="font-size:11px;margin-bottom:6px">${CAREER ? `Bars = ${esc(mgr.name)} points per game; lines = the Stream Team and Best Wire averages that season` : `Bars = ${esc(mgr.name)}'s score (green beat the Stream Team); lines = the Stream Team and the Best Wire`}</p>
                <div class="db-chart" id="mgr-stream-chart"></div></div>`;
        const c = { accent: SITE.color('accent'), red: SITE.color('danger'), muted: SITE.color('muted'), grid: SITE.color('track'), line: SITE.color('line-strong'), ink: SITE.color('ink') };
        let cats, bars, sp, sb;
        if (CAREER) {
            const ss = [...new Set(mine.map(g => g.season))].sort();
            const of = (s, k) => { const l = mine.filter(g => g.season === s); return +(l.reduce((t, g) => t + g[k], 0) / l.length).toFixed(1); };
            cats = ss.map(String);
            bars = ss.map(s => ({ value: of(s, 'pf'), itemStyle: { color: of(s, 'pf') >= of(s, 'sp') ? c.accent : c.line } }));
            sp = ss.map(s => of(s, 'sp')); sb = ss.map(s => of(s, 'sb'));
        } else {
            cats = mine.map(g => g.period === 'Regular' ? `W${g.week}` : `W${g.week}*`);   // * = playoffs
            bars = mine.map(g => ({ value: g.pf, itemStyle: { color: g.pf >= g.sp ? c.accent : c.red } }));
            sp = mine.map(g => g.sp); sb = mine.map(g => g.sb);
        }
        const chart = echarts.init(document.getElementById('mgr-stream-chart'));
        chart.setOption({
            textStyle: { fontFamily: 'Inter, sans-serif' }, grid: { left: 40, right: 14, top: 28, bottom: 26 },
            legend: { type: 'scroll', top: 0, left: 'center', textStyle: { color: c.muted, fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
            tooltip: { trigger: 'axis', backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 } },
            xAxis: { type: 'category', data: cats, axisLabel: { color: c.muted, fontSize: 10 } },
            yAxis: { type: 'value', axisLabel: { color: c.muted, fontSize: 10 }, splitLine: { lineStyle: { color: c.grid } } },
            series: [{ name: mgr.name, type: 'bar', barMaxWidth: 26, data: bars, itemStyle: { color: c.accent } },
                     { name: 'Stream Team', type: 'line', symbolSize: 6, itemStyle: { color: c.ink }, lineStyle: { color: c.ink, width: 2 }, data: sp },
                     { name: 'Best Wire', type: 'line', symbolSize: 5, itemStyle: { color: c.red }, lineStyle: { color: c.red, type: 'dashed' }, data: sb }]
        });
        window.addEventListener('resize', () => chart.resize());
    }


    // ============================================================ WEEKLY SCORE RANKS (this manager's quads and rank spread vs the field)
    async function scoreRanks() {
        const rows = await GT.query(`SELECT m.season, m.week, t.owner_id AS id, o.display_name AS name, t.score_rank_on_week AS rank,
                                            t.team_score AS pf, t.opponent_score AS pa
                                     FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                                     WHERE m.season_period = 'Regular' AND t.team_score IS NOT NULL AND t.opponent_score IS NOT NULL
                                       AND ($s = 0 OR m.season = $s)`, { $s: season });
        const lines = SR.managers(SR.teamWeeks(rows));
        const me = lines.find(l => l.id === mgr.id);
        if (!me) return '';
        const ranked = lines.filter(l => l.ranked);
        const of = me.ranked ? ` of ${ranked.length}` : ' (unranked: under a full season)';
        const avgPos = me.ranked ? 1 + ranked.filter(l => l.avgRank < me.avgRank).length : null;
        const tile = (v, l, s) => `<div class="stat-tile"><div class="v">${v}</div><div class="l">${l}</div><div class="s">${s}</div></div>`;
        const quad = (q, k) => {
            const lg = lines.leagueQuads[k].pct, p = q.g ? q.w / q.g : null;
            const better = p != null && lg != null && p >= lg;
            return `<div class="sr-quad" style="--c:${p == null ? 'var(--line)' : better ? 'var(--accent)' : 'var(--danger)'}">
                <span>Score ranked ${SR.QUADS[k]}</span><b>${SR.pct3(p)}</b>
                <small>${q.g ? `${q.w}-${q.g - q.w} in ${q.g} week${q.g === 1 ? '' : 's'}` : 'no weeks'} · league ${SR.pct3(lg)}</small></div>`;
        };
        return `<section class="an-section">
            <div class="panel-head"><div><div class="eyebrow">${CAREER ? `Career · ${span}` : `${season} regular season`}</div><h2 class="section-title">Weekly Score Ranks</h2>
                <p class="section-copy" style="max-width:none">Where ${esc(mgr.name)}'s score landed against the whole league each week (1 = highest), and how often it won from there.</p></div>
                <a class="card-link" href="${url(`pages/stats.html${CAREER ? '' : `?season=${season}`}#moneyball`)}">Every manager in Moneyball</a></div>
            <div class="stat-tiles tiles-6" style="grid-template-columns:repeat(6,minmax(0,1fr))">
                ${tile(me.avgRank.toFixed(1), 'Avg weekly rank', avgPos ? `${ord(avgPos)}${of}` : of.trim())}
                ${tile(SR.pct3(me.allPlay), 'All-play PCT', me.pos ? `${ord(me.pos)}${of}` : of.trim())}
                ${tile(`${me.luck >= 0 ? '+' : ''}${me.luck.toFixed(1)}`, 'Luck', `${SR.pct3(me.winPct)} actual vs ${SR.pct3(me.allPlay)} all-play`)}
                ${tile(me.top1, 'Top score', 'weeks with the high score')}
                ${tile(me.top3, 'Top 3', 'weeks in the top 3')}
                ${tile(me.bottom3, 'Bottom 3', `${me.last} week${me.last === 1 ? '' : 's'} dead last`)}
            </div>
            <div class="sr-quads" style="margin-top:12px">${me.quads.map(quad).join('')}</div>
            <div class="panel" style="margin-top:12px"><h3 class="panel-title" style="margin-bottom:12px">Score Rank Spread</h3>
                ${SR.matrix(lines, { focus: mgr.id, only: [mgr.id] })}
                <p class="an-note">Weeks ${esc(mgr.name)} finished at each weekly score rank over ${me.games} regular-season games${CAREER ? ' (every season)' : ''}. Shading is on the same scale as the league matrix in Moneyball.</p></div>
        </section>`;
    }

    // ============================================================ FEATURED PLAYERS (this manager's season)
    async function featuredPlayers() {
        const [rows, best] = await Promise.all([
            GT.query(`SELECT p.player_id AS pid, p.name, p.position AS pos, COALESCE(MAX(frp.pro_team), p.pro_team) AS team,
                             COUNT(*) AS starts, SUM(frp.actual_points) AS pts
                      FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                      JOIN players p ON p.player_id = frp.player_id
                      WHERE fr.owner_id = $id AND ($s = 0 OR fr.season = $s) AND frp.slot_position NOT IN ('BE','IR') AND frp.actual_points IS NOT NULL
                      GROUP BY p.player_id ORDER BY pts DESC LIMIT 6`, { $id: mgr.id, $s: season }),
            GT.query(`SELECT p.player_id AS pid, p.name, p.position AS pos, COALESCE(frp.pro_team, p.pro_team) AS team, fr.season, fr.week, frp.actual_points AS pts
                      FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                      JOIN players p ON p.player_id = frp.player_id
                      WHERE fr.owner_id = $id AND ($s = 0 OR fr.season = $s) AND frp.slot_position NOT IN ('BE','IR') AND frp.actual_points IS NOT NULL
                      ORDER BY frp.actual_points DESC LIMIT 1`, { $id: mgr.id, $s: season })
        ]);
        if (!rows.length) return '';
        const shot = r => r.pid > 0 ? `https://a.espncdn.com/i/headshots/nfl/players/full/${r.pid}.png` : url(`assets/nfl-logos/${String(r.team || 'nfl').toLowerCase()}.png`);
        const href = r => r.pid > 0 ? `href="${url(`pages/players/stats.html?id=${r.pid}`)}"` : '';
        const fallback = `onerror="this.src='${url('assets/nfl-logos/nfl.png')}';this.onerror=null"`;
        const row = r => `<a class="fp-row" ${href(r)}><span class="fp-shot"><img src="${shot(r)}" alt="" ${fallback}></span>
            <span class="fp-who"><b>${esc(r.name)}</b><small>${esc(r.pos)} · ${esc(r.team || '')}</small><em>${r.starts} start${r.starts === 1 ? '' : 's'} · ${GT.pts(r.pts / r.starts)} per start</em></span>
            <span class="fp-num">${GT.pts(r.pts)}</span></a>`;
        const call = (title, r, line) => r ? `<div class="fp-callout"><h3>${title}</h3>
            <a class="fp-call" ${href(r)}><span class="fp-shot lg"><img src="${shot(r)}" alt="" ${fallback}></span>
            <span class="fp-who"><b>${esc(r.name)} · ${esc(r.pos)}</b><small>${esc(line)}</small></span></a></div>` : '';
        const top = rows[0], mostStarts = rows.slice().sort((x, y) => y.starts - x.starts || y.pts - x.pts)[0];
        return `<section class="fp-section with-photo">
            <div><div class="eyebrow">${CAREER ? `Career · ${span}` : `${season} roster`}</div><h2 class="section-title">Featured Players</h2>
                <div class="fp-photo" style="background-image:url('${url(`assets/images/background-${(mgr.id % 18) + 1}.png`)}')"><img src="${GT.logo(mgr.name)}" alt=""></div></div>
            <div><div class="fp-grid">${rows.map(row).join('')}</div>
                <a class="card-link" href="${mlink('roster-history', `&season=${sq}`)}">View full roster</a></div>
        </section>
        <div class="fp-callouts">
            ${call(`${label} Points Leader`, top, `${GT.pts(top.pts)} pts in ${top.starts} starts`)}
            ${call(`${label} Best Game`, best[0], best[0] ? `${GT.pts(best[0].pts)} pts · ${CAREER ? `${best[0].season} ` : ''}week ${best[0].week}` : '')}
            ${call(`${label} Most Starts`, mostStarts, `${mostStarts.starts} starts · ${GT.pts(mostStarts.pts)} pts`)}
        </div>`;
    }

    // ============================================================ SCHEDULE & RESULTS
    function schedule() {
        const rows = inSeason;
        const allReg = all.filter(g => g.period === 'Regular');
        const hi = rows.length ? Math.max(...rows.map(g => g.pf)) : null;
        const tile = (v, l, s = '') => `<div class="stat-tile"><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
        // head to head, all seasons
        const h2h = {};
        all.forEach(g => { (h2h[g.opp] = h2h[g.opp] || []).push(g); });
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:40px">
                <div><div class="eyebrow">${CAREER ? `Career · ${span}` : `${season} season`}</div><h2 class="section-title">Schedule &amp; Results</h2>
                    <p class="section-copy" style="max-width:none">Every ${esc(mgr.name)} matchup, regular season and playoffs.</p></div>
            </div>
            <div class="stat-tiles tiles-4">
                ${tile(GT.record(reg).text, 'Regular season')}
                ${CAREER ? tile(titles, 'Championships', `${seasons.length} seasons`) : tile(finish ? ord(finish) : '-', 'Final place')}
                ${tile(GT.pts(GT.sum(rows, 'pf')), 'Points for')}
                ${tile(hi == null ? '-' : GT.pts(hi), 'High score')}
            </div>
            ${CAREER ? seasons.map(s => {
                const list = all.filter(g => g.season === s), place = b.finish[`${s}-${mgr.id}`];
                return `<div class="eyebrow" style="margin:30px 0 10px">${s} season · ${GT.record(list.filter(g => g.period === 'Regular')).text}${place ? ` · ${ord(place)} place` : ''}</div>
                    <ul class="list-rows">${list.map(resultRow).join('')}</ul>`;
            }).join('') : `<ul class="list-rows" style="margin-top:22px">${rows.map(resultRow).join('') || '<li class="muted">No games this season.</li>'}</ul>`}
            <div class="panel"><div class="panel-head"><h3 class="panel-title">Head to Head · All Seasons</h3>
                <span class="muted">Career record ${GT.record(allReg).text} regular season</span></div>
                <div class="table-scroll"><table class="data-table">${SITE.cols('26%', '11%', '13%', '11%', '13%', '13%', '13%')}<thead><tr><th>Opponent</th><th class="num">Games</th><th class="num">Record</th>
                    <th class="num">Win %</th><th class="num">PF / G</th><th class="num">PA / G</th><th class="num">Last met</th></tr></thead><tbody>
                ${Object.entries(h2h).sort((x, y) => y[1].length - x[1].length).map(([opp, list]) => {
                    const r = GT.record(list), lastG = list[list.length - 1];
                    return `<tr><td><div class="team-cell"><img src="${GT.logo(opp)}" alt="">${esc(opp)}</div></td><td class="num">${list.length}</td>
                        <td class="num">${r.text}</td><td class="num">${(r.pct * 100).toFixed(0)}%</td>
                        <td class="num">${GT.pts(GT.sum(list, 'pf') / list.length)}</td><td class="num">${GT.pts(GT.sum(list, 'pa') / list.length)}</td>
                        <td class="num">${lastG.season} W${lastG.week}</td></tr>`;
                }).join('')}</tbody></table></div></div></div>`;
    }

    // ============================================================ ROSTER HISTORY
    async function rosterHistory() {
        const weeks = [...new Set(inSeason.map(g => g.week))].sort((x, y) => x - y);
        const week = Number(param('week')) || weeks[weeks.length - 1];
        const [lineup, picks, starts, moves] = await Promise.all([
            week && !CAREER ? GT.roster(mgr.id, season, week) : [],
            CAREER ? Promise.all(seasons.map(s => GT.draft(mgr.id, s).then(list => list.slice(0, 3).map(x => ({ ...x, season: s }))))).then(l => l.flat())
                   : GT.draft(mgr.id, season),
            GT.query(`SELECT p.name, p.position AS pos, COUNT(*) AS starts, SUM(frp.actual_points) AS pts
                      FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                      JOIN players p ON p.player_id = frp.player_id
                      WHERE fr.owner_id = $id AND ($s = 0 OR fr.season = $s) AND frp.slot_position NOT IN ('BE','IR')
                      GROUP BY p.player_id ORDER BY pts DESC LIMIT ${CAREER ? 24 : 12}`, { $id: mgr.id, $s: season }),
            GT.query(`SELECT t.processed_at AS at, t.type, ti.item_type AS item, p.name, p.position AS pos,
                             ti.from_owner_id AS fromId, ti.to_owner_id AS toId
                      FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.transaction_id
                      JOIN players p ON p.player_id = ti.player_id
                      WHERE ($s = 0 OR t.season = $s) AND t.status = 'EXECUTED' AND ti.item_type IN ('ADD','DROP','TRADE')
                        AND (ti.from_owner_id = $id OR ti.to_owner_id = $id)
                      ORDER BY t.processed_at DESC LIMIT 40`, { $id: mgr.id, $s: season })
        ]);
        const game = inSeason.find(g => g.week === week);
        lineup.sort(GT.slotSort);
        const starters = lineup.filter(GT.isStarter), bench = lineup.filter(r => !GT.isStarter(r));
        const row = r => `<tr><td><b>${esc(r.slot)}</b></td><td>${playerLink(r)}</td><td>${esc(r.pos)}</td><td>${esc(r.team || '')}</td>
            <td class="num">${GT.pts(r.points)}</td><td class="num muted">${GT.pts(r.proj)}</td></tr>`;
        const moveText = m => {
            const who = id => esc(b.byId[id] ? b.byId[id].name : '');
            if (m.item === 'TRADE') return m.toId === mgr.id ? `Traded for from ${who(m.fromId)}` : `Traded to ${who(m.toId)}`;
            return m.item === 'ADD' ? (m.type === 'WAIVER' ? 'Waiver claim' : 'Free agent add') : 'Dropped';
        };
        const lineupPanel = CAREER ? '' : `
            <div class="panel" style="margin-top:34px"><div class="panel-head">
                <div><div class="eyebrow">${season} · week ${week || '-'}</div><h3 class="panel-title">Lineup</h3></div>
                <div class="section-tools" style="margin:0">
                    <select class="select" id="roster-week">${weeks.map(w => `<option value="${w}"${w === week ? ' selected' : ''}>Week ${w}</option>`).join('')}</select></div>
                </div>
                ${game ? `<p class="muted" style="margin-bottom:12px">${GT.result(game)} ${GT.pts(game.pf)}-${GT.pts(game.pa)} vs ${esc(game.opp)} · ${esc(GT.periodLabel(game.period, game.week))}</p>` : ''}
                <div class="table-scroll"><table class="data-table">${SITE.cols('10%', '38%', '10%', '12%', '15%', '15%')}<thead><tr><th>Slot</th><th>Player</th><th>Pos</th><th>NFL</th><th class="num">Pts</th><th class="num">Proj</th></tr></thead>
                <tbody>${starters.map(row).join('')}${bench.length ? `<tr class="group"><td colspan="6">Bench</td></tr>${bench.map(row).join('')}` : ''}
                ${lineup.length ? '' : '<tr><td colspan="6" class="muted">No lineup saved for this week.</td></tr>'}</tbody></table></div></div>`;
        content.innerHTML = `<div class="wrap page-pad">${lineupPanel}
            <div class="card-row two" style="margin-top:${CAREER ? 34 : 18}px">
                <div class="panel" style="margin:0"><h3 class="panel-title" style="margin-bottom:12px">${CAREER ? 'Top 3 Picks Each Season' : `${season} Draft`}</h3>
                    <div class="table-scroll"><table class="data-table">${CAREER ? SITE.cols('15%', '15%', '45%', '12%', '13%') : SITE.cols('15%', '55%', '15%', '15%')}<thead><tr>${CAREER ? '<th>Season</th>' : ''}<th class="num">Pick</th><th>Player</th><th>Pos</th><th>NFL</th></tr></thead><tbody>
                    ${picks.map(p => `<tr>${CAREER ? `<td>${p.season}</td>` : ''}<td class="num">${p.pick}</td><td>${esc(p.name)}</td><td>${esc(p.pos)}</td><td>${esc(p.team || '')}</td></tr>`).join('') || `<tr><td colspan="${CAREER ? 5 : 4}" class="muted">No draft on record.</td></tr>`}
                    </tbody></table></div></div>
                <div class="panel" style="margin:0"><h3 class="panel-title" style="margin-bottom:12px">${CAREER ? 'Career ' : ''}Top Starters</h3>
                    <div class="table-scroll"><table class="data-table">${SITE.cols('52%', '14%', '17%', '17%')}<thead><tr><th>Player</th><th>Pos</th><th class="num">Starts</th><th class="num">Pts</th></tr></thead><tbody>
                    ${starts.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.pos)}</td><td class="num">${s.starts}</td><td class="num">${GT.pts(s.pts)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No lineups saved.</td></tr>'}
                    </tbody></table></div></div>
            </div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">${CAREER ? 'Latest 40 Transactions' : `${season} Transactions`}</h3>
                <div class="table-scroll"><table class="data-table">${SITE.cols('15%', '35%', '38%', '12%')}<thead><tr><th>Date</th><th>Move</th><th>Player</th><th>Pos</th></tr></thead><tbody>
                ${moves.map(m => `<tr><td>${m.at ? new Date(m.at).toLocaleDateString('en-US', CAREER ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' }) : ''}</td><td>${moveText(m)}</td><td>${esc(m.name)}</td><td>${esc(m.pos)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No transactions.</td></tr>'}
                </tbody></table></div></div></div>`;
        if (!CAREER) document.getElementById('roster-week').addEventListener('change', e => {
            const u = new URL(location.href); u.searchParams.set('week', e.target.value); location.href = u;
        });
    }
    const playerLink = r => r.playerId > 0 ? `<a href="${url(`pages/players/stats.html?id=${r.playerId}`)}"><b>${esc(r.name)}</b></a>` : `<b>${esc(r.name)}</b>`;

    // ============================================================ MANAGER STATS HISTORY
    async function statsHistory() {
        const accolades = await GT.query(`SELECT season, award FROM accolades WHERE owner_id = $id ORDER BY season`, { $id: mgr.id });
        const allReg = all.filter(g => g.period === 'Regular');
        const career = GT.record(allReg);
        const places = seasons.map(s => b.finish[`${s}-${mgr.id}`]).filter(Boolean);
        const titles = places.filter(p => p === 1).length;
        // seasons that reached the championship side: play-in, playoffs or the title game
        const playoffTrips = new Set(all.filter(g => ['Post-WC', 'Post-WB', 'Championship'].includes(g.period)).map(g => g.season)).size;
        const tile = (v, l, s = '') => `<div class="stat-tile"><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
        const bySeason = seasons.map(s => {
            const list = all.filter(g => g.season === s), r = list.filter(g => g.period === 'Regular');
            const post = list.filter(g => g.period !== 'Regular');
            return { s, r, post, rec: GT.record(r), pf: GT.sum(r, 'pf'), pa: GT.sum(r, 'pa'),
                     hi: r.length ? Math.max(...r.map(g => g.pf)) : 0, place: b.finish[`${s}-${mgr.id}`],
                     div: b.division[`${s}-${mgr.id}`], awards: accolades.filter(a => a.season === s).map(a => a.award) };
        });
        content.innerHTML = `<div class="wrap page-pad">
            <div class="stat-tiles tiles-7" style="margin-top:34px">
                ${tile(seasons.length, 'Seasons', `${mgr.first}-${mgr.last}`)}
                ${tile(career.text, 'Regular season', `${(career.pct * 100).toFixed(1)}% wins`)}
                ${tile(titles, 'Championships')}
                ${tile(playoffTrips, 'Playoff trips', `of ${seasons.length} seasons`)}
                ${tile(places.length ? (places.reduce((a, p) => a + p, 0) / places.length).toFixed(1) : '-', 'Average finish')}
                ${tile(GT.pts(GT.sum(allReg, 'pf') / (allReg.length || 1)), 'Points / game')}
                ${tile(allReg.length ? GT.pts(Math.max(...allReg.map(g => g.pf))) : '-', 'Career high')}
            </div>
            <section class="an-section" id="analytics"><div class="loading">Comparing against the field...</div></section>
            <div class="panel"><div class="panel-head"><h3 class="panel-title">Season by Season</h3></div>
                <div class="table-scroll"><table class="data-table" style="min-width:1000px">${SITE.cols('6%', '17%', '13%', '7%', '7%', '7%', '7%', '6%', '6%', '7%', '6%', '11%')}<thead><tr><th>Season</th><th>Team</th><th>Division</th><th class="num">Record</th>
                    <th class="num">PF</th><th class="num">PA</th><th class="num">Diff</th><th class="num">PF / G</th><th class="num">High</th>
                    <th class="num">Playoffs</th><th class="num">Finish</th><th>Awards</th></tr></thead><tbody>
                ${bySeason.map(x => `<tr><td><a href="${mlink('schedule', `&season=${x.s}`)}"><b>${x.s}</b></a></td><td>${esc(GT.teamName(b, mgr.name, x.s))}</td><td>${esc(x.div || '')}</td>
                    <td class="num">${x.rec.text}</td><td class="num">${GT.pts(x.pf)}</td><td class="num">${GT.pts(x.pa)}</td>
                    <td class="num ${x.pf >= x.pa ? 'win' : 'loss'}">${(x.pf >= x.pa ? '+' : '') + GT.pts(x.pf - x.pa)}</td>
                    <td class="num">${x.r.length ? GT.pts(x.pf / x.r.length) : '-'}</td><td class="num">${GT.pts(x.hi)}</td>
                    <td class="num">${x.post.length ? GT.record(x.post).text : '-'}</td><td class="num"><b>${x.place ? ord(x.place) : '-'}</b></td>
                    <td class="muted">${esc(x.awards.join(', '))}</td></tr>`).join('')}
                </tbody></table></div></div></div>`;
        managerAnalytics();
    }

    // ============================================================ VS THE FIELD (this season, every manager)
    async function managerAnalytics() {
        const host = document.getElementById('analytics');
        const [weeks, slots, moves, metrics] = await Promise.all([
            GT.query(`SELECT o.display_name AS owner, m.season, m.week, t.team_score AS pf, t.opponent_score AS pa, t.score_rank_on_week AS rank
                      FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                      WHERE ($s = 0 OR m.season = $s) AND m.season_period = 'Regular' AND t.team_score IS NOT NULL`, { $s: season }),
            GT.query(`SELECT o.display_name AS owner, frp.slot_position AS slot, COUNT(DISTINCT fr.week) AS weeks, SUM(frp.actual_points) AS pts
                      FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id JOIN owners o ON o.owner_id = fr.owner_id
                      WHERE ($s = 0 OR fr.season = $s) AND frp.slot_position NOT IN ('BE','IR') AND frp.actual_points IS NOT NULL
                      GROUP BY o.owner_id, frp.slot_position`, { $s: season }),
            GT.query(`SELECT o.display_name AS owner, m.kind, m.grade FROM transaction_moves m JOIN owners o ON o.owner_id = m.owner_id
                      WHERE ($s = 0 OR m.season = $s) AND m.provisional = 0`, { $s: season }),
            typeof RosterMetrics !== 'undefined' ? RosterMetrics.load().catch(() => null) : null
        ]);
        if (!weeks.length) { host.innerHTML = ''; return; }
        // ---- every manager's season line
        const owners = [...new Set(weeks.map(w => w.owner))];
        const byWeek = {};
        weeks.forEach(w => { w.key = `${w.season}|${w.week}`; (byWeek[w.key] = byWeek[w.key] || []).push(w); });
        const nWeek = w => byWeek[w].length;
        const GPA = { A: 4, B: 3, C: 2, D: 1, F: 0 };
        const line = owner => {
            const mine = weeks.filter(w => w.owner === owner).sort((a, b) => a.season - b.season || a.week - b.week);
            const pts = mine.map(w => w.pf).sort((a, b) => a - b), n = pts.length;
            const mean = pts.reduce((a, b) => a + b, 0) / n;
            const q = f => pts[Math.min(n - 1, Math.round(f * (n - 1)))];
            const wins = mine.filter(w => w.pf > w.pa).length + mine.filter(w => w.pf === w.pa).length / 2;
            const allPlay = mine.reduce((t, w) => t + byWeek[w.key].filter(o => o.owner !== owner && o.pf < w.pf).length
                                                   + byWeek[w.key].filter(o => o.owner !== owner && o.pf === w.pf).length / 2, 0);
            const allPlayGames = mine.reduce((t, w) => t + nWeek(w.key) - 1, 0);
            const pooled = metrics ? RosterMetrics.pool(mine.map(w => metrics.get(`${owner}|${w.season}|${w.week}`)).filter(Boolean)) : null;
            const mv = moves.filter(m => m.owner === owner);
            const gpa = kind => { const g = mv.filter(m => m.kind === kind && m.grade); return g.length ? g.reduce((t, m) => t + GPA[m.grade], 0) / g.length : null; };
            const slotPts = {};
            slots.filter(r => r.owner === owner).forEach(r => { slotPts[r.slot] = r.pts / n; });
            return { owner, n, ppg: mean, pa: mine.reduce((t, w) => t + w.pa, 0) / n, ceil: q(0.9), floor: q(0.1),
                     vol: Math.sqrt(pts.reduce((t, x) => t + (x - mean) ** 2, 0) / n) / mean,
                     top3: mine.filter(w => w.rank && w.rank <= 3).length / n * 100,
                     bot3: mine.filter(w => w.rank && w.rank > nWeek(w.key) - 3).length / n * 100,
                     win: wins / n * 100, allPlay: allPlayGames ? allPlay / allPlayGames * 100 : null,
                     eff: pooled ? pooled.eff : null, fp: pooled ? pooled.fp : null,
                     pickups: mv.filter(m => m.kind === 'PICKUP').length, trades: mv.filter(m => m.kind === 'TRADE').length,
                     pickupGpa: gpa('PICKUP'), tradeGpa: gpa('TRADE'), slotPts, weekly: mine };
        };
        let field = owners.map(line);
        const me = field.find(f => f.owner === mgr.name);
        if (!me) { host.innerHTML = `<p class="muted">No ${season} regular-season games for ${esc(mgr.name)}.</p>`; return; }
        // career: compare against managers with at least a quarter of the longest career (the manager shown always counts)
        const minGames = CAREER ? Math.round(Math.max(...field.map(f => f.n)) * 0.25) : 0;
        if (CAREER) field = field.filter(f => f.n >= minGames || f === me);
        me.luck = me.allPlay != null ? me.win - me.allPlay : null;
        field.forEach(f => { f.luck = f.allPlay != null ? f.win - f.allPlay : null; });
        const f1 = v => v == null ? '-' : v.toFixed(1), f2 = v => v == null ? '-' : v.toFixed(2), pc = v => v == null ? '-' : `${v.toFixed(1)}%`;
        const sg = v => v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
        // [label, key, higherIsBetter, format, category] -- category 'luck' is shown but left out of the grades
        const M = [
            ['Points / game', 'ppg', true, f1, 'score'], ['Ceiling (90th pct week)', 'ceil', true, f1, 'score'], ['Floor (10th pct week)', 'floor', true, f1, 'score'],
            ['Top-3 weeks', 'top3', true, pc, 'score'], ['Bottom-3 weeks', 'bot3', false, pc, 'score'], ['Volatility', 'vol', false, f2, 'score'],
            ['All-play win %', 'allPlay', true, pc, 'results'], ['Actual win %', 'win', true, pc, 'results'],
            ['Luck (win % − all-play %)', 'luck', true, sg, 'luck'], ['Points against / game', 'pa', false, f1, 'luck'],
            ['Lineup efficiency', 'eff', true, pc, 'lineup'], ['FP+ (vs projections)', 'fp', true, f1, 'lineup'],
            ['Pickups', 'pickups', true, v => String(v ?? '-'), 'moves'], ['Pickup GPA', 'pickupGpa', true, f2, 'moves'],
            ['Trades', 'trades', true, v => String(v ?? '-'), 'moves'], ['Trade GPA', 'tradeGpa', true, f2, 'moves']
        ];
        const rows = M.map(([label, k, hb, fmt, cat]) => ({ label, cat, shown: fmt(me[k]), p: AN.percentile(me[k], field.map(f => f[k]), hb) }));
        const grade = cats => AN.grade(rows.filter(r => cats.includes(r.cat)).map(r => r.p));
        const SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST', 'P', 'HC'].filter(sl => field.some(f => f.slotPts[sl]));
        const slotRows = SLOTS.map(sl => ({ label: `${sl} points / week`, shown: f1(me.slotPts[sl] ?? 0), p: AN.percentile(me.slotPts[sl] ?? 0, field.map(f => f.slotPts[sl] ?? 0), true) }));
        const block = (title, list) => `<div class="an-block"><h4>${title}</h4>${list.map(r => AN.bar(r.label, r.shown, r.p)).join('')}</div>`;
        // weekly score vs the league average, as bars
        const chart = (() => {
            const W = 1060, H = 190, L = 40, R = 10, T = 14, B = 26;
            const mean = list => list.reduce((t, x) => t + x.pf, 0) / list.length;
            const items = CAREER
                ? seasons.slice().reverse().map(s => {
                    const mineS = me.weekly.filter(w => w.season === s);
                    if (!mineS.length) return null;
                    const wins = mineS.filter(w => w.pf > w.pa).length;
                    return { x: s, pf: mean(mineS), pa: mean(mineS.map(w => ({ pf: w.pa }))), won: wins * 2 > mineS.length,
                             avg: mean(weeks.filter(w => w.season === s)), tip: `${s}: ${mean(mineS).toFixed(1)} per game, ${wins}-${mineS.length - wins}` };
                }).filter(Boolean)
                : me.weekly.map(w => ({ x: w.week, pf: w.pf, pa: w.pa, won: w.pf > w.pa, avg: mean(byWeek[w.key]),
                                        tip: `Week ${w.week}: ${w.pf.toFixed(1)} (${w.pf > w.pa ? 'W' : 'L'} vs ${w.pa.toFixed(1)})` }));
            const avgs = items.map(i => i.avg);
            const max = Math.max(...items.map(i => i.pf), ...avgs) * 1.08;
            const bw = (W - L - R) / items.length;
            const y = v => T + (1 - v / max) * (H - T - B);
            let svg = '';
            [0, 0.25, 0.5, 0.75, 1].forEach(f => { const v = max * f; svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="an-grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="an-t">${Math.round(v)}</text>`; });
            items.forEach((w, i) => {
                const x = L + i * bw;
                svg += `<rect x="${(x + bw * 0.18).toFixed(1)}" y="${y(w.pf).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${(H - B - y(w.pf)).toFixed(1)}" class="${w.won ? 'an-bar-w' : 'an-bar-l'}"><title>${w.tip}, league average ${avgs[i].toFixed(1)}</title></rect>
                        <text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="an-t">${w.x}</text>`;
            });
            svg += `<polyline points="${avgs.map((a, i) => `${(L + i * bw + bw / 2).toFixed(1)},${y(a).toFixed(1)}`).join(' ')}" class="an-avg-line"/>`;
            return `<div class="an-chart"><div class="an-strip-label">${CAREER ? `Season by season · bars = ${esc(mgr.name)} points per game (green winning record, grey losing) · line = league average`
                                                       : `Week by week · bars = ${esc(mgr.name)} (green win, grey loss) · line = league average`}</div>
                <svg viewBox="0 0 ${W} ${H}" class="an-svg">${svg}</svg></div>`;
        })();
        host.innerHTML = `
            <div class="panel-head"><div><div class="eyebrow">${CAREER ? `Career regular season (${span}) · vs ${field.length} managers with ${minGames}+ games` : `${season} regular season · vs all ${field.length} managers`}</div><h2 class="section-title">Vs The Field</h2></div></div>
            <div class="an-top"><div class="an-grades">
                ${AN.gradeBadge('Overall', grade(['score', 'results', 'lineup']))}${AN.gradeBadge('Scoring', grade(['score']))}
                ${AN.gradeBadge('Lineup', grade(['lineup']))}${AN.gradeBadge('Roster moves', grade(['moves']))}${AN.gradeBadge('Positional', AN.grade(slotRows.map(r => r.p)))}</div>
                <div class="an-rank"><b>#${field.slice().sort((a, b) => b.ppg - a.ppg).findIndex(f => f.owner === mgr.name) + 1}</b><span>in points per game<br>of ${field.length} managers</span></div></div>
            <div class="an-cols">${block('Scoring', rows.filter(r => r.cat === 'score'))}${block('Results & Luck', rows.filter(r => r.cat === 'results' || r.cat === 'luck'))}</div>
            <div class="an-cols">${block('Lineup & Roster Moves', rows.filter(r => r.cat === 'lineup' || r.cat === 'moves'))}${block('Positional Strength', slotRows)}</div>
            ${chart}
            ${AN.strip(field.map(f => f.allPlay), [{ label: mgr.name, value: me.allPlay, color: AN.color(rows.find(r => r.label === 'All-play win %').p) }],
                       { label: CAREER ? 'Career all-play win %, every qualified manager' : `All-play win %, every manager in ${season}`, fmt: v => `${v.toFixed(0)}%` })}
            ${AN.legend()}
            <p class="an-note">Percentiles compare ${esc(mgr.name)} with ${CAREER ? `every manager's pooled regular seasons (${span}); managers need ${minGames}+ games to count` : `every manager in the ${season} regular season`}. Luck rows are shown but left out of the grades. All-play win % is the record against every other team every week. Lineup efficiency and FP+ match the Recordbook.</p>`;
    }

    // ============================================================ VS THE NFL
    // The manager against the NFL GMs (nflgm.js): every NFL team's own roster played as a fantasy team each week.
    // Pick a team: record and margin against it, week by week, and the two lineups side by side for any week.
    async function vsNfl() {
        const [teams, gmAll] = await Promise.all([NG.teams(), CAREER ? Promise.all(seasons.map(s => NG.weeks(s).then(l => l.map(r => ({ ...r, season: s }))))).then(l => l.flat())
                                                                        : NG.weeks(season).then(l => l.map(r => ({ ...r, season })))]);
        const mine = inSeason.filter(g => g.pf != null);
        const nameOf = Object.fromEntries(teams.map(t => [t.abbr, t.name]));
        const NFL_TIP = 'An NFL GM is an NFL team played as a fantasy team: each week, the best legal lineup in this league\'s format from that team\'s own players, D/ST and head coach included. Proj picks it by ESPN\'s projections and scores it with what the players really scored, the way a manager has to pick. Best picks it with hindsight. A team on its bye has no lineup that week.';
        let kind = param('kind') === 'best' ? 'best' : 'proj';
        const key = (s, w) => `${s}-${w}`;
        // every NFL team against this manager, in the weeks both had a score
        const lines = () => {
            const gm = gmAll.filter(r => r.kind === kind), byKey = {};
            gm.forEach(r => { (byKey[key(r.season, r.week)] = byKey[key(r.season, r.week)] || []).push(r); });
            const out = {};
            teams.forEach(t => { out[t.abbr] = { abbr: t.abbr, name: t.name, w: 0, l: 0, t: 0, margin: 0, g: 0, pts: 0 }; });
            mine.forEach(g => (byKey[key(g.season, g.week)] || []).forEach(r => {
                const o = out[r.team]; if (!o) return;
                o.g++; o.pts += r.score; o.margin += g.pf - r.score;
                if (g.pf > r.score) o.w++; else if (g.pf < r.score) o.l++; else o.t++;
            }));
            return Object.values(out).filter(o => o.g).map(o => ({ ...o, ppg: o.pts / o.g, avgMargin: o.margin / o.g }));
        };
        let ls = lines();
        if (!ls.length) { content.innerHTML = `<div class="wrap page-pad"><p class="muted" style="margin-top:34px">No NFL GM data for ${label}.</p></div>`; return; }
        const initial = teams.find(t => t.abbr === param('team')) ? param('team') : ls.slice().sort((x, y) => y.ppg - x.ppg)[0].abbr;
        let pick = initial;
        const sg = v => `${v >= 0 ? '+' : ''}${GT.pts(v)}`;
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">${esc(mgr.name)} · ${label}</div><h2 class="section-title">Vs the NFL</h2>
                <p class="section-copy">Every NFL team played as a fantasy team in this league's format, from its own roster. Pick a front office and see how ${esc(mgr.name)}'s lineups stack up.</p></div>
                <div class="vn-ctl"><label class="sx-f"><span>NFL team</span><select class="select" id="vn-team">${teams.slice().sort((x, y) => x.name.localeCompare(y.name)).map(t =>
                    `<option value="${t.abbr}"${t.abbr === pick ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
                    <span class="seg" id="vn-kind"><button data-k="proj"${kind === 'proj' ? ' class="on"' : ''} data-tip="${esc(NFL_TIP)}">Proj</button><button data-k="best"${kind === 'best' ? ' class="on"' : ''} data-tip="Best: each NFL roster's best lineup in hindsight.">Best</button></span></div></div>
            <div class="vn-team" id="vn-head"></div>
            <div class="db-kpis vn-kpis" id="vn-kpis"></div>
            ${CAREER ? '' : `<div class="panel"><h3 class="panel-title" style="margin-bottom:10px">Week by Week</h3><div id="vn-chart" class="vn-chart"></div></div>
            <div class="panel"><div class="panel-head" style="margin-bottom:10px"><h3 class="panel-title">Lineup vs Lineup</h3>
                <select class="select" id="vn-week"></select></div><div class="vn-lineups" id="vn-lineups"></div></div>`}
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px" data-tip="${esc(NFL_TIP)}">Against All 32</h3>
                <div class="table-scroll"><table class="data-table" style="min-width:640px">${SITE.cols('36%', '14%', '16%', '16%', '18%')}<thead><tr>
                    <th>NFL GM</th><th class="num">Record</th><th class="num" data-tip="${esc(`${mgr.name}'s average points a week over (+) or under (-) that NFL GM, in the weeks both played.`)}">Avg margin</th>
                    <th class="num">NFL pts / wk</th><th class="num" data-tip="Weeks both had a score (the NFL team's byes are left out).">Weeks</th></tr></thead><tbody id="vn-rows"></tbody></table></div></div></div>`;
        let chart;
        const draw = () => {
            const o = ls.find(x => x.abbr === pick) || { w: 0, l: 0, t: 0, avgMargin: 0, ppg: 0, g: 0 };
            const myPpg = mine.length ? mine.reduce((t, g) => t + g.pf, 0) / mine.length : 0;
            const rank = 1 + ls.filter(x => x.ppg > myPpg).length;
            const winning = ls.filter(x => x.w > x.l).length;
            document.getElementById('vn-head').innerHTML = `<img src="${GT.logo(mgr.name)}" alt=""><b>${esc(mgr.name)}</b><span>vs</span><b>${esc(nameOf[pick] || pick)}</b><img src="${NG.logo(pick)}" alt="">`;
            const kpi = (l, v, s, tip = '') => `<div class="db-kpi"><span${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</span><b>${v}</b><small>${s}</small></div>`;
            document.getElementById('vn-kpis').innerHTML =
                kpi(`Record vs ${esc(pick)}`, `${o.w}-${o.l}${o.t ? '-' + o.t : ''}`, `${o.g} weeks both played`) +
                kpi('Avg margin', sg(o.avgMargin), `${GT.pts(myPpg)} vs ${GT.pts(o.ppg)} a week`) +
                kpi('Rank among NFL GMs', `${rank} of ${ls.length + 1}`, `by points a week, ${kind === 'proj' ? 'NFL picked by projection' : 'NFL picked with hindsight'}`, 'Where this manager\'s points a week would rank if he were one of the NFL GMs.') +
                kpi('Winning record against', `${winning} of ${ls.length}`, 'NFL GMs');
            document.getElementById('vn-rows').innerHTML = ls.slice().sort((x, y) => y.avgMargin - x.avgMargin).map(x => `<tr class="row-pick ${x.abbr === pick ? 'me' : ''}" data-t="${x.abbr}">
                <td><span class="team-cell"><img src="${NG.logo(x.abbr)}" alt=""><span>${esc(x.name)}</span></span></td><td class="num"><b>${x.w}-${x.l}${x.t ? '-' + x.t : ''}</b></td>
                <td class="num ${x.avgMargin >= 0 ? 'win' : 'loss'}">${sg(x.avgMargin)}</td><td class="num">${GT.pts(x.ppg)}</td><td class="num">${x.g}</td></tr>`).join('');
            document.querySelectorAll('#vn-rows tr').forEach(tr => tr.addEventListener('click', () => setTeam(tr.dataset.t)));
            if (CAREER) return;
            // week by week, and the week picker for the lineups
            const gm = gmAll.filter(r => r.kind === kind && r.team === pick);
            const wks = mine.map(g => g.week);
            const scoreOf = w => (gm.find(r => r.week === w) || {}).score;
            const C = { accent: SITE.color('accent'), ink: SITE.color('ink'), muted: SITE.color('muted'), line: SITE.color('line-strong'), grid: SITE.color('track') };
            if (!chart) chart = echarts.init(document.getElementById('vn-chart'));
            chart.setOption({
                textStyle: { fontFamily: 'Inter, sans-serif' }, animationDurationUpdate: 300,
                tooltip: { trigger: 'axis', backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 }, valueFormatter: v => v == null ? 'bye' : GT.pts(v) },
                legend: { top: 0, left: 'center', textStyle: { color: C.muted, fontSize: 10 } },
                grid: { left: 40, right: 12, top: 30, bottom: 24 },
                xAxis: { type: 'category', data: mine.map(g => `W${g.week}`), axisLabel: { color: C.muted, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } } },
                yAxis: { type: 'value', min: v => Math.floor(v.min / 20) * 20, axisLabel: { color: C.muted, fontSize: 10 }, splitLine: { lineStyle: { color: C.grid } } },
                series: [
                    { name: mgr.name, type: 'bar', barMaxWidth: 18, itemStyle: { color: C.accent }, data: mine.map(g => ({ value: g.pf, itemStyle: { color: scoreOf(g.week) == null || g.pf >= scoreOf(g.week) ? C.accent : C.line } })) },
                    { name: nameOf[pick] || pick, type: 'line', data: wks.map(scoreOf), connectNulls: false, lineStyle: { color: C.ink, width: 2 }, itemStyle: { color: C.ink }, symbolSize: 6 }
                ]
            }, false);
            const sel = document.getElementById('vn-week');
            const both = mine.filter(g => scoreOf(g.week) != null).map(g => g.week);
            const keep = Number(sel.value);
            sel.innerHTML = both.map(w => `<option value="${w}">Week ${w}</option>`).join('');
            sel.value = both.includes(keep) ? keep : both[both.length - 1];
            showWeek();
        };
        const ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'P', 'D/ST', 'HC'];
        const bySlot = l => l.slice().sort((x, y) => ORDER.indexOf(x.slot) - ORDER.indexOf(y.slot));
        async function showWeek() {
            const w = Number(document.getElementById('vn-week').value);
            if (!w) { document.getElementById('vn-lineups').innerHTML = '<p class="muted">No week where both played.</p>'; return; }
            const [nfl, me] = await Promise.all([NG.lineup(season, w, pick, kind), GT.query(`
                SELECT frp.slot_position AS slot, frp.player_id AS pid, p.name, p.position AS pos, frp.actual_points AS pts, frp.projected_points AS proj
                FROM fantasy_roster_players frp JOIN fantasy_rosters fr ON fr.roster_id = frp.roster_id JOIN players p ON p.player_id = frp.player_id
                WHERE fr.season = $s AND fr.week = $w AND fr.owner_id = $o AND frp.slot_position NOT IN ('BE', 'IR')`, { $s: season, $w: w, $o: mgr.id })]);
            const a = bySlot(me), bb = bySlot(nfl), n = Math.max(a.length, bb.length);
            const total = l => l.reduce((t, p) => t + (p.pts || 0), 0);
            const ta = total(a), tb = total(bb);
            const cell = p => p ? `<td class="muted">${esc(p.slot)}</td><td>${p.pid > 0 ? `<a href="${url(`pages/players/stats.html?id=${p.pid}`)}">${esc(p.name)}</a>` : esc(p.name)} <span class="muted">${esc(p.pos)}</span></td>
                <td class="num">${GT.pts(p.proj || 0)}</td><td class="num"><b>${GT.pts(p.pts || 0)}</b></td>` : '<td></td><td></td><td></td><td></td>';
            const table = (title, logo, list, sum, win) => `<div class="vn-lu"><div class="vn-lu-h ${win ? 'win' : ''}"><img src="${logo}" alt=""><b>${esc(title)}</b><span>${GT.pts(sum)}</span></div>
                <table class="data-table">${SITE.cols('14%', '52%', '17%', '17%')}<thead><tr><th>Slot</th><th>Player</th><th class="num">Proj</th><th class="num">Pts</th></tr></thead>
                <tbody>${Array.from({ length: n }, (_, k) => `<tr>${cell(list[k])}</tr>`).join('')}</tbody></table></div>`;
            document.getElementById('vn-lineups').innerHTML = table(mgr.name, GT.logo(mgr.name), a, ta, ta > tb) + table(`${nameOf[pick] || pick} (${kind === 'proj' ? 'Proj' : 'Best'})`, NG.logo(pick), bb, tb, tb > ta);
        }
        function setTeam(t) {
            pick = t;
            document.getElementById('vn-team').value = t;
            const u = new URL(location.href); u.searchParams.set('team', t); history.replaceState(null, '', u);
            draw();
        }
        document.getElementById('vn-team').addEventListener('change', e => setTeam(e.target.value));
        document.querySelectorAll('#vn-kind button').forEach(btn => btn.addEventListener('click', () => {
            kind = btn.dataset.k;
            document.querySelectorAll('#vn-kind button').forEach(x => x.classList.toggle('on', x === btn));
            const u = new URL(location.href); u.searchParams.set('kind', kind); history.replaceState(null, '', u);
            ls = lines(); draw();
        }));
        if (!CAREER) document.getElementById('vn-week').addEventListener('change', showWeek);
        window.addEventListener('resize', () => chart && chart.resize());
        draw();
    }

    // ============================================================ DRAFT TENDENCIES (career)
    // What this manager drafts round by round, how it compares with the league, and how picks did against their slot:
    // within each position, every season's drafted players ranked by the fantasy points they scored that season (WR3 =
    // third-most points among drafted WRs), against the order that position came off the board (WR10 = tenth WR taken).
    async function draftTendencies() {
        const [picksAll, ptsRows, grades, starts] = await Promise.all([
            GT.query(`SELECT t.season, ti.overall_pick AS pick, ti.to_owner_id AS id, p.player_id AS pid, p.name, p.position AS pos, COALESCE(st.team, p.pro_team) AS nfl
                      FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.transaction_id JOIN players p ON p.player_id = ti.player_id
                      LEFT JOIN (${GT.SEASON_TEAM}) st ON st.season = t.season AND st.pid = p.player_id
                      WHERE t.type = 'DRAFT' AND ti.item_type = 'DRAFT' AND ti.overall_pick IS NOT NULL ORDER BY t.season, ti.overall_pick`),
            GT.query(`SELECT w.season, w.player_id AS pid, SUM(COALESCE(w.points, 0)) AS pts FROM player_week_points w
                      WHERE w.player_id IN (SELECT ti.player_id FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.transaction_id
                                            WHERE t.type = 'DRAFT' AND ti.item_type = 'DRAFT')
                      GROUP BY w.season, w.player_id`),
            GT.query('SELECT season, pre_grade AS pre, post_grade AS post, post_rank AS rank, provisional FROM draft_grades WHERE owner_id = $o', { $o: mgr.id }),
            GT.query(`SELECT fr.season, frp.player_id AS pid, COUNT(*) AS starts, SUM(COALESCE(frp.actual_points, 0)) AS pts
                      FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                      WHERE fr.owner_id = $o AND frp.slot_position NOT IN ('BE', 'IR') GROUP BY fr.season, frp.player_id`, { $o: mgr.id })
        ]);
        const ptsOf = {}, startOf = {};
        ptsRows.forEach(r => { ptsOf[`${r.season}|${r.pid}`] = r.pts; });
        starts.forEach(r => { startOf[`${r.season}|${r.pid}`] = r; });
        // teams per draft = managers who picked that season (round = pick / teams, rounded up)
        const teams = {}, bySeason = {};
        picksAll.forEach(p => { (teams[p.season] = teams[p.season] || new Set()).add(p.id); (bySeason[p.season] = bySeason[p.season] || []).push(p); });
        Object.entries(bySeason).forEach(([s, list]) => {
            list.forEach(p => { p.round = Math.ceil(p.pick / teams[s].size); p.pts = ptsOf[`${s}|${p.pid}`] || 0; });
            const byPos = {};
            list.forEach(p => { (byPos[p.pos] = byPos[p.pos] || []).push(p); });
            Object.values(byPos).forEach(l => {
                l.forEach((p, i) => { p.posPick = i + 1; });                      // list is in pick order
                l.slice().sort((x, y) => y.pts - x.pts).forEach((p, i) => { p.posFinish = i + 1; p.delta = p.posPick - p.posFinish; });
            });
        });
        const mine = picksAll.filter(p => p.id === mgr.id);
        mine.forEach(p => { const s = startOf[`${p.season}|${p.pid}`]; p.starts = s ? s.starts : 0; p.startPts = s ? s.pts : 0; });
        if (!mine.length) { content.innerHTML = `<div class="wrap page-pad"><p class="muted" style="margin-top:34px">No draft picks for ${esc(mgr.name)}.</p></div>`; return; }
        const mySeasons = [...new Set(mine.map(p => p.season))].sort((x, y) => y - x);
        const league = picksAll.filter(p => mySeasons.includes(p.season));              // the drafts he was in
        const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'P', 'D/ST', 'HC'].filter(p => league.some(x => x.pos === p));
        const rounds = Math.max(...mine.map(p => p.round));
        const share = (list, pos) => list.length ? list.filter(p => p.pos === pos).length / list.length : 0;
        const pc = v => `${Math.round(v * 100)}%`;
        const sgn = v => `${v > 0 ? '+' : ''}${v}`;
        const avg = (l, f) => l.length ? l.reduce((t, p) => t + f(p), 0) / l.length : null;
        const prk = (p, n) => `${String(p.pos || '').replace('/', '')}${n}`;   // WR10, DST20
        const plink = p => p.pid > 0 ? `<a href="${url(`pages/players/stats.html?id=${p.pid}`)}">${esc(p.name)}</a>` : esc(p.name);
        const pname = p => `<span class="pnm">${posChip(p.pos)}${plink(p)}</span>`;          // chip, then the name
        const live = !b.finish[`${b.season}-${mgr.id}`] && mySeasons.includes(b.season);
        const kpi = (l, v, s, tip = '') => `<div class="db-kpi"><span${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</span><b>${v}</b><small>${s}</small></div>`;
        const VALUE_TIP = 'Compared within the position, among that season\'s drafted players. Drafted 10 = the tenth player taken at his position; finished 3 = the third-most fantasy points of the drafted players at his position that season. +/- = drafted spot minus finish: +7 means he outscored seven players at his position taken ahead of him.';

        // the cards
        const early = mine.filter(p => p.round <= 3);
        const fav = POS.map(pos => [pos, early.filter(p => p.pos === pos).length]).sort((x, y) => y[1] - x[1])[0];
        const avgDelta = avg(mine, p => p.delta);
        const bestPick = mine.reduce((m, p) => !m || p.delta > m.delta ? p : m, null);
        const groups = Object.values(mine.reduce((m, p) => { (m[p.pid] = m[p.pid] || []).push(p); return m; }, {}));
        // favorite player: picked the most times; ties go to the earliest average pick
        const favPlayer = groups.slice().sort((x, y) => y.length - x.length || avg(x, p => p.pick) - avg(y, p => p.pick))[0];

        // position mix: much more than counts
        const firstRound = (list, pos) => {                     // the round his first pick at the position came, averaged over drafts that had one
            const per = mySeasons.map(s => list.filter(p => p.season === s && p.pos === pos)).filter(l => l.length).map(l => Math.min(...l.map(p => p.round)));
            return per.length ? per.reduce((t, v) => t + v, 0) / per.length : null;
        };
        const mix = POS.map(pos => {
            const m = mine.filter(p => p.pos === pos), lg = league.filter(p => p.pos === pos);
            const best = m.reduce((x, p) => !x || p.delta > x.delta ? p : x, null), worst = m.reduce((x, p) => !x || p.delta < x.delta ? p : x, null);
            return { pos, n: m.length, me: share(mine, pos), lg: share(league, pos), rd: avg(m, p => p.round), lgRd: avg(lg, p => p.round), first: firstRound(mine, pos),
                     hit: m.length ? m.filter(p => p.delta > 0).length / m.length : null, val: avg(m, p => p.delta), starts: m.reduce((t, p) => t + p.starts, 0),
                     startPts: m.reduce((t, p) => t + p.startPts, 0), best, worst };
        });
        const f1 = v => v == null ? '-' : v.toFixed(1);
        const pickCell = p => p ? `<span class="dt-pk" title="${esc(`${p.name}, ${p.season} pick ${p.pick}: drafted ${prk(p, p.posPick)}, finished ${prk(p, p.posFinish)}`)}"><span class="nm">${esc(p.name)}</span>
            <span class="yr">'${String(p.season).slice(2)}</span><b class="dl ${p.delta >= 0 ? 'up' : 'dn'}">${sgn(p.delta)}</b></span>` : '-';
        // a grade as a fixed-size chip: draft day -> after the season
        const gradeChip = (g, cls = '') => `<span class="gchip ${cls}">${esc(g || '-')}</span>`;

        // draft day history: one row per draft
        const gradeOf = Object.fromEntries(grades.map(g => [g.season, g]));
        const history = mySeasons.map(s => {
            const l = mine.filter(p => p.season === s), g = gradeOf[s] || {};
            const top = l.reduce((x, p) => !x || p.delta > x.delta ? p : x, null);
            return { season: s, slot: Math.min(...l.map(p => p.pick)), r1: l.find(p => p.round === 1), r2: l.find(p => p.round === 2), top,
                     starts: l.reduce((t, p) => t + p.starts, 0), startPts: l.reduce((t, p) => t + p.startPts, 0), g, finish: b.finish[`${s}-${mgr.id}`] };
        });
        const sorted = mine.slice().sort((x, y) => y.delta - x.delta);
        const pickTable = list => `<table class="data-table ph-fit">${SITE.cols('10%', '10%', '40%', '14%', '14%', '12%')}<thead><tr><th><span class="hl">Year</span><span class="hs">Yr</span></th>
            <th class="num"><span class="hl">Pick</span><span class="hs">Pk</span></th><th>Player</th>
            <th class="num" data-tip="${esc(VALUE_TIP)}"><span class="hl">Drafted</span><span class="hs">Drft</span></th><th class="num" data-tip="${esc(VALUE_TIP)}"><span class="hl">Finished</span><span class="hs">Fin</span></th>
            <th class="num" data-tip="${esc(VALUE_TIP)}">+/-</th></tr></thead><tbody>${list.map(p => `<tr>
            <td><span class="hl">${p.season}</span><span class="hs">'${String(p.season).slice(2)}</span></td><td class="num">${p.pick}</td><td>${pname(p)}</td><td class="num" title="${prk(p, p.posPick)}">${p.posPick}</td><td class="num" title="${prk(p, p.posFinish)}">${p.posFinish}</td>
            <td class="num ${p.delta >= 0 ? 'win' : 'loss'}"><b>${sgn(p.delta)}</b></td></tr>`).join('')}</tbody></table>`;
        const repeats = groups.filter(l => l.length > 1).sort((x, y) => y.length - x.length || avg(x, p => p.pick) - avg(y, p => p.pick));
        const nflCount = Object.entries(mine.reduce((m, p) => { if (p.nfl) m[p.nfl] = (m[p.nfl] || 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1]).slice(0, 8);
        const H = (l, s) => `<span class="hl">${l}</span><span class="hs">${s}</span>`;
        // HOMER: the NFL team he drafts from most is the team he roots for
        const fan = GT.fanTeam(mgr.name), topN = nflCount.length ? nflCount[0][1] : 0;
        const nflName = (await NG.teams()).reduce((m, x) => (m[x.abbr] = x.name, m), {});
        const homer = fan && topN && nflCount.some(([tm, n]) => tm === fan && n === topN)
            ? `${mgr.name} drafts more ${nflName[fan] || fan} players (${topN}) than any other NFL team's, and that's his team.` : '';

        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:34px"><div class="dt-head"><div class="eyebrow">${esc(mgr.name)} · ${mySeasons.length} drafts</div>
                <div class="dt-title"><h2 class="section-title">Draft Tendencies</h2>${homer ? `<span class="homer" style="background:${GT.teamColor(fan) || 'var(--accent)'}" data-tip="${esc(homer)}">
                    <img class="${GT.whiteLogo(fan) ? 'logo-white' : ''}" src="${url(`assets/nfl-logos/${fan.toLowerCase()}.png`)}" alt="${esc(fan)}">Homer</span>` : ''}</div>
                <p class="section-copy">What ${esc(mgr.name)} takes round by round, how that compares with the rest of the league in the same drafts, and how the picks played against where they went.${live ? ` ${b.season} is still being played, so its picks are judged on the season so far.` : ''}</p></div></div>
            <div class="db-kpis dt-kpis">${kpi('Picks', mine.length, `${mySeasons.length} drafts, ${mySeasons[mySeasons.length - 1]}-${mySeasons[0]}`) +
                kpi('Favorite player', esc(favPlayer[0].name), favPlayer.length > 1 ? `drafted ${favPlayer.length}x, average pick ${Math.round(avg(favPlayer, p => p.pick))}` : 'no player drafted twice', 'The player drafted the most times; a tie goes to the one taken earliest on average.') +
                kpi('Early-round favorite', fav && fav[1] ? fav[0] : '-', fav && fav[1] ? `${fav[1]} of ${early.length} picks in rounds 1-3` : 'no early picks') +
                kpi('Avg pick vs slot', sgn(Math.round(avgDelta * 10) / 10), 'spots better (+) or worse (-) than drafted, by position', VALUE_TIP) +
                kpi('Best value', esc(bestPick.name), `${bestPick.season}: drafted ${prk(bestPick, bestPick.posPick)}, finished ${prk(bestPick, bestPick.posFinish)}`, VALUE_TIP)}</div>
            <div class="panel"><div class="panel-head" style="margin-bottom:12px"><h3 class="panel-title">Position by Round</h3>
                <span class="seg seg-eq" id="dt-view"><button data-v="matrix" class="on">Matrix</button><button data-v="chart" data-tip="One distribution curve per position: the chance that a ${esc(mgr.name)} pick at that position comes in each round (a smoothed density over his drafts; each curve adds up to 100% across the rounds). The number in the legend is how many he has taken.">Probability</button></span></div>
                <div id="dt-matrix"><table class="data-table dt-grid ph-fit"><colgroup><col class="dt-poscol">${Array.from({ length: rounds }, () => '<col>').join('')}</colgroup>
                    <thead><tr><th>Pos</th>${Array.from({ length: rounds }, (_, i) => `<th class="num">${H(`R${i + 1}`, i + 1)}</th>`).join('')}</tr></thead>
                    <tbody>${POS.map(pos => `<tr><td>${posChip(pos)}</td>${Array.from({ length: rounds }, (_, i) => {
                        const r = i + 1, mineR = mine.filter(p => p.round === r), lgR = league.filter(p => p.round === r);
                        const n = mineR.filter(p => p.pos === pos).length, s = mineR.length ? n / mineR.length : 0;
                        return `<td class="num dt-cell" style="${n ? `background:rgba(var(--accent-rgb),${(0.12 + s * 0.6).toFixed(2)})` : ''}" title="Round ${r}: ${n} ${pos} of ${mineR.length} picks (${pc(s)}); league ${pc(share(lgR, pos))}">${n || ''}</td>`;
                    }).join('')}</tr>`).join('')}</tbody></table>
                    <p class="muted dt-note">Picks at each position in each round across ${mySeasons.length} drafts, shaded by that round's share. Hover a cell for the league's share in the same drafts.</p></div>
                <div id="dt-chart" class="dt-chart" style="display:none"></div></div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">Position Mix vs the League</h3>
                <table class="data-table ph-fit" id="dt-mix">${SITE.cols('5%', '5%', '6%', '6%', '6%', '6%', '6%', '6%', '6%', '10%', '19%', '19%')}<thead><tr>
                    <th>Pos</th><th class="num">${H('Picks', '#')}</th><th class="num">${H('His share', 'Him')}</th><th class="num">${H('League', 'Lg')}</th>
                    <th class="num ph-x" data-tip="His average round at the position, against the league's in the same drafts.">Avg round</th><th class="num ph-x">Lg round</th>
                    <th class="num ph-x" data-tip="The round of his first pick at the position, averaged over the drafts where he took one.">First taken</th>
                    <th class="num ph-x" data-tip="${esc('Share of his picks at the position that finished better than where they were drafted (within the position).')}">Hit %</th>
                    <th class="num" data-tip="${esc(VALUE_TIP)}">Avg +/-</th><th class="num ph-x" data-tip="Times he started the players he drafted at the position, and the points they scored for him.">Starts / pts</th>
                    <th class="ph-x" data-tip="${esc(VALUE_TIP)}">Best pick</th><th class="ph-x" data-tip="${esc(VALUE_TIP)}">Worst pick</th></tr></thead>
                    <tbody>${mix.map(m => `<tr><td>${posChip(m.pos)}</td><td class="num">${m.n}</td><td class="num">${pc(m.me)}</td>
                        <td class="num ${m.me - m.lg >= 0.005 ? 'win' : m.me - m.lg <= -0.005 ? 'loss' : ''}">${pc(m.lg)}</td>
                        <td class="num ph-x">${f1(m.rd)}</td><td class="num ph-x">${f1(m.lgRd)}</td><td class="num ph-x">${m.first == null ? '-' : f1(m.first)}</td>
                        <td class="num ph-x">${m.hit == null ? '-' : pc(m.hit)}</td><td class="num ${m.val >= 0 ? 'win' : 'loss'}">${m.val == null ? '-' : sgn(Math.round(m.val * 10) / 10)}</td>
                        <td class="num ph-x">${m.starts} / ${GT.pts(m.startPts)}</td>
                        <td class="ph-x">${pickCell(m.best)}</td><td class="ph-x">${pickCell(m.worst)}</td></tr>`).join('')}</tbody></table>
                <p class="muted dt-note">League share and round are from the same drafts ${esc(mgr.name)} was in. Green / red: ${esc(mgr.name)} takes the position more / less often than the league.</p></div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">Draft Day History</h3>
                <table class="data-table ph-fit" id="dt-hist">${SITE.cols('7%', '6%', '18%', '19%', '19%', '13%', '9%', '9%')}<thead><tr>
                    <th>${H('Season', 'Yr')}</th><th class="num" data-tip="His first pick of the draft.">${H('Slot', 'Pk')}</th><th>Round 1</th><th class="ph-x">Round 2</th>
                    <th class="ph-x" data-tip="${esc(VALUE_TIP)}">Best value</th>                    <th class="dt-c" data-tip="The league's draft grade on draft day, and after the season (Draft Grades page).">${H('Grade', 'Grd')}</th><th class="num ph-x">Grade rank</th><th class="num">${H('Finish', 'Fin')}</th></tr></thead>
                    <tbody>${history.map(h => `<tr><td>${h.season}</td><td class="num">${h.slot}</td><td>${h.r1 ? pname(h.r1) : '-'}</td>
                        <td class="ph-x">${h.r2 ? pname(h.r2) : '-'}</td>
                        <td class="ph-x">${h.top ? `<span class="dt-pk"><span class="nm">${pname(h.top)}</span><b class="dl up">${sgn(h.top.delta)}</b></span>` : '-'}</td>
                        <td class="dt-c">${h.g.pre ? `<span class="gpair">${gradeChip(h.g.pre)}<span class="garr">→</span>${gradeChip(h.g.post, 'on')}${h.g.provisional ? '<sup>*</sup>' : ''}</span>` : '-'}</td><td class="num ph-x">${h.g.rank ? ord(h.g.rank) : '-'}</td>
                        <td class="num">${h.finish ? ord(h.finish) : '-'}</td></tr>`).join('')}</tbody></table>
                ${grades.some(g => g.provisional) ? '<p class="muted dt-note">* Season in progress: the after-season grade is provisional.</p>' : ''}</div>
            <div class="dt-row">
                <div class="panel"><h3 class="panel-title" style="margin-bottom:12px" data-tip="${esc(VALUE_TIP)}">Best Value Picks</h3>${pickTable(sorted.slice(0, 8))}</div>
                <div class="panel"><h3 class="panel-title" style="margin-bottom:12px" data-tip="${esc(VALUE_TIP)}">Biggest Misses</h3>${pickTable(sorted.slice(-8).reverse())}</div></div>
            <div class="dt-row">
                <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">Drafted More Than Once</h3>${repeats.length ? `<div class="dt-repeat">${repeats.slice(0, 12).map(l =>
                    `<span>${pname(l[0])} <small>${l.length}x · ${l.map(p => `'${String(p.season).slice(2)} R${p.round}`).join(', ')}</small></span>`).join('')}</div>` : '<p class="muted">Never drafted the same player twice.</p>'}</div>
                <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">Favorite NFL Teams</h3><div class="dt-nfl">${nflCount.map(([t, n]) =>
                    `<span><img src="${url(`assets/nfl-logos/${t.toLowerCase()}.png`)}" alt="" onerror="this.src='${url('assets/nfl-logos/nfl.png')}';this.onerror=null"><b>${esc(t)}</b><small>${n}</small></span>`).join('')}</div></div></div>
        </div>`;
        ['dt-mix', 'dt-hist'].forEach(id => {                                // phone-hidden columns: the col follows its header
            const t = document.getElementById(id);
            [...t.querySelectorAll('thead th')].forEach((th, i) => { if (th.classList.contains('ph-x')) t.querySelectorAll('col')[i].classList.add('ph-x'); });
        });

        // the probability chart: one distribution curve per position. Where in the draft his picks at that position come,
        // as a smoothed density (Gaussian kernel, about a round wide) over the rounds: the height at round r is the chance
        // that a pick of his at that position lands in round r, so each curve sums to 100% across the rounds.
        let chart;
        const COLORS = POS_COLOR;
        const BW = 1.0, STEP = 0.1;
        const curve = pos => {
            const rs = mine.filter(p => p.pos === pos).map(p => p.round);
            if (!rs.length) return [];
            const pts = [];
            for (let x = 1; x <= rounds + 1e-9; x += STEP) {
                const d = rs.reduce((t, r) => t + Math.exp(-0.5 * ((x - r) / BW) ** 2), 0) / (rs.length * BW * Math.sqrt(2 * Math.PI));
                pts.push([Math.round(x * 10) / 10, d]);
            }
            const area = pts.reduce((t, q) => t + q[1], 0) * STEP;            // renormalise inside rounds 1..N (the tails are cut off)
            return pts.map(([x, d]) => [x, Math.round(d / area * 1000) / 10]);
        };
        const drawChart = () => {
            const el = document.getElementById('dt-chart');
            if (!chart) chart = echarts.init(el);
            const C = { muted: SITE.color('muted'), line: SITE.color('line-strong'), grid: SITE.color('track') };
            const series = POS.map(pos => ({ pos, n: mine.filter(p => p.pos === pos).length, data: curve(pos) })).filter(s => s.n);
            chart.setOption({
                textStyle: { fontFamily: 'Inter, sans-serif' },
                tooltip: { trigger: 'axis', backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 },
                           formatter: ps => `<b>Round ${Number(ps[0].axisValue).toFixed(1)}</b><br>${ps.slice().sort((x, y) => y.value[1] - x.value[1]).map(p =>
                               `${p.marker}${p.seriesName} ${p.value[1].toFixed(1)}%`).join('<br>')}` },
                legend: { top: 0, left: 'center', textStyle: { color: C.muted, fontSize: 10 }, itemWidth: 14, itemHeight: 8 },
                grid: { left: 48, right: 16, top: 34, bottom: 34 },
                xAxis: { type: 'value', min: 1, max: rounds, interval: 1, name: 'Round', nameLocation: 'middle', nameGap: 24, nameTextStyle: { color: C.muted, fontSize: 10 },
                         axisLabel: { color: C.muted, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } }, splitLine: { show: false } },
                yAxis: { type: 'value', min: 0, name: 'Probability', nameTextStyle: { color: C.muted, fontSize: 10 },
                         axisLabel: { color: C.muted, fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: C.grid } } },
                series: series.map(s => ({ name: `${s.pos} (${s.n})`, type: 'line', smooth: true, symbol: 'none', data: s.data,
                    lineStyle: { width: 2.5, color: COLORS[s.pos] }, itemStyle: { color: COLORS[s.pos] }, areaStyle: { color: COLORS[s.pos], opacity: 0.08 },
                    emphasis: { focus: 'series' } }))
            }, true);
            chart.resize();
        };
        document.querySelectorAll('#dt-view button').forEach(btn => btn.addEventListener('click', () => {
            const v = btn.dataset.v;
            document.querySelectorAll('#dt-view button').forEach(x => x.classList.toggle('on', x === btn));
            document.getElementById('dt-matrix').style.display = v === 'matrix' ? '' : 'none';
            document.getElementById('dt-chart').style.display = v === 'chart' ? '' : 'none';
            if (v === 'chart') drawChart();
        }));
        window.addEventListener('resize', () => chart && chart.resize());
        window.addEventListener('themechange', () => chart && drawChart());
    }

    // ============================================================ RIVALRIES (career)
    // Every opponent this manager has played: the record, streaks, every meeting and the games that stand out.
    async function rivalry() {
        const played = inSeason.filter(g => g.oppId && g.pf != null && g.pa != null);
        if (!played.length) { content.innerHTML = `<div class="wrap page-pad"><p class="muted" style="margin-top:34px">No games for ${esc(mgr.name)}.</p></div>`; return; }
        // both lineups of every game, for projections and each side's top scorer; the opponent's rank that week
        const [lineupRows, oppRows] = await Promise.all([
            GT.query(`SELECT fr.season, fr.week, fr.owner_id AS id, p.player_id AS pid, p.name, p.position AS pos, COALESCE(frp.actual_points, 0) AS pts, COALESCE(frp.projected_points, 0) AS proj
                      FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id JOIN players p ON p.player_id = frp.player_id
                      WHERE frp.slot_position NOT IN ('BE', 'IR') AND fr.season IN (${[...new Set(played.map(g => g.season))].join(',')})`),
            GT.query('SELECT game_id AS gameId, score_rank_on_week AS rank, bench_score AS bench FROM matchup_team_stats WHERE opponent_owner_id = $o', { $o: mgr.id })
        ]);
        const lineup = {};
        lineupRows.forEach(r => { (lineup[`${r.season}|${r.week}|${r.id}`] = lineup[`${r.season}|${r.week}|${r.id}`] || []).push(r); });
        const oppOf = Object.fromEntries(oppRows.map(r => [r.gameId, r]));
        played.forEach(g => {
            const a = lineup[`${g.season}|${g.week}|${mgr.id}`] || [], z = lineup[`${g.season}|${g.week}|${g.oppId}`] || [];
            const top = l => l.reduce((m, p) => !m || p.pts > m.pts ? p : m, null);
            // a lineup's projection counts only when nearly every starter had one (some old weeks are missing most of them)
            const projOf = l => l.length && l.filter(p => p.proj > 0).length >= l.length * 0.8 ? l.reduce((t, p) => t + p.proj, 0) : null;
            g.proj = projOf(a); g.oppProj = projOf(z);
            g.mvp = top(a); g.oppMvp = top(z);
            const o = oppOf[g.gameId] || {};
            g.oppRank = o.rank; g.oppBench = o.bench;
        });
        const PLAYOFF = ['Post-WC', 'Post-WB', 'Championship'];
        const byOpp = {};
        played.forEach(g => { (byOpp[g.oppId] = byOpp[g.oppId] || []).push(g); });
        const streakOf = list => {
            let cur = null, n = 0, bestW = 0, bestL = 0, run = 0, prev = null;
            list.forEach(g => {
                const r = GT.result(g);
                run = r === prev ? run + 1 : 1; prev = r;
                if (r === 'W') bestW = Math.max(bestW, run); if (r === 'L') bestL = Math.max(bestL, run);
            });
            for (let i = list.length - 1; i >= 0; i--) { const r = GT.result(list[i]); if (cur == null) cur = r; if (r !== cur) break; n++; }
            return { cur: cur ? `${cur}${n}` : '-', bestW, bestL };
        };
        const lines = Object.entries(byOpp).map(([id, list]) => {
            const r = GT.record(list), po = GT.record(list.filter(g => PLAYOFF.includes(g.period)));
            const pf = GT.sum(list, 'pf'), pa = GT.sum(list, 'pa'), z = list[list.length - 1];
            return { id: Number(id), opp: list[0].opp, list, rec: r, po, g: list.length, pf, pa, margin: (pf - pa) / list.length, ...streakOf(list),
                     lastKey: z.season * 100 + z.week, last: `${z.season} W${z.week}` };
        }).sort((x, y) => y.g - x.g || y.lastKey - x.lastKey);
        let pick = lines.find(l => l.id === Number(param('vs'))) ? Number(param('vs')) : lines[0].id;
        const sg = v => `${v > 0 ? '+' : ''}${GT.pts(v)}`;
        const kpi = (l, v, s) => `<div class="db-kpi"><span>${l}</span><b>${v}</b><small>${s}</small></div>`;
        const H = (l, s) => `<span class="hl">${l}</span><span class="hs">${s}</span>`;
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">${esc(mgr.name)} · career</div><h2 class="section-title">Rivalries</h2>
                <p class="section-copy">Every opponent ${esc(mgr.name)} has faced: the record, the streaks and every meeting. Pick a rival, or click one in the table at the bottom.</p></div>
                <label class="sx-f"><span>Rival</span><select class="select" id="rv-opp">${lines.slice().sort((x, y) => x.opp.localeCompare(y.opp)).map(l =>
                    `<option value="${l.id}"${l.id === pick ? ' selected' : ''}>${esc(l.opp)} (${l.g})</option>`).join('')}</select></label></div>
            <div class="vn-team" id="rv-head"></div>
            <div class="db-kpis vn-kpis" id="rv-kpis"></div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:10px">Every Meeting</h3><div id="rv-chart" class="rv-chart"></div></div>
            <div class="rv-cards" id="rv-cards"></div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">Game Log</h3><table class="data-table ph-fit" id="rv-log"></table>
                <p class="muted dt-note">Projected: each side's starting lineup projections (ESPN) going into the game; Upset = won as the underdog or lost as the favorite. Rank: where each score ranked among every team that week. Click a game for its game center.</p></div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">All Rivals</h3><table class="data-table rv-all ph-fit" id="rv-all"></table></div></div>`;
        let chart;
        const hideCols = id => {
            const t = document.getElementById(id);
            [...t.querySelectorAll('thead th')].forEach((th, i) => { if (th.classList.contains('ph-x')) t.querySelectorAll('col')[i].classList.add('ph-x'); });
        };
        const resCell = g => { const r = GT.result(g); return `<b class="${r === 'W' ? 'win' : r === 'L' ? 'loss' : ''}">${r}</b>`; };
        const mvpCell = p => p ? `${esc(p.name)} <span class="muted">${GT.pts(p.pts)}</span>` : '-';
        function draw() {
            const l = lines.find(x => x.id === pick), list = l.list;
            const withProj = list.filter(g => g.proj != null && g.oppProj != null);
            const upsets = withProj.filter(g => (g.pf > g.pa) !== (g.proj > g.oppProj) && g.pf !== g.pa).length;
            document.getElementById('rv-head').innerHTML = `<img src="${GT.logo(mgr.name)}" alt=""><b>${esc(mgr.name)}</b><span>${l.rec.text}</span><b>${esc(l.opp)}</b><img src="${GT.logo(l.opp)}" alt="">`;
            document.getElementById('rv-kpis').innerHTML =
                kpi('Record', l.rec.text, `${l.g} meeting${l.g === 1 ? '' : 's'}${l.po.w + l.po.l + l.po.t ? ` · playoffs ${l.po.text}` : ''}`) +
                kpi('Points a game', `${GT.pts(l.pf / l.g)}-${GT.pts(l.pa / l.g)}`, `average margin ${sg(l.margin)}`) +
                kpi('Current streak', l.cur, `last met ${l.last} · longest W${l.bestW} / L${l.bestL}`) +
                kpi('Upsets', upsets, `of ${withProj.length} games went against the projections`);
            const C = { win: SITE.color('win'), loss: SITE.color('loss'), muted: SITE.color('muted'), line: SITE.color('line-strong'), grid: SITE.color('track') };
            if (!chart) chart = echarts.init(document.getElementById('rv-chart'));
            chart.setOption({
                textStyle: { fontFamily: 'Inter, sans-serif' }, animationDurationUpdate: 300,
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(17,17,17,.92)', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 },
                           formatter: ps => { const g = list[ps[0].dataIndex]; return `<b>${g.season} ${esc(GT.periodLabel(g.period, g.week))}</b><br>${esc(mgr.name)} ${GT.pts(g.pf)} - ${GT.pts(g.pa)} ${esc(l.opp)}`; } },
                grid: { left: 40, right: 12, top: 12, bottom: 30 },
                xAxis: { type: 'category', data: list.map(g => `'${String(g.season).slice(2)} W${g.week}${PLAYOFF.includes(g.period) ? '*' : ''}`), axisLabel: { color: C.muted, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } } },
                yAxis: { type: 'value', axisLabel: { color: C.muted, fontSize: 10, formatter: v => (v > 0 ? '+' : '') + v }, splitLine: { lineStyle: { color: C.grid } } },
                series: [{ type: 'bar', barMaxWidth: 26, data: list.map(g => ({ value: Number((g.pf - g.pa).toFixed(2)), itemStyle: { color: g.pf >= g.pa ? C.win : C.loss } })) }]
            }, true);
            const wins = list.filter(g => g.pf > g.pa), losses = list.filter(g => g.pf < g.pa);
            const big = wins.reduce((m, g) => !m || g.pf - g.pa > m.pf - m.pa ? g : m, null);
            const bad = losses.reduce((m, g) => !m || g.pa - g.pf > m.pa - m.pf ? g : m, null);
            const close = list.reduce((m, g) => !m || Math.abs(g.pf - g.pa) < Math.abs(m.pf - m.pa) ? g : m, null);
            const card = (title, g) => `<a class="panel rv-card" ${g ? `href="${GT.gameHref(g.gameId)}"` : ''}><span>${title}</span>${g
                ? `<b>${GT.pts(g.pf)}-${GT.pts(g.pa)}</b><small>${g.season} ${esc(GT.periodLabel(g.period, g.week))} · ${sg(g.pf - g.pa)}</small>` : '<b>-</b><small>none yet</small>'}</a>`;
            document.getElementById('rv-cards').innerHTML = card('Biggest win', big) + card('Worst loss', bad) + card('Closest game', close);
            document.getElementById('rv-log').innerHTML = `${SITE.cols('6%', '12%', '11%', '6%', '7%', '11%', '7%', '15%', '15%', '10%')}<thead><tr><th>${H('Season', 'Yr')}</th><th>Game</th>
                <th class="num">Score</th><th>${H('Result', 'Res')}</th><th class="num">${H('Margin', '+/-')}</th><th class="num ph-x">Projected</th><th class="ph-x"></th>
                <th class="ph-x">${esc(mgr.name)}'s top scorer</th><th class="ph-x">${esc(l.opp)}'s top scorer</th><th class="num ph-x">Rank</th></tr></thead>
                <tbody>${list.slice().reverse().map(g => {
                    const fav = g.proj != null && g.oppProj != null ? g.proj - g.oppProj : null;
                    const upset = fav != null && g.pf !== g.pa && (g.pf > g.pa) !== (fav > 0);
                    return `<tr class="row-link" data-href="${GT.gameHref(g.gameId)}">
                    <td>${g.season}</td><td title="${esc(GT.periodLabel(g.period, g.week))}">${esc(GT.periodLabel(g.period, g.week))}</td><td class="num">${GT.pts(g.pf)}-${GT.pts(g.pa)}</td><td>${resCell(g)}</td>
                    <td class="num">${sg(g.pf - g.pa)}</td><td class="num ph-x" title="${fav == null ? '' : `${esc(mgr.name)} ${fav >= 0 ? 'favored' : 'underdog'} by ${GT.pts(Math.abs(fav))}`}">${fav == null ? '-' : `${GT.pts(g.proj)}-${GT.pts(g.oppProj)}`}</td>
                    <td class="ph-x">${upset ? '<span class="pill pill-dark rv-upset">Upset</span>' : ''}</td>
                    <td class="ph-x">${mvpCell(g.mvp)}</td><td class="ph-x">${mvpCell(g.oppMvp)}</td>
                    <td class="num ph-x">${g.rank ? ord(g.rank) : '-'} / ${g.oppRank ? ord(g.oppRank) : '-'}</td></tr>`; }).join('')}</tbody>`;
            hideCols('rv-log');
            document.querySelectorAll('#rv-log tr.row-link').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) location.href = tr.dataset.href; }));
            document.getElementById('rv-all').innerHTML = `${SITE.cols('26%', '11%', '13%', '12%', '13%', '11%', '14%')}<thead><tr><th>Opponent</th><th class="num">${H('Games', 'G')}</th>
                <th class="num">${H('Record', 'Rec')}</th><th class="num ph-x">Win %</th><th class="num">${H('Avg margin', '+/-')}</th><th class="num">${H('Streak', 'Strk')}</th><th class="num ph-x">Last met</th></tr></thead><tbody>${lines.map(x => `
                <tr class="row-pick ${x.id === pick ? 'me' : ''}" data-id="${x.id}"><td><span class="team-cell"><img src="${GT.logo(x.opp)}" alt=""><b>${esc(x.opp)}</b></span></td>
                <td class="num">${x.g}</td><td class="num"><b>${x.rec.text}</b></td><td class="num ph-x">${(x.rec.pct * 100).toFixed(1)}%</td>
                <td class="num ${x.margin >= 0 ? 'win' : 'loss'}">${sg(x.margin)}</td><td class="num">${x.cur}</td><td class="num ph-x">${x.last}</td></tr>`).join('')}</tbody>`;
            hideCols('rv-all');
            document.querySelectorAll('#rv-all tr').forEach(tr => tr.dataset.id && tr.addEventListener('click', () => setOpp(Number(tr.dataset.id), true)));
        }
        function setOpp(id, scroll) {
            pick = id;
            document.getElementById('rv-opp').value = id;
            const u = new URL(location.href); u.searchParams.set('vs', id); history.replaceState(null, '', u);
            draw();
            if (scroll) document.getElementById('rv-head').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        document.getElementById('rv-opp').addEventListener('change', e => setOpp(Number(e.target.value)));
        window.addEventListener('resize', () => chart && chart.resize());
        draw();
    }

    ({ overview, schedule, 'roster-history': rosterHistory, 'stats-history': statsHistory, 'vs-nfl': vsNfl,
       'draft-tendencies': draftTendencies, rivalry })[page]();
})();
