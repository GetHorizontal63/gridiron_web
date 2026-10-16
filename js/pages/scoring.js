/* Past Seasons: Scoring Rules. A season's scoring settings laid out like ESPN's league settings page, one block per
   category (data/scoring_rules.json, built by NEW/python/build_scoring_rules.py from the ESPN league settings).
   An item worth points only in one lineup slot (D/ST: slot 16) is listed in that slot's block. */
(async function () {
    const { esc, url, param } = SITE;
    const content = document.getElementById('content');
    await GT.load();
    const data = await fetch(url('data/scoring_rules.json')).then(r => r.json()).catch(() => ({ seasons: {} }));
    const seasons = Object.keys(data.seasons).map(Number).sort((x, y) => y - x);
    const season = seasons.includes(Number(param('season'))) ? Number(param('season')) : seasons[0];
    SITE.subHeader({ crumbs: [['Past Seasons', url('pages/past-seasons/index.html')], [`${season}`, url(`pages/past-seasons/overview.html?season=${season}`)], ['Scoring Rules']],
                     tabs: SITE.sectionTabs('competitions', '').filter(t => !t.href.endsWith('index.html')).map(t => ({ ...t, href: `${t.href}?season=${season}` })) });
    SITE.hero({ title: `${season} Scoring`, size: 'short', dots: false, image: 'background-7.png',
                tools: `<label class="hero-season"><span>Season</span><select class="select" id="hero-season">${seasons.map(s => `<option value="${s}"${s === season ? ' selected' : ''}>${s} season</option>`).join('')}</select></label>`,
                meta: ['League scoring settings', 'Points per stat, by category'] });
    document.getElementById('hero-season').addEventListener('change', e => { const u = new URL(location.href); u.searchParams.set('season', e.target.value); location.href = u; });

    // ESPN stat ids -> [category, label]
    const S = {
        3: ['Passing', 'Passing yards'], 4: ['Passing', 'TD pass'], 19: ['Passing', '2-pt passing conversion'], 20: ['Passing', 'Interception thrown'],
        24: ['Rushing', 'Rushing yards'], 25: ['Rushing', 'TD rush'], 26: ['Rushing', '2-pt rushing conversion'],
        42: ['Receiving', 'Receiving yards'], 43: ['Receiving', 'TD reception'], 44: ['Receiving', '2-pt receiving conversion'], 53: ['Receiving', 'Each reception'],
        63: ['Miscellaneous', 'Fumble recovered for TD'], 72: ['Miscellaneous', 'Fumble lost'], 101: ['Miscellaneous', 'Kickoff return TD'], 102: ['Miscellaneous', 'Punt return TD'],
        74: ['Kicking', 'FG made (50+ yards)'], 77: ['Kicking', 'FG made (40-49 yards)'], 80: ['Kicking', 'FG made (0-39 yards)'], 198: ['Kicking', 'FG made (50-59 yards)'],
        201: ['Kicking', 'FG made (60+ yards)'], 85: ['Kicking', 'FG missed'], 86: ['Kicking', 'PAT made'], 88: ['Kicking', 'PAT missed'],
        138: ['Punting', 'Each punt'], 140: ['Punting', 'Punt inside the 10'], 141: ['Punting', 'Punt inside the 20'], 142: ['Punting', 'Punt blocked'], 146: ['Punting', 'Fair catch'],
        148: ['Punting', 'Punt average 44.0+'], 149: ['Punting', 'Punt average 42.0-43.9'], 150: ['Punting', 'Punt average 40.0-41.9'],
        89: ['Team Defense / Special Teams', '0 points allowed'], 90: ['Team Defense / Special Teams', '1-6 points allowed'], 91: ['Team Defense / Special Teams', '7-13 points allowed'],
        92: ['Team Defense / Special Teams', '14-17 points allowed'], 121: ['Team Defense / Special Teams', '18-21 points allowed'], 122: ['Team Defense / Special Teams', '22-27 points allowed'],
        123: ['Team Defense / Special Teams', '28-34 points allowed'], 124: ['Team Defense / Special Teams', '35-45 points allowed'], 125: ['Team Defense / Special Teams', '46+ points allowed'],
        128: ['Team Defense / Special Teams', 'Less than 100 yards allowed'], 129: ['Team Defense / Special Teams', '100-199 yards allowed'], 130: ['Team Defense / Special Teams', '200-299 yards allowed'],
        131: ['Team Defense / Special Teams', '300-349 yards allowed'], 132: ['Team Defense / Special Teams', '350-399 yards allowed'], 133: ['Team Defense / Special Teams', '400-449 yards allowed'],
        134: ['Team Defense / Special Teams', '450-499 yards allowed'], 135: ['Team Defense / Special Teams', '500-549 yards allowed'], 136: ['Team Defense / Special Teams', '550+ yards allowed'],
        93: ['Team Defense / Special Teams', 'Blocked punt or FG return for TD'], 95: ['Team Defense / Special Teams', 'Each interception'], 96: ['Team Defense / Special Teams', 'Each fumble recovered'],
        97: ['Team Defense / Special Teams', 'Blocked punt, PAT or FG'], 98: ['Team Defense / Special Teams', 'Each safety'], 99: ['Team Defense / Special Teams', 'Each sack'],
        103: ['Team Defense / Special Teams', 'Interception return TD'], 104: ['Team Defense / Special Teams', 'Fumble return TD'], 106: ['Team Defense / Special Teams', 'Each fumble forced'],
        117: ['Team Defense / Special Teams', 'Every 25 kickoff return yards'], 119: ['Team Defense / Special Teams', 'Every 25 punt return yards'],
        206: ['Team Defense / Special Teams', '2-pt conversion return'], 209: ['Team Defense / Special Teams', '1-pt safety'],
        155: ['Head Coach', 'Team win'], 156: ['Head Coach', 'Team loss'],
        166: ['Head Coach', 'Win by 1-4 points'], 165: ['Head Coach', 'Win by 5-9 points'], 164: ['Head Coach', 'Win by 10-14 points'], 163: ['Head Coach', 'Win by 15-19 points'],
        162: ['Head Coach', 'Win by 20-24 points'], 161: ['Head Coach', 'Win by 25+ points'],
        167: ['Head Coach', 'Lose by 1-4 points'], 168: ['Head Coach', 'Lose by 5-9 points'], 169: ['Head Coach', 'Lose by 10-14 points'], 170: ['Head Coach', 'Lose by 15-19 points'],
        171: ['Head Coach', 'Lose by 20-24 points'], 172: ['Head Coach', 'Lose by 25+ points']
    };
    const ORDER = ['Passing', 'Rushing', 'Receiving', 'Miscellaneous', 'Kicking', 'Punting', 'Team Defense / Special Teams', 'Head Coach', 'Other'];
    const yards = { 3: 'passing', 24: 'rushing', 42: 'receiving' };
    // the value shown: per-yard items as "1 pt per N yards" (ESPN's way); everything else as points
    const fmt = (id, v) => {
        if (yards[id] && v > 0 && v < 1) return `1 pt / ${Math.round(1 / v)} yds`;
        const n = Number(v.toFixed(2));
        return `${n > 0 ? '+' : ''}${n}`;
    };
    // row order within a block, the way ESPN lists them (ids not listed sort last)
    const RANK = [3, 4, 19, 20, 24, 25, 26, 42, 43, 44, 53, 63, 72, 101, 102, 80, 77, 74, 198, 201, 85, 86, 88, 138, 140, 141, 142, 146, 148, 149, 150,
        89, 90, 91, 92, 121, 122, 123, 124, 125, 128, 129, 130, 131, 132, 133, 134, 135, 136, 99, 95, 96, 106, 97, 98, 93, 103, 104, 117, 119, 206, 209,
        155, 156, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172];
    const rank = id => { const i = RANK.indexOf(id); return i < 0 ? 999 + id : i; };
    const groups = {};
    (data.seasons[String(season)] || []).slice().sort((x, y) => rank(x.id) - rank(y.id)).forEach(r => {
        const slotOnly = !r.pts && r.slots && r.slots['16'] != null;
        const [cat, label] = S[r.id] || [slotOnly ? 'Team Defense / Special Teams' : 'Other', `Stat ${r.id}`];
        const v = r.pts || (r.slots ? Object.values(r.slots)[0] : 0);
        (groups[cat] = groups[cat] || []).push({ label, v: fmt(r.id, v), neg: v < 0 });
    });
    content.innerHTML = `<div class="wrap page-pad">
        <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">${season} season</div><h2 class="section-title">Scoring Rules</h2></div></div>
        <div class="sr-grid">${ORDER.filter(c => groups[c]).map(c => `<div class="panel sr-block"><h3 class="panel-title">${esc(c)}</h3>
            ${groups[c].map(x => `<div class="sr-row"><span>${esc(x.label)}</span><b class="${x.neg ? 'loss' : ''}">${esc(x.v)}</b></div>`).join('')}</div>`).join('')}</div></div>`;
})();
