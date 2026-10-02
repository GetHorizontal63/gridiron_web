/* Managers: every manager in league history */
(async function () {
    const { esc, url } = SITE;
    const b = await GT.load();
    const career = await GT.query(`SELECT t.owner_id AS id, COUNT(*) AS gp, SUM(t.team_score > t.opponent_score) AS w,
                                          SUM(t.team_score = t.opponent_score) AS ti, SUM(t.team_score) AS pf
                                   FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id
                                   WHERE m.season_period = 'Regular' GROUP BY t.owner_id`);
    const stats = Object.fromEntries(career.map(c => [c.id, c]));
    const titles = id => Object.entries(b.finish).filter(([k, p]) => k.endsWith(`-${id}`) && p === 1).length;
    const active = b.owners.filter(o => o.last === b.season);
    // reigning champion: winner of the most recent season with a final placement
    const champSeasons = Object.entries(b.finish).filter(([, p]) => p === 1).map(([k]) => k.split('-').map(Number));
    const reigning = champSeasons.length ? champSeasons.reduce((m, x) => x[0] > m[0] ? x : m)[1] : null;

    SITE.subHeader({ crumbs: [['Managers']],
                     tabs: [{ label: 'All Managers', href: url('pages/managers/index.html'), active: true },
                            { label: 'Where We Marched', href: url('pages/managers/where-we-marched.html') },
                            { label: 'League Overview', href: url('pages/past-seasons/overview.html') }] });
    SITE.hero({ title: 'Managers', size: 'short', dots: false, image: 'background-3.png',
                meta: [`${b.owners.length} managers since 2019 · ${active.length} active in ${b.season}`] });

    let filter = 'active';
    const content = document.getElementById('content');
    function render() {
        const list = (filter === 'active' ? active : b.owners).slice()
            .sort((x, y) => titles(y.id) - titles(x.id) || ((stats[y.id] || {}).w || 0) - ((stats[x.id] || {}).w || 0));
        content.innerHTML = `<div class="wrap page-pad">
            <div class="panel-head" style="margin-top:34px">
                <div><div class="eyebrow">League history</div><h2 class="section-title">The Managers</h2></div>
                <div class="seg" id="seg"><button data-f="active" class="${filter === 'active' ? 'on' : ''}">Active ${b.season}</button>
                    <button data-f="all" class="${filter === 'all' ? 'on' : ''}">All time</button></div>
            </div>
            <div class="tile-grid mgr-grid">${list.map(o => {
                const s = stats[o.id] || { gp: 0, w: 0, ti: 0 };
                const t = titles(o.id);
                const l = s.gp - s.w - s.ti;
                const isReigning = o.id === reigning;
                // champions get a left bar (gold for the reigning champion) that carries the title count
                const label = `Champion${t > 1 ? ` ×${t}` : ''}`;
                return `<a class="m-tile${t ? ' champ' : ''}${isReigning ? ' reigning' : ''}" href="${url(`pages/managers/overview.html?m=${o.id}`)}"${t ? ` title="${isReigning ? 'Reigning champion · ' : ''}${label}"` : ''}>
                    ${t ? `<span class="champ-bar"><span>${label}</span></span>` : ''}
                    <img src="${GT.logo(o.name)}" alt="">
                    <div class="m-info"><div class="m-top"><h3>${esc(o.name)}</h3></div>
                        <p>${esc(GT.teamName(b, o.name, o.last))}</p>
                        <p>${o.first}-${o.last} · ${s.w}-${l}${s.ti ? '-' + s.ti : ''} career</p></div>
                </a>`;
            }).join('')}</div></div>`;
        document.querySelectorAll('#seg button').forEach(btn => btn.addEventListener('click', () => { filter = btn.dataset.f; render(); }));
    }
    render();
})();
