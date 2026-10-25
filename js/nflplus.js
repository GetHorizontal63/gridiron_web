/* Watch games: what the relay's guide has on today and tomorrow, as game cards with live scores, a box score and live
   fantasy points. Shared by the website's Watch page and the app's Watch screen (each styles the np-* markup in its
   own CSS).

   guide (WATCH.guide)    the EPG's programs on the relay's channels (title, channel, start, stop, open now?)
   ESPN public site API   that day's scoreboard (the game each program shows, live score, down & distance) and the game
                          summary for the box score; both answer any origin (CORS *), no key
   Fantasy points         computed live from that same summary by js/live-fantasy.js (league scoring, no league.db)

   A program whose title names a game ("NFL - New England Patriots at Chicago Bears (PRIME) - NFL+") becomes that
   game's card; another program on at the same time without teams (an alternate feed such as Prime Vision, shown by
   its first word: "Prime") becomes that game's second feed; anything else gets a card of its own. The feeds are
   buttons in the player's bar (feedsHtml), the game's live score a Game Center style band (bandHtml). */
(function () {
    const API = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const logo = abbr => SITE.url(`assets/nfl-logos/${String(abbr || 'nfl').toLowerCase()}.png`);
    const cols = (...widths) => `<colgroup>${widths.map(w => `<col style="width:${w}">`).join('')}</colgroup>`;
    // a plain GET: no cache option (that adds request headers, and ESPN doesn't answer the CORS pre-check they cause);
    // ESPN's own caching is 3 seconds, so live data stays fresh
    const getJson = url => fetch(url).then(r => { if (!r.ok) throw new Error(`ESPN answered ${r.status}`); return r.json(); });
    const ET = { timeZone: 'America/New_York' };
    const kickoff = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const time = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const etDay = iso => new Date(iso).toLocaleDateString('en-CA', ET).replace(/-/g, '');        // 'YYYYMMDD' in Eastern time

    // ---------------------------------------------------------------- the guide -> games
    // "NFL - Prime Vision with Next Gen Stats (PRIMEALT1) - NFL+" -> "Prime Vision with Next Gen Stats"
    const clean = title => String(title).replace(/^\s*NFL\s*-\s*/i, '').replace(/\s*-\s*NFL\+?\s*$/i, '').replace(/\s*\([A-Z0-9 ]+\)/g, '').trim();
    // Thursday / Sunday / Monday night slots by name; anything else by its day
    function slot(iso) {
        const d = new Date(iso), day = d.toLocaleDateString('en-US', { ...ET, weekday: 'long' });
        const hour = Number(d.toLocaleString('en-US', { ...ET, hour: 'numeric', hour12: false }));
        return hour >= 19 && ['Thursday', 'Sunday', 'Monday'].includes(day) ? `${day} Night Football` : `${day} game`;
    }
    async function events(programs) {
        const days = [...new Set(programs.map(p => etDay(p.start)))];
        const boards = await Promise.all(days.map(d => getJson(`${API}scoreboard?dates=${d}`).catch(() => ({ events: [] }))));
        return Object.fromEntries(boards.flatMap(b => b.events || []).map(e => [e.id, parseEvent(e)]));
    }
    function games(programs, evs) {
        const list = [], used = new Set();
        const feedName = t => { const c = clean(t), w = c.match(/^(.*?)\s+with\s+(.+)$/i);
            return w && /football/i.test(w[1]) ? w[2].replace(/\s+and\s+/i, ' & ') : c.split(/\s+/)[0]; };
        const findEvent = title => { const t = title.toLowerCase(); return Object.values(evs).find(e => e.teams.every(x => x.full && t.includes(x.full.toLowerCase()))); };
        programs.forEach((p, i) => {
            const ev = findEvent(p.title);
            if (!ev) return;
            used.add(i);
            let g = list.find(x => x.event && x.event.id === ev.id);
            if (!g) list.push(g = { key: ev.id, title: clean(p.title), label: slot(ev.date), start: p.start, stop: p.stop, event: ev, feeds: [] });
            g.feeds.push({ channel: p.channel, name: 'Watch', open: p.open, start: p.start });
        });
        programs.forEach((p, i) => {
            if (used.has(i)) return;
            const g = list.find(x => Math.abs(new Date(x.start) - new Date(p.start)) <= 30 * 60e3);
            if (g) g.feeds.push({ channel: p.channel, name: feedName(p.title), title: clean(p.title), open: p.open, start: p.start });
            else list.push({ key: `${p.channel}-${p.start}`, title: clean(p.title), label: slot(p.start), start: p.start, stop: p.stop, event: null,
                             feeds: [{ channel: p.channel, name: 'Watch', open: p.open, start: p.start }] });
        });
        return list.sort((x, y) => new Date(x.start) - new Date(y.start));
    }
    // the whole week: every game on ESPN's current-week scoreboard, each with the guide's channels for it (none when our
    // channels don't carry it), plus anything else on the guide (an alternate feed rides with its game)
    async function week(programs) {
        const board = await getJson(`${API}scoreboard`);
        const evs = { ...Object.fromEntries((board.events || []).map(e => [e.id, parseEvent(e)])), ...await events(programs) };
        const list = games(programs, evs);
        (board.events || []).forEach(e => { if (!list.some(g => g.key === e.id)) { const ev = evs[e.id];
            list.push({ key: e.id, title: `${ev.teams[0].full} at ${ev.teams[1].full}`, label: slot(ev.date), start: ev.date, stop: null, event: ev, feeds: [] }); } });
        const kick = g => new Date(g.event ? g.event.date : g.start);                // kickoff, not when the channel's program starts
        return { week: board.week && board.week.number, list: list.sort((x, y) => kick(x) - kick(y)) };
    }

    // ---------------------------------------------------------------- live scores (one week's scoreboard)
    function team(c) {
        const rec = (c.records || c.record || []).find(r => r.type === 'total') || (c.records || c.record || [])[0];
        return { id: c.team.id, abbr: c.team.abbreviation, name: c.team.shortDisplayName || c.team.name, full: c.team.displayName, score: c.score != null && c.score !== '' ? c.score : null,
                 record: rec ? rec.summary : '', winner: !!c.winner, lines: (c.linescores || []).map(l => l.displayValue ?? l.value) };
    }
    function parseEvent(e) {
        const c = e.competitions[0], st = e.status || c.status;
        const teams = ['away', 'home'].map(side => team(c.competitors.find(x => x.homeAway === side)));
        const s = c.situation || {};
        return { id: e.id, date: e.date, state: st.type.state, detail: st.type.shortDetail, completed: st.type.completed,
                 teams, networks: [...new Set((c.broadcasts || []).flatMap(b => b.names || []))],
                 situation: st.type.state === 'in' && s.downDistanceText ? { text: s.downDistanceText, possession: s.possession, redZone: !!s.isRedZone } : null };
    }
    // ---------------------------------------------------------------- box score (game summary)
    const TEAM_STATS = [['Total Yards', 'Total yards'], ['Passing', 'Passing yards'], ['Rushing', 'Rushing yards'], ['1st Downs', 'First downs'],
                        ['3rd down efficiency', '3rd down'], ['4th down efficiency', '4th down'], ['Red Zone (Made-Att)', 'Red zone'],
                        ['Turnovers', 'Turnovers'], ['Sacks-Yards Lost', 'Sacks-yards'], ['Penalties', 'Penalties'], ['Possession', 'Possession']];
    async function box(id) {
        const s = await getJson(`${API}summary?event=${id}`);
        const comp = s.header.competitions[0];
        const teams = ['away', 'home'].map(side => team(comp.competitors.find(x => x.homeAway === side)));
        const stats = Object.fromEntries((s.boxscore?.teams || []).map(t => [t.team.id, Object.fromEntries((t.statistics || []).map(x => [x.label, x.displayValue]))]));
        const players = Object.fromEntries((s.boxscore?.players || []).map(p => [p.team.id, Object.fromEntries(p.statistics.map(g => [g.name, {
            labels: g.labels, totals: g.totals || null,
            rows: g.athletes.map(a => ({ name: a.athlete.shortName || a.athlete.displayName, full: a.athlete.displayName, stats: a.stats }))
        }]))]));
        // every drive and play; wallclock (when it happened) lets the plays panel stay behind the delayed video
        const driveList = [...(s.drives?.previous || []), ...(s.drives?.current && !(s.drives.previous || []).some(d => d.id === s.drives.current.id) ? [s.drives.current] : [])];
        const drives = driveList.map(d => ({
            id: d.id, team: d.team?.abbreviation || '', desc: d.description || '', result: d.displayResult || '', score: !!d.isScore,
            plays: (d.plays || []).map(p => ({ id: p.id, q: p.period?.number, clock: p.clock?.displayValue || '', down: p.start?.downDistanceText || '',
                                                 type: p.type?.text || '', text: p.text || '', scoring: !!p.scoringPlay, wall: p.wallclock ? Date.parse(p.wallclock) : 0,
                                                 score: `${p.awayScore ?? ''}-${p.homeScore ?? ''}` }))
        }));
        const st = comp.status;
        return {
            id, raw: s, state: st.type.state, detail: st.type.shortDetail, date: comp.date, teams, stats, players, drives,
            networks: [...new Set((comp.broadcasts || []).map(b => b.media?.shortName).filter(Boolean))],
            scoring: (s.scoringPlays || []).map(p => ({ q: p.period?.number, clock: p.clock?.displayValue || '', team: p.team?.abbreviation || '',
                                                         text: p.text, score: `${p.awayScore}-${p.homeScore}` }))
        };
    }

    // ---------------------------------------------------------------- markup
    const status = g => g.state === 'in' ? `<span class="np-live">Live</span> ${esc(g.detail)}` : g.state === 'post' ? esc(g.detail) : esc(kickoff(g.date));
    // one game from games() as a Game Center card: teams, live score, possession; the feeds are listed, played from the bar
    function card(game, on) {
        const g = game.event;
        const row = t => `<div class="gc-team${g.state === 'post' && t.winner ? ' won' : ''}">
            <img src="${logo(t.abbr)}" alt="" onerror="this.src='${logo('nfl')}';this.onerror=null"><span class="gc-name">${esc(t.name)}</span>
            <span class="gc-mark">${g.situation && String(g.situation.possession) === String(t.id) ? '●' : ''}</span><span class="gc-score">${g.state === 'pre' ? esc(t.record) : esc(t.score ?? '')}</span></div>`;
        const sit = g && g.situation ? `${esc(g.situation.text)}${g.situation.redZone ? ' · Red zone' : ''}` : g ? esc(g.networks.join(' · ')) : `${esc(time(game.start))} - ${esc(time(game.stop))}`;
        return `<div class="gc-card np-card${on ? ' on' : ''}${g ? '' : ' np-solo'}" data-key="${esc(game.key)}">
            <div class="gc-top"><span class="gc-label">${esc(game.label)}</span><span class="gc-label np-status">${g ? status(g) : esc(kickoff(game.start))}</span></div>
            ${g ? g.teams.map(row).join('') : `<div class="np-title">${esc(game.title)}</div>`}
            <div class="gc-foot"><span class="np-sit">${sit}</span><span class="np-chs">${game.feeds.length ? game.feeds.map(f =>
                `<span class="np-ch${live(f) ? ' live' : ''}" title="${esc(f.title || game.title)}">${f.name === 'Watch' ? '' : `${esc(f.name)} `}<b>${esc(f.channel)}</b></span>`).join('')
                : g && g.state === 'post' ? '' : '<span class="np-ch none">No channel</span>'}</span></div></div>`;
    }
    // the player bar's buttons: one per feed of the game on screen, greyed until the relay opens its window
    // a feed has a stream only while the relay has its window open AND its program has started (before kickoff EPlusTV
    // has nothing to send); `active` is the feed being watched ({ key, ch }), the only one drawn selected
    const live = f => f.open && Date.now() >= new Date(f.start).getTime();
    const feedsHtml = (game, active) => (game ? game.feeds : []).map(f => {
        const on = live(f), sel = on && active && active.key === game.key && String(active.ch) === String(f.channel);
        return `<button class="np-feed${sel ? ' on' : ''}" type="button" data-ch="${esc(f.channel)}"${on ? '' : ' disabled'} aria-pressed="${sel ? 'true' : 'false'}"
            title="${esc(f.title || game.title)} · channel ${esc(f.channel)}${on ? '' : ` · available at ${esc(time(f.start))}`}">${esc(f.name)}<small>${on ? esc(f.channel) : esc(time(f.start))}</small></button>`;
    }).join('');
    // when the next feed becomes available (ms from now), so the page can refresh right then; null if none is waiting
    const nextStart = list => { const t = list.flatMap(g => g.feeds).map(f => new Date(f.start).getTime()).filter(x => x > Date.now()); return t.length ? Math.min(...t) - Date.now() : null; };
    // the game on screen as Game Center's header band: status pill, both teams, the score
    function bandHtml(game) {
        const g = game && game.event;
        if (!g) return game ? `<div class="band-label"><span class="pill pill-dark">${esc(kickoff(game.start))}</span>${esc(game.label)}</div>
            <div class="scoreboard np-band-solo"><b>${esc(game.title)}</b></div>` : '';
        const [A, H] = g.teams, lead = g.state === 'pre' ? '' : Number(A.score) > Number(H.score) ? 'a' : Number(H.score) > Number(A.score) ? 'h' : '';
        const side = (t, right) => `<div class="sb-team${right ? ' right' : ''}">${right ? '' : `<div class="sb-logo"><img src="${logo(t.abbr)}" alt=""></div>`}
            <div class="sb-name"><span>${esc(t.name)}</span><small>${esc(t.record)}${g.situation && String(g.situation.possession) === String(t.id) ? ' · ball' : ''}</small></div>
            ${right ? `<div class="sb-logo"><img src="${logo(t.abbr)}" alt=""></div>` : ''}</div>`;
        const pill = g.state === 'in' ? 'pill-accent' : 'pill-dark', text = g.state === 'in' ? `Live · ${g.detail}` : g.state === 'post' ? g.detail : kickoff(g.date);
        return `<div class="band-label"><span class="pill ${pill}">${esc(text)}</span>${esc(game.label)} · ${esc(g.networks.join(' · '))}${g.situation ? ` · ${esc(g.situation.text)}` : ''}</div>
            <div class="scoreboard">${side(A)}<div class="sb-scores"><div class="sb-score${lead === 'a' ? ' won' : ''}">${g.state === 'pre' ? '-' : esc(A.score)}</div><span class="sb-at">${g.state === 'pre' ? 'AT' : 'VS'}</span>
                <div class="sb-score${lead === 'h' ? ' won' : ''}">${g.state === 'pre' ? '-' : esc(H.score)}</div></div>${side(H, true)}</div>`;
    }

    // fantasy points (LIVEFP.score), one table per team: D/ST and coach first, then players by points
    // "Pass yds 274 +19.18", "Rec 6 +6"; tier lines already carry their number ("10 pts allowed +3", "Win by 7 +1")
    const f2 = v => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
    const howLine = l => `${l.label}${/^(\d|Avg|Win|Loss)/.test(l.label) ? '' : ` ${Number.isInteger(l.qty) ? l.qty : l.qty.toFixed(1)}`} ${l.pts > 0 ? '+' : ''}${f2(l.pts)}`;
    function fantasyHtml(b, fp) {
        if (!fp) return '';
        const one = t => {
            const rows = [{ name: `${t.abbr} D/ST`, ...t.dst }, { name: `${t.abbr} Coach`, ...t.hc },
                          ...fp.players.filter(p => p.teamId === t.id).sort((x, y) => y.pts - x.pts)];
            return `<div class="table-scroll"><table class="np-table np-fp np-wide">${cols('24%', '64%', '12%')}<thead><tr><th><span class="np-tcell"><img src="${logo(t.abbr)}" alt="">${esc(t.name || t.abbr)}</span></th><th>Scoring</th><th class="num">Pts</th></tr></thead>
                <tbody>${rows.map(r => { const how = r.lines.map(howLine).join(' · ');
                    return `<tr><td title="${esc(r.full || r.name)}">${esc(r.name)}</td><td title="${esc(how)}">${esc(how) || '<span class="np-dim">-</span>'}</td><td class="num"><b>${f2(r.pts)}</b></td></tr>`; }).join('')}</tbody></table></div>`;
        };
        const byId = Object.fromEntries(fp.teams.map(t => [t.id, t]));
        return `<div class="np-stack">${b.teams.map(t => byId[t.id] ? one(byId[t.id]) : '').join('')}</div>`;
    }

    // every ESPN box score category, in ESPN's order
    const GROUPS = [['passing', 'Passing'], ['rushing', 'Rushing'], ['receiving', 'Receiving'], ['fumbles', 'Fumbles'], ['defensive', 'Defense'],
                    ['interceptions', 'Interceptions'], ['kickReturns', 'Kick returns'], ['puntReturns', 'Punt returns'], ['kicking', 'Kicking'], ['punting', 'Punting']];
    // one category as a full-width table: a header row per team, its players, its totals; first column 26%, the rest even
    function groupTable(b, key, title, teams) {
        const parts = teams.map(t => ({ t, g: (b.players[t.id] || {})[key] })).filter(x => x.g && x.g.rows.length);
        if (!parts.length) return '';
        const labels = parts[0].g.labels, w = `${(74 / labels.length).toFixed(2)}%`;
        const body = parts.map(({ t, g }) => `${teams.length > 1 ? `<tr class="np-teamrow"><td colspan="${labels.length + 1}"><span class="np-tcell"><img src="${logo(t.abbr)}" alt="">${esc(t.name)}</span></td></tr>` : ''}
            ${g.rows.map(r => `<tr><td title="${esc(r.full || r.name)}">${esc(r.name)}</td>${labels.map((_, i) => `<td class="num">${esc(r.stats[i] ?? '-')}</td>`).join('')}</tr>`).join('')}
            ${g.totals ? `<tr class="np-total"><td>${esc(t.abbr)} total</td>${labels.map((_, i) => `<td class="num">${esc(g.totals[i] ?? '')}</td>`).join('')}</tr>` : ''}`).join('');
        return `<div class="table-scroll"><table class="np-table np-wide">${cols('26%', ...labels.map(() => w))}
            <thead><tr><th>${title}</th>${labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
    function boxHtml(meta, b, fp) {
        const [A, H] = b.teams;
        if (b.state === 'pre') return `<div class="np-box"><p class="np-empty">Kickoff ${esc(kickoff(b.date))}${b.networks.length ? ` · ${esc(b.networks.join(' · '))}` : ''}. The box score starts at kickoff.</p></div>`;
        const sa = b.stats[A.id] || {}, sh = b.stats[H.id] || {};
        const teamStats = `<div class="table-scroll"><table class="np-table np-wide np-teamstats">${cols('40%', '30%', '30%')}
            <thead><tr><th>Team stats</th><th class="num"><span class="np-tcell r"><img src="${logo(A.abbr)}" alt="">${esc(A.abbr)}</span></th><th class="num"><span class="np-tcell r"><img src="${logo(H.abbr)}" alt="">${esc(H.abbr)}</span></th></tr></thead>
            <tbody>${TEAM_STATS.filter(([k]) => sa[k] != null || sh[k] != null).map(([k, label]) => `<tr><td>${label}</td><td class="num">${esc(sa[k] ?? '-')}</td><td class="num">${esc(sh[k] ?? '-')}</td></tr>`).join('')}</tbody></table></div>`;
        const scoring = b.scoring.length ? `<div class="table-scroll"><table class="np-table np-wide">${cols('6%', '9%', '9%', '64%', '12%')}
            <thead><tr><th>Q</th><th>Time</th><th>Team</th><th>Scoring play</th><th class="num">${esc(A.abbr)}-${esc(H.abbr)}</th></tr></thead>
            <tbody>${b.scoring.map(p => `<tr><td>${esc(p.q)}</td><td>${esc(p.clock)}</td><td><span class="np-tcell"><img src="${logo(p.team)}" alt="">${esc(p.team)}</span></td><td title="${esc(p.text)}">${esc(p.text)}</td><td class="num">${esc(p.score)}</td></tr>`).join('')}</tbody></table></div>`
            : '<p class="np-empty">No scoring yet.</p>';
        return `<div class="np-box">
            <h3 class="np-sub">Team stats</h3>${teamStats}
            <h3 class="np-sub">Scoring plays</h3>${scoring}
            <h3 class="np-sub">Fantasy points <small>league scoring, live from the box score</small></h3>${fantasyHtml(b, fp)}
            <h3 class="np-sub">Box score</h3>${GROUPS.map(([key, title]) => groupTable(b, key, title, b.teams)).join('')}</div>`;
    }

    // ---------------------------------------------------------------- the full-screen panel (X-Ray style): Stats and Plays
    // score card: both teams, the score and clock, the quarters (before kickoff: records and kickoff time)
    function scoreCardHtml(game, b) {
        const g = game && game.event;
        if (!g) return '';
        const teams = b && b.state !== 'pre' ? b.teams : g.teams, pre = !b || b.state === 'pre';
        const [A, H] = teams, gA = g.teams[0], gH = g.teams[1];
        const n = pre ? 4 : Math.max(4, A.lines.length, H.lines.length);
        const qs = Array.from({ length: n }, (_, i) => i < 4 ? String(i + 1) : n === 5 ? 'OT' : `OT${i - 3}`);
        const qw = `${Math.floor(60 / n)}%`;
        const ball = t => g.situation && String(g.situation.possession) === String(t.id) ? '<i class="xr-ball"></i>' : '';
        return `<div class="xr-card">
            <div class="xr-score"><span class="xr-team"><img src="${logo(gA.abbr)}" alt="">${ball(gA)}<small>${esc(gA.record)}</small></span>
                <span class="xr-mid"><b>${pre ? '-' : `${esc(A.score)} - ${esc(H.score)}`}</b><small>${esc(pre ? kickoff(g.date) : (b ? b.detail : g.detail))}</small></span>
                <span class="xr-team"><img src="${logo(gH.abbr)}" alt="">${ball(gH)}<small>${esc(gH.record)}</small></span></div>
            ${g.situation ? `<div class="xr-sit">${esc(g.situation.text)}${g.situation.redZone ? ' · Red zone' : ''}</div>` : ''}
            <table class="xr-table">${cols('40%', ...qs.map(() => qw))}<thead><tr><th></th>${qs.map(q => `<th class="num">${q}</th>`).join('')}</tr></thead>
                <tbody>${[A, H].map((t, i) => `<tr><td><span class="np-tcell"><img src="${logo(t.abbr)}" alt="">${esc(t.abbr)}</span></td>
                    ${qs.map((_, k) => `<td class="num">${pre ? '-' : esc(t.lines[k] ?? '-')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    // the Stats tab: score card, a toggle between the two teams, then that team's team stats and every box score category
    function statsPaneHtml(game, b, side = 0) {
        const card = scoreCardHtml(game, b);
        if (!b || b.state === 'pre') return `${card}<p class="np-empty">Stats appear at kickoff.</p>`;
        const t = b.teams[side] || b.teams[0], st = b.stats[t.id] || {};
        const toggle = `<div class="xr-toggle">${b.teams.map((x, i) => `<button type="button" data-side="${i}" class="${i === side ? 'on' : ''}"><img src="${logo(x.abbr)}" alt="">${esc(x.name)}</button>`).join('')}</div>`;
        // fixed column widths, never clipped: each stat column is as wide as its longest entry (in characters of the
        // table's font), the name column takes what's left and shows the short name ("R. Stevenson"; the full name on hover)
        const chars = v => String(v ?? '').length;
        const statCol = n => `calc(${n}ch + 8px)`;
        const brief = n => { const w = String(n || '').split(' ').filter(x => !/^(Jr\.?|Sr\.?|II|III|IV|V)$/.test(x));
            return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(' ')}` : String(n || ''); };
        const tsRows = TEAM_STATS.filter(([k]) => st[k] != null);
        const teamStats = `<h4>Team stats</h4><table class="xr-table xr-box">${cols('auto', statCol(Math.max(chars(t.abbr), ...tsRows.map(([k]) => chars(st[k])))))}
            <thead><tr><th></th><th class="num">${esc(t.abbr)}</th></tr></thead>
            <tbody>${tsRows.map(([k, label]) => `<tr><td>${label}</td><td class="num">${esc(st[k])}</td></tr>`).join('')}</tbody></table>`;
        const groups = GROUPS.map(([key, title]) => { const g = (b.players[t.id] || {})[key]; if (!g || !g.rows.length) return '';
            // no sideways scroll: the name takes a share, every stat column the rest in proportion to its widest entry
            const room = g.labels.map((l, i) => Math.max(3, chars(l), ...g.rows.map(r => chars(r.stats[i] ?? '-')), chars((g.totals || [])[i])));
            return `<div class="xr-block"><h4>${title}</h4><div class="xr-scroll"><table class="xr-table xr-box">${cols('auto', ...room.map(statCol))}
                <thead><tr><th></th>${g.labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead>
                <tbody>${g.rows.map(r => `<tr><td title="${esc(r.full || r.name)}">${esc(brief(r.full || r.name))}</td>${g.labels.map((_, i) => `<td class="num">${esc(r.stats[i] ?? '-')}</td>`).join('')}</tr>`).join('')}
                ${g.totals ? `<tr class="xr-total"><td>Total</td>${g.labels.map((_, i) => `<td class="num">${esc(g.totals[i] ?? '')}</td>`).join('')}</tr>` : ''}</tbody></table></div></div>`; }).join('');
        return `${card}${toggle}<div class="xr-block">${teamStats}</div>${groups}`;
    }
    // the Plays tab: every play, drive by drive, newest first. A play shows only `delay` ms after it happened (its
    // wallclock), so the panel never runs ahead of the delayed video; a drive's result waits for its last play.
    // `folded`: the drive ids the viewer has collapsed (the header toggles; the page keeps the set across refreshes)
    function playsHtml(b, delay = 15000, folded = new Set()) {
        if (!b || b.state === 'pre') return '<p class="np-empty">Plays appear at kickoff.</p>';
        const cutoff = Date.now() - delay;
        const drives = (b.drives || []).map(d => { const shown = d.plays.filter(p => !p.wall || p.wall <= cutoff);
            return { ...d, shown, done: shown.length === d.plays.length }; }).filter(d => d.shown.length);
        if (!drives.length) return '<p class="np-empty">No plays yet.</p>';
        const all = drives.every(d => folded.has(String(d.id)));
        return `<div class="xr-fold"><button type="button" data-fold="${all ? 'open' : 'all'}">${all ? 'Expand all' : 'Collapse all'}</button></div>
            <div class="xr-plays">${drives.slice().reverse().map(d => { const shut = folded.has(String(d.id)); return `<div class="xr-drive${shut ? ' shut' : ''}">
            <button type="button" class="xr-dhead" data-drive="${esc(d.id)}" aria-expanded="${!shut}"><img src="${logo(d.team)}" alt=""><b>${esc(d.team)}</b><span>${d.done ? `${esc(d.desc)}${d.result ? ` · ${esc(d.result)}` : ''}` : 'Drive in progress'}</span><i class="xr-caret">${shut ? '+' : '−'}</i></button>
            ${shut ? '' : d.shown.slice().reverse().map(p => `<div class="xr-play${p.scoring ? ' score' : ''}"><span class="xr-pq">Q${esc(p.q)} ${esc(p.clock)}${p.down ? ` · ${esc(p.down)}` : ''}</span>
                ${p.scoring ? `<span class="xr-pt"><b>${esc(p.score)}</b></span>` : `<span class="xr-ptype">${esc(p.type)}</span>`}<p title="${esc(p.text)}">${esc(p.text)}</p></div>`).join('')}</div>`; }).join('')}</div>`;
    }

    window.NFLPLUS = { events, games, week, isLive: f => live(f), box, card, feedsHtml, nextStart, bandHtml, boxHtml, fantasyHtml, scoreCardHtml, statsPaneHtml, playsHtml };
})();
