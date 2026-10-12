/* FP+ and boom / bust, per game.
   Weekly FP+  = (player actual / player projection) / (position average actual / position average projection) x 100,
                 where the position averages are over every player at the position with a real projection that week.
                 100 = hit the projection exactly as well as the position did that week; 130 = 30% better than that.
   The z-score puts each week's FP+ on the league-wide spread for the position over the measured period
   (mean and standard deviation of every projected player-week at the position), on a tiered ladder:
       within ±0.5 Normal · 0.5-1.25 Boom / Bust · 1.25-2 Big · 2-3 Huge · beyond 3 Smash / Disaster
   A week projected under 30% of the position's median projection (injured, deep backup, bye) is "unprojected":
   its ratio explodes on a tiny denominator, so it is left out of FP+ and of every rate.
   FPP.classify(rows)  rows: every player-week at ONE position in the period, { season, week, id, pts, proj }
                       -> { get(row) -> { fpp, z, cls }, mean, sd, floor, ratio } */
window.FPP = (() => {
    // side: -1 bust tiers, 0 normal, +1 boom tiers; tier 1-4 = how far out (drives colour and shading)
    const BANDS = [
        { key: 'disaster', label: 'Disaster', lo: -Infinity, hi: -3, side: -1, tier: 4 },
        { key: 'hugebust', label: 'Huge Bust', lo: -3, hi: -2, side: -1, tier: 3 },
        { key: 'bigbust', label: 'Big Bust', lo: -2, hi: -1.25, side: -1, tier: 2 },
        { key: 'bust', label: 'Bust', lo: -1.25, hi: -0.5, side: -1, tier: 1 },
        { key: 'normal', label: 'Normal', lo: -0.5, hi: 0.5, side: 0, tier: 0 },
        { key: 'boom', label: 'Boom', lo: 0.5, hi: 1.25, side: 1, tier: 1 },
        { key: 'bigboom', label: 'Big Boom', lo: 1.25, hi: 2, side: 1, tier: 2 },
        { key: 'hugeboom', label: 'Huge Boom', lo: 2, hi: 3, side: 1, tier: 3 },
        { key: 'smash', label: 'Smash', lo: 3, hi: Infinity, side: 1, tier: 4 }
    ];
    const EDGES = [0.5, 1.25, 2, 3];                     // band edges in standard deviations, both sides
    const band = z => BANDS.find(b => z >= b.lo && z < b.hi) || BANDS[BANDS.length - 1];
    const key = r => `${r.season}|${r.week}|${r.id}`;
    const median = v => { const s = v.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };

    function classify(rows) {
        const projected = rows.filter(r => r.proj > 0 && r.pts != null);
        const floor = 0.3 * median(projected.map(r => r.proj));
        const ok = projected.filter(r => r.proj >= floor);
        const wk = {};                                   // position totals per week: the league ratio
        ok.forEach(r => { const k = `${r.season}|${r.week}`, w = wk[k] || (wk[k] = { a: 0, p: 0 }); w.a += r.pts; w.p += r.proj; });
        const out = new Map();
        const vals = [];
        ok.forEach(r => {
            const w = wk[`${r.season}|${r.week}`];
            const lr = w.p ? w.a / w.p : 0;
            if (!lr) return;
            const fpp = (r.pts / r.proj) / lr * 100;
            out.set(key(r), { fpp });
            vals.push(fpp);
        });
        const mean = vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : 100;
        const sd = vals.length > 1 ? Math.sqrt(vals.reduce((t, v) => t + (v - mean) ** 2, 0) / (vals.length - 1)) : 0;
        out.forEach(o => { o.z = sd ? (o.fpp - mean) / sd : 0; o.cls = band(o.z).key; });
        return { get: r => out.get(key(r)) || null, mean, sd, floor, ratio: wk };
    }

    // period FP+ for a set of a player's weeks: their actual / projected over the league's actual / projected in the same weeks
    function period(rows, C) {
        let a = 0, p = 0, la = 0, lp = 0;
        rows.forEach(r => { const c = C.get(r); if (!c) return; const w = C.ratio[`${r.season}|${r.week}`]; a += r.pts; p += r.proj; la += w.a; lp += w.p; });
        return p && lp ? (a / p) / (la / lp) * 100 : null;
    }
    // share of a player's (or group's) projected weeks in each band; side(+1) = every boom tier, side(-1) = every bust tier
    function mix(rows, C) {
        const counts = Object.fromEntries(BANDS.map(b => [b.key, 0]));
        let n = 0;
        rows.forEach(r => { const c = C.get(r); if (c) { counts[c.cls]++; n++; } });
        const side = s => n ? BANDS.filter(b => b.side === s).reduce((t, b) => t + counts[b.key], 0) / n : null;
        return { n, unprojected: rows.length - n, counts, share: k => n ? counts[k] / n : null, side };
    }
    const TIP = "Weekly FP+ = (player points / player projection) ÷ (position points / position projection that week) × 100. Each week's FP+ is then measured in standard deviations from the position's average in this period: within ±0.5 Normal; 0.5 to 1.25 Boom / Bust; 1.25 to 2 Big Boom / Big Bust; 2 to 3 Huge Boom / Huge Bust; beyond 3 Smash / Disaster. Weeks projected under 30% of the position's median projection are left out (unprojected).";
    return { BANDS, EDGES, classify, period, mix, TIP };
})();
