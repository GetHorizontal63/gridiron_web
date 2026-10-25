/* Watch: one stage, up to four feeds. Shared by the website's Watch page and the app's Watch screen (each styles the
   mv-* markup in its own CSS).

   Layouts (the stage's data-layout; a tile's place is its data-slot, so changing either animates the tiles there):
     single   one feed, full quality, the video's own controls
     pip      picture in picture: slot 0 fills the stage at full quality, slot 1 is a small window in the corner on the
              channel's low-bitrate copy; the sound is always the main picture's. Clicking the window swaps the two
     2, 3, 4  multi-view: every tile on the low-bitrate copy (four feeds fit the relay's upload); clicking a tile gives it
              the accent border and the sound, the others are muted

   set(layout, tiles, focus) draws a layout: tiles [{ ch, key, label }] in slot order (a channel is in one tile at most),
   focus the channel with the sound. A tile that stays on the same channel at the same quality keeps playing through a
   layout change; the rest open (or close) their streams. */
(function () {
    const QUALITY = (layout, slot) => layout === 'single' || (layout === 'pip' && slot === 0) ? 'hi' : 'lo';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // stage: the element the tiles live in. on: { focus(ch), swap(), error(ch, detail) }
    function create(stage, conn, on = {}) {
        let layout = 'single', focus = null;
        const tiles = new Map();                          // ch -> { el, video, handle, quality, info }
        stage.classList.add('mv-stage');
        stage.dataset.layout = layout;

        function drop(ch) {
            const t = tiles.get(ch); if (!t) return;
            tiles.delete(ch);
            if (t.handle) WATCH.close(t.handle);
            t.el.classList.add('mv-out');                 // fade, then go
            setTimeout(() => t.el.remove(), 400);
        }
        function start(t, quality) {
            if (t.handle) WATCH.close(t.handle);
            t.quality = quality;
            try { t.handle = WATCH.open(conn, t.info.ch, t.video, { quality }); }
            catch (error) { t.handle = null; (on.error || (() => {}))(t.info.ch, { title: 'Not playing', text: error.message }); }
        }
        function make(info) {
            const el = document.createElement('div');
            el.className = 'mv-tile mv-in';
            el.innerHTML = `<video playsinline muted></video><span class="mv-cap"></span><span class="mv-audio">Audio</span>`;
            const video = el.querySelector('video');
            video.setAttribute('controlslist', 'nofullscreen');
            const t = { el, video, handle: null, quality: null, info };
            el.addEventListener('click', e => {
                if (layout === 'single' || e.target.closest('video[controls]')) return;
                if (layout === 'pip') { if (el.dataset.slot === '1') (on.swap || (() => {}))(); return; }
                setFocus(info.ch); (on.focus || (() => {}))(info.ch);
            });
            video.addEventListener('watcherror', e => (on.error || (() => {}))(info.ch, e.detail));
            stage.appendChild(el);
            requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('mv-in')));   // fade in at its place
            return t;
        }
        // the sound: the focused tile in multi-view, the main picture in PiP, the one feed in single
        function setFocus(ch) {
            focus = ch;
            tiles.forEach((t, c) => {
                const loud = layout === 'pip' ? t.el.dataset.slot === '0' : c === ch;
                t.video.muted = !loud;
                if (loud && t.video.paused && t.video.buffered.length) t.video.play().catch(() => {});
                t.el.classList.toggle('mv-focus', /^[234]$/.test(layout) && c === ch);
            });
        }
        function set(newLayout, list, newFocus) {
            layout = newLayout;
            stage.dataset.layout = layout;
            const keep = new Set(list.map(x => String(x.ch)));
            [...tiles.keys()].forEach(ch => { if (!keep.has(ch)) drop(ch); });
            list.forEach((info, slot) => {
                const ch = String(info.ch);
                let t = tiles.get(ch);
                if (!t) { t = make({ ...info, ch }); tiles.set(ch, t); }
                t.info = { ...info, ch };
                t.el.dataset.slot = slot;
                t.el.querySelector('.mv-cap').textContent = info.label || `Channel ${ch}`;
                t.video.controls = layout === 'single';
                const q = QUALITY(layout, slot);
                if (!t.handle || t.handle.closed || t.quality !== q) start(t, q);
            });
            setFocus(keep.has(String(newFocus)) ? String(newFocus) : list.length ? String(list[0].ch) : null);
        }
        function stopAll() { [...tiles.keys()].forEach(drop); }
        return { set, focus: setFocus, stop: stopAll, state: () => ({ layout, focus, tiles: [...tiles.values()].sort((a, b) => a.el.dataset.slot - b.el.dataset.slot).map(t => t.info) }) };
    }

    // the layout buttons for the player's bar: each needs that many live feeds (PiP two); `on` is the layout showing
    const LAYOUTS = [['single', 'Single', 1], ['pip', 'PiP', 2], ['2', '2', 2], ['3', '3', 3], ['4', '4', 4]];
    const NAMES = { single: 'One game', pip: 'Picture in picture', 2: 'Two games', 3: 'Three games', 4: 'Four games' };
    const buttonsHtml = (on, live) => LAYOUTS.map(([k, label, need]) =>
        `<button type="button" class="mv-mode${k === on ? ' on' : ''}" data-layout="${k}"${live >= need ? '' : ' disabled'} aria-pressed="${k === on}"
            title="${esc(NAMES[k])}${live >= need ? '' : ` (needs ${need} live feeds)`}"><i class="mv-ico mv-ico-${k}"></i><span>${esc(label)}</span></button>`).join('');
    // how many tiles a layout takes, given the live feeds (it shrinks to what's live)
    const size = (k, live) => k === 'single' ? Math.min(1, live) : k === 'pip' ? Math.min(2, live) : Math.min(Number(k), live);

    // ---------------------------------------------------------------- the page's side: which feeds are on screen
    // player() keeps the tiles in step with the week's games (NFLPLUS.week's list): `want` is the layout picked, the
    // layout shown is that, shrunk to the feeds live now (a feed that goes off the air leaves; a slot that opens up takes
    // another live feed: games not on screen first, a game's main feed before its alternate). Nothing plays until a feed
    // or a layout is picked.
    //   hooks: list() the games; current() the game on the bug; follow(key) the sound moved to another game;
    //          caption(title, text); drawn() after each change (redraw the feed buttons); modes: the layout-button boxes
    function player(stage, conn, hooks) {
        let want = 'single', tiles = [], started = false, active = null;          // tiles [{ ch, key }] in slot order
        const live = f => f.open && Date.now() >= new Date(f.start).getTime();
        const liveFeeds = () => hooks.list().flatMap(g => g.feeds.filter(live).map(f => ({ ch: String(f.channel), key: g.key, main: f.name === 'Watch' })));
        const feedOf = t => { const g = hooks.list().find(x => x.key === t.key); return { g, f: g && g.feeds.find(x => String(x.channel) === t.ch) }; };
        const label = t => { const { g, f } = feedOf(t); const teams = g && g.event ? `${g.event.teams[0].abbr} @ ${g.event.teams[1].abbr}` : g ? g.title : '';
            return `${teams}${f && f.name !== 'Watch' ? ` · ${f.name}` : ''} · ${t.ch}`; };
        const layoutNow = () => tiles.length < 2 ? 'single' : want === 'pip' ? 'pip' : String(tiles.length);
        const mv = create(stage, conn, {
            focus: ch => { active = tiles.find(t => t.ch === ch) || active; show(); hooks.follow(active.key); },
            swap: () => { tiles = [tiles[1], tiles[0]]; active = tiles[0]; show(); hooks.follow(active.key); },
            error: (ch, d) => { tiles = tiles.filter(t => t.ch !== ch); if (active && active.ch === ch) active = tiles[0] || null; show(); hooks.caption(d.title, d.text); },
        });
        function fit() {
            const lf = liveFeeds();
            tiles = tiles.filter(t => lf.some(f => f.ch === t.ch));
            const n = started ? size(want, lf.length) : tiles.length;
            while (tiles.length < n) {
                const next = lf.filter(f => !tiles.some(t => t.ch === f.ch))
                    .sort((a, b) => (tiles.some(t => t.key === a.key) - tiles.some(t => t.key === b.key)) || (b.main - a.main))[0];
                if (!next) break;
                tiles.push({ ch: next.ch, key: next.key });
            }
            tiles = tiles.slice(0, n);
            const was = active && active.ch;
            if (!active || !tiles.some(t => t.ch === active.ch)) active = tiles[0] || null;
            if (layoutNow() === 'pip') active = tiles[0];
            return !!(was && active && active.ch !== was);                          // the sound moved to another feed
        }
        function show() {
            const layout = layoutNow();
            if (tiles.length) mv.set(layout, tiles.map(t => ({ ...t, label: label(t) })), active && active.ch); else mv.stop();
            hooks.modes.forEach(el => { el.innerHTML = buttonsHtml(tiles.length ? layout : null, liveFeeds().length); });
            if (active) { const { g, f } = feedOf(active); if (g) hooks.caption(g.title, `${f && f.name !== 'Watch' ? `${f.name} · ` : ''}channel ${active.ch}${tiles.length > 1 ? ` · ${tiles.length} feeds` : ''}`); }
            hooks.drawn();
        }
        // a feed on screen: the tile already showing it gets the sound; else it takes the place of the one with the sound
        function put(t) {
            started = true;
            const have = tiles.find(x => x.ch === t.ch);
            if (have) active = have;
            else if (!tiles.length) { tiles = [t]; active = t; }
            else { const i = Math.max(0, tiles.findIndex(x => active && x.ch === active.ch)); tiles[i] = t; active = t; }
            fit(); show();
        }
        // a game card picked while feeds are playing: that game on screen too (its tile gets the sound, or it takes that one's place)
        function pick(g) {
            const f = g && (g.feeds.find(x => x.name === 'Watch' && live(x)) || g.feeds.find(live));
            if (started && tiles.length && f) put(tiles.find(t => t.key === g.key) || { ch: String(f.channel), key: g.key });
        }
        hooks.modes.forEach(el => el.addEventListener('click', e => {
            const btn = e.target.closest('button[data-layout]'); if (!btn || btn.disabled) return;
            want = btn.dataset.layout; started = true;
            if (!tiles.length) { const g = hooks.current(), f = g && g.feeds.find(live); if (f) tiles = [{ ch: String(f.channel), key: g.key }]; }
            // the feed with the sound stays: the main picture in single and PiP, never the tile a smaller layout drops
            if (active && tiles.includes(active)) {
                const n = size(want, liveFeeds().length), rest = tiles.filter(t => t !== active);
                if (want === 'single' || want === 'pip') tiles = [active, ...rest];
                else if (tiles.indexOf(active) >= n) tiles = [...rest.slice(0, n - 1), active, ...rest.slice(n - 1)];
            }
            fit(); show();
        }));
        // after each refresh of the games: re-fit (feeds on and off the air); the bug follows the sound if it moved
        function update() {
            if (!started) { hooks.modes.forEach(el => { el.innerHTML = buttonsHtml(null, liveFeeds().length); }); return; }
            const moved = fit(); show();
            if (moved) hooks.follow(active.key);
        }
        return { put, pick, update, active: () => active, stop: () => { tiles = []; started = false; active = null; mv.stop(); } };
    }

    window.MVIEW = { create, player, buttonsHtml, size, QUALITY };
})();
