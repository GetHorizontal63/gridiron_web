/* Live fantasy points for one NFL game, from ESPN's game summary (box score + play-by-play) and the league's scoring
   rules (data/scoring_rules.json: ESPN stat id -> points, with lineup-slot overrides: 16 = D/ST, 14 = head coach).
   Nothing comes from league.db: every point is recomputed from the game as it happens.

   A browser port of the platform's scorer (grasstouchers_ffl_app/server/app/gamedata/plays.py, providers/espn.py and
   scoring/engine.py), which reproduces ESPN's recorded points exactly for QB/RB/WR/TE/K/HC. Known limits, same as
   there: a punter's "inside the 10" is read from play text (ESPN's own rule isn't public; right in most games), and
   D/ST forced fumbles / blocked kicks come from play text too. Stats with no public source (fumble recovery TD by the
   offense, blocked kick return TD, 2-pt return, 1-pt safety) are not counted. */
(function () {
    const r2 = x => Math.round((x + 0) * 100) / 100 + 0;

    // ---------------------------------------------------------------- rules: ESPN stat id -> points, per kind of entity
    let rulesP = null;
    function rules(src, season) {
        rulesP = rulesP || fetch(src, { cache: 'no-store' }).then(r => r.ok ? r.json() : { seasons: {} }).catch(() => ({ seasons: {} }));
        return rulesP.then(d => {
            const years = Object.keys(d.seasons).map(Number).sort((a, b) => b - a);
            const list = d.seasons[String(season)] || d.seasons[String(years[0])] || [];
            const pick = slot => Object.fromEntries(list.map(x => [x.id, x.slots && x.slots[slot] != null ? x.slots[slot] : x.pts]));
            return { player: Object.fromEntries(list.map(x => [x.id, x.pts])), dst: pick('16'), hc: pick('14') };
        });
    }

    // ---------------------------------------------------------------- box score -> stat lines
    const STAT = {
        'passing.passingYards': 'pass_yd', 'passing.passingTouchdowns': 'pass_td', 'passing.interceptions': 'pass_int',
        'rushing.rushingYards': 'rush_yd', 'rushing.rushingTouchdowns': 'rush_td',
        'receiving.receptions': 'rec', 'receiving.receivingYards': 'rec_yd', 'receiving.receivingTouchdowns': 'rec_td',
        'fumbles.fumblesLost': 'fum_lost',
        'defensive.sacks': 'sack', 'defensive.defensiveTouchdowns': 'def_td',
        'interceptions.interceptions': 'int', 'interceptions.interceptionTouchdowns': 'int_td',
        'kickReturns.kickReturns': 'kr', 'kickReturns.kickReturnYards': 'kr_yd', 'kickReturns.kickReturnTouchdowns': 'kr_td',
        'puntReturns.puntReturns': 'pr', 'puntReturns.puntReturnYards': 'pr_yd', 'puntReturns.puntReturnTouchdowns': 'pr_td',
        'punting.punts': 'punts', 'punting.puntYards': 'punt_yd', 'punting.puntsInside20': 'punt_in20'
    };
    const COMPOUND = { 'kicking.fieldGoalsMade/fieldGoalAttempts': ['/', ['fgm', 'fga']], 'kicking.extraPointsMade/extraPointAttempts': ['/', ['xpm', 'xpa']] };
    const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

    // finds a team's player in play text, which abbreviates names as 'F.Last' ("J.Bates")
    function nameIndex() {
        const byTeam = {};
        return {
            add(team, id, first, last) {
                last = String(last || '').trim().replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '');
                if (first && last) (byTeam[team] = byTeam[team] || []).push([`${first[0]}.${last}`.toLowerCase(), id]);
            },
            find(team, text, start = 0) {
                let best = null; const hay = text.toLowerCase();
                for (const [key, id] of byTeam[team] || []) { const i = hay.indexOf(key, start); if (i !== -1 && (!best || i < best[1])) best = [id, i]; }
                return best;
            }
        };
    }

    // scoring events the box score doesn't break out, read from the play-by-play
    const FG_RE = /(\d+) yard field goal is (GOOD|No Good|BLOCKED)/i;
    const TWO_PT_RE = /TWO-POINT CONVERSION ATTEMPT\.([\s\S]*?)ATTEMPT (SUCCEEDS|FAILS)/i;
    const PUNT_RE = /punts (\d+) yards? to (\w+) (\d+)/i;
    const TEXT_ABBR = { CLV: 'CLE', HST: 'HOU', BLT: 'BAL', ARZ: 'ARI', LA: 'LAR', WAS: 'WSH', JAC: 'JAX' };   // play-text codes -> ESPN's
    function playEvents(summary, names) {
        const player = {}, team = {};
        const addP = (id, k, n = 1) => { const d = player[id] = player[id] || {}; d[k] = (d[k] || 0) + n; };
        const addT = (id, k, n = 1) => { const d = team[id] = team[id] || {}; d[k] = (d[k] || 0) + n; };
        const abbrs = Object.fromEntries(((summary.header?.competitions || [{}])[0].competitors || []).map(c => [String(c.team.id), c.team.abbreviation]));
        const side = (play, kind) => { const t = (play.teamParticipants || []).find(x => x.type === kind); return t ? String(t.id) : null; };
        for (const drive of summary.drives?.previous || []) for (const play of drive.plays || []) {
            let text = play.text || '';
            if (/- No Play\b/i.test(text)) continue;                 // wiped out by a penalty (the down is replayed)
            const rev = text.search(/the play was REVERSED\./i);     // replay review: only the corrected play after it counts
            if (rev !== -1) text = text.slice(rev).replace(/^the play was REVERSED\./i, '');
            const ptype = play.type?.text || '', off = side(play, 'offense'), def = side(play, 'defense');
            let m;
            if (/field goal/i.test(ptype) && (m = FG_RE.exec(text))) {     // gate on the type: a kick wiped out by a penalty doesn't count
                const dist = Number(m[1]), outcome = m[2].toLowerCase(), kicker = names.find(off, text);
                if (kicker) addP(kicker[0], outcome === 'good' ? (dist < 40 ? 'fg_0_39' : dist < 50 ? 'fg_40_49' : dist < 60 ? 'fg_50_59' : 'fg_60p') : 'fg_miss');
                if (outcome === 'blocked' && def) addT(def, 'blk_kick');
            } else if (ptype === 'Blocked Punt') {
                if (def) addT(def, 'blk_kick');
                const punter = names.find(off, text); if (punter) addP(punter[0], 'punt_blocked');
            } else if (ptype === 'Punt') {
                punt(play, text, off, def);
            }
            // "FUMBLES (T.Johnson)": the parenthetical is the defender who forced it; "(Aborted)" is a botched snap, not forced
            if (/FUMBLES \((?!Aborted)/i.test(text) && !/penalty/i.test(ptype) && def) addT(def, 'ff');
            if (/extra point is Blocked/i.test(text) && def) addT(def, 'blk_kick');
            if ((m = TWO_PT_RE.exec(text)) && m[2].toUpperCase() === 'SUCCEEDS') {
                const body = m[1], lower = body.toLowerCase();
                if (lower.includes(' pass ') || lower.trim().startsWith('pass')) {
                    const passer = names.find(off, body), at = lower.indexOf('pass to ');
                    const receiver = at !== -1 ? names.find(off, body, at + 8) : null;
                    if (passer) addP(passer[0], 'pass_2pt');
                    if (receiver) addP(receiver[0], 'rec_2pt');
                } else {
                    const rusher = names.find(off, body); if (rusher) addP(rusher[0], 'rush_2pt');
                }
            }
        }
        for (const sp of summary.scoringPlays || []) if (/safety/i.test(sp.text || '') && sp.team?.id) addT(String(sp.team.id), 'safety');
        return { player, team };

        function punt(play, text, off, def) {
            const punter = names.find(off, text);
            if (!punter) return;
            const id = punter[0], lower = text.toLowerCase(), touchback = lower.includes('touchback');
            if (lower.includes('fair catch')) addP(id, 'punt_fc');
            const m = PUNT_RE.exec(text);
            if (!m || touchback) return;
            // where it came down, from the receiving goal line: "to TEAM n" in the text (play text has its own team codes,
            // mapped back here); when the code isn't recognised, the line of scrimmage minus the kick
            const start = play.start || {}, dist = Number(m[1]), spot = Number(m[3]);
            const spotTeam = TEXT_ABBR[m[2].toUpperCase()] || m[2].toUpperCase(), receiver = abbrs[def || ''], kicker = abbrs[off || ''];
            const landed = spotTeam === receiver ? spot : spotTeam === kicker ? 100 - spot
                : typeof start.yardsToEndzone === 'number' ? start.yardsToEndzone - dist : spot;
            const end = play.end || {};
            const ended = typeof end.yardsToEndzone === 'number' ? 100 - end.yardsToEndzone : landed;
            // ESPN's "inside the 10" (checked against its 2026 counts): the kick came down inside the 10 AND the play
            // ended inside it (after any return or penalty), both strictly: a ball at the 10 doesn't count
            if (landed < 10 && ended < 10) addP(id, 'punt_in10');
        }
    }

    // ---------------------------------------------------------------- the game's stat lines (players, D/ST, coaches)
    function lines(summary) {
        const players = {}, names = nameIndex();
        for (const block of summary.boxscore?.players || []) {
            const abbr = block.team.abbreviation, teamId = String(block.team.id);
            for (const cat of block.statistics || []) for (const a of cat.athletes || []) {
                const ath = a.athlete, id = String(ath.id);
                names.add(teamId, id, ath.firstName, ath.lastName);
                const p = players[id] = players[id] || { id, name: ath.shortName || ath.displayName, full: ath.displayName, team: abbr, teamId, stats: {}, groups: new Set() };
                p.groups.add(cat.name);
                (cat.keys || []).forEach((key, i) => {
                    const raw = (a.stats || [])[i], k = `${cat.name}.${key}`;
                    if (COMPOUND[k]) { const [sep, outs] = COMPOUND[k]; String(raw).split(sep).forEach((part, j) => { const n = num(part); if (n != null) p.stats[outs[j]] = n; }); }
                    else if (STAT[k]) { const n = num(raw); if (n != null) p.stats[STAT[k]] = n; }
                });
            }
        }
        const ev = playEvents(summary, names);
        Object.entries(ev.player).forEach(([id, extra]) => { if (players[id]) Object.entries(extra).forEach(([k, v]) => { players[id].stats[k] = (players[id].stats[k] || 0) + v; }); });
        Object.values(players).forEach(p => {
            const s = p.stats;
            if (s.punt_in10) s.punt_in10 = Math.min(s.punt_in10, s.punt_in20 || 0);   // never more inside the 10 than ESPN counts inside the 20
            if (s.fga != null) s.fg_miss = s.fg_miss != null ? s.fg_miss : Math.max(0, s.fga - s.fgm);
        });

        const comp = summary.header.competitions[0];
        const sides = ['home', 'away'].map(h => comp.competitors.find(c => c.homeAway === h));
        const yards = Object.fromEntries((summary.boxscore?.teams || []).map(t => [String(t.team.id), num(((t.statistics || []).find(x => x.name === 'totalYards') || {}).displayValue)]));
        const sum = (teamId, k) => Object.values(players).filter(p => p.teamId === teamId).reduce((a, p) => a + (p.stats[k] || 0), 0);
        const teams = {};
        sides.forEach((me, i) => {
            const opp = sides[1 - i], id = String(me.team.id), oppId = String(opp.team.id);
            const d = {};
            ['sack', 'int', 'def_td', 'int_td', 'kr', 'kr_td', 'kr_yd', 'pr', 'pr_td', 'pr_yd'].forEach(k => { d[k] = sum(id, k); });
            d.fum_rec = sum(oppId, 'fum_lost');                      // the opponent's lost fumbles (the box score's count includes own recoveries)
            d.fum_td = Math.max(d.def_td - d.int_td, 0);
            Object.entries(ev.team[id] || {}).forEach(([k, v]) => { d[k] = (d[k] || 0) + v; });
            const mine = num(me.score) || 0, theirs = num(opp.score) || 0;
            if (yards[oppId] != null) d.yards_allowed = yards[oppId];
            Object.assign(d, { points_allowed: theirs, points_scored: mine, margin: mine - theirs });
            teams[id] = { id, abbr: me.team.abbreviation, name: me.team.shortDisplayName || me.team.name, stats: d };
        });
        // D/ST points allowed leave out what the other side's defense / special teams scored
        Object.values(teams).forEach(t => {
            const o = Object.values(teams).find(x => x !== t).stats;
            t.stats.points_allowed_adj = Math.max(t.stats.points_allowed - 6 * (o.int_td + o.fum_td + o.kr_td + o.pr_td) - 2 * (o.safety || 0), 0);
        });
        return { players: Object.values(players), teams: Object.values(teams) };
    }

    // ---------------------------------------------------------------- points (ESPN stat ids)
    const PER_YARD = [[3, 'pass_yd', 'Pass yds'], [24, 'rush_yd', 'Rush yds'], [42, 'rec_yd', 'Rec yds']];
    const PLAYER_COUNT = [[4, ['pass_td'], 'Pass TD'], [20, ['pass_int'], 'INT'], [19, ['pass_2pt'], '2PT pass'], [25, ['rush_td'], 'Rush TD'],
        [26, ['rush_2pt'], '2PT rush'], [43, ['rec_td'], 'Rec TD'], [44, ['rec_2pt'], '2PT rec'], [53, ['rec'], 'Rec'],
        [80, ['fg_0_39'], 'FG 0-39'], [77, ['fg_40_49'], 'FG 40-49'], [198, ['fg_50_59'], 'FG 50-59'], [201, ['fg_60p'], 'FG 60+'],
        [85, ['fg_miss'], 'FG missed'], [86, ['xpm'], 'PAT'], [138, ['punts'], 'Punts'], [141, ['punt_in20'], 'Inside 20'],
        [140, ['punt_in10'], 'Inside 10'], [146, ['punt_fc'], 'Fair catch'], [142, ['punt_blocked'], 'Punt blocked'],
        [72, ['fum_lost'], 'Fumble lost'], [101, ['kr_td'], 'KR TD'], [102, ['pr_td'], 'PR TD']];
    const DST_COUNT = [[99, ['sack'], 'Sack'], [95, ['int'], 'INT'], [96, ['fum_rec'], 'Fum rec'], [106, ['ff'], 'Forced fum'],
        [97, ['blk_kick'], 'Blocked kick'], [98, ['safety'], 'Safety'], [103, ['int_td'], 'INT TD'], [104, ['fum_td'], 'Fum TD'],
        [101, ['kr_td'], 'KR TD'], [102, ['pr_td'], 'PR TD']];
    const PA = [[89, 0, 0], [90, 1, 6], [91, 7, 13], [92, 14, 17], [121, 18, 21], [122, 22, 27], [123, 28, 34], [124, 35, 45], [125, 46, Infinity]];
    const YA = [[128, 0, 99], [129, 100, 199], [130, 200, 299], [131, 300, 349], [132, 350, 399], [133, 400, 449], [134, 450, 499], [135, 500, 549], [136, 550, Infinity]];
    const HC = [[161, 25, Infinity], [162, 20, 24], [163, 15, 19], [164, 10, 14], [165, 5, 9], [166, 1, 4]];
    const HC_LOSS = [[167, 1, 4], [168, 5, 9], [169, 10, 14], [170, 15, 19], [171, 20, 24], [172, 25, Infinity]];
    const tier = (list, v) => list.find(([, lo, hi]) => v >= lo && v <= hi);

    function score(summary, R) {
        const { players, teams } = lines(summary);
        const add = (out, label, qty, pts, always = false) => { if (pts && (qty || always)) out.push({ label, qty, pts: r2(pts) }); };
        const total = out => r2(out.reduce((a, l) => a + l.pts, 0));
        const playerRows = players.map(p => {
            const s = p.stats, out = [];
            PER_YARD.forEach(([id, k, label]) => { if (R.player[id] != null) add(out, label, s[k] || 0, (s[k] || 0) * R.player[id]); });
            PLAYER_COUNT.forEach(([id, keys, label]) => { if (R.player[id] != null) { const q = keys.reduce((a, k) => a + (s[k] || 0), 0); add(out, label, q, q * R.player[id]); } });
            if (R.player[88] != null && s.xpa != null) { const q = s.xpa - s.xpm; add(out, 'PAT missed', q, q * R.player[88]); }
            if (s.punts > 0) {                                     // one band by gross average, the highest reached
                const avg = (s.punt_yd || 0) / s.punts, band = [[148, 44], [149, 42], [150, 40]].find(([, lo]) => avg >= lo);
                if (band && R.player[band[0]] != null) add(out, `Avg ${avg.toFixed(1)}`, 1, R.player[band[0]]);
            }
            return { ...p, groups: [...p.groups], pts: total(out), lines: out };
        }).filter(p => p.lines.length);
        const teamRows = teams.map(t => {
            const s = t.stats, dst = [], hc = [];
            DST_COUNT.forEach(([id, keys, label]) => { if (R.dst[id] != null) { const q = keys.reduce((a, k) => a + (s[k] || 0), 0); add(dst, label, q, q * R.dst[id]); } });
            [[117, 'kr_yd', 'KR yds /25'], [119, 'pr_yd', 'PR yds /25']].forEach(([id, k, label]) => { if (R.dst[id] != null) { const q = Math.trunc((s[k] || 0) / 25); add(dst, label, q, q * R.dst[id]); } });
            const pa = s.points_allowed_adj, paT = tier(PA, pa); if (paT && R.dst[paT[0]] != null) add(dst, `${pa} pts allowed`, pa, R.dst[paT[0]], true);
            if (s.yards_allowed != null) { const yT = tier(YA, s.yards_allowed); if (yT && R.dst[yT[0]] != null) add(dst, `${s.yards_allowed} yds allowed`, s.yards_allowed, R.dst[yT[0]], true); }
            if (s.margin) { const hT = tier(s.margin > 0 ? HC : HC_LOSS, Math.abs(s.margin)); if (hT && R.hc[hT[0]] != null) add(hc, `${s.margin > 0 ? 'Win' : 'Loss'} by ${Math.abs(s.margin)}`, Math.abs(s.margin), R.hc[hT[0]]); }
            return { ...t, dst: { pts: total(dst), lines: dst }, hc: { pts: total(hc), lines: hc } };
        });
        return { players: playerRows, teams: teamRows };
    }

    window.LIVEFP = { rules, lines, score };
})();
