/* Sortable, paged table with CSV export (the Stat Finder table, reusable).
   EX.table(mount, { cols, rows, sort: [key, dir], perPage, href(row), onRow(row), csv: 'file-name' })
   cols: EX.col(key, label, width %, numeric?, render(row) -> html, csv(row) -> text). Widths are fixed (colgroup):
   columns never resize with their content. Returns { set(rows), rows() }. */
window.EX = (() => {
    const { esc } = SITE;
    const col = (k, label, w, num, render, csv) => ({ k, label, w, num, render: render || (r => esc(r[k] ?? '-')), csv: csv || (r => r[k] ?? '') });

    function table(mount, opt) {
        const per = opt.perPage || 25;
        let rows = opt.rows || [], page = 1, sort = { key: opt.sort[0], dir: opt.sort[1] };
        mount.innerHTML = `<div class="table-scroll"><table class="data-table sx-table" style="min-width:${opt.minWidth || 900}px">${SITE.cols(...opt.cols.map(c => `${c.w}%`))}
            <thead><tr>${opt.cols.map(c => `<th class="${c.num ? 'num' : ''} sx-sort" data-k="${c.k}">${esc(c.label)}</th>`).join('')}</tr></thead>
            <tbody></tbody></table></div><div class="pager"></div>`;
        const body = mount.querySelector('tbody'), pager = mount.querySelector('.pager');
        const sorted = () => rows.slice().sort((x, y) => {
            const a = x[sort.key], c = y[sort.key];
            if (a == null && c == null) return 0;
            if (a == null) return 1;
            if (c == null) return -1;
            return (typeof a === 'string' ? a.localeCompare(c) : a - c) * sort.dir;
        });
        function render() {
            const list = sorted();
            const pages = Math.max(1, Math.ceil(list.length / per));
            page = Math.min(Math.max(1, page), pages);
            const start = (page - 1) * per;
            const shown = list.slice(start, start + per);
            body.innerHTML = shown.map((r, i) => `<tr data-i="${start + i}"${opt.href ? ` class="row-link" data-href="${opt.href(r)}"` : opt.onRow ? ' class="row-link"' : ''}>
                ${opt.cols.map(c => `<td class="${c.num ? 'num' : ''}${c.k === sort.key ? ' sx-on' : ''}"${c.num ? '' : ` title="${esc(c.csv(r))}"`}>${c.render(r)}</td>`).join('')}</tr>`).join('')
                || `<tr><td colspan="${opt.cols.length}" class="muted">Nothing matches these filters.</td></tr>`;
            if (opt.onRow) body.querySelectorAll('tr[data-i]').forEach(tr => tr.addEventListener('click', e => {
                if (e.target.closest('a')) return;
                opt.onRow(list[Number(tr.dataset.i)]);
            }));
            mount.querySelectorAll('.sx-sort').forEach(th => {
                th.classList.toggle('asc', th.dataset.k === sort.key && sort.dir === 1);
                th.classList.toggle('desc', th.dataset.k === sort.key && sort.dir === -1);
            });
            const nums = [...new Set([1, pages, ...Array.from({ length: 5 }, (_, i) => page - 2 + i)])].filter(n => n >= 1 && n <= pages).sort((x, y) => x - y);
            let html = '', prev = 0;
            nums.forEach(n => { if (n - prev > 1) html += '<span class="pager-gap">…</span>'; html += `<button data-page="${n}" class="${n === page ? 'on' : ''}">${n}</button>`; prev = n; });
            pager.innerHTML = list.length ? `<span class="pager-info">${(start + 1).toLocaleString()}-${Math.min(start + per, list.length).toLocaleString()} of ${list.length.toLocaleString()}</span>
                <div class="pager-nav"><button data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Prev</button>${html}
                <button data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>Next</button></div>` : '';
            pager.querySelectorAll('button[data-page]').forEach(btn => btn.addEventListener('click', () => { page = Number(btn.dataset.page); render(); }));
        }
        mount.querySelectorAll('.sx-sort').forEach(th => th.addEventListener('click', () => {
            const k = th.dataset.k;
            if (sort.key === k) sort.dir = -sort.dir;
            else sort = { key: k, dir: opt.cols.find(c => c.k === k).num ? -1 : 1 };     // numbers start high, text A-Z
            page = 1; render();
        }));
        render();
        return {
            set(list) { rows = list; page = 1; render(); },
            rows: () => sorted(),
            csv(name) {
                const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
                const text = [opt.cols.map(c => q(c.label)).join(','), ...sorted().map(r => opt.cols.map(c => q(c.csv(r))).join(','))].join('\n');
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
                a.download = `${name}.csv`;
                a.click(); URL.revokeObjectURL(a.href);
            }
        };
    }

    // grade letter -> ring colour on the Statcast scale (A red-hot ... F cold blue); provisional rings are dashed
    const LETTER_PCT = { 'A+': 98, A: 93, 'A-': 87, 'B+': 80, B: 72, 'B-': 63, 'C+': 55, C: 45, 'C-': 36, 'D+': 28, D: 18, 'D-': 10, F: 4 };
    const ring = (letter, { small = false, prov = false, title = '' } = {}) => letter
        ? `<span class="mv-ring${small ? ' sm' : ''}${prov ? ' prov' : ''}" style="background:${AN.color(LETTER_PCT[letter] ?? 50)}" title="${esc(title)}">${esc(letter)}</span>`
        : `<span class="mv-ring none${small ? ' sm' : ''}" title="${esc(title || 'Not graded')}">–</span>`;
    const GPA = { 'A+': 4.3, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, 'D-': 0.7, F: 0 };

    return { col, table, ring, GPA, LETTER_PCT };
})();
