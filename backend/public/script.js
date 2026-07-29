// ============================================================
// MOVIEBOARD — Cinematic Feed Page
// Stars, confetti, ripple, animated counters, search, pagination
// ============================================================

const API = '/api/movies';
const PAGE_SIZE = 6;

let sort = 'new', genre = 'All', allMovies = [];
let currentPage = 1;
let visibleMovies = [];

const $grid = document.getElementById('movies-container');
const $skel = document.getElementById('skeleton-loading');
const $empty = document.getElementById('empty-state');
const $error = document.getElementById('error-state');
const $count = document.getElementById('movie-count');
const $toast = document.getElementById('toast');
const $search = document.getElementById('search-input');
const $searchBar = document.getElementById('search-bar');
const $searchToggle = document.getElementById('search-toggle-btn');
const $pagination = document.getElementById('pagination-controls');

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

// ─── Relative time ───
function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMon = Math.floor(diffDay / 30);
  if (diffMon < 12) return `${diffMon}mo ago`;
  const diffYr = Math.floor(diffMon / 12);
  return `${diffYr}y ago`;
}

// ─── Fetch Movies ───
async function fetchMovies() {
  currentPage = 1;
  $skel.style.display = 'grid';
  $grid.innerHTML = '';
  $empty.style.display = $error.style.display = 'none';
  $count.textContent = '';
  if ($pagination) $pagination.innerHTML = '';

  try {
    let url = `${API}?sort=${sort}`;
    if (genre !== 'All') url += `&genre=${encodeURIComponent(genre)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    allMovies = await res.json();
    $skel.style.display = 'none';
    updateStats(allMovies);
    applyFilterAndRender();
  } catch {
    $skel.style.display = 'none';
    $error.style.display = 'block';
  }
}

// ─── Search filter + pagination ───
function applyFilterAndRender() {
  const q = $search.value.toLowerCase().trim();
  visibleMovies = q
    ? allMovies.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.pitch.toLowerCase().includes(q) ||
        (Array.isArray(m.genres) && m.genres.some(g => g.toLowerCase().includes(q))))
    : allMovies.slice();

  const maxPage = Math.max(1, Math.ceil(visibleMovies.length / PAGE_SIZE));
  if (currentPage > maxPage) currentPage = maxPage;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = visibleMovies.slice(start, start + PAGE_SIZE);

  renderMovies(pageItems, visibleMovies.length, start);
  renderPagination(visibleMovies.length, maxPage);
}

function renderMovies(movies, totalCount, rankOffset) {
  $grid.innerHTML = '';
  if (!movies.length) {
    $empty.style.display = 'block';
    $count.textContent = '0 movies';
    return;
  }
  $empty.style.display = 'none';
  $count.textContent = `${totalCount} movie${totalCount !== 1 ? 's' : ''}`;
  movies.forEach((m, i) => {
    const card = makeCard(m, rankOffset + i);
    card.style.animationDelay = `${i * 0.07}s`;
    $grid.appendChild(card);
  });
}

function renderPagination(totalCount, maxPage) {
  if (!$pagination) return;
  if (totalCount <= PAGE_SIZE) { $pagination.innerHTML = ''; return; }
  $pagination.innerHTML = `
    <button class="page-btn" id="page-prev" ${currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>
    <span class="page-indicator">Page ${currentPage} of ${maxPage}</span>
    <button class="page-btn" id="page-next" ${currentPage === maxPage ? 'disabled' : ''}>Next ›</button>
  `;
  const prevBtn = document.getElementById('page-prev');
  const nextBtn = document.getElementById('page-next');
  const scrollToTop = () => {
    const bar = document.querySelector('.sort-bar');
    if (bar) bar.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  if (prevBtn) prevBtn.addEventListener('click', () => { currentPage--; applyFilterAndRender(); scrollToTop(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; applyFilterAndRender(); scrollToTop(); });
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
  const voted = Boolean(m.hasVoted);
  const votedAttr = voted ? 'disabled' : '';

  const posterHTML = `<div class="card-poster-wrap">
      ${m.poster ? '<img class="card-poster" alt="" loading="lazy">' : ''}
      <div class="card-poster-fallback" style="${m.poster ? 'display:none;' : ''}">🎬</div>
    </div>`;

  const deleteHTML = m.isOwner
    ? `<button class="delete-btn" title="Delete your recommendation" aria-label="Delete your recommendation">🗑️</button>`
    : '';

  const genresHTML = (Array.isArray(m.genres) ? m.genres : [])
    .map(g => `<span class="genre-badge genre-${esc(g)}">${esc(g)}</span>`)
    .join('');

  el.innerHTML = `
    <div class="card-accent"></div>
    ${posterHTML}
    <div class="card-body">
      <div class="card-rank">#${idx + 1}</div>
      ${deleteHTML}
      <div class="card-genres">${genresHTML}</div>
      <h2 class="card-title">${esc(m.title)}</h2>
      <p class="card-pitch">${esc(m.pitch)}</p>
      <span class="card-time">${timeAgo(m.createdAt)}</span>
    </div>
    <div class="card-footer${voted ? ' already-voted' : ''}">
      <button class="vote-btn upvote" data-id="${m.movieId}" data-vote="up" ${votedAttr} title="${voted ? 'You already voted on this movie' : 'Upvote'}" aria-label="${voted ? 'You already voted on this movie' : 'Upvote'}">
        <span class="vote-arrow">▲</span>
        <span class="vote-count" id="up-${m.movieId}">${m.upvotes}</span>
      </button>
      <button class="vote-btn downvote" data-id="${m.movieId}" data-vote="down" ${votedAttr} title="${voted ? 'You already voted on this movie' : 'Downvote'}" aria-label="${voted ? 'You already voted on this movie' : 'Downvote'}">
        <span class="vote-arrow">▼</span>
        <span class="vote-count" id="down-${m.movieId}">${m.downvotes}</span>
      </button>
      <span class="net-score ${netCls}" id="net-${m.movieId}">${netStr}</span>
    </div>`;

  // Assign poster src/alt via properties (not template strings) so a
  // crafted poster URL or title can never break out of an HTML attribute.
  if (m.poster) {
    const img = el.querySelector('.card-poster');
    if (img) {
      img.src = m.poster;
      img.alt = m.title + ' poster';
      img.onerror = () => {
        img.style.display = 'none';
        const fallback = img.nextElementSibling;
        if (fallback) fallback.style.display = 'flex';
      };
    }
  }

  el.querySelectorAll('.vote-btn').forEach(b => {
    b.addEventListener('click', e => { ripple(e, b); vote(b.dataset.id, b.dataset.vote, b, e); });
  });

  const delBtn = el.querySelector('.delete-btn');
  if (delBtn) {
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${m.title}" from the board?`)) return;
      delBtn.disabled = true;
      try {
        const res = await fetch(`${API}/${m.movieId}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Delete failed');
        }
        allMovies = allMovies.filter(x => x.movieId !== m.movieId);
        updateStats(allMovies);
        applyFilterAndRender();
        toast('🗑️', 'Recommendation deleted', 'success');
      } catch (err) {
        toast('⚠️', (err && err.message) || 'Delete failed', 'error');
        delBtn.disabled = false;
      }
    });
  }

  return el;
}

// ─── Vote Handler ───
function markVoted(card) {
  if (!card) return;
  card.querySelectorAll('.vote-btn').forEach(b => {
    b.disabled = true;
    b.title = 'You already voted on this movie';
    b.setAttribute('aria-label', 'You already voted on this movie');
  });
  card.classList.add('already-voted');
}

async function vote(id, type, btn, ev) {
  const card = btn.closest('.movie-card');
  const buttons = card ? card.querySelectorAll('.vote-btn') : [btn];
  buttons.forEach(b => b.disabled = true);

  try {
    const res = await fetch(`${API}/${id}/vote`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: type })
    });

    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      toast('🚫', data.error || 'You already voted on this movie', 'error');
      markVoted(card);
      return;
    }
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      toast('⏳', data.error || 'Slow down — too many votes', 'error');
      buttons.forEach(b => b.disabled = false);
      return;
    }
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
    markVoted(card);
    if (type === 'up') { boom(ev.clientX, ev.clientY); toast('🎉', 'Upvoted!', 'success'); }
    else toast('👎', 'Downvoted', 'error');
  } catch {
    toast('⚠️', 'Vote failed', 'error');
    buttons.forEach(b => b.disabled = false);
  }
}

// ─── Build genre chips from shared config ───
function initGenreChips() {
  const strip = document.querySelector('.genre-strip');
  if (!strip || typeof MOVIEBOARD_GENRES === 'undefined') return;
  MOVIEBOARD_GENRES.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'genre-chip';
    btn.dataset.genre = g;
    btn.textContent = `${MOVIEBOARD_GENRE_EMOJI[g] || ''} ${g}`.trim();
    strip.appendChild(btn);
  });
}

// ─── Genre Chips ───
// Event delegation on the strip itself (rather than binding to each
// button individually) so the chips built dynamically above are
// clickable without needing to re-run this setup after creating them.
document.querySelector('.genre-strip').addEventListener('click', (e) => {
  const chip = e.target.closest('.genre-chip');
  if (!chip) return;
  document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  genre = chip.dataset.genre;
  fetchMovies();
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
    currentPage = 1;
    applyFilterAndRender();
  }, 250);
});

// ─── Mobile search toggle ───
// On desktop the search bar is always visible inline; below 768px it's
// hidden until this button reveals it as a dropdown under the navbar.
if ($searchToggle && $searchBar) {
  $searchToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = $searchBar.classList.toggle('mobile-open');
    $searchToggle.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) $search.focus();
  });

  document.addEventListener('click', (e) => {
    if (!$searchBar.classList.contains('mobile-open')) return;
    if ($searchBar.contains(e.target) || $searchToggle.contains(e.target)) return;
    $searchBar.classList.remove('mobile-open');
    $searchToggle.setAttribute('aria-expanded', 'false');
  });
}

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
  initGenreChips();
  createStars();
  fetchMovies();
});
