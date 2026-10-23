/* Fantasy play ticker: each play of an NFL game turned into the fantasy points it produced, and for whom, under the
   league's scoring (data/scoring_rules.json via LIVEFP.rules). Read from ESPN's play-by-play text, like the scorer in
   js/live-fantasy.js; per play it's approximate (the box score totals stay the reference): yardage, touchdowns, catches,
   interceptions, lost fumbles, two-point conversions, field goals and extra points, punts and fair catches, and the
   D/ST's sacks, interceptions, fumble recoveries and return touchdowns. Tiered items (yards / points allowed, punt
   average, coach margin) only exist at the end of a game, so they're not per-play.

   TICKER.plays(summary, rules) -> [{ id, wall, q, clock, text, gains: [{ id, pts, what }] }], oldest first; a D/ST is
   id -(16000 + ESPN team id), as in league.db. */
(function () {
    const r2 = x => Math.round(x * 100) / 100;
    const yardsOf = text => { const m = /\bfor (-?\d+) (?:yards?|yds)\b/i.exec(text); return m ? Number(m[1]) : /for no gain/i.test(text) ? 0 : null; };

    // finds a team's player in play text, which abbreviates names as 'F.Last' ("D.Swift"); returns [id, position]
    function nameIndex(summary) {
        const byTeam = {};
        for (const block of summary.boxscore?.players || []) {
            const team = String(block.team.id);
            for (const cat of block.statistics || []) for (const a of cat.athletes || []) {
                const ath = a.athlete, last = String(ath.lastName || '').trim().replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '');
                if (!ath.firstName || !last) continue;
                const keys = byTeam[team] = byTeam[team] || new Map(), id = String(ath.id);
                // "D.Swift"; "Bi.Robinson" / "Br.Robinson" when two share an initial; "Daniel Jones" in some plays
                [`${ath.firstName[0]}.${last}`, `${ath.firstName.slice(0, 2)}.${last}`, `${ath.firstName} ${last}`].forEach(k => keys.set(k.toLowerCase(), id));
            }
        }
        return (team, text, start = 0) => {
            let best = null; const hay = text.toLowerCase();
            for (const [key, id] of byTeam[team] || []) { const i = hay.indexOf(key, start); if (i !== -1 && (!best || i < best[1])) best = [id, i]; }
            return best;
        };
    }

    function plays(summary, R) {
        const find = nameIndex(summary), P = R.player, D = R.dst, out = [];
        const side = (play, kind) => { const t = (play.teamParticipants || []).find(x => x.type === kind); return t ? String(t.id) : null; };
        const dst = team => String(-(16000 + Number(team)));
        for (const drive of summary.drives?.previous || []) for (const play of drive.plays || []) {
            let text = play.text || '';
            if (/- No Play\b/i.test(text)) continue;                               // wiped out by a penalty
            text = text.replace(/^[\s\S]*?reported in as eligible\.\s*/i, '');      // a lineman announcement before the play itself
            const rev = text.search(/the play was REVERSED\./i);
            if (rev !== -1) text = text.slice(rev).replace(/^the play was REVERSED\./i, '');
            const type = play.type?.text || '', off = side(play, 'offense'), def = side(play, 'defense');
            const gains = [], add = (id, pts, what) => { if (id && pts) gains.push({ id, pts: r2(pts), what }); };
            const main = text.split(/TWO-POINT CONVERSION ATTEMPT/i)[0];          // the play itself, without a conversion after it
            const td = /TOUCHDOWN/i.test(main), y = yardsOf(main);
            let m;
            if (/pass .*? to /i.test(main) && !/incomplete/i.test(main) && !/INTERCEPTED/i.test(main) && y != null) {
                const passer = find(off, text), at = text.toLowerCase().indexOf(' to ', passer ? passer[1] : 0), rec = at !== -1 ? find(off, text, at + 4) : null;
                if (passer) add(passer[0], y * (P[3] || 0) + (td ? P[4] || 0 : 0), `${y}-yd pass${td ? ', TD' : ''}`);
                if (rec) add(rec[0], y * (P[42] || 0) + (P[53] || 0) + (td ? P[43] || 0 : 0), `${y}-yd catch${td ? ', TD' : ''}`);
            } else if (/INTERCEPTED/i.test(main)) {
                const passer = find(off, text);
                if (passer) add(passer[0], P[20] || 0, 'interception');
                if (def) add(dst(def), (D[95] || 0) + (td ? D[103] || 0 : 0), td ? 'pick-six' : 'interception');
            } else if (/sacked/i.test(main)) {
                if (def) add(dst(def), D[99] || 0, 'sack');
            } else if ((/rush/i.test(type) || /fumble recovery/i.test(type)) && !/ pass |punt|kick/i.test(main)) {     // a run (also one that ended in a fumble)
                const runner = find(off, text);
                if (runner && y != null) add(runner[0], y * (P[24] || 0) + (td ? P[25] || 0 : 0), `${y}-yd run${td ? ', TD' : ''}`);
            }
            if (/field goal/i.test(type) && (m = /(\d+) yard field goal is (GOOD|No Good|BLOCKED)/i.exec(text))) {
                const kicker = find(off, text), dist = Number(m[1]), good = m[2].toUpperCase() === 'GOOD';
                const id = good ? (dist < 40 ? 80 : dist < 50 ? 77 : dist < 60 ? 198 : 201) : 85;
                if (kicker) add(kicker[0], P[id] || 0, good ? `${dist}-yd FG` : `missed ${dist}-yd FG`);
                if (m[2].toUpperCase() === 'BLOCKED' && def) add(dst(def), D[97] || 0, 'blocked FG');
            }
            if ((m = /([A-Z][a-z]?\.[A-Za-z'\-]+(?: [A-Z][a-z]+)?) extra point is GOOD/.exec(text))) {
                const kicker = find(off, text, Math.max(0, m.index - 1));
                if (kicker) add(kicker[0], P[86] || 0, 'PAT');
            }
            if ((m = /TWO-POINT CONVERSION ATTEMPT\.([\s\S]*?)ATTEMPT SUCCEEDS/i.exec(text))) {
                const body = m[1], lower = body.toLowerCase(), base = m.index + 'TWO-POINT CONVERSION ATTEMPT.'.length;
                if (lower.includes(' pass ') || lower.trim().startsWith('pass')) {
                    const passer = find(off, text, base), at = text.toLowerCase().indexOf('pass to ', base), rec = at !== -1 ? find(off, text, at + 8) : null;
                    if (passer) add(passer[0], P[19] || 0, '2-pt pass');
                    if (rec) add(rec[0], P[44] || 0, '2-pt catch');
                } else { const runner = find(off, text, base); if (runner) add(runner[0], P[26] || 0, '2-pt run'); }
            }
            if (/FUMBLES/i.test(text) && /RECOVERED by/i.test(text) && /opp|fumble recovery \(opponent\)|fumble return/i.test(type)) {
                const fumbler = find(off, text);
                if (fumbler) add(fumbler[0], P[72] || 0, 'fumble lost');
                if (def) add(dst(def), (D[96] || 0) + (td ? D[104] || 0 : 0), td ? 'fumble return TD' : 'fumble recovery');
            }
            if (type === 'Punt') {
                const punter = find(off, text);
                if (punter) add(punter[0], (P[138] || 0) + (/fair catch/i.test(text) ? P[146] || 0 : 0), /fair catch/i.test(text) ? 'punt, fair catch' : 'punt');
            }
            if (/(kickoff|punt) return touchdown/i.test(type) && def) add(dst(def), D[/punt/i.test(type) ? 102 : 101] || 0, 'return TD');
            if (gains.length) out.push({ id: play.id, wall: play.wallclock ? Date.parse(play.wallclock) : 0, q: play.period?.number, clock: play.clock?.displayValue || '', text, gains });
        }
        return out;
    }

    window.TICKER = { plays };
})();
