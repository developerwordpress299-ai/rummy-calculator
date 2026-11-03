import * as cloud from './cloud.js';

/* ---------- helpers ---------- */
const ICONS = {
  zap: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z', plus: 'M12 5v14M5 12h14',
  login: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2', trend: 'm22 7-8.5 8.5-5-5L2 17M16 7h6v6',
  edit: 'M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  x: 'M18 6 6 18M6 6l12 12', check: 'M20 6 9 17l-5-5', copy: 'M8 8h12v12H8zM4 16V4h12',
  shuffle: 'M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22M18 2l4 4-4 4M2 6h1.9c1.5 0 2.9.9 3.6 2.2M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8M18 14l4 4-4 4',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20'
};
const I = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[n]}"/></svg>`;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uidGen = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
let toastT; const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2500); };

/* ---------- storage ---------- */
const KEY = 'rummy_games';
const sample = () => ({
  id: 'sample-1', title: 'Friday Night Rummy', date: new Date().toISOString(), isCompleted: false,
  players: ['Ali', 'Usman', 'Hamza', 'Bilal'],
  rounds: [
    { id: 'r1', scores: { Ali: 5, Usman: 20, Hamza: 0, Bilal: 25 } },
    { id: 'r2', scores: { Ali: 12, Usman: 35, Hamza: 20, Bilal: 0 } },
    { id: 'r3', scores: { Ali: 0, Usman: 25, Hamza: 30, Bilal: 45 } }
  ]
});
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) {}
  if (raw === null) return [sample()];
  try {
    const s = JSON.parse(raw);
    if (Array.isArray(s)) return s.filter(g => g && Array.isArray(g.players)).map(g => {
      g = { ...g, rounds: g.rounds || [] };
      if (g.id === 'sample-1' && g.roomCode === 'RUMMY1') delete g.roomCode; // purani sample room hata di
      return g;
    });
  } catch (e) {}
  return [sample()];
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(games)); } catch (e) {} };

/* ---------- game logic ---------- */
function totals(g) {
  const t = Object.create(null);
  g.players.forEach(p => { t[p] = 0; });
  g.rounds.forEach(r => { for (const p in (r.scores || {})) if (p in t) t[p] += Number(r.scores[p]) || 0; });
  return t;
}
function summary(g) {
  const t = totals(g), act = g.players.filter(p => t[p] < 100);
  const low = () => g.players.reduce((a, b) => (t[b] < t[a] ? b : a), g.players[0]);
  let winner = null, auto = false;
  if (g.players.length > 1 && g.rounds.length) {
    if (act.length === 1) { winner = act[0]; auto = true; }
    else if (!act.length) { winner = low(); auto = true; }
  }
  if (!auto && g.isCompleted) winner = low();
  return { t, act, winner, auto };
}
// Game ka status hamesha scores se sync rakhta hai (round edit/delete par winner galat nahi rehta)
function settle(g) {
  const s = summary(g);
  if (s.auto) { g.isCompleted = true; g.winner = s.winner; g.endedBy = 'auto'; }
  else if (g.isCompleted && g.endedBy === 'auto') { g.isCompleted = false; g.winner = null; g.endedBy = null; }
  else if (g.isCompleted) g.winner = s.winner;
  return g;
}
const zone = s => s >= 100 ? ['out', 'OUT (100+)'] : s >= 76 ? ['danger', 'Danger'] : s >= 51 ? ['warn', 'Caution'] : ['safe', 'Safe'];

/* ---------- state ---------- */
let games = load();
let sel = games[0]?.id || null, tab = 'active', modal = null, unsub = null, watched = null;
let draft = { title: '', players: ['Player 1', 'Player 2', 'Player 3'] };
const cur = () => games.find(g => g.id === sel) || null;
const isHost = g => (g.roomCode && g.hostUid) ? g.hostUid === cloud.uid() : true;

function commit(g) {
  settle(g);
  if (g.roomCode && isHost(g) && cloud.ready()) g.remoteTs = cloud.push(g);
  games = games.map(x => (x.id === g.id ? g : x));
  save(); render();
}

/* ---------- views ---------- */
function vActive() {
  const g = cur();
  if (!g) return `<div class="card empty"><div class="big">🃏</div><h3>No Active Match</h3><p class="muted sm">Create a new match${cloud.ready() ? ' or join with a room code' : ''} to start.</p><div class="row c"><button class="btn primary" data-act="tab" data-v="new">+ New Match</button>${cloud.ready() ? '<button class="btn" data-act="tab" data-v="join">Join via Code</button>' : ''}</div></div>`;
  const s = summary(g), host = isHost(g);
  const ctl = host
    ? `<button class="btn primary" data-act="addRound" ${g.isCompleted ? 'disabled' : ''}>${I('plus')}Enter Score</button>` +
      (g.isCompleted ? (g.endedBy === 'auto' ? '' : '<button class="btn" data-act="reopen">Reopen</button>') : (g.rounds.length ? '<button class="btn" data-act="end">End Match</button>' : ''))
    : '<span class="chip">🔒 Only host can edit</span>';
  const win = s.winner ? `<div class="win"><h3>🏆 Winner Declared!</h3><b>${esc(s.winner)}</b><p>${s.auto ? (s.act.length === 1 ? 'All other players reached 100+ points and were eliminated!' : 'Everyone crossed 100 — lowest score wins!') : `Finished with the lowest score: ${s.t[s.winner]} points`}</p></div>` : '';
  const cards = g.players.map((p, i) => {
    const t = s.t[p], [z, lb] = zone(t), out = t >= 100;
    return `<div class="pc z-${z}"><div class="row sb"><div class="tr"><small>Seat #${i + 1}</small><h4>${esc(p)}${s.winner === p ? ' 🏆' : ''}</h4></div><div class="sc"><b>${t}</b><small>PTS</small></div></div><div class="row sb"><span class="tag">${lb}</span><span class="muted sm">${Math.min(t, 100)}/100</span></div><div class="bar"><i style="width:${Math.min(t, 100)}%"></i></div><div class="row sb sm foot"><span class="muted">Margin</span><b class="${out ? 'x' : 'ok'}">${out ? 'OUT' : (100 - t) + ' pts left'}</b></div></div>`;
  }).join('');
  const rows = g.rounds.map((r, i) => `<tr><td class="muted">#${i + 1}</td>${g.players.map(p => { const v = Number((r.scores || {})[p]) || 0; return `<td class="${v === 0 ? 'ok' : v >= 20 ? 'x' : ''}">${v}</td>`; }).join('')}<td class="act">${host ? `<button class="ib" data-act="editRound" data-id="${esc(r.id)}" title="Edit">${I('edit')}</button><button class="ib del" data-act="delRound" data-id="${esc(r.id)}" title="Delete">${I('trash')}</button>` : '<span class="muted sm">View only</span>'}</td></tr>`).join('');
  return `<div class="stack">
    <div class="card head"><div><div class="row wrap"><h2>${esc(g.title)}</h2>${g.roomCode ? `<button class="chip" data-act="copy">${I('globe')}Code: ${esc(g.roomCode)} ${I('copy')}</button>` : ''}</div><p class="muted sm">${g.players.length} Players • ${g.rounds.length} Rounds • ${host ? '👑 Score Keeper' : '👁 Live View'}</p></div><div class="row wrap">${ctl}</div></div>
    ${win}
    <div class="row sb wrap"><h3>Scoreboard <span class="muted sm">(limit 100)</span></h3></div>
    <div class="grid4">${cards}</div>
    <div class="card" style="padding:0;overflow:hidden"><div class="row sb" style="padding:14px"><h3>Round Scores</h3><span class="chip">Rounds: ${g.rounds.length}</span></div>
    ${g.rounds.length ? `<div class="tw"><table><thead><tr><th>Round</th>${g.players.map(p => `<th>${esc(p)}</th>`).join('')}<th></th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total</td>${g.players.map(p => `<td class="${s.t[p] >= 100 ? 'x' : ''}">${s.t[p]}</td>`).join('')}<td></td></tr></tfoot></table></div>` : `<div class="empty muted sm" style="padding:24px"><p>No rounds recorded yet.</p>${host && !g.isCompleted ? '<button class="btn primary" data-act="addRound">+ Add First Round</button>' : ''}</div>`}
    </div></div>`;
}

function vNew() {
  return `<form class="card narrow" data-form="create" autocomplete="off"><h2>New Match</h2>
  <p class="muted sm">${cloud.ready() ? 'A room code is created so others can follow the score live.' : 'Scores are saved on this device.'}</p>
  <div><label class="lbl">Match title</label><input class="in" name="title" placeholder="e.g. Friends Rummy Match" value="${esc(draft.title)}" maxlength="40"></div>
  <div class="row sb"><label class="lbl">Players (${draft.players.length})</label><button type="button" class="btn sm2" data-act="shuffleP">${I('shuffle')}Shuffle</button></div>
  <div class="stack s">${draft.players.map((p, i) => `<div class="row"><span class="muted n">${i + 1}.</span><input class="in" data-pi="${i}" value="${esc(p)}" placeholder="Player ${i + 1}" maxlength="20">${draft.players.length > 2 ? `<button type="button" class="ib del" data-act="rmP" data-i="${i}">${I('x')}</button>` : ''}</div>`).join('')}</div>
  <button type="button" class="btn" data-act="addP">+ Add player</button>
  <div class="row"><button class="btn primary grow" type="submit">Create Match</button><button type="button" class="btn" data-act="tab" data-v="active">Cancel</button></div></form>`;
}

function vJoin() {
  return `<form class="card narrow" data-form="join" autocomplete="off" style="max-width:420px"><h2>Join Online Room</h2><p class="muted sm">Enter the 6-character code shared by the host.</p>
  <input class="in" name="code" placeholder="ABC123" maxlength="10" required style="text-align:center;font-size:22px;font-family:monospace;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--gl)">
  <button class="btn primary" type="submit">Join Live Scoreboard</button></form>`;
}

function vHistory() {
  const head = `<div class="row sb" style="margin-bottom:14px"><div><h2>Matches History</h2><p class="muted sm">Open or delete past matches</p></div><button class="btn" data-act="tab" data-v="new">${I('plus')}New</button></div>`;
  if (!games.length) return head + '<div class="card empty muted sm">No games yet.</div>';
  return head + `<div class="grid2">${games.map(g => {
    const s = summary(g);
    return `<div class="card"><div class="row sb"><div><h3>${esc(g.title)}</h3><small class="muted sm">${new Date(g.date).toLocaleDateString()} • ${g.roomCode ? 'Code: ' + esc(g.roomCode) : 'Local'}</small></div><span class="tag ${g.isCompleted ? 'fin' : 'live'}">${g.isCompleted ? 'Finished' : 'Live'}</span></div>
    <div class="mini">${g.players.map(p => `<div><span>${esc(p)}</span><b class="${s.t[p] >= 100 ? 'x' : 'ok'}">${s.t[p]}</b></div>`).join('')}</div>
    <div class="row sb"><span class="sm wn">${g.isCompleted && s.winner ? '🏆 ' + esc(s.winner) : '<span class="muted">In progress</span>'}</span><div class="row"><button class="btn sm2" data-act="open" data-id="${esc(g.id)}">Open</button><button class="ib del" data-act="del" data-id="${esc(g.id)}" title="Delete">${I('trash')}</button></div></div></div>`;
  }).join('')}</div>`;
}

function vStats() {
  const st = new Map();
  games.filter(g => g.isCompleted).forEach(g => {
    g.players.forEach(p => { if (!st.has(p)) st.set(p, { n: 0, w: 0 }); st.get(p).n++; });
    const w = g.winner || summary(g).winner;
    if (w && st.has(w)) st.get(w).w++;
  });
  const list = [...st].map(([name, v]) => ({ name, ...v, rate: v.n ? Math.round((v.w / v.n) * 1000) / 10 : 0 })).sort((a, b) => b.rate - a.rate || b.w - a.w);
  const head = '<div style="margin-bottom:14px"><h2>Player Analytics</h2><p class="muted sm">Based on finished matches only</p></div>';
  if (!list.length) return head + '<div class="card empty muted sm">No finished matches yet.</div>';
  return head + `<div class="card" style="padding:0;overflow:hidden"><div class="tw"><table><thead><tr><th>Rank</th><th>Player</th><th>Played</th><th>Wins</th><th>Win Rate</th></tr></thead><tbody>${list.map((s, i) => `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td style="font-family:inherit">${esc(s.name)}</td><td>${s.n}</td><td class="ok">${s.w}</td><td>${s.rate}%</td></tr>`).join('')}</tbody></table></div></div>`;
}

/* ---------- render ---------- */
function tabs() { return [['active', 'zap', 'Active Game', 'Active'], ['new', 'plus', 'New Match', 'New'], ...(cloud.ready() ? [['join', 'login', 'Join Room', 'Join']] : []), ['history', 'history', 'History', 'History'], ['stats', 'trend', 'Analytics', 'Stats']]; }
function render() {
  if (tab === 'join' && !cloud.ready()) tab = 'active';
  const T = tabs();
  $('#nav').innerHTML = T.map(([k, ic, l]) => `<button class="nv ${tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${I(ic)}<span>${l}</span></button>`).join('');
  $('#bnav').innerHTML = T.map(([k, ic, , s]) => `<button class="${tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${I(ic)}<span>${s}</span></button>`).join('');
  $('#picker').innerHTML = games.length > 1 ? `<select data-pick>${games.map(g => `<option value="${esc(g.id)}" ${g.id === sel ? 'selected' : ''}>${esc(g.title)}${g.roomCode ? ' (' + esc(g.roomCode) + ')' : ''}</option>`).join('')}</select>` : '';
  $('#mode').textContent = cloud.ready() ? 'Live sync on' : 'Saved on this device';
  $('#view').innerHTML = ({ active: vActive, new: vNew, join: vJoin, history: vHistory, stats: vStats })[tab]();
  watch();
}

/* ---------- round modal ---------- */
function readInputs() { const o = {}; document.querySelectorAll('[data-sp]').forEach(i => { o[i.dataset.sp] = i.value; }); return o; }
function openModal(rid) {
  const g = cur(); if (!g) return;
  const r = rid && g.rounds.find(x => x.id === rid);
  modal = { rid: rid || null, scores: r ? { ...r.scores } : {} }; drawModal();
}
function drawModal() {
  const g = cur(), s = summary(g);
  $('#modal').innerHTML = `<div class="overlay" data-ov><div class="sheet" role="dialog" aria-modal="true"><header><b>${modal.rid ? 'Edit Round' : 'Enter Round Scores'}</b><div class="row"><button class="btn sm2" data-act="shuffleG">${I('shuffle')}Shuffle</button><button class="ib" data-act="closeModal" aria-label="Close">${I('x')}</button></div></header>
  <div class="sbody">${g.players.map(p => `<div class="pr"><div><b>${esc(p)}</b><small class="muted sm">Total: ${s.t[p]}</small></div><div class="row"><button type="button" class="pen" data-act="pen" data-p="${esc(p)}">+25</button><input class="in" type="number" inputmode="numeric" min="0" placeholder="0" data-sp="${esc(p)}" value="${esc(modal.scores[p] ?? '')}"></div></div>`).join('')}</div>
  <footer><button class="btn primary grow" data-act="saveRound">${I('check')}Save Scores</button><button class="btn" data-act="closeModal">Cancel</button></footer></div></div>`;
  const f = $('#modal [data-sp]'); if (f && !modal.rid) f.focus();
}
const closeModal = () => { modal = null; $('#modal').innerHTML = ''; };

/* ---------- actions ---------- */
const act = {
  tab: el => { tab = el.dataset.v; render(); scrollTo({ top: 0 }); },
  open: el => { sel = el.dataset.id; tab = 'active'; render(); scrollTo({ top: 0 }); },
  del: el => { if (!confirm('Delete this match?')) return; games = games.filter(g => g.id !== el.dataset.id); if (sel === el.dataset.id) sel = games[0]?.id || null; save(); render(); },
  addRound: () => { const g = cur(); if (g && !g.isCompleted) openModal(null); },
  editRound: el => openModal(el.dataset.id),
  delRound: el => { if (!confirm('Delete this round?')) return; const g = { ...cur() }; g.rounds = g.rounds.filter(r => r.id !== el.dataset.id); commit(g); },
  end: () => { if (!confirm('End this match now? Lowest score wins.')) return; commit({ ...cur(), isCompleted: true, endedBy: 'manual' }); },
  reopen: () => commit({ ...cur(), isCompleted: false, winner: null, endedBy: null }),
  copy: () => { const g = cur(); try { navigator.clipboard.writeText(g.roomCode); toast('Room code copied!'); } catch (e) { toast('Code: ' + g.roomCode); } },
  addP: () => { draft.players.push('Player ' + (draft.players.length + 1)); render(); },
  rmP: el => { draft.players.splice(+el.dataset.i, 1); render(); },
  shuffleP: () => { draft.players = shuffle(draft.players); render(); },
  closeModal,
  shuffleG: () => { modal.scores = readInputs(); commit({ ...cur(), players: shuffle(cur().players) }); drawModal(); },
  pen: el => { const i = [...document.querySelectorAll('[data-sp]')].find(x => x.dataset.sp === el.dataset.p); if (i) i.value = (Number(i.value) || 0) + 25; },
  saveRound: () => {
    const g = { ...cur() }, sc = {};
    g.players.forEach(p => { const i = [...document.querySelectorAll('[data-sp]')].find(x => x.dataset.sp === p); sc[p] = Math.max(0, Math.floor(Number(i?.value) || 0)); });
    g.rounds = modal.rid ? g.rounds.map(r => (r.id === modal.rid ? { ...r, scores: sc } : r)) : [...g.rounds, { id: uidGen(), scores: sc }];
    closeModal(); commit(g);
  }
};
const forms = {
  async create() {
    const players = draft.players.map(p => p.trim()).filter(Boolean);
    if (players.length < 2) return toast('Please enter at least 2 players');
    if (new Set(players.map(p => p.toLowerCase())).size !== players.length) return toast('Player names must be different');
    const g = { id: uidGen(), title: draft.title.trim() || `Game #${games.length + 1}`, date: new Date().toISOString(), isCompleted: false, players, rounds: [] };
    if (cloud.ready()) {
      try { g.roomCode = await cloud.newCode(); g.hostUid = cloud.uid(); g.remoteTs = cloud.push(g); }
      catch (e) { delete g.roomCode; delete g.hostUid; toast('Online room failed — saved locally'); }
    }
    games = [g, ...games]; sel = g.id; tab = 'active';
    draft = { title: '', players: ['Player 1', 'Player 2', 'Player 3'] };
    save(); render(); scrollTo({ top: 0 });
  },
  async join(f) {
    const code = f.code.value.trim().toUpperCase(); if (!code) return;
    const ex = games.find(g => g.roomCode === code);
    if (ex) { sel = ex.id; tab = 'active'; return render(); }
    try {
      const d = await cloud.fetchRoom(code);
      if (!d) return toast(`Room "${code}" not found`);
      const g = { id: String(d.id || uidGen()), roomCode: code, date: new Date().toISOString(), ...fromRemote(d), remoteTs: d.lastUpdated };
      games = [g, ...games]; sel = g.id; tab = 'active'; save(); render();
    } catch (e) { console.warn(e); toast('Could not join. Check internet connection.'); }
  }
};

/* ---------- live sync ---------- */
const fromRemote = d => ({
  title: String(d.title || 'Online Game'), players: (d.players || []).map(String), rounds: Array.isArray(d.rounds) ? d.rounds : [],
  isCompleted: !!d.isCompleted, winner: d.winner || null, endedBy: d.endedBy || null, hostUid: d.hostUid || null
});
function watch() {
  const g = cur(), code = g && g.roomCode && cloud.ready() ? g.roomCode : null;
  if (code === watched) return;
  if (unsub) unsub(); unsub = null; watched = code;
  if (code) unsub = cloud.listen(code, onRemote);
}
function onRemote(d, pending) {
  const g = games.find(x => x.roomCode === watched);
  if (!g || (isHost(g) && pending) || d.lastUpdated === g.remoteTs) return;
  Object.assign(g, fromRemote(d), { remoteTs: d.lastUpdated });
  save();
  if (tab !== 'new' && tab !== 'join') render();
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  if (e.target.dataset && e.target.dataset.ov !== undefined) return closeModal();
  const el = e.target.closest('[data-act]'); if (el && act[el.dataset.act]) act[el.dataset.act](el);
});
document.addEventListener('submit', e => { e.preventDefault(); const f = forms[e.target.dataset.form]; if (f) f(e.target); });
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.pi !== undefined) draft.players[+t.dataset.pi] = t.value;
  else if (t.name === 'title') draft.title = t.value;
});
document.addEventListener('change', e => { if (e.target.hasAttribute('data-pick')) { sel = e.target.value; tab = 'active'; render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal) closeModal(); });

render();
cloud.init().then(on => { if (on) render(); });
