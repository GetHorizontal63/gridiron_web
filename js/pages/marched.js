/* Where We Marched: the drum corps league members marched with (ported from the public site) */
(async function () {
    const { esc, url } = SITE;
    const content = document.getElementById('content');
    const b = await GT.load();
    SITE.subHeader({ crumbs: [['Managers', url('pages/managers/index.html')], ['Where We Marched']],
                     tabs: [{ label: 'All Managers', href: url('pages/managers/index.html') },
                            { label: 'Where We Marched', href: url('pages/managers/where-we-marched.html'), active: true },
                            { label: 'League Overview', href: url('pages/past-seasons/overview.html') }] });

    const data = (await LeagueDb.dci()).DCI_Corps;
    const CLASSES = [['World_Class', 'World Class'], ['Open_Class', 'Open Class'], ['All_Age', 'All Age']];
    const all = CLASSES.flatMap(([k]) => data[k] || []);
    const withMembers = all.filter(c => c.members);
    const memberCount = new Set(withMembers.flatMap(c => c.members.split(',').map(m => m.trim()))).size;
    SITE.hero({ title: 'Where We Marched', size: 'short', dots: false, image: 'background-11.png',
                meta: [`${memberCount} league members marched with ${withMembers.length} of ${all.length} corps · World Class, Open Class and All Age`] });

    // these logos are white (made for the old dark page); use their dark versions on white cards
    const DARK = ['cav', 'man', 'rcr', 'tro'];
    const logo = c => { const a = c.abbreviation.toLowerCase(); return url(`assets/icons/dci-logos/${a}${DARK.includes(a) ? '-drk' : ''}.png`); };
    const card = c => {
        const members = c.members ? c.members.split(',').map(m => m.trim()).filter(Boolean) : [];
        return `<div class="wm-card${members.length ? '' : ' empty'}">
            <img class="wm-logo" src="${logo(c)}" alt="" onerror="this.src='${url('assets/icons/dci-logos/dci.png')}';this.onerror=null">
            <div class="wm-name" title="${esc(c.name)}">${esc(c.name)}</div>
            <div class="wm-members">${members.length ? members.map(m => {
                const o = b.byName[m.toLowerCase()];
                return o ? `<a class="wm-chip" href="${url(`pages/managers/overview.html?m=${o.id}`)}"><img src="${GT.logo(m)}" alt="">${esc(m)}</a>`
                         : `<span class="wm-chip">${esc(m)}</span>`;
            }).join('') : '<span class="wm-none">No members</span>'}</div>
        </div>`;
    };
    content.innerHTML = `<div class="wrap page-pad">
        ${CLASSES.map(([k, label]) => {
            const list = (data[k] || []).slice().sort((x, y) => x.name.localeCompare(y.name));   // alphabetical, as on the public page
            if (!list.length) return '';
            const n = list.filter(c => c.members).length;
            return `<section class="wm-section">
                <div class="panel-head"><div><div class="eyebrow">${n} of ${list.length} corps with league members</div><h2 class="section-title">${label}</h2></div></div>
                <div class="wm-grid">${list.map(card).join('')}</div></section>`;
        }).join('')}</div>`;
})();
