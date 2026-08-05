// ============================================================
// Movie Detail Page — Netflix-Style
// ============================================================

const API = '/api/movies';
let allMovies = [];
let currentMovie = null;

// Get movie ID from URL
const params = new URLSearchParams(window.location.search);
const movieId = params.get('id');

// ─── Stars ───
function createStars() {
  const c = document.getElementById('stars');
  if (!c) return;
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const sz = Math.random() * 2 + 1;
    s.style.cssText = `width:${sz}px;height:${sz}px;top:${Math.random()*100}%;left:${Math.random()*100}%;animation-duration:${Math.random()*4+2}s;animation-delay:${Math.random()*5}s;`;
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
  for (let i = 0; i < 50; i++) ps.push({
    x, y, vx: (Math.random()-0.5)*16, vy: (Math.random()-0.7)*16,
    c: cols[~~(Math.random()*cols.length)], s: Math.random()*8+3,
    r: Math.random()*360, rs: (Math.random()-0.5)*12, o: 1, d: 0.01+Math.random()*0.008
  });
  (function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    let alive = false;
    ps.forEach(p => {
      if (p.o <= 0) return; alive = true;
      p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.r += p.rs; p.o -= p.d;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r*Math.PI/180);
      ctx.globalAlpha = Math.max(0, p.o);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s/2, -p.s/2, p.s, p.s);
      ctx.restore();
    });
    if (alive) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

// ─── Time Ago ───
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

// ─── Toast ───
function toast(icon, msg, type) {
  const t = document.getElementById('toast');
  document.getElementById('toast-icon').textContent = icon;
  document.getElementById('toast-msg').textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ─── Fetch all movies and find the one ───
async function loadMovie() {
  if (!movieId) {
    showError();
    return;
  }

  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error();
    allMovies = await res.json();
    currentMovie = allMovies.find(m => m.movieId === movieId);

    if (!currentMovie) {
      showError();
      return;
    }

    renderMovie(currentMovie);
    renderSimilar(currentMovie);
  } catch (err) {
    console.error(err);
    showError();
  }
}

function showError() {
  document.getElementById('loading-state').style.display = 'none';
  document.getElementById('error-state').style.display = 'block';
}

// ─── Render Movie Detail ───
function renderMovie(m) {
  document.getElementById('loading-state').style.display = 'none';
  document.getElementById('movie-detail').style.display = 'block';

  // Title
  document.title = `${m.title} — MovieBoard`;
  document.getElementById('detail-title').textContent = m.title;

  // Poster
  const posterEl = document.getElementById('detail-poster');
  const backdrop = document.getElementById('backdrop');
  if (m.poster && m.poster.startsWith('http')) {
    posterEl.src = m.poster;
    posterEl.alt = m.title;
    backdrop.style.backgroundImage = `url(${m.poster})`;
    posterEl.onerror = () => {
      posterEl.style.display = 'none';
      posterEl.parentElement.innerHTML = '<div class="detail-poster no-poster">🎬</div>';
    };
  } else {
    posterEl.style.display = 'none';
    posterEl.parentElement.innerHTML = '<div class="detail-poster no-poster">🎬</div>';
  }

  // Genres
  const genresEl = document.getElementById('detail-genres');
  const genres = Array.isArray(m.genres) ? m.genres : [];
  genresEl.innerHTML = genres.map(g =>
    `<span class="genre-badge genre-${esc(g)}">${esc(g)}</span>`
  ).join('');

  // Meta
  document.getElementById('detail-time').textContent = timeAgo(m.createdAt);
  document.getElementById('detail-owner').textContent = m.isOwner ? 'Your recommendation' : 'Community pick';

  // Pitch
  document.getElementById('detail-pitch').textContent = m.pitch;

  // Votes
  updateVoteUI(m);

  // Stats
  document.getElementById('stat-upvotes').textContent = m.upvotes;
  document.getElementById('stat-downvotes').textContent = m.downvotes;
  const net = m.upvotes - m.downvotes;
  document.getElementById('stat-score').textContent = (net > 0 ? '+' : '') + net;
  document.getElementById('stat-date').textContent = formatDate(m.createdAt);

  // Vote button listeners
  document.getElementById('vote-up').addEventListener('click', (e) => handleVote('up', e));
  document.getElementById('vote-down').addEventListener('click', (e) => handleVote('down', e));

  // Share button
  document.getElementById('share-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      toast('📋', 'Link copied to clipboard!', 'success');
    }).catch(() => {
      toast('🔗', window.location.href, 'success');
    });
  });
}

function updateVoteUI(m) {
  document.getElementById('vote-up-count').textContent = m.upvotes;
  document.getElementById('vote-down-count').textContent = m.downvotes;
  const net = m.upvotes - m.downvotes;
  const netEl = document.getElementById('net-score');
  netEl.textContent = (net > 0 ? '+' : '') + net;
  netEl.className = 'net-num ' + (net > 0 ? 'positive' : net < 0 ? 'negative' : 'zero');

  // Update stats too
  document.getElementById('stat-upvotes').textContent = m.upvotes;
  document.getElementById('stat-downvotes').textContent = m.downvotes;
  document.getElementById('stat-score').textContent = (net > 0 ? '+' : '') + net;

  // Show voted state
  if (m.hasVoted) {
    document.getElementById('vote-up').classList.add('voted');
    document.getElementById('vote-down').classList.add('voted');
  }
}

// ─── Handle Vote ───
async function handleVote(type, ev) {
  const btn = type === 'up' ? document.getElementById('vote-up') : document.getElementById('vote-down');
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/${movieId}/vote`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: type })
    });

    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      toast('🚫', data.error || 'You already voted on this movie', 'error');
      document.getElementById('vote-up').disabled = true;
      document.getElementById('vote-down').disabled = true;
      return;
    }
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      toast('⏳', data.error || 'Slow down — too many votes', 'error');
      return;
    }
    if (!res.ok) throw new Error();
    const updated = await res.json();

    // Update current movie
    currentMovie.upvotes = updated.upvotes;
    currentMovie.downvotes = updated.downvotes;
    updateVoteUI(updated);

    // Bump animation
    const countEl = type === 'up' ? document.getElementById('vote-up-count') : document.getElementById('vote-down-count');
    countEl.classList.add('bump');
    setTimeout(() => countEl.classList.remove('bump'), 500);

    if (type === 'up') {
      boom(ev.clientX, ev.clientY);
      toast('🎉', 'Upvoted!', 'success');
    } else {
      toast('👎', 'Downvoted', 'error');
    }
  } catch {
    toast('⚠️', 'Vote failed', 'error');
  } finally {
    btn.disabled = false;
  }
}

// ─── Similar Movies ───
function renderSimilar(movie) {
  const movieGenres = Array.isArray(movie.genres) ? movie.genres : [];
  if (movieGenres.length === 0) return;

  const similar = allMovies
    .filter(m => m.movieId !== movie.movieId)
    .filter(m => {
      const g = Array.isArray(m.genres) ? m.genres : [];
      return g.some(genre => movieGenres.includes(genre));
    })
    .sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes))
    .slice(0, 6);

  if (similar.length === 0) return;

  document.getElementById('similar-section').style.display = 'block';
  const grid = document.getElementById('similar-grid');

  similar.forEach(m => {
    const net = m.upvotes - m.downvotes;
    const netCls = net > 0 ? 'positive' : net < 0 ? 'negative' : '';
    const hasPoster = m.poster && m.poster.startsWith('http');

    const card = document.createElement('a');
    card.className = 'similar-card';
    card.href = `movie.html?id=${m.movieId}`;

    card.innerHTML = `
      ${hasPoster
        ? `<img class="similar-poster" src="" alt="">`
        : '<div class="similar-poster no-img">🎬</div>'}
      <div class="similar-info">
        <div class="similar-name">${esc(m.title)}</div>
        <div class="similar-genre">${(Array.isArray(m.genres) ? m.genres : []).join(' · ')}</div>
        <div class="similar-score ${netCls}">${net > 0 ? '+' : ''}${net}</div>
      </div>
    `;

    // Set poster src safely via JS (not inline HTML)
    if (hasPoster) {
      const img = card.querySelector('.similar-poster');
      if (img) {
        img.src = m.poster;
        img.alt = m.title;
        img.onerror = () => {
          img.outerHTML = '<div class="similar-poster no-img">🎬</div>';
        };
      }
    }

    grid.appendChild(card);
  });
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  createStars();
  loadMovie();
});
