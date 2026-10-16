/* Past Seasons: All-Pro Teams. The three best full lineups of a season in the league's format, from the players who
   scored the most started points (GT.allPro in data.js): First Team, Second Team, Third Team. */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    const seasons = (await GT.query('SELECT DISTINCT season FROM fantasy_rosters ORDER BY season DESC')).map(r => r.season);
    const season = seasons.includes(Number(param('season'))) ? Number(param('season')) : seasons[0];
    SITE.subHeader({
        crumbs: [['Past Seasons', url('pages/past-seasons/index.html')], [`${season} All-Pro Teams`]],
        tabs: SITE.sectionTabs('competitions', 'all-pro').filter(t => !t.href.endsWith('index.html')).map(t => ({ ...t, href: `${t.href}?season=${season}` }))
    });
    const live = !Object.keys(b.finish).some(k => k.startsWith(`${season}-`));
    SITE.hero({ title: `${season} All-Pro Teams`, size: 'short', dots: false, image: 'background-14.png',
                tools: `<label class="hero-season"><span>Season</span><select class="select" id="hero-season">${seasons.map(s => `<option value="${s}"${s === season ? ' selected' : ''}>${s} season</option>`).join('')}</select></label>`,
                meta: ['The three best lineups of the season, by started points', live ? 'Season in progress: through the latest week' : 'Regular season and playoffs'] });
    document.getElementById('hero-season').addEventListener('change', e => { const u = new URL(location.href); u.searchParams.set('season', e.target.value); location.href = u; });

    const teams = await GT.allPro(season);
    const NAMES = ['First Team', 'Second Team', 'Third Team'];
    const shot = p => p.pid > 0 ? `https://a.espncdn.com/i/headshots/nfl/players/full/${p.pid}.png` : PS.nflLogo(p.team);
    const fallback = `onerror="this.src='${url('assets/nfl-logos/nfl.png')}';this.onerror=null"`;
    const row = ({ slot, p }) => p ? `<a class="ap-row" ${p.pid > 0 ? `href="${url(`pages/players/stats.html?id=${p.pid}`)}"` : ''}>
            <span class="ap-slot">${slot}</span><span class="ap-shot"><img src="${shot(p)}" alt="" ${fallback}></span>
            <span class="ap-who"><b>${esc(p.name)}</b><small>${esc(p.pos)} · ${esc(p.team || '')} · ${p.starts} start${p.starts === 1 ? '' : 's'}</small>
                <em>${esc((p.mgrs || '').split(',').join(', '))}</em></span>
            <span class="ap-pts">${GT.pts(p.pts)}</span></a>`
        : `<div class="ap-row empty"><span class="ap-slot">${slot}</span><span></span><span class="ap-who muted">-</span><span></span></div>`;
    content.innerHTML = `<div class="wrap page-pad">
        <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">${season} season</div><h2 class="section-title">All-Pro Teams</h2>
            <p class="section-copy">Every slot in the league's lineup filled with the season's top scorers in starting lineups. Bench and free-agent points don't count. FLEX takes the best RB, WR or TE left after the position slots.</p></div></div>
        <div class="ap-grid">${teams.map((t, i) => `<div class="panel ap-team ap-t${i + 1}"><div class="ap-head"><span>${NAMES[i]}</span>
            <b>${GT.pts(t.slots.reduce((s, x) => s + (x.p ? x.p.pts : 0), 0))}</b></div>${t.slots.map(row).join('')}</div>`).join('')}</div></div>`;
})();
