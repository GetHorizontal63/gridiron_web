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
            { key: 'vs-nfl', label: 'Vs the NFL', href: 'pages/managers/vs-nfl.html', needs: 'm' },
            { key: 'draft-tendencies', label: 'Draft Tendencies', href: 'pages/managers/draft-tendencies.html', needs: 'm' },
            { key: 'rivalry', label: 'Rivalries', href: 'pages/managers/rivalry.html', needs: 'm' },
            { key: 'where-we-marched', label: 'Where We Marched', href: 'pages/managers/where-we-marched.html', menuOnly: true }   // menu only, not a manager tab
        ] },
        { key: 'players', label: 'Players', href: 'pages/players/index.html', children: [
            { key: 'stats', label: 'Stats', href: 'pages/players/stats.html', needs: 'id' },
            { key: 'highlights', label: 'Highlights', href: 'pages/players/highlights.html', needs: 'id' },
            { key: 'achievements', label: 'Achievements', href: 'pages/players/achievements.html', needs: 'id' },
            { key: 'game-history', label: 'Game History', href: 'pages/players/game-history.html', needs: 'id' },
            { key: 'compare', label: 'Compare', href: 'pages/players/compare.html', carry: 'ids' },   // takes the current player along
            { key: 'trade-calculator', label: 'Trade Calculator', href: 'pages/players/trade-calculator.html', menuOnly: true }   // menu + the Players index tabs
        ] },
        { key: 'recordbook', label: 'Recordbook', href: 'pages/recordbook/league-records.html', children: [
            { key: 'league-records', label: 'League Records', href: 'pages/recordbook/league-records.html' },
            { key: 'single-game', label: 'Single Game', href: 'pages/recordbook/single-game.html' },
            { key: 'single-season', label: 'Single Season', href: 'pages/recordbook/single-season.html' },
            { key: 'record-vs-playoffs', label: 'Record vs. Playoffs', href: 'pages/recordbook/record-vs-playoffs.html' },
            { key: 'scorigami', label: 'Scorigami', href: 'pages/recordbook/scorigami.html' },
            { key: 'cumulative', label: 'Cumulative Points', href: 'pages/recordbook/cumulative.html' }
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
            { key: 'transactions', label: 'Transactions', href: 'pages/past-seasons/transactions.html' },   // trades + free agency
            { key: 'draft', label: 'Draft Grades', href: 'pages/past-seasons/draft.html' },
            { key: 'all-pro', label: 'All-Pro Teams', href: 'pages/past-seasons/all-pro.html' },
            { key: 'watch', label: 'Watch', href: 'pages/past-seasons/watch.html', menuOnly: true },   // live TV (current season): tab only on All Seasons
            { key: 'moments', label: 'Historic League Moments', href: 'pages/past-seasons/moments.html', menuOnly: true }   // cross-season: tab only on All Seasons
        ] }
    ];
    // the Stats section's pages (its tab row); statsTabs(key) marks one active
    const STATS_PAGES = [['dashboard', 'Dashboard', 'pages/stats.html'], ['stat-finder', 'Stat Finder', 'pages/stat-finder.html'],
                         ['player-regression', 'Player Regression', 'pages/player-regression.html'], ['schedule-luck', 'Schedule Luck', 'pages/schedule-luck.html'],
                         ['lineup-regret', 'Lineup Regret', 'pages/lineup-regret.html']];
    const statsTabs = active => STATS_PAGES.map(([k, label, href]) => ({ label, href: ROOT + href, active: k === active }));
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
        // a long tab row scrolls sideways: bring the active tab into view
        const nav = holder.querySelector('.sub-tabs'), on = nav.querySelector('a.active');
        if (on) { const over = on.getBoundingClientRect().right - nav.getBoundingClientRect().right; if (over > 0) nav.scrollLeft += over; }
    }

    // Section tabs straight from the site map (adds ?m= / ?id= where the page needs one)
    function sectionTabs(sectionKey, activeKey, id) {
        const group = SITE_MAP.find(g => g.key === sectionKey);
        return group.children.filter(c => !c.menuOnly).map(c => ({
            label: c.label,
            href: url(c.href) + ((c.needs || c.carry) && id ? `?${c.needs || c.carry}=${encodeURIComponent(id)}` : ''),
            active: c.key === activeKey
        }));
    }

    // Keep a point of a cover-cropped background in view at any box size: focus = 'x% y%' of the image (a face, say).
    // Reads the image's real size, then places it so that point sits at the middle across and `at` of the way down the box
    // (0.4 by default: a little headroom keeps the upper body in frame; the hero uses 0.25 so the face clears its title),
    // clamped so the image always covers the box. Re-runs as the box resizes. Further layers (a fallback) stay centered.
    function focusImage(el, src, focus, at = 0.4) {
        const m = String(focus || '').match(/(-?[\d.]+)%\s+(-?[\d.]+)%/);
        if (!el || !m) return;
        const fx = Number(m[1]) / 100, fy = Number(m[2]) / 100, layers = (el.style.backgroundImage.match(/url\(/g) || []).length;
        const img = new Image();
        img.onload = () => {
            const place = () => {
                const cw = el.clientWidth, ch = el.clientHeight;
                if (!cw || !ch) return;
                const k = Math.max(cw / img.naturalWidth, ch / img.naturalHeight), sw = img.naturalWidth * k, sh = img.naturalHeight * k;
                const ox = Math.min(0, Math.max(cw - sw, cw / 2 - fx * sw)), oy = Math.min(0, Math.max(ch - sh, ch * at - fy * sh));
                el.style.backgroundPosition = [`${ox.toFixed(1)}px ${oy.toFixed(1)}px`, ...Array(Math.max(0, layers - 1)).fill('center')].join(', ');
            };
            place();
            if (window.ResizeObserver) new ResizeObserver(place).observe(el); else window.addEventListener('resize', place);
        };
        img.src = src;
    }

    // The hero / banner photo pool (assets/images/background-N). Each page load deals from one shuffled deck, so every
    // header gets a random photo and no two on the same page repeat.
    const BACKGROUNDS = [...Array.from({ length: 18 }, (_, i) => `background-${i + 1}.png`),
                         ...Array.from({ length: 16 }, (_, i) => `background-${i + 19}.jpg`)];
    // each photo's focal point (x% y% of the image: the main player's face / upper body), kept in frame by focusImage
    const BG_FOCUS_N = {
        1: '32% 28%', 2: '55% 40%', 3: '36% 30%', 4: '40% 27%', 5: '48% 16%', 6: '60% 18%',
        7: '52% 25%', 8: '66% 12%', 9: '48% 37%', 10: '35% 28%', 11: '50% 55%', 12: '49% 28%',
        13: '60% 14%', 14: '47% 9%', 15: '51% 13%', 16: '40% 18%', 17: '60% 25%', 18: '48% 16%',
        19: '42% 40%', 20: '49% 45%', 21: '63% 13%', 22: '50% 17%', 23: '50% 55%', 24: '50% 26%',
        25: '50% 22%', 26: '50% 20%', 27: '49% 12%', 28: '50% 16%', 29: '51% 31%', 30: '58% 9%',
        31: '47% 18%', 32: '45% 8%', 33: '52% 13%', 34: '42% 26%'
    };
    const bgFocus = name => BG_FOCUS_N[(String(name).match(/^background-(\d+)\./) || [])[1]] || '';
    const bgDeck = [];
    function randomBg() {
        if (!bgDeck.length) bgDeck.push(...BACKGROUNDS.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]));
        return bgDeck.pop();
    }

    // focus: the spot to keep in view as the hero crops ('42% 26%' = a face); fallback: an image layer underneath
    // that shows if the main image is missing
    function hero({ title, logo = '', meta = [], image = 'background-5.png', size = '', dots = true, portrait = '', tools = '', focus = '', fallback = '' }) {
        const holder = document.getElementById('hero');
        if (!holder) return;
        holder.className = `hero ${size}${portrait ? ' has-portrait' : ''}`;
        if (/^background-\d+\.(png|jpg)$/.test(image)) {                            // a stock header: a random photo from the pool
            image = randomBg();
            focus = bgFocus(image);
        }
        holder.style.backgroundImage = `url('${url('assets/images/' + image)}')${fallback ? `, url('${url('assets/images/' + fallback)}')` : ''}`;
        holder.style.backgroundPosition = focus ? '50% 30%' : '';                // until the image's size is known
        if (focus) focusImage(holder, url('assets/images/' + image), focus, 0.25);
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

    // Tooltips: any element with data-tip="..." explains itself on hover (or tap on a phone). One floating box for the
    // whole page, positioned in the viewport, so tables that scroll or clip their cells never cut it off.
    const tipBox = document.createElement('div');
    tipBox.className = 'tipbox';
    tipBox.setAttribute('role', 'tooltip');
    let tipFor = null;
    const showTip = el => {
        tipFor = el;
        tipBox.textContent = el.dataset.tip;
        tipBox.classList.add('on');
        const r = el.getBoundingClientRect(), w = tipBox.offsetWidth, h = tipBox.offsetHeight;
        const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
        const top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
        tipBox.style.left = `${left}px`; tipBox.style.top = `${top}px`;
    };
    const hideTip = () => { tipFor = null; tipBox.classList.remove('on'); };
    document.addEventListener('mouseover', e => { const el = e.target.closest('[data-tip]'); if (el && el !== tipFor) showTip(el); else if (!el && tipFor) hideTip(); });
    document.addEventListener('click', e => { const el = e.target.closest('[data-tip]'); if (el && el !== tipFor) showTip(el); else if (!el) hideTip(); });
    window.addEventListener('scroll', hideTip, { passive: true });
    document.body.appendChild(tipBox);

    renderHeader();
    renderFooter();
    const color = name => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();   // theme colour, e.g. color('accent')
    window.SITE = { ROOT, url, esc, param, subHeader, sectionTabs, hero, focusImage, randomBg, bgFocus, statsTabs, setSeason, cols, color, SITE_MAP };
})();
