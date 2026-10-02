/* Search: managers (names and every team name they've used), NFL players, and site pages */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    SITE.subHeader({ crumbs: [['Search']], tabs: [] });
    SITE.hero({ title: 'Search', size: 'short', dots: false, image: 'background-17.png', meta: ['Managers, team names, players and pages'] });

    const pages = [{ label: 'Home', href: url('index.html') }, { label: 'Stats', href: url('pages/stats.html') }]
        .concat(SITE.SITE_MAP.filter(g => !g.hidden).flatMap(g => [{ label: g.label, href: url(g.href) },
            ...g.children.filter(c => !c.needs).map(c => ({ label: `${g.label} · ${c.label}`, href: url(c.href) }))]));
    let players = [];
    PS.index().then(list => { players = list; run(); }).catch(() => {});

    content.innerHTML = `<div class="wrap page-pad">
        <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">Find anything</div><h2 class="section-title">Search</h2></div></div>
        <div class="search-box"><input id="q" type="search" placeholder="Manager, team name or player..." autocomplete="off" value="${esc(param('q') || '')}" autofocus></div>
        <div class="search-results" id="results"></div></div>`;

    const section = (title, rows) => rows.length ? `<div class="panel"><h3 class="panel-title" style="margin-bottom:12px">${title}</h3>
        <div class="table-scroll"><table class="data-table">${SITE.cols('55%', '45%')}<tbody>${rows.join('')}</tbody></table></div></div>` : '';
    function run() {
        const q = document.getElementById('q').value.trim().toLowerCase();
        const box = document.getElementById('results');
        if (q.length < 2) { box.innerHTML = '<p class="muted">Type at least two letters.</p>'; return; }
        const managers = b.owners.filter(o => o.name.toLowerCase().includes(q) ||
            Object.values(b.names[o.name] || {}).some(n => n.toLowerCase().includes(q))).slice(0, 12);
        const found = players.filter(p => p.name.toLowerCase().includes(q))
            .sort((x, y) => (y.gp.REG + y.gp.POST) - (x.gp.REG + x.gp.POST)).slice(0, 15);
        const pageHits = pages.filter(p => p.label.toLowerCase().includes(q));
        box.innerHTML = section('Managers', managers.map(o => {
                const match = Object.entries(b.names[o.name] || {}).find(([, n]) => n.toLowerCase().includes(q));
                return `<tr><td><a class="team-cell" href="${url(`pages/managers/overview.html?m=${o.id}`)}"><img src="${GT.logo(o.name)}" alt=""><b>${esc(o.name)}</b></a></td>
                    <td class="muted">${match ? `${esc(match[1])} (${match[0]})` : esc(GT.teamName(b, o.name, o.last))}</td></tr>`;
            })) +
            section('Players', found.map(p => `<tr><td><a class="team-cell" href="${url(`pages/players/stats.html?id=${encodeURIComponent(p.id)}`)}"><img src="${PS.nflLogo(p.team)}" alt=""><b>${esc(p.name)}</b></a></td>
                <td class="muted">${esc(p.pos)} · ${esc(p.team)} · ${Object.keys(p.seasons)[0]}-${Object.keys(p.seasons).slice(-1)[0]}</td></tr>`)) +
            section('Pages', pageHits.map(p => `<tr><td><a href="${p.href}"><b>${esc(p.label)}</b></a></td><td></td></tr>`))
            || '<p class="muted">No matches.</p>';
    }
    document.getElementById('q').addEventListener('input', run);
    run();
})();
