// ============================================================
// MOVIEBOARD — Cinematic Feed Page
// Stars, confetti, ripple, animated counters, search
// ============================================================

const API = '/api/movies';
let sort = 'new', genre = 'All', allMovies = [];

const $grid = document.getElementById('movies-container');
const $skel = document.getElementById('skeleton-loading');
const $empty = document.getElementById('empty-state');
const $error = document.getElementById('error-state');
const $count = document.getElementById('movie-count');
const $toast = document.getElementById('toast');
const $search = document.getElementById('search-input');

// ─── Stars ───
function createStars() {
  const c = document.getElementById('stars');
  if (!c) return;
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 2 + 1;
    s.style.cssText = `width:${size}px;height:${size}px;top:${Math.random()*100}%;left:${Math.random()*100}%;animation-duration:${Math.random()*4+2}s;animation-delay:${Math.random()*5}s;`;
    c.appendChild(s);
  }
}

// ─── Confetti ───
function boom(x, y) {
  const cv = document.getElementById('confetti-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const ps = [], cols = ['#a855f7','#ec4899','#fbbf24','#06b6d4','#10b981','#3b82f6'];
  for (let i = 0; i < 40; i++) ps.push({
    x, y, vx: (Math.random()-0.5)*14, vy: (Math.random()-0.7)*14,
    c: cols[~~(Math.random()*cols.length)], s: Math.random()*7+3,
    r: Math.random()*360, rs: (Math.random()-0.5)*12, o: 1, d: 0.012+Math.random()*0.01
  });
  (function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    let alive = false;
    ps.forEach(p => {
      if (p.o <= 0) return;
      alive = true;
      p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.r += p.rs; p.o -= p.d;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r * Math.PI / 180);
      ctx.globalAlpha = Math.max(0, p.o);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s/2, -p.s/2, p.s, p.s);
      ctx.restore();
    });
    if (alive) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

// ─── Ripple ───
function ripple(e, el) {
  const r = document.createElement('span');
  r.className = 'ripple';
  const rect = el.getBoundingClientRect();
  const sz = Math.max(rect.width, rect.height);
  r.style.cssText = `width:${sz}px;height:${sz}px;left:${e.clientX-rect.left-sz/2}px;top:${e.clientY-rect.top-sz/2}px;`;
  el.appendChild(r);
  setTimeout(() => r.remove(), 600);
}

// ─── Animated Counter ───
function animateCount(el, target) {
  const start = parseInt(el.textContent) || 0;
  const diff = target - start;
  if (diff === 0) { el.textContent = target; return; }
  const dur = 600, step = 16;
  let t = 0;
  const timer = setInterval(() => {
    t += step;
    const progress = Math.min(t / dur, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + diff * ease);
    if (progress >= 1) clearInterval(timer);
  }, step);
}

// ─── Fetch Movies ───
async function fetchMovies() {
  $skel.style.display = 'grid';
  $grid.innerHTML = '';
  $empty.style.display = $error.style.display = 'none';
  $count.textContent = '';

  try {
    let url = `${API}?sort=${sort}`;
    if (genre !== 'All') url += `&genre=${encodeURIComponent(genre)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    allMovies = await res.json();
    $skel.style.display = 'none';
    renderMovies(allMovies);
    updateStats(allMovies);
  } catch {
    $skel.style.display = 'none';
    $error.style.display = 'block';
  }
}

function renderMovies(movies) {
  $grid.innerHTML = '';
  if (!movies.length) { $empty.style.display = 'block'; $count.textContent = '0 movies'; return; }
  $empty.style.display = 'none';
  $count.textContent = `${movies.length} movie${movies.length !== 1 ? 's' : ''}`;
  movies.forEach((m, i) => {
    const card = makeCard(m, i);
    card.style.animationDelay = `${i * 0.07}s`;
    $grid.appendChild(card);
  });
}

function updateStats(movies) {
  const totalVotes = movies.reduce((a, m) => a + m.upvotes + m.downvotes, 0);
  animateCount(document.getElementById('stat-movies'), movies.length);
  animateCount(document.getElementById('stat-votes'), totalVotes);
}

// ─── Card Builder ───
function makeCard(m, idx) {
  const el = document.createElement('div');
  el.className = 'movie-card';
  el.dataset.id = m.movieId;
  const net = m.upvotes - m.downvotes;
  const netCls = net > 0 ? 'positive' : net < 0 ? 'negative' : 'zero';
  const netStr = net > 0 ? '+' + net : net.toString();
  el.innerHTML = `
    <div class="card-accent"></div>
    <div class="card-body">
      <div class="card-rank">#${idx + 1}</div>
      <span class="genre-badge genre-${esc(m.genre)}">${esc(m.genre)}</span>
      <h2 class="card-title">${esc(m.title)}</h2>
      <p class="card-pitch">${esc(m.pitch)}</p>
    </div>
    <div class="card-footer">
      <button class="vote-btn upvote" data-id="${m.movieId}" data-vote="up">
        <span class="vote-arrow">▲</span>
        <span class="vote-count" id="up-${m.movieId}">${m.upvotes}</span>
      </button>
      <button class="vote-btn downvote" data-id="${m.movieId}" data-vote="down">
        <span class="vote-arrow">▼</span>
        <span class="vote-count" id="down-${m.movieId}">${m.downvotes}</span>
      </button>
      <span class="net-score ${netCls}" id="net-${m.movieId}">${netStr}</span>
    </div>`;
  el.querySelectorAll('.vote-btn').forEach(b => {
    b.addEventListener('click', e => { ripple(e, b); vote(b.dataset.id, b.dataset.vote, b, e); });
  });
  return el;
}

// ─── Vote Handler ───
async function vote(id, type, btn, ev) {
  btn.disabled = true;
  try {
    const res = await fetch(`${API}/${id}/vote`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: type })
    });
    if (!res.ok) throw new Error();
    const u = await res.json();
    const up = document.getElementById(`up-${id}`);
    const dn = document.getElementById(`down-${id}`);
    const nt = document.getElementById(`net-${id}`);
    if (up) { up.textContent = u.upvotes; if (type === 'up') { up.classList.add('bump'); setTimeout(() => up.classList.remove('bump'), 400); } }
    if (dn) { dn.textContent = u.downvotes; if (type === 'down') { dn.classList.add('bump'); setTimeout(() => dn.classList.remove('bump'), 400); } }
    if (nt) {
      const n = u.upvotes - u.downvotes;
      nt.textContent = (n > 0 ? '+' : '') + n;
      nt.className = 'net-score ' + (n > 0 ? 'positive' : n < 0 ? 'negative' : 'zero');
    }
    btn.classList.add('clicked');
    setTimeout(() => btn.classList.remove('clicked'), 600);
    if (type === 'up') { boom(ev.clientX, ev.clientY); toast('🎉', 'Upvoted!', 'success'); }
    else toast('👎', 'Downvoted', 'error');
  } catch { toast('⚠️', 'Vote failed', 'error'); }
  finally { btn.disabled = false; }
}

// ─── Genre Chips ───
document.querySelectorAll('.genre-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    genre = chip.dataset.genre;
    fetchMovies();
  });
});

// ─── Sort Tabs ───
document.querySelectorAll('.sort-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    sort = tab.dataset.sort;
    fetchMovies();
  });
});

// ─── Search ───
let searchTimeout;
$search.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const q = $search.value.toLowerCase().trim();
    if (!q) { renderMovies(allMovies); return; }
    const filtered = allMovies.filter(m =>
      m.title.toLowerCase().includes(q) || m.pitch.toLowerCase().includes(q) || m.genre.toLowerCase().includes(q)
    );
    renderMovies(filtered);
  }, 250);
});

// ─── Toast ───
function toast(icon, msg, type) {
  document.getElementById('toast-icon').textContent = icon;
  document.getElementById('toast-msg').textContent = msg;
  $toast.className = `toast ${type} show`;
  setTimeout(() => $toast.classList.remove('show'), 2500);
}

// ─── Utility ───
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  createStars();
  fetchMovies();
});
