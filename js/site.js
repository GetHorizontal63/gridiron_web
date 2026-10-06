/* Shakuro Style site shell: utility bar, header, hamburger drawer (site map), sub header, footer.
   Every page sets <html data-root="../"> (path back to the project root) and
   <body data-section="managers" data-page="overview">, then loads this file first. */
(function () {
    const ROOT = document.documentElement.dataset.root || '';
    window.LEAGUE_DB_URL = ROOT + 'data/league.db';           // read by league-db.js

    // Site map (Gear removed; Teams -> Managers)
    const SITE_MAP = [
        { key: 'managers', label: 'Managers', href: 'pages/managers/index.html', children: [
            { key: 'overview', label: 'Overview', href: 'pages/managers/overview.html', needs: 'm' },
            { key: 'schedule', label: 'Schedule & Results', href: 'pages/managers/schedule.html', needs: 'm' },
            { key: 'roster-history', label: 'Roster History', href: 'pages/managers/roster-history.html', needs: 'm' },
            { key: 'stats-history', label: 'Manager Stats History', href: 'pages/managers/stats-history.html', needs: 'm' },
            { key: 'where-we-marched', label: 'Where We Marched', href: 'pages/managers/where-we-marched.html', menuOnly: true }   // menu only, not a manager tab
        ] },
        { key: 'players', label: 'Players', href: 'pages/players/index.html', children: [
            { key: 'stats', label: 'Stats', href: 'pages/players/stats.html', needs: 'id' },
            { key: 'highlights', label: 'Highlights', href: 'pages/players/highlights.html', needs: 'id' },
            { key: 'achievements', label: 'Achievements', href: 'pages/players/achievements.html', needs: 'id' },
            { key: 'game-history', label: 'Game History', href: 'pages/players/game-history.html', needs: 'id' }
        ] },
        { key: 'recordbook', label: 'Recordbook', href: 'pages/recordbook/league-records.html', children: [
            { key: 'league-records', label: 'League Records', href: 'pages/recordbook/league-records.html' },
            { key: 'single-game', label: 'Single Game', href: 'pages/recordbook/single-game.html' },
            { key: 'single-season', label: 'Single Season', href: 'pages/recordbook/single-season.html' },
            { key: 'record-vs-playoffs', label: 'Record vs. Playoffs', href: 'pages/recordbook/record-vs-playoffs.html' },
            { key: 'scorigami', label: 'Scorigami', href: 'pages/recordbook/scorigami.html' }
        ] },
        // the earlier Stories pages: no longer in the menus, kept so existing links still work
        { key: 'stories', label: 'Stories', href: 'pages/stories/news.html', hidden: true, children: [
            { key: 'news', label: 'News', href: 'pages/stories/news.html' },
            { key: 'features', label: 'Features', href: 'pages/stories/features.html' },
            { key: 'highlights', label: 'Highlights', href: 'pages/stories/highlights.html' },
            { key: 'film-room', label: 'Film Room', href: 'pages/stories/film-room.html' }
        ] },
        { key: 'competitions', label: 'Past Seasons', href: 'pages/past-seasons/index.html', children: [
            { key: 'index', label: 'All Seasons', href: 'pages/past-seasons/index.html' },
            { key: 'overview', label: 'Overview', href: 'pages/past-seasons/overview.html' },
            { key: 'schedule', label: 'Schedule', href: 'pages/past-seasons/schedule.html' },
            { key: 'standings', label: 'Standings', href: 'pages/past-seasons/standings.html' },
            { key: 'playoff-bracket', label: 'Playoff Bracket', href: 'pages/past-seasons/playoff-bracket.html' },
            { key: 'managers', label: 'Managers', href: 'pages/past-seasons/managers.html' },
            { key: 'trades', label: 'Trades', href: 'pages/past-seasons/trades.html' },
            { key: 'free-agency', label: 'Free Agency', href: 'pages/past-seasons/free-agency.html' },
            { key: 'draft', label: 'Draft Grades', href: 'pages/past-seasons/draft.html' }
        ] }
    ];
    const NAV = [{ key: 'feed', label: 'Stats', href: 'pages/stats.html' }, ...SITE_MAP.filter(g => !g.hidden).map(({ key, label, href }) => ({ key, label, href }))];

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const url = path => ROOT + path;
    const param = name => new URLSearchParams(location.search).get(name);
    const body = document.body;
    const section = body.dataset.section || '';
    const page = body.dataset.page || '';

    const brand = (dark) => `<a class="brand" href="${url('index.html')}" aria-label="Grass Touchers home">
        <img src="${url('assets/logos/logo_2.png')}" alt="">
        <span class="brand-text">Grass Touchers<small>Fantasy Football League</small></span></a>`;

    function renderHeader() {
        const now = new Date();
        const day = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const html = `
        <div class="util-bar"><div class="wrap">
            <div class="util-left"><span>${esc(day)}, <b>${esc(time)}</b></span><span id="util-season">Season <b>-</b></span></div>
            <div class="util-right">
                <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch light or dark mode">
                    <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
                    <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
                    <span id="theme-label"></span></button>
                <a href="${url('pages/app.html')}" class="util-app">Get the App</a>
                <a href="${url('pages/search.html')}">Search</a>
            </div>
        </div></div>
        <header class="site-header"><div class="wrap">
            ${brand()}
            <nav class="main-nav" aria-label="Main">
                ${NAV.map(n => `<a href="${url(n.href)}" class="${n.key === section ? 'active' : ''}">${esc(n.label)}</a>`).join('')}
            </nav>
            <div class="header-actions">
                <button class="burger" id="burger" aria-label="Open menu" aria-expanded="false"><span></span></button>
            </div>
        </div></header>
        <div class="drawer-backdrop" id="drawer-backdrop"></div>
        <aside class="drawer" id="drawer" aria-label="Site map">
            <div class="drawer-head">${brand(true)}<button class="drawer-close" id="drawer-close" aria-label="Close menu">×</button></div>
            <div class="drawer-top">
                <a href="${url('index.html')}">Home</a><a href="${url('pages/search.html')}">Search</a><a href="${url('pages/stats.html')}">Stats</a><a href="${url('pages/app.html')}">Get the App</a>
            </div>
            ${SITE_MAP.filter(g => !g.hidden).map(g => `<div class="drawer-group">
                <a href="${url(g.href)}">${esc(g.label)}</a>
                <ul>${g.children.map(c => `<li><a href="${url(childHref(c))}" class="${g.key === section && c.key === page ? 'active' : ''}">${esc(c.label)}</a></li>`).join('')}</ul>
            </div>`).join('')}
        </aside>`;
        const holder = document.getElementById('site-header');
        if (holder) holder.outerHTML = html;
        const open = v => { body.classList.toggle('drawer-open', v); document.getElementById('burger').setAttribute('aria-expanded', String(v)); };
        document.getElementById('burger').addEventListener('click', () => open(true));
        document.getElementById('drawer-close').addEventListener('click', () => open(false));
        document.getElementById('drawer-backdrop').addEventListener('click', () => open(false));
        document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
        // light / dark: the choice is remembered; until then the system setting decides (applied early in <head>)
        const label = () => { document.getElementById('theme-label').textContent = document.documentElement.dataset.theme === 'dark' ? 'Light mode' : 'Dark mode'; };
        label();
        document.getElementById('theme-toggle').addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            try { localStorage.setItem('gt-theme', next); } catch (_) { /* private mode: still switches for this page */ }
            label();
            window.dispatchEvent(new CustomEvent('themechange', { detail: next }));
        });
    }

    // Child pages that need a manager / player keep the current one (or go to the section index)
    function childHref(c) {
        if (!c.needs) return c.href;
        const value = param(c.needs) || (c.needs === 'm' ? localStorage.getItem('gt-last-manager') : localStorage.getItem('gt-last-player'));
        if (!value) return c.href.replace(/[^/]+\.html$/, 'index.html');
        return `${c.href}?${c.needs}=${encodeURIComponent(value)}`;
    }

    function renderFooter() {
        const holder = document.getElementById('site-footer');
        if (!holder) return;
        holder.outerHTML = `<footer class="site-footer"><div class="wrap">
            <span class="brand-text">Grass Touchers<small>Fantasy Football League · Est. 2019</small></span>
            <nav>${NAV.map(n => `<a href="${url(n.href)}">${esc(n.label)}</a>`).join('')}<a href="${url('pages/app.html')}">Get the App</a></nav>
        </div></footer>`;
    }

    /* Sub header: crumbs [[label, href], ...], tabs [{label, href, active}], action {label, id} */
    function subHeader({ crumbs = [], tabs = [], action = null }) {
        const holder = document.getElementById('sub-header');
        if (!holder) return;
        holder.innerHTML = `<div class="sub-header"><div class="wrap">
            <div class="crumbs">${crumbs.map(([label, href], i) =>
                (i ? '<span class="sep">/</span>' : '') +
                (href ? `<a href="${href}">${esc(label)}</a>` : `<span class="here">${esc(label)}</span>`)).join('')}</div>
            <nav class="sub-tabs">${tabs.map(t => `<a href="${t.href}" class="${t.active ? 'active' : ''}">${esc(t.label)}</a>`).join('')}</nav>
            ${action ? `<button class="btn btn-accent" id="${action.id}">${esc(action.label)}</button>` : ''}
        </div></div>`;
    }

    // Section tabs straight from the site map (adds ?m= / ?id= where the page needs one)
    function sectionTabs(sectionKey, activeKey, id) {
        const group = SITE_MAP.find(g => g.key === sectionKey);
        return group.children.filter(c => !c.menuOnly).map(c => ({
            label: c.label,
            href: url(c.href) + (c.needs && id ? `?${c.needs}=${encodeURIComponent(id)}` : ''),
            active: c.key === activeKey
        }));
    }

    function hero({ title, logo = '', meta = [], image = 'background-5.png', size = '', dots = true, portrait = '', tools = '' }) {
        const holder = document.getElementById('hero');
        if (!holder) return;
        holder.className = `hero ${size}${portrait ? ' has-portrait' : ''}`;
        holder.style.backgroundImage = `url('${url('assets/images/' + image)}')`;
        holder.innerHTML = `<div class="wrap">${tools ? `<div class="hero-tools">${tools}</div>` : ''}
            ${logo ? `<div class="hero-logo"><img src="${logo}" alt=""></div>` : ''}
            <h1 class="hero-title"><span>${esc(title)}</span></h1>
            ${meta.length ? `<div class="hero-meta">${meta.map(m => `<div>${m}</div>`).join('')}</div>` : ''}
        </div>${portrait ? `<img class="hero-portrait" src="${portrait}" alt="" onerror="this.remove()">` : ''}${dots ? '<div class="hero-dots"><span class="on"></span><span></span><span></span><span></span><span></span></div>' : ''}`;
        fitHeroTitle();
    }

    // Keep the hero title on one line: shrink the text to fit, but keep the title box at its
    // full-size height so the spacing (and the hero's height) never changes with the name length.
    function fitHeroTitle() {
        const h1 = document.querySelector('#hero .hero-title');
        if (!h1) return;
        const span = h1.firstElementChild;
        span.style.fontSize = '';
        const full = parseFloat(getComputedStyle(h1).fontSize);
        h1.style.height = `${Math.round(full * 0.95)}px`;
        let size = full;
        while (span.scrollWidth > h1.clientWidth && size > 18) {
            size -= 1;
            span.style.fontSize = `${size}px`;
        }
    }
    window.addEventListener('resize', fitHeroTitle);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHeroTitle);   // re-measure once the display font loads

    function setSeason(season) {
        const el = document.getElementById('util-season');
        if (el) el.innerHTML = `Season <b>${esc(season)}</b>`;
    }

    // <colgroup> with fixed widths, e.g. cols('34%', '8%', ...): tables never size columns to their content
    const cols = (...widths) => `<colgroup>${widths.map(w => `<col style="width:${w}">`).join('')}</colgroup>`;

    // rows/cards with data-href open that page; links inside them (e.g. a manager name) keep their own target
    document.addEventListener('click', e => {
        const row = e.target.closest('[data-href]');
        if (!row || e.target.closest('a, button, select, input')) return;
        if (e.ctrlKey || e.metaKey) window.open(row.dataset.href, '_blank'); else location.href = row.dataset.href;
    });

    renderHeader();
    renderFooter();
    const color = name => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();   // theme colour, e.g. color('accent')
    window.SITE = { ROOT, url, esc, param, subHeader, sectionTabs, hero, setSeason, cols, color, SITE_MAP };
})();
