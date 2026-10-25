/* Watch: the league's live games, behind codes. Shared by the website's Past Seasons > Watch page, the Android app's
   Watch screen and tools/watch-lock.html (which makes the lock).

   data/watch.json is the lock (v2): { v, iv, data, keys: [{ salt, hash, iter, iv, box }] }
     data  the relay's channels, AES-GCM encrypted under one random data key, so the published files never show the
           relay's address or its key:   { channels: [{ number, name, url, lo }] }   url: https://<relay>/proxy/ts/stream/<id>?key=<key>;
           lo (optional): the same channel's low-bitrate copy, for multi-view tiles and the picture-in-picture window
     keys  one per code: hash is the SHA-256 of `${salt}:${code}` (hex) and identifies the code; box is the data key plus
           who the code is for, AES-GCM encrypted under a key derived from the code (PBKDF2-SHA256, `iter` rounds):
             { k, role: 'master' }                                     the commissioner's passcode: today and tomorrow's games
             { k, role: 'manager', owner, name, date: 'YYYY-MM-DD' }   "<first name><MMDDYY>" for one manager and game day
   Manager codes are a name and a date, so they're easy to guess: they personalise the page; the relay's EPG gate (a
   channel streams only while its game is on) is what limits the exposure. Codes are matched without case or spaces.
   The relay (tools/watch-relay.Caddyfile + tools/watch-gate.py) also serves /guide.json with the same key.
   Once unlocked, the connection is remembered on that device (localStorage) until Lock is pressed or the code's key
   leaves the lock. Streams are raw MPEG-TS (Dispatcharr's /proxy/ts/stream/...), played with mpegts.js. */
(function () {
    const enc = new TextEncoder(), dec = new TextDecoder();
    const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const STORE = 'gt-watch';
    const normal = code => String(code || '').toLowerCase().replace(/\s+/g, '');

    // ---------------------------------------------------------------- the lock
    const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
    async function keyFor(code, salt, iter, usage) {
        const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter },
                                       base, { name: 'AES-GCM', length: 256 }, false, [usage]);
    }
    const aes = async (key, iv, bytes) => new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    // tools/watch-lock.html: codes [{ code, iter, who: { role, ... } }] + channels -> the contents of data/watch.json
    async function seal(codes, conn, progress = () => {}) {
        const raw = crypto.getRandomValues(new Uint8Array(32));
        const dataKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const keys = [];
        for (const [i, c] of codes.entries()) {
            const salt = hex(crypto.getRandomValues(new Uint8Array(16))), kiv = crypto.getRandomValues(new Uint8Array(12));
            const box = await aes(await keyFor(normal(c.code), salt, c.iter, 'encrypt'), kiv, enc.encode(JSON.stringify({ k: b64(raw), ...c.who })));
            keys.push({ salt, hash: await sha256(`${salt}:${normal(c.code)}`), iter: c.iter, iv: b64(kiv), box: b64(box) });
            progress(i + 1, codes.length);
        }
        keys.sort((x, y) => x.hash.localeCompare(y.hash));          // no order to read anything from
        return { v: 2, iv: b64(iv), data: b64(await aes(dataKey, iv, enc.encode(JSON.stringify(conn)))), keys };
    }
    // a wrong code returns null; a right one returns the channels plus who it's for ({ role, owner, name, date })
    async function unlock(lock, code) {
        code = normal(code);
        if (!code || !lock || lock.v !== 2) return null;
        let entry = null;
        for (const k of lock.keys) if (await sha256(`${k.salt}:${code}`) === k.hash) { entry = k; break; }
        if (!entry) return null;
        const kek = await keyFor(code, entry.salt, entry.iter, 'decrypt');
        const who = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(entry.iv) }, kek, unb64(entry.box))));
        const dataKey = await crypto.subtle.importKey('raw', unb64(who.k), 'AES-GCM', false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(lock.iv) }, dataKey, unb64(lock.data));
        delete who.k;
        const conn = { ...JSON.parse(dec.decode(plain)), who, hash: entry.hash };
        try { localStorage.setItem(STORE, JSON.stringify(conn)); } catch (_) { /* private mode: unlocked for this visit only */ }
        return conn;
    }
    const loadLock = src => fetch(src, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
    // still valid while the lock still holds that code's key
    function remembered(lock) {
        try {
            const c = JSON.parse(localStorage.getItem(STORE) || 'null');
            return c && lock && lock.v === 2 && c.channels && c.who && lock.keys.some(k => k.hash === c.hash) ? c : null;
        } catch (_) { return null; }
    }
    function forget() { try { localStorage.removeItem(STORE); } catch (_) { /* private mode */ } }

    // ---------------------------------------------------------------- the guide (from the relay, same key as the streams)
    function guideUrl(conn) {
        const u = new URL(conn.channels[0].url);
        return `${u.origin}/guide.json?key=${encodeURIComponent(u.searchParams.get('key') || '')}`;
    }
    // a plain GET: a cache option would add request headers the relay's CORS rules don't allow (it sends no-store itself)
    async function guide(conn) {
        const r = await fetch(guideUrl(conn));
        if (!r.ok) throw new Error(r.status === 404 ? 'The guide refused this key' : `The guide answered ${r.status}`);
        return r.json();
    }

    // ---------------------------------------------------------------- playing channels (one or several at once)
    // open() plays one channel into one <video> and returns its handle ({ close }); several can run side by side (multi-view,
    // picture in picture). quality 'lo' takes the channel's low-bitrate copy (`lo` in the lock) when it has one: small
    // tiles use it so four feeds fit the relay's upload. play() / stop() are the one-feed shorthand: stop everything, open one
    const players = new Set();                            // open handles
    // watcherror detail: { title, text } for the player's caption
    const report = (video, title, text) => video.dispatchEvent(new CustomEvent('watcherror', { detail: { title, text } }));
    function open(conn, number, video, { quality = 'hi' } = {}) {
        const ch = conn.channels.find(c => String(c.number) === String(number));
        if (!ch) throw new Error(`Channel ${number} isn't set up`);
        if (!window.mpegts || !mpegts.isSupported()) throw new Error("This browser can't play live streams");
        const src = quality === 'lo' && ch.lo ? ch.lo : ch.url;
        // never skip ahead to chase the live edge (that skip is the "catching up" jump); keep a large stash instead
        const ts = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: src },
                                       { enableStashBuffer: true, stashInitialSize: 2 * 1024 * 1024, liveBufferLatencyChasing: false, lazyLoad: false,
                                         autoCleanupSourceBuffer: true, autoCleanupMaxBackwardDuration: 60, autoCleanupMinBackwardDuration: 30 });
        const h = { video, ts, number: String(number), quality: src === ch.lo ? 'lo' : 'hi', closed: false };
        h.close = () => close(h);
        players.add(h);
        // a cushion, built in the background: start once START seconds are buffered; while playing, if the buffer ahead
        // drops under LOW, play at SLOW speed (pitch kept) until it's back over HIGH, so a dip refills without a pause.
        // Only an empty buffer (a real stall) pauses, to refill to START
        const START = 12, LOW = 8, HIGH = 15, SLOW = 0.95;
        const ahead = () => { const b = video.buffered; return b.length ? b.end(b.length - 1) - video.currentTime : 0; };
        let filling = true;
        h.cushion = setInterval(() => {
            if (h.closed) return clearInterval(h.cushion);
            const a = ahead();
            if (filling) {
                if (a >= START) { filling = false; video.playbackRate = 1; video.play().catch(() => { /* autoplay blocked: the controls' play button starts it */ }); }
                return;
            }
            if (a < LOW && video.playbackRate !== SLOW) video.playbackRate = SLOW;
            else if (a > HIGH && video.playbackRate !== 1) video.playbackRate = 1;
        }, 500);
        h.onWait = () => { if (!h.closed && video.currentTime > 0 && ahead() < 0.5) { filling = true; video.pause(); } };
        video.addEventListener('waiting', h.onWait);
        // the relay refuses a channel outside its program (403), and Dispatcharr sends no video while a feed is idle
        const offAir = () => report(video, 'Off the air', 'Nothing is on this channel right now. Check back at game time.');
        const timer = setTimeout(() => { if (!h.closed && !video.buffered.length) { close(h); offAir(); } }, 20000);
        video.addEventListener('progress', () => { if (video.buffered.length) clearTimeout(timer); });
        ts.on(mpegts.Events.ERROR, () => {
            if (h.closed) return;
            clearTimeout(timer);
            const started = video.currentTime > 0;
            close(h);
            if (started) report(video, 'Stream stopped', 'Pick the game again to retry.'); else offAir();
        });
        ts.attachMediaElement(video);
        ts.load();                                        // playback starts once the cushion is buffered (above)
        return h;
    }
    // closing the connection is how Dispatcharr knows the viewer left
    function close(h) {
        if (!h || h.closed) return;
        h.closed = true; players.delete(h);
        clearInterval(h.cushion);
        h.video.removeEventListener('waiting', h.onWait);
        h.video.playbackRate = 1;
        h.ts.unload(); h.ts.detachMediaElement(); h.ts.destroy();
        h.video.pause(); h.video.removeAttribute('src'); h.video.load();
    }
    function stop() { [...players].forEach(close); }
    function play(conn, number, video) { stop(); return open(conn, number, video); }
    window.addEventListener('pagehide', stop);

    window.WATCH = { seal, unlock, loadLock, remembered, forget, guideUrl, guide, open, close, play, stop, isPlaying: () => players.size > 0 };
})();
