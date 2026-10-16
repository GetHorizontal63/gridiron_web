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

    // ESPN stat ids -> [section, column, label], listed in display order (ESPN's)
    const OFF = 'Offense', KP = 'Kicking & Punting', DST = 'Team Defense / Special Teams', HC = 'Head Coach';
    const LIST = [
        [3, OFF, 'Passing', 'Passing yards'], [4, OFF, 'Passing', 'TD pass'], [19, OFF, 'Passing', '2-pt conversion'], [20, OFF, 'Passing', 'Interception thrown'],
        [24, OFF, 'Rushing', 'Rushing yards'], [25, OFF, 'Rushing', 'TD rush'], [26, OFF, 'Rushing', '2-pt conversion'],
        [42, OFF, 'Receiving', 'Receiving yards'], [43, OFF, 'Receiving', 'TD reception'], [44, OFF, 'Receiving', '2-pt conversion'], [53, OFF, 'Receiving', 'Each reception'],
        [63, OFF, 'Miscellaneous', 'Fumble recovered for TD'], [72, OFF, 'Miscellaneous', 'Fumble lost'], [101, OFF, 'Miscellaneous', 'Kickoff return TD'], [102, OFF, 'Miscellaneous', 'Punt return TD'],
        [80, KP, 'Kicking', 'FG made, 0-39 yds'], [77, KP, 'Kicking', 'FG made, 40-49 yds'], [74, KP, 'Kicking', 'FG made, 50+ yds'], [198, KP, 'Kicking', 'FG made, 50-59 yds'],
        [201, KP, 'Kicking', 'FG made, 60+ yds'], [85, KP, 'Kicking', 'FG missed'], [86, KP, 'Kicking', 'PAT made'], [88, KP, 'Kicking', 'PAT missed'],
        [138, KP, 'Punting', 'Each punt'], [140, KP, 'Punting', 'Inside the 10'], [141, KP, 'Punting', 'Inside the 20'], [142, KP, 'Punting', 'Punt blocked'], [146, KP, 'Punting', 'Fair catch'],
        [148, KP, 'Punt average', '44.0+'], [149, KP, 'Punt average', '42.0-43.9'], [150, KP, 'Punt average', '40.0-41.9'],
        [89, DST, 'Points allowed', '0'], [90, DST, 'Points allowed', '1-6'], [91, DST, 'Points allowed', '7-13'], [92, DST, 'Points allowed', '14-17'],
        [121, DST, 'Points allowed', '18-21'], [122, DST, 'Points allowed', '22-27'], [123, DST, 'Points allowed', '28-34'], [124, DST, 'Points allowed', '35-45'], [125, DST, 'Points allowed', '46+'],
        [128, DST, 'Yards allowed', 'Under 100'], [129, DST, 'Yards allowed', '100-199'], [130, DST, 'Yards allowed', '200-299'], [131, DST, 'Yards allowed', '300-349'],
        [132, DST, 'Yards allowed', '350-399'], [133, DST, 'Yards allowed', '400-449'], [134, DST, 'Yards allowed', '450-499'], [135, DST, 'Yards allowed', '500-549'], [136, DST, 'Yards allowed', '550+'],
        [99, DST, 'Defense', 'Sack'], [95, DST, 'Defense', 'Interception'], [96, DST, 'Defense', 'Fumble recovered'], [106, DST, 'Defense', 'Fumble forced'],
        [97, DST, 'Defense', 'Blocked punt, PAT or FG'], [98, DST, 'Defense', 'Safety'], [209, DST, 'Defense', '1-pt safety'],
        [103, DST, 'Returns', 'Interception return TD'], [104, DST, 'Returns', 'Fumble return TD'], [93, DST, 'Returns', 'Blocked kick return TD'],
        [117, DST, 'Returns', 'Every 25 kickoff return yds'], [119, DST, 'Returns', 'Every 25 punt return yds'], [206, DST, 'Returns', '2-pt conversion return'],
        [155, HC, 'Result', 'Team win'], [156, HC, 'Result', 'Team loss'],
        [161, HC, 'Wins', 'By 25+'], [162, HC, 'Wins', 'By 20-24'], [163, HC, 'Wins', 'By 15-19'], [164, HC, 'Wins', 'By 10-14'], [165, HC, 'Wins', 'By 5-9'], [166, HC, 'Wins', 'By 1-4'],
        [167, HC, 'Losses', 'By 1-4'], [168, HC, 'Losses', 'By 5-9'], [169, HC, 'Losses', 'By 10-14'], [170, HC, 'Losses', 'By 15-19'], [171, HC, 'Losses', 'By 20-24'], [172, HC, 'Losses', 'By 25+']
    ];
    const S = Object.fromEntries(LIST.map(([id, ...rest], k) => [id, [...rest, k]]));
    const yards = { 3: 1, 24: 1, 42: 1 };
    // per-yard items as "1 pt / N yds" (ESPN's way); everything else as points
    const fmt = (id, v) => {
        if (yards[id] && v > 0 && v < 1) return `1 pt / ${Math.round(1 / v)} yds`;
        const n = Number(v.toFixed(2));
        return `${n > 0 ? '+' : ''}${n}`;
    };
    const rows = (data.seasons[String(season)] || []).map(r => {
        const v = r.pts || (r.slots ? Object.values(r.slots)[0] : 0);
        const [sec, col, label, k] = S[r.id] || ['Other', 'Other', `Stat ${r.id}`, 999 + r.id];
        return { sec, col, label, k, v: fmt(r.id, v), neg: v < 0 };
    }).sort((x, y) => x.k - y.k);
    const SECS = [OFF, KP, DST, HC, 'Other'];
    const block = sec => {
        const cols = [...new Set(rows.filter(r => r.sec === sec).map(r => r.col))];
        return `<section class="panel sr-sec"><h3 class="panel-title">${esc(sec)}</h3><div class="sr-cols">${cols.map(c => `<div class="sr-col">
            <div class="sr-col-head">${esc(c)}</div>${rows.filter(r => r.sec === sec && r.col === c).map(x =>
                `<div class="sr-row"><span>${esc(x.label)}</span><b class="${x.neg ? 'loss' : ''}">${esc(x.v)}</b></div>`).join('')}</div>`).join('')}</div></section>`;
    };
    content.innerHTML = `<div class="wrap page-pad">
        <div class="panel-head" style="margin-top:34px"><div><div class="eyebrow">${season} season</div><h2 class="section-title">Scoring Rules</h2></div></div>
        ${SECS.filter(s => rows.some(r => r.sec === s)).map(block).join('')}</div>`;
})();
