/* Get the App: download the Android app (and every update) from the site. The newest version, its size and date come
   from the app's GitHub releases (the files are hosted there); what changed comes from data/app_changelog.json. */
(async function () {
    const { esc, url } = SITE;
    const content = document.getElementById('content');
    const REPO = 'GetHorizontal63/gridiron_android';
    const STABLE = `https://github.com/${REPO}/releases/latest/download/GrassTouchers.apk`;   // always the newest build
    SITE.subHeader({ crumbs: [['Get the App']], tabs: [] });
    SITE.hero({ title: 'Get the App', size: 'short', dots: false, image: 'background-9.png',
                meta: ['Grass Touchers for Android · scores, standings, stats and the record book in your pocket'] });

    const [releases, changelog] = await Promise.all([
        fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers: { Accept: 'application/vnd.github+json' } })
            .then(r => (r.ok ? r.json() : [])).catch(() => []),
        fetch(url('data/app_changelog.json')).then(r => (r.ok ? r.json() : { releases: [] })).catch(() => ({ releases: [] }))
    ]);
    const notesFor = v => (changelog.releases.find(x => x.version === v) || {}).notes || [];
    const builds = releases.filter(r => !r.draft && !r.prerelease).map(r => {
        const apk = r.assets.find(a => /^GrassTouchers-.*\.apk$/.test(a.name)) || r.assets.find(a => a.name.endsWith('.apk'));
        return apk && { version: r.tag_name.replace(/^v/, ''), date: new Date(r.published_at), size: apk.size, href: apk.browser_download_url };
    }).filter(Boolean);
    const latest = builds[0];
    const mb = n => `${(n / 1048576).toFixed(1)} MB`;
    const day = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const pageUrl = location.href.split('#')[0];

    const shots = [['screen-home.png', 'This week'], ['screen-game.png', 'Game center'], ['screen-stats.png', 'Playoff odds'],
                   ['screen-bracket.png', 'Brackets'], ['screen-records.png', 'Record book']];
    content.innerHTML = `<div class="wrap page-pad">
        <section class="ga-hero">
            <div class="ga-main">
                <img class="ga-icon" src="${url('assets/logos/logo_2.png')}" alt="">
                <div class="ga-id"><div class="eyebrow">Android app</div><h2 class="section-title">Grass Touchers</h2>
                    <p class="ga-meta">${latest ? `Version ${esc(latest.version)} · ${day(latest.date)} · ${mb(latest.size)}` : 'Newest version'} · Android 6.0 or newer · Free</p></div>
                <a class="btn btn-accent ga-download" href="${latest ? latest.href : STABLE}" download>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M6 10l6 6 6-6M4 20h16"/></svg>
                    Download${latest ? ` v${esc(latest.version)}` : ''}</a>
                ${latest && notesFor(latest.version).length ? `<div class="ga-new"><b>What's new</b><ul>${notesFor(latest.version).map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
            </div>
            <div class="ga-qr"><div id="ga-qr"></div><p>On a computer? Scan with your phone's camera to open this page there.</p></div>
        </section>

        <section class="ga-shots">${shots.map(([f, label]) => `<figure><img src="${url(`assets/app/${f}`)}" alt="${esc(label)}" loading="lazy"><figcaption>${esc(label)}</figcaption></figure>`).join('')}</section>

        <section class="ga-steps">
            <div class="ga-step"><span>1</span><h3>Download</h3><p>Tap <b>Download</b> on your Android phone. The file is about ${latest ? mb(latest.size) : '30 MB'}.</p></div>
            <div class="ga-step"><span>2</span><h3>Open it</h3><p>Open the downloaded file from the notification or your Downloads folder.</p></div>
            <div class="ga-step"><span>3</span><h3>Allow and install</h3><p>The first time, Android asks to allow installs from your browser. Allow it, go back and tap <b>Install</b>.</p></div>
        </section>
        <p class="ga-note">Updating: download the newest version here and open it. It installs over the one you have and keeps your settings.
            League scores and stats update on their own, so you only need a new version when the app itself changes. iPhone isn't available.</p>

        ${builds.length ? `<div class="panel"><div class="panel-head"><h3 class="panel-title">Every Version</h3><span class="muted">Newest first</span></div>
            <ul class="ga-versions">${builds.map((b, i) => `<li>
                <div><b>Version ${esc(b.version)}</b>${i === 0 ? ' <span class="pill pill-accent">Latest</span>' : ''}<small>${day(b.date)} · ${mb(b.size)}</small>
                    ${notesFor(b.version).length ? `<ul>${notesFor(b.version).map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>
                <a class="btn ${i === 0 ? 'btn-accent' : 'btn-black'}" href="${b.href}" download>Download</a></li>`).join('')}</ul></div>`
            : `<div class="panel"><p class="muted">The version list couldn't load right now; the Download button above always gets the newest version.</p></div>`}
    </div>`;

    // QR code to this page for desktop visitors (cdnjs qrcodejs, loaded only here)
    const qr = document.createElement('script');
    qr.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    qr.onload = () => { try { new QRCode(document.getElementById('ga-qr'), { text: pageUrl, width: 150, height: 150, colorDark: '#111111', colorLight: '#ffffff' }); } catch (_) { /* optional */ } };
    document.head.appendChild(qr);
})();
