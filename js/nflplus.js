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
        const list = [], used = new Set(), feedName = t => clean(t).split(/\s+/)[0];
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
    const PLAYER_GROUPS = [['passing', 'Passing', ['C/ATT', 'YDS', 'TD', 'INT']], ['rushing', 'Rushing', ['CAR', 'YDS', 'TD', 'LONG']],
                           ['receiving', 'Receiving', ['REC', 'YDS', 'TD', 'TGTS']]];
    async function box(id) {
        const s = await getJson(`${API}summary?event=${id}`);
        const comp = s.header.competitions[0];
        const teams = ['away', 'home'].map(side => team(comp.competitors.find(x => x.homeAway === side)));
        const stats = Object.fromEntries((s.boxscore?.teams || []).map(t => [t.team.id, Object.fromEntries((t.statistics || []).map(x => [x.label, x.displayValue]))]));
        const players = Object.fromEntries((s.boxscore?.players || []).map(p => [p.team.id, Object.fromEntries(p.statistics.map(g => [g.name, {
            labels: g.labels, rows: g.athletes.map(a => ({ name: a.athlete.shortName || a.athlete.displayName, stats: a.stats }))
        }]))]));
        const st = comp.status;
        return {
            id, raw: s, state: st.type.state, detail: st.type.shortDetail, date: comp.date, teams, stats, players,
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
            <div class="gc-foot">${sit} · ${game.feeds.map(f => `${esc(f.name === 'Watch' ? 'Ch' : f.name)} ${esc(f.channel)}`).join(' · ')}</div></div>`;
    }
    // the player bar's buttons: one per feed of the game on screen, greyed until the relay opens its window
    const feedsHtml = game => (game ? game.feeds : []).map((f, i) => `<button class="np-feed${i ? ' alt' : ''}" type="button" data-ch="${esc(f.channel)}"${f.open ? '' : ' disabled'}
        title="${esc(f.title || game.title)} · channel ${esc(f.channel)}${f.open ? '' : ` · opens before ${esc(time(f.start))}`}">${esc(f.name)}<small>${esc(f.channel)}</small></button>`).join('');
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
    const howLine = l => `${l.label}${/^(\d|Avg|Win|Loss)/.test(l.label) ? '' : ` ${Number.isInteger(l.qty) ? l.qty : l.qty.toFixed(1)}`} ${l.pts > 0 ? '+' : ''}${l.pts}`;
    function fantasyHtml(b, fp) {
        if (!fp) return '';
        const one = t => {
            const rows = [{ name: `${t.abbr} D/ST`, ...t.dst }, { name: `${t.abbr} Coach`, ...t.hc },
                          ...fp.players.filter(p => p.teamId === t.id).sort((x, y) => y.pts - x.pts)];
            return `<table class="np-table np-fp">${cols('34%', '48%', '18%')}<thead><tr><th>${esc(t.abbr)} fantasy</th><th>Scoring</th><th class="num">Pts</th></tr></thead>
                <tbody>${rows.map(r => { const how = r.lines.map(howLine).join(' · ');
                    return `<tr><td title="${esc(r.full || r.name)}">${esc(r.name)}</td><td title="${esc(how)}">${esc(how) || '<span class="np-dim">-</span>'}</td><td class="num"><b>${r.pts}</b></td></tr>`; }).join('')}</tbody></table>`;
        };
        const byId = Object.fromEntries(fp.teams.map(t => [t.id, t]));
        return `<div class="np-pair">${b.teams.map(t => byId[t.id] ? one(byId[t.id]) : '').join('')}</div>`;
    }

    function boxHtml(meta, b, fp) {
        const [A, H] = b.teams;
        if (b.state === 'pre') return `<div class="np-box"><p class="np-empty">Kickoff ${esc(kickoff(b.date))}${b.networks.length ? ` · ${esc(b.networks.join(' · '))}` : ''}. The box score starts at kickoff.</p></div>`;
        const n = Math.max(4, A.lines.length, H.lines.length);
        const qs = Array.from({ length: n }, (_, i) => i < 4 ? String(i + 1) : n === 5 ? 'OT' : `OT${i - 3}`);
        const qw = `${Math.floor(56 / (n + 1))}%`;
        const lines = `<table class="np-table">${cols('44%', ...qs.map(() => qw), qw)}<thead><tr><th>Team</th>${qs.map(q => `<th class="num">${q}</th>`).join('')}<th class="num">T</th></tr></thead>
            <tbody>${b.teams.map(t => `<tr><td><span class="np-tcell"><img src="${logo(t.abbr)}" alt="">${esc(t.abbr)}</span></td>
                ${qs.map((_, i) => `<td class="num">${esc(t.lines[i] ?? '')}</td>`).join('')}<td class="num"><b>${esc(t.score ?? '')}</b></td></tr>`).join('')}</tbody></table>`;
        const sa = b.stats[A.id] || {}, sh = b.stats[H.id] || {};
        const teamStats = `<table class="np-table">${cols('46%', '27%', '27%')}<thead><tr><th>Team stats</th><th class="num">${esc(A.abbr)}</th><th class="num">${esc(H.abbr)}</th></tr></thead>
            <tbody>${TEAM_STATS.filter(([k]) => sa[k] != null || sh[k] != null).map(([k, label]) => `<tr><td>${label}</td><td class="num">${esc(sa[k] ?? '-')}</td><td class="num">${esc(sh[k] ?? '-')}</td></tr>`).join('')}</tbody></table>`;
        const groupTable = (t, key, title, want) => {
            const g = (b.players[t.id] || {})[key];
            if (!g || !g.rows.length) return '';
            const idx = want.map(l => g.labels.indexOf(l));
            const w = `${Math.floor(56 / want.length)}%`;
            return `<table class="np-table">${cols('44%', ...want.map(() => w))}<thead><tr><th>${esc(t.abbr)} ${title}</th>${want.map(l => `<th class="num">${l}</th>`).join('')}</tr></thead>
                <tbody>${g.rows.slice(0, 5).map(r => `<tr><td title="${esc(r.name)}">${esc(r.name)}</td>${idx.map(i => `<td class="num">${esc(i >= 0 ? r.stats[i] : '-')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        };
        const playerTables = PLAYER_GROUPS.map(([key, title, want]) => `<div class="np-pair">${groupTable(A, key, title, want)}${groupTable(H, key, title, want)}</div>`).join('');
        const scoring = b.scoring.length ? `<table class="np-table np-scoring">${cols('9%', '13%', '11%', '53%', '14%')}<thead><tr><th>Q</th><th>Time</th><th>Team</th><th>Scoring play</th><th class="num">${esc(A.abbr)}-${esc(H.abbr)}</th></tr></thead>
            <tbody>${b.scoring.map(p => `<tr><td>${esc(p.q)}</td><td>${esc(p.clock)}</td><td>${esc(p.team)}</td><td title="${esc(p.text)}">${esc(p.text)}</td><td class="num">${esc(p.score)}</td></tr>`).join('')}</tbody></table>` : '';
        return `<div class="np-box"><h3 class="np-sub">Scoring</h3><div class="np-grid"><div>${lines}${teamStats}</div><div>${scoring || '<p class="np-empty">No scoring yet.</p>'}</div></div>
            <h3 class="np-sub">Fantasy points <small>league scoring, live from the box score</small></h3>${fantasyHtml(b, fp)}
            <h3 class="np-sub">Box score</h3>${playerTables}</div>`;
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
    // game leaders: each team's top passer, rusher and receiver (by yards)
    const LEADERS = [['passing', 'Passing', ['YDS', 'TD', 'INT']], ['rushing', 'Rushing', ['CAR', 'YDS', 'TD']], ['receiving', 'Receiving', ['REC', 'YDS', 'TD']]];
    function leadersHtml(b) {
        if (!b || b.state === 'pre') return '<p class="np-empty">Leaders appear at kickoff.</p>';
        return `<div class="xr-block"><h4>Game leaders</h4>${LEADERS.map(([key, title, want]) => {
            const rows = b.teams.map(t => { const g = (b.players[t.id] || {})[key]; if (!g || !g.rows.length) return null;
                const yi = g.labels.indexOf('YDS'), top = g.rows.slice().sort((x, y) => (parseFloat(y.stats[yi]) || 0) - (parseFloat(x.stats[yi]) || 0))[0];
                return { t, name: top.name, vals: want.map(l => { const i = g.labels.indexOf(l); return i >= 0 ? top.stats[i] : '-'; }) }; }).filter(Boolean);
            return rows.length ? `<table class="xr-table">${cols('52%', '16%', '16%', '16%')}<thead><tr><th>${title}</th>${want.map(l => `<th class="num">${l}</th>`).join('')}</tr></thead>
                <tbody>${rows.map(r => `<tr><td><span class="np-tcell"><img src="${logo(r.t.abbr)}" alt="">${esc(r.name)}</span></td>${r.vals.map(v => `<td class="num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
        }).join('')}</div>`;
    }
    // scoring plays, newest first
    function playsHtml(b) {
        if (!b || b.state === 'pre' || !b.scoring.length) return '<p class="np-empty">No scoring yet.</p>';
        return `<div class="xr-plays">${b.scoring.slice().reverse().map(p => `<div class="xr-play"><span class="xr-pq">Q${esc(p.q)} · ${esc(p.clock)}</span>
            <span class="xr-pt"><img src="${logo(p.team)}" alt=""><b>${esc(p.score)}</b></span><p title="${esc(p.text)}">${esc(p.text)}</p></div>`).join('')}</div>`;
    }

    window.NFLPLUS = { events, games, box, card, feedsHtml, bandHtml, boxHtml, fantasyHtml, scoreCardHtml, leadersHtml, playsHtml };
})();
