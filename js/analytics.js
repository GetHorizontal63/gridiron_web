/* Comparative analytics helpers: Statcast-style percentile bars and PFF-style 0-100 grades.
   A percentile is where a value sits in its comparison group (same season, and for players the same position):
   99 = better than everyone, 1 = worse than everyone. "Lower is better" metrics are flipped. */
window.AN = (() => {
    const esc = s => SITE.esc(s);

    // share of the field this value beats (ties count half), as 1-99
    function percentile(value, field, higherBetter = true) {
        const vals = field.filter(v => v != null && !Number.isNaN(v));
        if (value == null || Number.isNaN(value) || vals.length < 2) return null;
        let below = 0, equal = 0;
        vals.forEach(v => { if (v === value) equal += 1; else if (higherBetter ? v < value : v > value) below += 1; });
        const p = (below + (equal - 1) / 2) / (vals.length - 1) * 100;
        return Math.max(1, Math.min(99, Math.round(p)));
    }

    // Statcast colour scale: deep blue (1) -> grey (50) -> deep red (99)
    function color(p) {
        if (p == null) return '#c9c9c9';
        const lerp = (a, b, t) => Math.round(a + (b - a) * t);
        const blue = [52, 94, 168], grey = [196, 196, 196], red = [211, 47, 47];
        const [from, to, t] = p < 50 ? [blue, grey, p / 50] : [grey, red, (p - 50) / 50];
        return `rgb(${lerp(from[0], to[0], t)},${lerp(from[1], to[1], t)},${lerp(from[2], to[2], t)})`;
    }

    // one Statcast row: label | value | bar with the percentile in a circle at its end
    function bar(label, shown, p, note = '') {
        const w = p == null ? 0 : p;
        return `<div class="an-row" title="${esc(note)}">
            <span class="an-label">${esc(label)}</span>
            <span class="an-val">${shown}</span>
            <span class="an-track"><span class="an-fill" style="width:${w}%;background:${color(p)}"></span>
                <span class="an-dot" style="left:${w}%;background:${color(p)}">${p == null ? '–' : p}</span></span>
        </div>`;
    }

    // PFF-style grade: 0-100, from the average percentile of a category
    const grade = pcts => { const v = pcts.filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
    const tier = g => g == null ? '' : g >= 90 ? 'Elite' : g >= 80 ? 'High quality' : g >= 65 ? 'Above average' : g >= 50 ? 'Average' : g >= 35 ? 'Below average' : 'Poor';
    function gradeBadge(label, g) {
        return `<div class="an-grade"><span class="an-ring" style="--c:${color(g)}">${g == null ? '–' : g}</span>
            <b>${esc(label)}</b><small>${tier(g)}</small></div>`;
    }

    // Strip plot of the whole field for one metric, with highlighted entries
    function strip(values, highlights, { label = '', fmt = v => v.toFixed(1), higherBetter = true } = {}) {
        const vals = values.filter(v => v != null);
        if (vals.length < 2) return '';
        const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
        // positions in %, so dots spread with the width while text stays a fixed size
        const x = v => ((higherBetter ? (v - lo) : (hi - v)) / span * 100).toFixed(2);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const edge = v => { const p = +x(v); return p < 12 ? 'left' : p > 88 ? 'right' : ''; };
        let html = '<span class="an-axis"></span>' + vals.map(v => `<span class="an-pt" style="left:${x(v)}%"></span>`).join('')
            + `<span class="an-avg" style="left:${x(avg)}%"></span><span class="an-tag avg ${edge(avg)}" style="left:${x(avg)}%">avg ${fmt(avg)}</span>`;
        highlights.forEach(h => {
            if (h.value == null) return;
            html += `<span class="an-hl" style="left:${x(h.value)}%;background:${h.color || 'var(--ink)'}"></span>
                     <span class="an-tag me ${edge(h.value)}" style="left:${x(h.value)}%">${esc(h.label)} ${fmt(h.value)}</span>`;
        });
        return `<div class="an-strip"><div class="an-strip-label">${esc(label)} <span>· worse ← → better</span></div>
            <div class="an-plot" role="img" aria-label="${esc(label)} distribution">${html}</div></div>`;
    }

    const legend = () => `<div class="an-legend"><span>Percentile vs the field:</span><span class="an-scale"></span><span>Poor · Average · Great</span></div>`;

    return { percentile, color, bar, grade, gradeBadge, tier, strip, legend };
})();
