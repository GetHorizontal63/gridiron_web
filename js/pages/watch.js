/* Past Seasons: Watch (a tab beside All Seasons). Members only: until a code is entered the page shows nothing but the
   code box. Styled like the Game Center:
     header        the NFL game as a score bug (65%) beside the manager's fantasy matchup score (35%; the commissioner's
                   passcode has no matchup, so the bug runs full width)
     player        full content width: one feed, picture in picture or multi-view of 2-4 (js/multiview.js); the bar under
                   it has the feeds of the game on screen and the layouts (each needs that many live feeds; a layout
                   shrinks when a feed goes off the air). In multi-view the clicked tile has the sound and the score bug
     below         manager: both sides' players in this game, side by side; "Full rosters" opens both lineups in the
                   Game Center's mirrored layout. Everyone: the week's games, each with the channel it's on
     box score     with live fantasy points (league scoring, js/live-fantasy.js)
   Full screen is laid out like Prime Video's X-Ray: the video and its title on the left, a tabbed panel on the right
   (Stats: score card and game leaders; Fantasy; Plays; Games), "Hide info" gives the video the whole screen. */
(async function () {
    const { esc, url } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    const season = b.season;
    const tabs = [{ label: 'All Seasons', href: url('pages/past-seasons/index.html') },
                  { label: 'Historic League Moments', href: url('pages/past-seasons/moments.html') },
                  { label: 'Watch', href: url('pages/past-seasons/watch.html'), active: true }];
    const header = unlocked => SITE.subHeader({ crumbs: [['Past Seasons', url('pages/past-seasons/index.html')], ['Watch']], tabs,
                                                 action: unlocked ? { label: 'Lock', id: 'watch-lockbtn' } : null });
    header(false);
    SITE.hero({ title: `${season} Watch`, size: 'short', dots: false, image: 'background-7.png', meta: ['Members only'] });

    const lock = await WATCH.loadLock(url('data/watch.json'));
    if (!lock) {
        content.innerHTML = `<div class="wrap page-pad"><div class="panel watch-lock"><div class="eyebrow">Watch</div>
            <h2 class="panel-title">Not set up yet</h2><p class="muted">The commissioner hasn't turned on Watch for this season.</p></div></div>`;
        return;
    }
    let conn = await WATCH.remembered(lock), timer = null;
    if (conn) open(); else showLock();

    function showLock(message = '') {
        clearTimeout(timer);
        header(false);
        SITE.hero({ title: `${season} Watch`, size: 'short', dots: false, image: 'background-7.png', meta: ['Members only'] });
        content.innerHTML = `<div class="wrap page-pad"><form class="panel watch-lock" id="watch-form" autocomplete="off">
            <div class="eyebrow">Members only</div><h2 class="panel-title">Enter your code</h2>
            <div class="watch-row"><input class="input" id="watch-pass" type="password" placeholder="Code" aria-label="Code" autofocus>
                <button class="btn btn-accent" type="submit">Unlock</button></div>
            <p class="watch-msg" id="watch-msg">${esc(message)}</p></form></div>`;
        const msg = document.getElementById('watch-msg');
        document.getElementById('watch-form').addEventListener('submit', async e => {
            e.preventDefault();
            msg.textContent = 'Checking...';
            const code = document.getElementById('watch-pass').value;
            const unlocked = code ? await WATCH.unlock(lock, code).catch(() => null) : null;
            if (unlocked) { conn = unlocked; open(); } else { msg.textContent = "That code doesn't open Watch."; document.getElementById('watch-pass').select(); }
        });
    }

    async function open() {
        const who = conn.who, manager = who.role === 'manager';
        const rules = await LIVEFP.rules(url('data/scoring_rules.json'), season);
        const dayText = manager ? new Date(`${who.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : '';
        const m = manager ? await WMATCH.load(who, season).catch(error => ({ missing: error.message })) : null;
        header(true);
        SITE.hero({ title: manager ? `${who.name}'s Watch` : `${season} Watch`, size: 'short', dots: false, image: 'background-7.png',
                    meta: manager ? [dayText, m && m.opp ? `Week ${m.week} · vs ${esc(m.opp.name)}` : 'Live fantasy'] : ['Members only', "Today and tomorrow's games"] });
        document.getElementById('watch-lockbtn').addEventListener('click', () => { WATCH.stop(); WATCH.forget(); conn = null; exitFull(); showLock(); });

        const XTABS = manager ? [['stats', 'Stats'], ['fantasy', 'Fantasy'], ['top', 'Top Contributors'], ['plays', 'Plays'], ['games', 'Games']]
            : [['stats', 'Stats'], ['top', 'Top Contributors'], ['plays', 'Plays'], ['games', 'Games']];
        content.innerHTML = `<div class="wrap page-pad">
            <section class="w-head${manager ? '' : ' solo'}" id="w-head"><div class="w-bugwrap" id="w-bugwrap"><div class="w-bug game-band" id="w-band"></div></div>${manager ? '<div class="w-mscore" id="w-mscore"></div>' : ''}</section>
            <div class="w-watch" id="w-watch">
                <div class="w-stage"><div id="mv-stage"></div>
                    <div class="w-tape" id="w-tape"></div>
                    <div class="w-bar"><div class="watch-now" id="watch-now"><b>Pick a feed</b><span class="muted">Feeds open when the game's window does</span></div>
                        <div class="w-feeds" id="w-feeds"></div><div class="mv-modes" id="mv-modes"></div>
                        <button class="w-tool" id="w-full" type="button">Full screen</button></div></div>
                <aside class="w-xray" id="w-xray">
                    <nav class="xr-tabs">${XTABS.map(([k, label], i) => `<button type="button" data-tab="${k}" class="${i ? '' : 'on'}">${label}</button>`).join('')}</nav>
                    <div class="xr-pane" id="xr-pane"></div></aside>
                <button class="w-chev" id="w-chev" type="button" aria-label="Show or hide the stats">›</button>
            </div>
            <section class="w-below" id="w-below"></section>
            <section class="panel" id="np-box" hidden></section></div>`;
        const $ = id => document.getElementById(id);
        const band = $('w-band'), feeds = $('w-feeds'), boxEl = $('np-box'), wrap = $('w-watch'), below = $('w-below'), pane = $('xr-pane');
        const setNow = (title, text) => { $('watch-now').innerHTML = `<b>${esc(title)}</b><span class="muted">${esc(text)}</span>`; };

        // ---------------------------------------------------------------- full screen (video + X-Ray panel)
        const full = () => document.fullscreenElement === wrap || wrap.classList.contains('w-fs');
        const fsLabel = () => { const short = innerWidth < 900; $('w-full').textContent = full() ? (short ? 'Exit' : 'Exit full screen') : (short ? 'Full' : 'Full screen'); };
        fsLabel();
        $('w-full').addEventListener('click', async () => {
            if (full()) { exitFull(); return fsLabel(); }
            try { await wrap.requestFullscreen(); } catch (_) { wrap.classList.add('w-fs'); }   // no Fullscreen API: cover the window
            if (innerHeight < 500 || innerWidth < 760) wrap.classList.add('w-hide');   // a phone: the video gets the screen, the chevron brings the stats
            fsLabel(); chev(); drawPane(); drawTape((current() || {}).event, true);
        });
        document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) wrap.classList.remove('w-hide'); fsLabel(); chev(); });
        // the chevron on the right edge: pull the stats panel out / push it away without leaving full screen
        const chev = () => { $('w-chev').textContent = wrap.classList.contains('w-hide') ? '‹' : '›'; };
        $('w-chev').addEventListener('click', () => { wrap.classList.toggle('w-hide'); chev(); });
        let xtab = XTABS[0][0], side = 0;
        const folded = new Set();   // the drives collapsed in Plays (kept while the page is open)
        let held = null, heldWeek = null;   // Top Contributors: every manager's roster for the game's week
        // plays show ~15 s after they happen (the video plays ~12 s behind live); re-check every 3 s while the tab is open
        const PLAY_DELAY = 15000;
        const playsTick = setInterval(() => { if (!document.body.contains(pane)) return clearInterval(playsTick); if (xtab === 'plays') drawPane(); }, 3000);
        $('w-xray').querySelector('.xr-tabs').addEventListener('click', e => {
            const t = e.target.closest('button[data-tab]'); if (!t) return;
            xtab = t.dataset.tab;
            $('w-xray').querySelectorAll('.xr-tabs button').forEach(x => x.classList.toggle('on', x === t));
            drawPane();
        });

        // ---------------------------------------------------------------- the games, refreshed while anything is on
        let list = [], weekNo = null, programs = null, guideError = '', selected = null, boxData = null, score = null, showRosters = false;
        // the ticker tape (desktop and full screen only): every matchup of the week, live; re-scored at most once a minute
        let tapeAt = 0;
        const tapeWanted = () => matchMedia('(min-width: 1101px)').matches || document.fullscreenElement === wrap || wrap.classList.contains('w-fs');
        async function drawTape(ev, force = false) {
            if (!tapeWanted() || (!force && Date.now() - tapeAt < 60000)) return;
            tapeAt = Date.now();
            const game = current(), day = game ? new Date(game.start).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            const L = await WMATCH.league(day, season, rules, ev ? { id: ev.id, state: ev.state, raw: boxData && boxData.id === ev.id && boxData.state !== 'pre' ? boxData.raw : null } : null).catch(() => null);
            $('w-tape').innerHTML = WMATCH.tapeHtml(L, manager ? Number(who.owner) : null);
        }
        const current = () => list.find(g => g.key === selected);
        const etDay = g => new Date(g.start).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        // the guide's games, day of and day ahead, in kickoff order; arrows either side of the game bug step through them
        const stepHtml = cls => list.length > 1 ? `<button class="${cls} step-prev" type="button" data-step="-1" aria-label="Previous game">‹</button>` : '';
        const stepNext = cls => list.length > 1 ? `<button class="${cls} step-next" type="button" data-step="1" aria-label="Next game">›</button>` : '';
        const countText = () => list.length > 1 ? `${list.findIndex(g => g.key === selected) + 1} of ${list.length}` : '';
        function step(by) {
            if (list.length < 2) return;
            const i = list.findIndex(g => g.key === selected);
            selected = list[(i + by + list.length) % list.length].key; boxData = null; refresh();
        }
        const cardsHtml = () => list.length ? `<div class="np-cards">${list.map(g => NFLPLUS.card(g, g.key === selected)).join('')}</div>` : '<p class="np-empty">No games this week.</p>';
        const weekHtml = () => `<div class="panel-head"><div><div class="eyebrow">Week ${esc(weekNo || '')} · ${guideError && !programs ? `channels unavailable: can't reach the relay (${esc(guideError)})` : 'channels from the guide'}</div><h2 class="section-title">This Week</h2></div></div>${cardsHtml()}`;

        // ---------------------------------------------------------------- the player: one feed, PiP or multi-view (js/multiview.js)
        const mv = MVIEW.player($('mv-stage'), conn, { list: () => list, current, modes: [$('mv-modes')], caption: setNow,
            follow: key => { if (key !== selected) { selected = key; boxData = null; refresh(); } },
            drawn: () => { feeds.innerHTML = NFLPLUS.feedsHtml(current(), mv.active()); } });
        const liveNow = () => { const g = current(); return !!(g && g.event && g.event.state === 'in'); };
        function drawPane() {
            const game = current(), b2 = boxData && game && game.event && boxData.id === game.event.id ? boxData : null;
            const nav = list.length > 1 ? `<div class="xr-nav">${stepHtml('xr-step')}<span>${countText()}</span>${stepNext('xr-step')}</div>` : '';
            pane.innerHTML = xtab === 'stats' ? (game ? nav + NFLPLUS.statsPaneHtml(game, b2, side) : '<p class="np-empty">No game on screen.</p>')
                : xtab === 'plays' ? NFLPLUS.playsHtml(b2, PLAY_DELAY, folded)
                : xtab === 'top' ? topPane(b2)
                : xtab === 'fantasy' ? (score ? `<div class="xr-card">${WMATCH.boardHtml(m, score, liveNow())}</div>${WMATCH.inGameHtml(score)}` : '<div class="loading">Scoring the matchup...</div>')
                : cardsHtml();
        }
        // the game's ten best by league scoring, each with the manager who has him (the week's rosters load once)
        function topPane(b2) {
            if (!b2 || b2.state === 'pre') return '<p class="np-empty">Top contributors appear at kickoff.</p>';
            const week = (b2.raw.header && b2.raw.header.week) || (m && m.week);
            if (heldWeek !== week) { heldWeek = week; held = null;
                WMATCH.rostered(season, week).then(h => { held = h; if (xtab === 'top') drawPane(); }).catch(() => { held = {}; if (xtab === 'top') drawPane(); }); }
            if (!held) return '<div class="loading">Loading every roster...</div>';
            return WMATCH.topHtml(LIVEFP.score(b2.raw, rules), held, manager ? [Number(who.owner)] : []);
        }
        function drawBelow() {
            if (!manager) { below.innerHTML = weekHtml(); return; }
            if (m && m.missing) { below.innerHTML = `<p class="np-empty">${esc(m.missing)}</p><div class="w-week">${weekHtml()}</div>`; return; }
            below.innerHTML = `<div class="panel-head"><div><div class="eyebrow">Week ${m.week} · ${esc(m.me.name)} vs ${esc(m.opp.name)}</div><h2 class="section-title">In This Game</h2></div>
                    <button class="btn btn-outline" id="w-rosters" type="button">${showRosters ? 'Hide full rosters' : 'Full rosters'}</button></div>
                ${score ? WMATCH.inGameHtml(score) : '<div class="loading">Scoring the matchup...</div>'}
                ${showRosters && score ? `<div class="panel wm-full">${WMATCH.rostersHtml(score)}</div>` : ''}
                <div class="w-week">${weekHtml()}</div>`;
        }
        async function drawBox() {
            const game = current();
            if (!game || !game.event) { boxEl.hidden = true; boxData = null; return; }
            boxEl.hidden = false;
            try {
                boxData = await NFLPLUS.box(game.event.id);
                boxEl.innerHTML = NFLPLUS.boxHtml(game, boxData, boxData.state === 'pre' ? null : LIVEFP.score(boxData.raw, rules));
            } catch (error) {
                boxEl.innerHTML = `<p class="np-empty">Can't load the box score from ESPN right now (${esc(error.message)}).</p>`;
            }
        }
        function drawTop() {
            const game = current();
            band.innerHTML = game ? NFLPLUS.bandHtml(game).replace('</div>', `${list.length > 1 ? `<span class="w-count">${countText()}</span>` : ''}</div>`)
                : `<div class="band-label"><span class="pill pill-dark">${esc(manager ? dayText : 'Guide')}</span>Week ${esc(weekNo || '')}</div>
                <div class="scoreboard np-band-solo"><b>No games on the schedule this week</b></div>`;
            const wrapEl = $('w-bugwrap');
            wrapEl.querySelectorAll('.w-step').forEach(x => x.remove());
            if (list.length > 1) { wrapEl.insertAdjacentHTML('afterbegin', stepHtml('w-step')); wrapEl.insertAdjacentHTML('beforeend', stepNext('w-step')); }
            wrapEl.classList.toggle('multi', list.length > 1);
            if (manager) $('w-mscore').innerHTML = m && m.missing ? `<p class="np-empty">${esc(m.missing)}</p>` : score ? WMATCH.boardHtml(m, score, liveNow()) : '<div class="loading">Scoring...</div>';
            feeds.innerHTML = NFLPLUS.feedsHtml(game, mv.active());
        }
        async function refresh() {
            clearTimeout(timer);
            // the week's games come from ESPN whatever happens; the relay's guide only adds the channels (the last good
            // copy is kept if the relay can't be reached for a moment)
            try { programs = (await WATCH.guide(conn)).programs; guideError = ''; } catch (error) { guideError = error.message; }
            try { const w = await NFLPLUS.week(programs || []); list = w.list; weekNo = w.week; }
            catch (error) { if (!list.length) below.innerHTML = `<p class="np-empty">Can't load this week's games from ESPN (${esc(error.message)}). Try again later.</p>`; }
            if (!list.some(g => g.key === selected)) {
                // first choice: a game you can watch now (yours first), then one on our channels, then any live game
                const live = g => g.event && g.event.state === 'in', mine = g => manager && etDay(g) === who.date;
                const now = g => g.feeds.some(NFLPLUS.isLive), ours = g => g.feeds.length > 0;
                const first = [g => now(g) && mine(g), now, g => ours(g) && mine(g) && g.event && g.event.state !== 'post', g => live(g) && mine(g), live,
                               g => ours(g) && (!g.event || g.event.state !== 'post'), mine].map(f => list.find(f)).find(Boolean) || list[0];
                selected = first ? first.key : null;
            }
            const ev = (current() || {}).event;
            if (!ev) { boxEl.hidden = true; boxData = null; }
            else if (!boxData || boxData.id !== ev.id || ev.state === 'in' || boxData.state !== ev.state) await drawBox();
            if (manager && m && !m.missing) {
                // the game on screen, before kickoff too (its players are listed from the start); its summary once there is one
                score = await WMATCH.score(m, rules, ev ? { id: ev.id, state: ev.state, raw: boxData && boxData.id === ev.id && boxData.state !== 'pre' ? boxData.raw : null } : null).catch(() => score);
            }
            drawTop(); drawBelow(); drawPane();
            mv.update();
            drawTape(ev);
            const busy = list.some(g => (g.event && g.event.state === 'in') || g.feeds.some(f => f.open));
            // every 20 s while something's on, else every 5 min, and always right when the next feed's program starts
            const soon = NFLPLUS.nextStart(list);
            timer = setTimeout(refresh, Math.min(busy ? 20000 : 300000, soon != null ? soon + 1500 : Infinity));
        }
        // a game card: on the bug; while feeds are playing, also on screen (its feed gets the sound, or takes that one's place)
        const pick = e => {
            const el = e.target.closest('.np-card'); if (!el) return;
            mv.pick(list.find(x => x.key === el.dataset.key));
            if (el.dataset.key !== selected) { selected = el.dataset.key; boxData = null; refresh(); }
        };
        below.addEventListener('click', e => {
            if (e.target.closest('#w-rosters')) { showRosters = !showRosters; drawBelow(); return; }
            pick(e);
        });
        pane.addEventListener('click', e => {
            const t = e.target.closest('[data-side]'); if (t) { side = Number(t.dataset.side); drawPane(); return; }
            const d = e.target.closest('[data-drive]'); if (d) { const k = d.dataset.drive; if (folded.has(k)) folded.delete(k); else folded.add(k); drawPane(); return; }
            const f = e.target.closest('[data-fold]');
            if (f) { if (f.dataset.fold === 'open') folded.clear(); else pane.querySelectorAll('[data-drive]').forEach(x => folded.add(x.dataset.drive)); drawPane(); return; }
            const s = e.target.closest('[data-step]'); if (s) step(Number(s.dataset.step)); else pick(e);
        });
        $('w-bugwrap').addEventListener('click', e => { const s = e.target.closest('[data-step]'); if (s) step(Number(s.dataset.step)); });
        feeds.addEventListener('click', e => {
            const btn = e.target.closest('button[data-ch]'), game = current(); if (!btn || !game) return;
            mv.put({ ch: String(btn.dataset.ch), key: game.key });
        });
        refresh();
    }
    function exitFull() {
        const wrap = document.getElementById('w-watch');
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        if (wrap) wrap.classList.remove('w-fs', 'w-hide');
    }
})();
