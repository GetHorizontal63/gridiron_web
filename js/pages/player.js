/* Player profile: Stats, Highlights, Achievements, Game History */
(async function () {
    const { esc, url, param } = SITE;
    const page = document.body.dataset.page;
    const content = document.getElementById('content');
    await GT.load();
    const id = param('id') || localStorage.getItem('gt-last-player');
    if (!id) { location.href = url('pages/players/index.html'); return; }
    let p, games;
    try { [p, games] = await Promise.all([PS.player(id), PS.games()]); }
    catch (_) { content.innerHTML = '<div class="wrap"><div class="panel">This player could not be loaded.</div></div>'; return; }
    localStorage.setItem('gt-last-player', id);
    document.title = `${p.name} - Grass Touchers FFL`;

    const rows = p.games.map(r => ({ r, g: games[r.g] })).filter(x => x.g);
    const real = rows.filter(x => x.g.type !== 'PRE');
    const last = rows[rows.length - 1];
    const team = last ? last.r.tm : '';
    const bio = p.bio || {};
    const cols = PS.cols(p.pos);

    SITE.subHeader({ crumbs: [['Players', url('pages/players/index.html')], [p.name]],
                     tabs: SITE.sectionTabs('players', page, id),
                     action: { id: 'compare', label: 'Find Players' } });
    document.getElementById('compare').addEventListener('click', () => { location.href = url('pages/players/index.html'); });
    const seasonsPlayed = [...new Set(real.map(x => x.g.season))].sort((a, b) => b - a);
    const cur = seasonsPlayed[0];
    const curRows = real.filter(x => x.g.season === cur);
    const sumBy = (list, k) => list.reduce((a, x) => a + (x.r[k] || 0), 0);
    const height = bio.height ? `${Math.floor(bio.height / 12)}'${bio.height % 12}"` : '';
    SITE.hero({
        title: p.name, logo: PS.nflLogo(team), size: page === 'stats' ? '' : 'compact', dots: page === 'stats',
        // ESPN's cut-out headshot (same ESPN player id); D/ST units have none, so they get nothing
        portrait: p.pos === 'D/ST' ? '' : `https://a.espncdn.com/i/headshots/nfl/players/full/${encodeURIComponent(id)}.png`,
        image: `background-${(Number(String(id).replace('-', '')) % 18) + 1}.png`,
        meta: [[p.pos, team, height, bio.weight ? bio.weight + ' lb' : ''].filter(Boolean).join(' · '),
               [bio.draft_year ? `Drafted ${bio.draft_year}${bio.draft_round ? ` Rd ${bio.draft_round}, #${bio.draft_pick}` : ''}` : (bio.rookie_season ? `Undrafted · ${bio.rookie_season}` : ''), bio.college].filter(Boolean).join(' · '),
               cur ? `${cur}: ${GT.pts(sumBy(curRows, 'fpts'))} fantasy pts in ${curRows.length} games` : '']
    });

    const gameLine = ({ r, g }) => {
        const s = PS.side(r, g);
        const res = s.us == null ? '' : `${s.us > s.them ? 'W' : s.us < s.them ? 'L' : 'T'} ${s.us}-${s.them}`;
        return { s, res };
    };
    const statLine = r => cols.map(([h, k]) => r[k] ? `${r[k]} ${h.toLowerCase()}` : '').filter(Boolean).slice(0, 4).join(' · ');
    const kv = (l, v) => `<li><span>${l}</span><b>${v}</b></li>`;
    const tile = (v, l, s = '') => `<div class="stat-tile"><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;

    // ============================================================ STATS (overview)
    async function stats() {
        const league = await PS.leagueHistory(id);
        const recent = real.slice(-6).reverse();
        const ppg = real.length ? sumBy(real, 'fpts') / real.length : 0;
        const best = real.reduce((m, x) => (x.r.fpts || 0) > (m ? m.r.fpts : -1) ? x : m, null);
        const bySeason = seasonsPlayed.map(s => {
            const list = real.filter(x => x.g.season === s);
            const tot = {}; cols.forEach(([, k]) => { tot[k] = sumBy(list, k); });
            return { s, list, tot, fp: sumBy(list, 'fpts'), teams: [...new Set(list.map(x => x.r.tm))].join(', ') };
        });
        content.innerHTML = `<div class="wrap page-pad">
            <div class="card-row">
                <div class="card"><div class="card-head"><span class="card-title">Recent Games</span></div><div class="card-body">
                    <ul class="mini-list">${recent.map(x => { const { s } = gameLine(x);
                        return `<li><img src="${PS.nflLogo(s.opp)}" alt=""><span>${s.home ? 'vs' : '@'} ${esc(s.opp)}</span><span class="when">${GT.fmtDate(new Date(x.g.kickoff))}</span><span class="res">${GT.pts(x.r.fpts)}</span></li>`; }).join('')}</ul>
                    </div><a class="card-link" href="${url(`pages/players/game-history.html?id=${id}`)}">Game history</a></div>
                <div class="card"><div class="card-head"><span class="card-title">${cur || ''} Season</span></div><div class="card-body">
                    <ul class="kv">${kv('Games', curRows.length)}${kv('Fantasy points', GT.pts(sumBy(curRows, 'fpts')))}
                        ${cols.slice(0, 5).map(([h, k]) => kv(h, sumBy(curRows, k))).join('')}</ul>
                    </div><a class="card-link" href="#seasons">All seasons</a></div>
                <div class="card"><div class="card-head"><span class="card-title">In the League</span></div><div class="card-body">
                    ${league.length ? `<table class="mini-table"><thead><tr><th>Manager</th><th>Yr</th><th>Starts</th><th>Pts</th></tr></thead><tbody>
                        ${league.slice(0, 7).map(l => `<tr><td>${esc(l.owner)}</td><td>${l.season}</td><td>${l.starts}</td><td>${Math.round(l.pts)}</td></tr>`).join('')}</tbody></table>`
                        : '<div class="card-empty">Never rostered in the league.</div>'}
                    </div><a class="card-link" href="${url('pages/managers/index.html')}">Managers</a></div>
                <div class="card"><div class="card-head"><span class="card-title">Career</span></div><div class="card-body">
                    <ul class="kv">${kv('Games (reg + post)', real.length)}${kv('Fantasy points', GT.pts(sumBy(real, 'fpts')))}${kv('Per game', GT.pts(ppg))}
                        ${kv('Best game', best ? `${GT.pts(best.r.fpts)} · ${best.g.season} ${PS.typeLabel(best.g)}` : '-')}
                        ${kv('Preseason games', rows.length - real.length)}</ul>
                    </div><a class="card-link" href="${url(`pages/players/achievements.html?id=${id}`)}">Achievements</a></div>
            </div>
            <section class="an-section" id="analytics"></section>
            <section class="an-section" id="field"></section>
            <div class="panel" id="seasons" style="margin-top:44px"><div class="panel-head"><h3 class="panel-title">Season by Season</h3><span class="muted">Regular season + playoffs</span></div>
                <div class="table-scroll"><table class="data-table" style="min-width:760px">${SITE.cols('8%', '13%', '6%', ...cols.map(() => (52 / cols.length).toFixed(2) + '%'), '11%', '10%')}<thead><tr><th>Season</th><th>Team</th><th class="num">G</th>
                    ${cols.map(([h]) => `<th class="num">${h}</th>`).join('')}<th class="num">Fantasy Pts</th><th class="num">Per Game</th></tr></thead><tbody>
                ${bySeason.map(x => `<tr><td><b>${x.s}</b></td><td>${esc(x.teams)}</td><td class="num">${x.list.length}</td>
                    ${cols.map(([, k]) => `<td class="num">${Math.round(x.tot[k] * 10) / 10}</td>`).join('')}
                    <td class="num"><b>${GT.pts(x.fp)}</b></td><td class="num">${GT.pts(x.fp / (x.list.length || 1))}</td></tr>`).join('')}
                </tbody></table></div></div></div>`;
    }

    // ============================================================ VS THE FIELD (Statcast-style percentiles, PFF-style grades)
    // Each metric: [label, value(e), higherIsBetter, format, category]. Peers: same position, same regular season,
    // with at least a quarter of the most games anyone at the position played that season.
    const per = (e, k) => e.g ? (e[k] || 0) / e.g : null;
    const rate = (a, b) => b ? a / b * 100 : null;
    const f1 = v => v == null ? '-' : v.toFixed(1), f2 = v => v == null ? '-' : v.toFixed(2), pc = v => v == null ? '-' : `${v.toFixed(1)}%`;
    const COMMON = [
        ['Fantasy pts / game', e => per(e, 'fp'), true, f1, 'prod'],
        ['Ceiling (90th pct week)', e => e.fp_p90, true, f1, 'prod'],
        ['Floor (10th pct week)', e => e.fp_p10, true, f1, 'prod'],
        ['Startable weeks', e => rate(e.start, e.g), true, pc, 'prod'],
        ['Elite weeks (top 3)', e => rate(e.elite, e.g), true, pc, 'prod'],
        ['Volatility', e => e.fp && e.g ? e.fp_sd / (e.fp / e.g) : null, false, f2, 'prod']
    ];
    const BY_GROUP = {
        QB: [['Pass yds / game', e => per(e, 'pass_yds'), true, f1, 'prod'], ['Pass TD / game', e => per(e, 'pass_td'), true, f2, 'prod'],
             ['Completion %', e => rate(e.pass_cmp || 0, e.pass_att), true, pc, 'eff'], ['Yards / attempt', e => e.pass_att ? (e.pass_yds || 0) / e.pass_att : null, true, f2, 'eff'],
             ['Interception %', e => rate(e.pass_int || 0, e.pass_att), false, pc, 'eff'], ['Rush yds / game', e => per(e, 'rush_yds'), true, f1, 'usage'],
             ['Rush share', e => e.rush_share || 0, true, pc, 'usage'], ['Snap share', e => e.snap, true, pc, 'usage']],
        RB: [['Carries / game', e => per(e, 'rush_att'), true, f1, 'usage'], ['Rush share', e => e.rush_share || 0, true, pc, 'usage'],
             ['Targets / game', e => per(e, 'rec_tgt'), true, f1, 'usage'], ['Target share', e => e.tgt_share || 0, true, pc, 'usage'],
             ['Snap share', e => e.snap, true, pc, 'usage'], ['Yards / carry', e => e.rush_att ? (e.rush_yds || 0) / e.rush_att : null, true, f2, 'eff'],
             ['Total TD / game', e => e.g ? ((e.rush_td || 0) + (e.rec_td || 0)) / e.g : null, true, f2, 'eff'], ['Fumbles lost / game', e => per(e, 'fum_lost'), false, f2, 'eff']],
        WR: [['Targets / game', e => per(e, 'rec_tgt'), true, f1, 'usage'], ['Target share', e => e.tgt_share || 0, true, pc, 'usage'],
             ['Snap share', e => e.snap, true, pc, 'usage'], ['Catch rate', e => rate(e.rec || 0, e.rec_tgt), true, pc, 'eff'],
             ['Yards / target', e => e.rec_tgt ? (e.rec_yds || 0) / e.rec_tgt : null, true, f2, 'eff'], ['Rec yds / game', e => per(e, 'rec_yds'), true, f1, 'prod'],
             ['Rec TD / game', e => per(e, 'rec_td'), true, f2, 'eff']],
        K: [['FG made / game', e => per(e, 'fg_made'), true, f2, 'usage'], ['FG %', e => rate(e.fg_made || 0, e.fg_att), true, pc, 'eff'],
            ['XP %', e => rate(e.xp_made || 0, e.xp_att), true, pc, 'eff']],
        P: [['Punts / game', e => per(e, 'punt'), true, f2, 'usage'], ['Gross average', e => e.punt ? (e.punt_yds || 0) / e.punt : null, true, f1, 'eff'],
            ['Inside-20 %', e => rate(e.punt_in20 || 0, e.punt), true, pc, 'eff']],
        'D/ST': [['Points allowed / game', e => per(e, 'pts_allowed'), false, f1, 'eff'], ['Yards allowed / game', e => per(e, 'yds_allowed'), false, f1, 'eff'],
                 ['Sacks / game', e => per(e, 'def_sck'), true, f2, 'usage'], ['Takeaways / game', e => e.g ? ((e.def_int || 0) + (e.fum_rec || 0)) / e.g : null, true, f2, 'usage'],
                 ['D/ST TD', e => e.dst_td || 0, true, v => String(Math.round(v || 0)), 'prod']]
    };
    BY_GROUP.TE = BY_GROUP.WR;

    async function renderAnalytics() {
        const host = document.getElementById('analytics');
        if (!host) return;
        let all;
        try { all = await PS.seasonStats(); } catch (_) { return; }
        const mySeasons = Object.keys(all).filter(s => all[s][id]).sort().reverse();
        if (!mySeasons.length) { host.remove(); return; }
        // career: every regular season pooled per player. Totals add up; spread and share stats are game-weighted.
        const WEIGHTED = ['snap', 'tgt_share', 'rush_share', 'fp_p10', 'fp_p90'];
        all.career = {};
        Object.keys(all).filter(s => s !== 'career').sort().forEach(s => Object.entries(all[s]).forEach(([pid, e]) => {
            const c = all.career[pid] = all.career[pid] || { grp: e.grp, g: 0, _sq: 0, _w: {} };
            c.grp = e.grp;                                              // latest season's position wins
            const mean = e.g ? e.fp / e.g : 0;
            c._sq += e.g * ((e.fp_sd || 0) ** 2 + mean ** 2);           // for the pooled standard deviation
            Object.entries(e).forEach(([k, v]) => {
                if (k === 'grp' || k === 'fp_sd' || typeof v !== 'number') return;
                if (WEIGHTED.includes(k)) c._w[k] = (c._w[k] || 0) + v * e.g;
                else c[k] = (c[k] || 0) + v;
            });
        }));
        Object.values(all.career).forEach(c => {
            const mean = c.g ? c.fp / c.g : 0;
            c.fp_sd = c.g ? Math.sqrt(Math.max(0, c._sq / c.g - mean ** 2)) : 0;
            WEIGHTED.forEach(k => { if (c._w[k] != null) c[k] = c.g ? c._w[k] / c.g : 0; });
        });
        let season = mySeasons[0];
        const draw = () => {
            const me = all[season][id], group = me.grp;
            const label = season === 'career' ? 'career' : season;
            const atPos = Object.entries(all[season]).filter(([, e]) => e.grp === group);
            const maxG = Math.max(...atPos.map(([, e]) => e.g));
            const peers = atPos.filter(([, e]) => e.g >= Math.max(1, Math.round(maxG * 0.25)));
            const metrics = [...COMMON, ...(BY_GROUP[group] || [])];
            const rows = metrics.map(([label, fn, hb, fmt, cat]) => {
                const v = fn(me);
                return { label, v, fmt, cat, hb, p: AN.percentile(v, peers.map(([, e]) => fn(e)), hb) };
            });
            const ppg = e => e.fp / e.g;
            const ranked = peers.slice().sort((a, b) => ppg(b[1]) - ppg(a[1]));
            const rank = ranked.findIndex(([pid]) => pid === id) + 1;
            const qualified = rank > 0;
            const cat = c => AN.grade(rows.filter(r => r.cat === c).map(r => r.p));
            const overall = AN.grade([...rows.map(r => r.p), rows[0].p, rows[0].p]);   // points per game counts three times
            const section = (title, cats) => `<div class="an-block"><h4>${title}</h4>${rows.filter(r => cats.includes(r.cat))
                .map(r => AN.bar(r.label, r.fmt(r.v), qualified ? r.p : null, `${r.label}: ${r.fmt(r.v)} (${group} ${label})`)).join('')}</div>`;
            host.innerHTML = `
                <div class="panel-head"><div><div class="eyebrow">${season === 'career' ? `Career regular season (${mySeasons[mySeasons.length - 1]}-${mySeasons[0]})` : `${season} regular season`} · vs every ${esc(group)}</div><h2 class="section-title">Vs The Field</h2></div>
                    <select class="select" id="an-season"><option value="career"${season === 'career' ? ' selected' : ''}>Career</option>${mySeasons.map(s => `<option${s === season ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
                <div class="an-top">
                    <div class="an-grades">${AN.gradeBadge('Overall', qualified ? overall : null)}${AN.gradeBadge('Production', qualified ? cat('prod') : null)}
                        ${AN.gradeBadge('Usage', qualified ? cat('usage') : null)}${AN.gradeBadge('Efficiency', qualified ? cat('eff') : null)}</div>
                    <div class="an-rank"><b>${qualified ? `#${rank}` : '-'}</b><span>${esc(group)} by points per game<br>of ${peers.length} qualified (${Math.max(1, Math.round(maxG * 0.25))}+ games)</span></div>
                </div>
                ${qualified ? '' : `<p class="muted" style="margin:10px 0">Played ${me.g} game${me.g === 1 ? '' : 's'} ${season === 'career' ? 'in total' : 'in ' + season}: not enough to rank against the field.</p>`}
                <div class="an-cols">${section('Production', ['prod'])}${section('Usage & Efficiency', ['usage', 'eff'])}</div>
                ${AN.strip(peers.map(([, e]) => ppg(e)), [{ label: p.name.split(' ').slice(-1)[0], value: ppg(me), color: AN.color(rows[0].p) }],
                           { label: `Fantasy points per game, every qualified ${group} ${season === 'career' ? 'over their career' : 'in ' + season}` })}
                ${AN.legend()}`;
            document.getElementById('an-season').addEventListener('change', e => { season = e.target.value; draw(); });
        };
        draw();
    }

    // ============================================================ AGAINST THE FIELD (weekly scoring vs starters, rostered players, free agents)
    // Weekly points and projections are ESPN's, scored with the league's rules (league.db player_week_points). Each week a
    // player at the position is a starter (in a league lineup), rostered (on a league roster, bench included; IR left out)
    // or a free agent (on nobody's roster). Boom / bust come from weekly FP+ (js/fpplus.js): each game's points vs its
    // projection, relative to the whole position that week, placed on the position's league-wide spread in standard deviations.
    async function renderField() {
        const host = document.getElementById('field');
        if (!host || !window.echarts || !window.FPP) return;
        const seasonsRows = await GT.query('SELECT season, COUNT(*) AS n FROM player_week_points WHERE player_id = $id AND points IS NOT NULL GROUP BY season ORDER BY season DESC', { $id: Number(id) }).catch(() => []);
        const seasons = seasonsRows.map(r => r.season);
        const SMALL = 6;                                   // fewer weeks than this is a small sample
        if (!seasons.length) { host.remove(); return; }
        const posRow = await GT.query('SELECT pos FROM player_values WHERE player_id = $id ORDER BY season DESC LIMIT 1', { $id: Number(id) }).catch(() => []);
        const pos = (posRow[0] || {}).pos || PS.groupOf(p.pos);
        // the latest season can be only a few weeks old: start on the career view then (the dropdown still offers it)
        let season = seasonsRows[0].n < SMALL && seasons.length > 1 ? 'career' : seasons[0];
        const charts = [];
        const q = (s, x) => { if (!s.length) return null; const i = (s.length - 1) * x, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
        const meanOf = l => l.length ? l.reduce((t, v) => t + v, 0) / l.length : null;
        const sdOf = l => { const m = meanOf(l); return l.length > 1 ? Math.sqrt(l.reduce((t, v) => t + (v - m) ** 2, 0) / (l.length - 1)) : null; };
        const share = (v, field) => field.length ? (field.filter(x => x < v).length + field.filter(x => x === v).length / 2) / field.length : null;
        const kdeOn = (xs, v, minBw) => {
            if (v.length < 2) return xs.map(() => 0);
            const bw = Math.max(minBw, 1.06 * (sdOf(v) || 1) * Math.pow(v.length, -0.2));
            return xs.map(x => +(v.reduce((t, s) => t + Math.exp(-0.5 * ((x - s) / bw) ** 2), 0) / (v.length * bw * Math.sqrt(2 * Math.PI)) * 100).toFixed(3));
        };
        window.addEventListener('resize', () => charts.forEach(c => c.resize()));
        const draw = async () => {
            host.innerHTML = '<div class="loading" style="margin:20px 0">Comparing every week at the position...</div>';
            const career = season === 'career';
            const [weeksRows, rosterRows] = await Promise.all([
                GT.query(`SELECT w.season, w.week, w.player_id AS id, w.points AS pts, w.projected AS proj FROM player_week_points w
                          JOIN player_values v ON v.season = w.season AND v.player_id = w.player_id
                          WHERE ($s = 0 OR w.season = $s) AND v.pos = $pos AND w.points IS NOT NULL`, { $s: career ? 0 : Number(season), $pos: pos }),
                GT.query(`SELECT fr.season, fr.week, frp.player_id AS id, frp.slot_position AS slot FROM fantasy_roster_players frp
                          JOIN fantasy_rosters fr ON fr.roster_id = frp.roster_id WHERE ($s = 0 OR fr.season = $s)`, { $s: career ? 0 : Number(season) })
            ]);
            const status = {};
            rosterRows.forEach(r => { const k = `${r.season}|${r.week}|${r.id}`; if (r.slot === 'IR') { status[k] = status[k] || 'ir'; return; }
                                      status[k] = r.slot === 'BE' ? (status[k] === 'start' ? 'start' : 'bench') : 'start'; });
            const tag = r => status[`${r.season}|${r.week}|${r.id}`] || 'fa';
            const C = FPP.classify(weeksRows);                  // weekly FP+ and its band, league-wide for the position in this span
            const sorted = l => l.slice().sort((x, y) => x - y);
            const groups = [
                { key: 'me', label: p.name, rows: weeksRows.filter(r => String(r.id) === String(id)) },
                { key: 'field', label: `Every ${pos}`, rows: weeksRows },
                { key: 'start', label: 'League starters', rows: weeksRows.filter(r => tag(r) === 'start') },
                { key: 'roster', label: 'Rostered', rows: weeksRows.filter(r => tag(r) === 'start' || tag(r) === 'bench') },
                { key: 'fa', label: 'Free agents', rows: weeksRows.filter(r => tag(r) === 'fa') }
            ].map(g => ({ ...g, v: sorted(g.rows.map(r => r.pts)) }));
            const me = groups[0];
            if (!me.v.length) { host.innerHTML = ''; return; }
            groups.forEach(g => {
                g.n = g.v.length; g.avg = meanOf(g.v); g.med = q(g.v, 0.5); g.sd = sdOf(g.v); g.p10 = q(g.v, 0.1); g.p90 = q(g.v, 0.9);
                g.fpp = FPP.period(g.rows, C); g.mix = FPP.mix(g.rows, C);
                g.boom = g.mix.side(1); g.bust = g.mix.side(-1);                // every boom / bust tier
                g.z = g.rows.map(r => C.get(r)).filter(Boolean).map(x => x.z);
                g.mine = g.key === 'me' ? null : share(me.med, g.v);           // where the player's typical week lands in this group
            });
            const meStatus = { start: 0, bench: 0, fa: 0, ir: 0 };
            me.rows.forEach(r => { meStatus[tag(r)]++; });
            const f1 = v => v == null || isNaN(v) ? '-' : GT.pts(v);
            const pc = v => v == null || isNaN(v) ? '-' : `${Math.round(v * 100)}%`;
            const fp = v => v == null || isNaN(v) ? '-' : Math.round(v);
            const GROUP_TIP = { me: `Every week ${p.name} recorded a stat in this span.`,
                                field: `Every week any ${pos} recorded a stat: starters, backups and free agents alike.`,
                                start: `Weeks a ${pos} was in a league starting lineup (any team).`,
                                roster: `Weeks a ${pos} was on any league roster, bench included (IR left out).`,
                                fa: `Weeks a ${pos} was on nobody's league roster: what the waiver wire offered.` };
            const mixTip = g => `${g.mix.n} projected week${g.mix.n === 1 ? '' : 's'}: ${FPP.BANDS.map(b => `${g.mix.counts[b.key]} ${b.label.toLowerCase()}`).join(', ')}${g.mix.unprojected ? `; ${g.mix.unprojected} unprojected (left out)` : ''}.`;
            const label = career ? `Career (${seasons[seasons.length - 1]}-${seasons[0]})` : season;
            host.innerHTML = `<div class="panel-head"><div><div class="eyebrow">${esc(label)} · weekly fantasy points vs every ${esc(pos)}</div><h2 class="section-title">Against the Field</h2>
                    <p class="section-copy" style="max-width:none">${me.n} week${me.n === 1 ? '' : 's'} played: ${meStatus.start} in a league lineup, ${meStatus.bench} on a bench, ${meStatus.fa} as a free agent${meStatus.ir ? `, ${meStatus.ir} on IR` : ''}.
                    <span data-tip="${esc(FPP.TIP)}">Boom / bust by weekly FP+: ${esc(pos)} average FP+ ${fp(C.mean)}, 1 standard deviation = ${fp(C.sd)}</span>.
                    ${me.n < SMALL ? `<b>Small sample: only ${me.n} week${me.n === 1 ? '' : 's'}${career ? '' : ` in ${season}`}. Switch to Career for the full picture.</b>` : ''}</p></div>
                    <select class="select" id="fd-season"><option value="career"${career ? ' selected' : ''}>Career</option>${seasons.map(s => `<option value="${s}"${s === season ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
                <div class="table-scroll"><table class="data-table" style="min-width:960px">${SITE.cols('18%', '7%', '7%', '7%', '7%', '7%', '9%', '8%', '7%', '7%', '16%')}<thead><tr>
                    <th data-tip="Who is being compared. Hover a group name for who is in it.">Group</th>
                    <th class="num" data-tip="Weeks with a recorded stat. For a group: every player-week in it, so one player can count many times.">Weeks</th>
                    <th class="num" data-tip="Average fantasy points per week (ESPN's points, scored with the league's rules).">Avg</th>
                    <th class="num" data-tip="The middle week: half the weeks scored more, half scored less. Less swayed by one huge game than the average.">Median</th>
                    <th class="num" data-tip="10th-percentile week: only 1 week in 10 was worse. A dependable low end.">Floor</th>
                    <th class="num" data-tip="90th-percentile week: only 1 week in 10 was better. A realistic high end.">Ceiling</th>
                    <th class="num" data-tip="Standard deviation of weekly points. Higher = bigger swings week to week; lower = steadier.">Volatility</th>
                    <th class="num" data-tip="FP+ over the whole period: (points / projection) ÷ (the position's points / projection in the same weeks) × 100. 100 = performed exactly to projection as well as the position did; 120 = 20% better.">FP+</th>
                    <th class="num" data-tip="Share of projected weeks with a weekly FP+ at least 0.5 standard deviations above the position's average: Boom, Big Boom, Huge Boom and Smash together. Hover a cell for each tier.">Boom</th>
                    <th class="num" data-tip="Share of projected weeks with a weekly FP+ at least 0.5 standard deviations below the position's average: Bust, Big Bust, Huge Bust and Disaster together. Hover a cell for each tier.">Bust</th>
                    <th class="num" data-tip="Where this player's median week would land among the group's weeks. 60% = a typical week here beats 60% of that group's weeks.">Typical week beats</th></tr></thead><tbody>
                ${groups.map(g => `<tr class="${g.key === 'me' ? 'me' : ''}"><td><b data-tip="${esc(GROUP_TIP[g.key])}">${esc(g.label)}</b></td><td class="num">${g.n.toLocaleString()}</td><td class="num">${f1(g.avg)}</td>
                    <td class="num">${f1(g.med)}</td><td class="num">${f1(g.p10)}</td><td class="num">${f1(g.p90)}</td><td class="num">${f1(g.sd)}</td>
                    <td class="num"><b>${fp(g.fpp)}</b></td>
                    <td class="num win" data-tip="${esc(mixTip(g))}">${pc(g.boom)}</td>
                    <td class="num loss" data-tip="${esc(mixTip(g))}">${pc(g.bust)}</td>
                    <td class="num"${g.key === 'me' ? '' : ` data-tip="A ${f1(me.med)}-point week (this player's median) beats ${pc(g.mine)} of the ${g.n.toLocaleString()} weeks in '${esc(g.label)}'"`}>${g.key === 'me' ? '-' : `<b>${pc(g.mine)}</b> of weeks`}</td></tr>`).join('')}</tbody></table></div>
                <div class="db-grid" style="margin-top:14px">
                    <section class="db-tile s12"><header><h3 data-tip="${esc(`Each projected week's FP+, measured in standard deviations from the ${pos} average (${fp(C.mean)}; 1 SD = ${fp(C.sd)}). Shading deepens with each tier, red below and green above: 0.5 to 1.25 SD Boom / Bust, 1.25 to 2 Big, 2 to 3 Huge, beyond 3 Smash / Disaster. Inside the dashed lines (±0.5) is Normal.`)}">FP+ Spread</h3>
                        <p>How each week compared with its projection, relative to every ${esc(pos)} that week. Dots = ${esc(p.name)}'s weeks (hover for the week).</p></header><div class="db-chart" id="fd-z"></div></section>
                    <section class="db-tile s7"><header><h3 data-tip="How often each weekly score happened, as a smooth curve (a kernel density). A tall narrow peak = consistent; a wide flat curve = up and down.">Scoring Distribution</h3><p>Share of weeks at each point total (smoothed). Dots = ${esc(p.name)}'s weeks.</p></header><div class="db-chart" id="fd-curve"></div></section>
                    <section class="db-tile s5"><header><h3 data-tip="${esc(`Each bar splits the group's projected weeks by weekly FP+ band. ${FPP.TIP}`)}">Boom / Bust Mix</h3><p>Projected weeks by FP+ band</p></header><div class="db-chart" id="fd-mix"></div></section>
                </div>
                <p class="an-note">Floor / ceiling = 10th / 90th percentile week and, with the scoring curves, count every week the player recorded a stat. FP+ and the bands use projected weeks only:
                a week projected under ${f1(C.floor)} points (30% of the ${esc(pos)} median projection) is left out, because a tiny projection makes the ratio meaningless.</p>`;
            document.getElementById('fd-season').addEventListener('change', e => { season = e.target.value === 'career' ? 'career' : Number(e.target.value); draw(); });

            charts.splice(0).forEach(ch => ch.dispose());
            const c = { accent: SITE.color('accent'), ink: SITE.color('ink'), muted: SITE.color('muted'), grid: SITE.color('track'), line: SITE.color('line-strong'),
                        win: SITE.color('win'), loss: SITE.color('loss'), surface: SITE.color('surface') };
            const COL = { me: c.accent, field: c.line, start: c.ink, roster: '#2e86de', fa: '#e67e22' };
            const BAND_COL = { disaster: '#7f1d1d', hugebust: '#b91c1c', bigbust: '#e35d4f', bust: '#f3a79e', normal: c.line,
                               boom: '#9fdcb2', bigboom: '#4caf73', hugeboom: '#1f8a4c', smash: '#14532d' };
            const mount = (elId, option) => { const ch = echarts.init(document.getElementById(elId)); ch.setOption({ textStyle: { fontFamily: 'Inter, sans-serif' }, ...option }); charts.push(ch); };
            const legend = { top: 0, right: 0, textStyle: { color: c.muted, fontSize: 10 }, itemWidth: 10, itemHeight: 10 };

            // FP+ spread in standard deviations, shaded at 1 / 2 / 3 SD
            const zs = Array.from({ length: 81 }, (_, i) => -4 + 8 * i / 80);
            const clamp = z => Math.max(-4, Math.min(4, z));
            const shade = (a, b, col, op) => [{ xAxis: a, itemStyle: { color: col, opacity: op } }, { xAxis: b }];
            const meWeeks = me.rows.map(r => ({ r, x: C.get(r) })).filter(o => o.x);
            mount('fd-z', {
                grid: { left: 40, right: 14, top: 52, bottom: 38 }, legend,
                tooltip: { trigger: 'axis', valueFormatter: v => typeof v === 'number' ? `${v.toFixed(2)}%` : v },
                xAxis: { type: 'value', min: -4, max: 4, interval: 1, name: `Standard deviations from the ${pos} average FP+ (${fp(C.mean)}; 1 SD = ${fp(C.sd)})`, nameLocation: 'middle', nameGap: 26,
                         nameTextStyle: { color: c.muted }, axisLabel: { color: c.muted, formatter: v => v === 0 ? 'avg' : `${v > 0 ? '+' : ''}${v} SD` }, splitLine: { show: false } },
                yAxis: { type: 'value', axisLabel: { color: c.muted, formatter: v => `${v}%` }, splitLine: { lineStyle: { color: c.grid } } },
                series: [
                    ...groups.map((g, k) => ({ name: g.label, type: 'line', smooth: true, symbol: 'none', data: (d => zs.map((x, i) => [x, d[i]]))(kdeOn(zs, g.z.map(clamp), 0.2)),
                        lineStyle: { color: COL[g.key], width: g.key === 'me' ? 3 : 1.5, type: g.key === 'field' ? 'dashed' : 'solid' }, itemStyle: { color: COL[g.key] },
                        areaStyle: g.key === 'me' ? { color: c.accent, opacity: 0.12 } : undefined,
                        // one shaded band per tier, deeper the further out (edges 0.5 / 1.25 / 2 / 3 SD)
                        markArea: k === 1 ? { silent: true, data: [[-4, -3, 0.30], [-3, -2, 0.20], [-2, -1.25, 0.12], [-1.25, -0.5, 0.06]]
                            .flatMap(([a, b2, op]) => [shade(a, b2, c.loss, op), shade(-b2, -a, c.win, op)]) } : undefined,
                        markLine: k === 1 ? { silent: true, symbol: 'none', lineStyle: { color: c.muted, type: 'dashed' },
                                              label: { color: c.muted, fontSize: 10, formatter: d => d.value < 0 ? 'Bust' : 'Boom' }, data: [{ xAxis: -0.5 }, { xAxis: 0.5 }] } : undefined })),
                    { name: `${p.name} weeks`, type: 'scatter', symbolSize: 8, itemStyle: { color: c.accent, borderColor: c.surface, borderWidth: 1 },
                      data: meWeeks.map(o => ({ value: [clamp(o.x.z), 0], o })),
                      tooltip: { trigger: 'item', formatter: d => { const o = d.data.o; return `${o.r.season} week ${o.r.week}: ${GT.pts(o.r.pts)} pts on a ${GT.pts(o.r.proj)} projection<br>FP+ ${Math.round(o.x.fpp)} · ${o.x.z >= 0 ? '+' : ''}${o.x.z.toFixed(2)} SD · ${FPP.BANDS.find(b => b.key === o.x.cls).label}`; } } }]
            });

            // scoring distribution (points)
            const all = groups[1].v;
            const lo = Math.floor(q(all, 0.005) ?? 0), hi = Math.ceil(Math.max(q(all, 0.995) ?? 30, me.v[me.v.length - 1] || 0));
            const xs = Array.from({ length: 81 }, (_, i) => lo + (hi - lo) * i / 80);
            mount('fd-curve', {
                grid: { left: 40, right: 14, top: 30, bottom: 36 }, legend,
                tooltip: { trigger: 'axis', valueFormatter: v => typeof v === 'number' ? `${v.toFixed(2)}%` : v },
                xAxis: { type: 'value', min: lo, max: hi, name: 'Fantasy points in a week', nameLocation: 'middle', nameGap: 24, nameTextStyle: { color: c.muted }, axisLabel: { color: c.muted }, splitLine: { show: false } },
                yAxis: { type: 'value', axisLabel: { color: c.muted, formatter: v => `${v}%` }, splitLine: { lineStyle: { color: c.grid } } },
                series: [
                    ...groups.map(g => ({ name: g.label, type: 'line', smooth: true, symbol: 'none', data: (d => xs.map((x, i) => [x, d[i]]))(kdeOn(xs, g.v, 0.8)),
                        lineStyle: { color: COL[g.key], width: g.key === 'me' ? 3 : 1.5, type: g.key === 'field' ? 'dashed' : 'solid' }, itemStyle: { color: COL[g.key] },
                        areaStyle: g.key === 'me' ? { color: c.accent, opacity: 0.12 } : undefined })),
                    { name: `${p.name} weeks`, type: 'scatter', symbolSize: 7, itemStyle: { color: c.accent, borderColor: c.surface, borderWidth: 1 },
                      data: me.v.map(v => [v, 0]), tooltip: { trigger: 'item', formatter: d => `${GT.pts(d.value[0])} pts` } }]
            });

            // band mix
            const order = groups.slice().reverse();
            mount('fd-mix', {
                grid: { left: 108, right: 14, top: 30, bottom: 26 }, legend,
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => `${v}%` },
                xAxis: { type: 'value', max: 100, axisLabel: { color: c.muted, formatter: '{value}%' }, splitLine: { lineStyle: { color: c.grid } } },
                yAxis: { type: 'category', data: order.map(g => g.key === 'me' ? p.name.split(' ').slice(-1)[0] : g.label), axisLabel: { color: c.ink, fontSize: 10 }, axisTick: { show: false } },
                series: FPP.BANDS.map(bd => ({ name: bd.label, type: 'bar', stack: 'm', barMaxWidth: 18, itemStyle: { color: BAND_COL[bd.key] },
                                              data: order.map(g => Math.round((g.mix.share(bd.key) || 0) * 1000) / 10) }))
            });
        };
        draw();
    }

    // ============================================================ HIGHLIGHTS
    function highlights() {
        const top = real.slice().sort((x, y) => (y.r.fpts || 0) - (x.r.fpts || 0)).slice(0, 12);
        const best = top[0];
        let band = '';
        if (best) {
            const { s } = gameLine(best);
            band = `<section class="game-band" style="margin-top:44px">
                <div class="band-label"><span class="pill pill-dark">Career best</span>${best.g.season} · ${esc(PS.typeLabel(best.g))} · ${GT.fmtDate(new Date(best.g.kickoff))}</div>
                <div class="scoreboard">
                    <div class="sb-team"><div class="sb-logo"><img src="${PS.nflLogo(best.r.tm)}" alt=""></div><div class="sb-name">${esc(best.r.tm)}<small>${esc(p.name)}</small></div></div>
                    <div class="sb-scores"><div class="sb-score ${s.us > s.them ? 'won' : ''}">${s.us ?? '-'}</div><span class="sb-at">${s.home ? 'VS' : 'AT'}</span>
                        <div class="sb-score ${s.them > s.us ? 'won' : ''}">${s.them ?? '-'}</div></div>
                    <div class="sb-team right"><div class="sb-name">${esc(s.opp)}<small>${esc(best.g.venue || '')}</small></div><div class="sb-logo"><img src="${PS.nflLogo(s.opp)}" alt=""></div></div>
                </div>
                <div class="band-foot"><div><h4>${GT.pts(best.r.fpts)} fantasy points</h4><p>${esc(statLine(best.r))}</p></div>
                    <div class="band-actions"><a class="btn btn-accent" href="${url(`pages/players/game-history.html?id=${id}`)}">Game history</a></div></div></section>`;
        }
        content.innerHTML = `<div class="wrap page-pad">${band}
            <section class="split-section"><div><div class="eyebrow">Top performances</div><h2 class="section-title">Highlight<br>Games</h2>
                <p class="section-copy">${esc(p.name)}'s best fantasy games since 2019, regular season and playoffs.</p></div>
                <ul class="list-rows">${top.map(x => { const { s, res } = gameLine(x);
                    return `<li><img src="${PS.nflLogo(s.opp)}" alt=""><div class="main"><b>${GT.pts(x.r.fpts)} pts</b> <span class="sub">${s.home ? 'vs' : '@'} ${esc(s.opp)} · ${esc(statLine(x.r))}</span></div>
                        <div class="date sub">${GT.fmtDate(new Date(x.g.kickoff))}, ${x.g.season}</div><div class="time sub">${res}</div><div class="tag">${esc(PS.typeLabel(x.g))}</div></li>`; }).join('')}</ul>
            </section></div>`;
    }

    // ============================================================ ACHIEVEMENTS
    function achievements() {
        const count = test => real.filter(x => test(x.r)).length;
        const g = PS.groupOf(p.pos);
        const marks = [
            ['30+ point games', count(r => r.fpts >= 30)], ['20+ point games', count(r => r.fpts >= 20)],
            ...(g === 'QB' ? [['300-yard passing games', count(r => r.pass_yds >= 300)], ['3+ TD pass games', count(r => r.pass_td >= 3)]] : []),
            ...(['RB', 'QB'].includes(g) ? [['100-yard rushing games', count(r => r.rush_yds >= 100)]] : []),
            ...(['WR', 'TE', 'RB'].includes(g) ? [['100-yard receiving games', count(r => r.rec_yds >= 100)], ['10+ catch games', count(r => r.rec >= 10)]] : []),
            ['Multi-TD games', count(r => (r.rush_td || 0) + (r.rec_td || 0) >= 2)],
            ...(g === 'K' ? [['50+ yard field goals', real.reduce((a, x) => a + (x.r.fg_dist || []).filter(d => d >= 50).length, 0)]] : []),
            ...(g === 'DEF' || g === 'D/ST' ? [['Sacks', Math.round(real.reduce((a, x) => a + (x.r.def_sck || 0), 0) * 10) / 10], ['Interceptions', real.reduce((a, x) => a + (x.r.def_int || 0), 0)]] : [])
        ];
        const yearMarks = seasonsPlayed.map(s => {
            const list = real.filter(x => x.g.season === s);
            const tot = k => list.reduce((a, x) => a + (x.r[k] || 0), 0);
            const out = [];
            if (tot('pass_yds') >= 4000) out.push(`${tot('pass_yds')} passing yards`);
            if (tot('rush_yds') >= 1000) out.push(`${tot('rush_yds')} rushing yards`);
            if (tot('rec_yds') >= 1000) out.push(`${tot('rec_yds')} receiving yards`);
            if (tot('rec') >= 100) out.push(`${tot('rec')} receptions`);
            const tds = tot('pass_td') + tot('rush_td') + tot('rec_td');
            if (tds >= 10) out.push(`${tds} total TDs`);
            if (tot('fpts') >= 300) out.push(`${GT.pts(tot('fpts'))} fantasy points`);
            return { s, out };
        }).filter(x => x.out.length);
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">Since 2019</div><h2 class="section-title">Achievements</h2></div></div>
            <div class="stat-tiles">${marks.map(([l, v]) => tile(v, l)).join('')}</div>
            <div class="panel"><h3 class="panel-title" style="margin-bottom:12px">Milestone Seasons</h3>
                ${yearMarks.length ? `<div class="table-scroll"><table class="data-table">${SITE.cols('12%', '88%')}<thead><tr><th>Season</th><th>Milestones</th></tr></thead><tbody>
                    ${yearMarks.map(x => `<tr><td><b>${x.s}</b></td><td>${esc(x.out.join(' · '))}</td></tr>`).join('')}</tbody></table></div>`
                    : '<p class="muted">No milestone seasons yet (1,000 yards, 4,000 passing, 100 catches, 10 TDs, 300 fantasy points).</p>'}</div></div>`;
    }

    // ============================================================ GAME HISTORY
    // Game History: one fixed set of abbreviated columns for offensive players, 25 games per page
    const GH_OFFENSE = [['CMP', 'pass_cmp'], ['ATT', 'pass_att'], ['PYD', 'pass_yds'], ['PTD', 'pass_td'], ['INT', 'pass_int'],
                        ['ReYD', 'rec_yds'], ['Rec', 'rec'], ['ReTD', 'rec_td'], ['RuYD', 'rush_yds'], ['RuAtt', 'rush_att'], ['RuTD', 'rush_td']];
    function gameHistory() {
        const PER_PAGE = 25;
        const ghCols = ['QB', 'RB', 'WR', 'TE'].includes(PS.groupOf(p.pos)) ? GH_OFFENSE : cols;
        const seasonsAll = [...new Set(rows.map(x => x.g.season))].sort((a, b) => b - a);
        const pick = Number(param('season')) || 0;
        const list = rows.filter(x => !pick || x.g.season === pick).slice().reverse();
        const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
        let current = 1;
        // fixed pixel columns that add up to the content width (1094px), so nothing resizes or truncates
        const wide = ghCols.length > 6;
        const widths = wide ? ['92px', '64px', '86px', '80px', ...ghCols.map(() => '52px'), '60px', '140px']
                            : ['110px', '70px', '110px', '96px', ...ghCols.map(() => `${Math.floor(440 / ghCols.length)}px`), '80px', '188px'];
        const shortDate = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` '${String(d.getFullYear()).slice(2)}`;
        content.innerHTML = `<div class="wrap page-pad"><div class="panel" style="margin-top:34px">
            <div class="panel-head"><div><div class="eyebrow">${list.length} games</div><h3 class="panel-title">Game History</h3></div>
                <select class="select" id="gh-season"><option value="">All seasons</option>${seasonsAll.map(x => `<option value="${x}"${x === pick ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
            <div class="table-scroll"><table class="data-table gh-table" style="width:${widths.reduce((a, w) => a + parseInt(w), 0)}px">${SITE.cols(...widths)}
                <thead><tr><th>Date</th><th>Week</th><th>Opp</th><th>Result</th>${ghCols.map(([h]) => `<th class="num stat">${h}</th>`).join('')}
                <th class="num">FPts</th><th>Venue · Weather</th></tr></thead><tbody id="gh-rows"></tbody></table></div>
            <div class="pager" id="gh-pager"></div></div></div>`;

        function render() {
            const start = (current - 1) * PER_PAGE;
            document.getElementById('gh-rows').innerHTML = list.slice(start, start + PER_PAGE).map(x => { const { s, res } = gameLine(x);
                return `<tr><td>${shortDate(new Date(x.g.kickoff))}</td><td>${esc(PS.typeLabel(x.g))}</td>
                    <td><span class="team-cell"><img src="${PS.nflLogo(s.opp)}" alt="">${s.home ? 'vs' : '@'} ${esc(s.opp)}</span></td><td>${res}</td>
                    ${ghCols.map(([, k]) => `<td class="num stat">${x.r[k] ?? 0}</td>`).join('')}<td class="num"><b>${GT.pts(x.r.fpts)}</b></td>
                    <td class="muted">${esc(PS.conditions(x.g))}</td></tr>`; }).join('') || `<tr><td colspan="${ghCols.length + 6}" class="muted">No games.</td></tr>`;
            const nums = [...new Set([1, pages, current - 2, current - 1, current, current + 1, current + 2])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
            let btns = '', prev = 0;
            nums.forEach(n => { if (n - prev > 1) btns += '<span class="pager-gap">…</span>'; btns += `<button data-page="${n}" class="${n === current ? 'on' : ''}">${n}</button>`; prev = n; });
            document.getElementById('gh-pager').innerHTML = list.length ? `
                <span class="pager-info">${start + 1}-${Math.min(start + PER_PAGE, list.length)} of ${list.length}</span>
                <div class="pager-nav"><button data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}>Prev</button>${btns}
                    <button data-page="${current + 1}" ${current === pages ? 'disabled' : ''}>Next</button></div>` : '';
            document.querySelectorAll('#gh-pager button[data-page]').forEach(btn => btn.addEventListener('click', () => {
                current = Number(btn.dataset.page); render();
                document.querySelector('#content .panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }));
        }
        render();
        document.getElementById('gh-season').addEventListener('change', e => {
            const u = new URL(location.href); if (e.target.value) u.searchParams.set('season', e.target.value); else u.searchParams.delete('season'); location.href = u;
        });
    }

    const drawn = ({ stats, highlights, achievements, 'game-history': gameHistory })[page]();
    if (page === 'stats') Promise.resolve(drawn).then(() => { renderAnalytics(); renderField(); });   // after the page (and its #analytics slot) exists
})();
