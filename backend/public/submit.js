// ============================================================
// MOVIEBOARD — Submit Page (Cinematic)
// Genre picker, poster field, live preview, confetti on success
// ============================================================

const API = '/api/movies';
// Sourced from shared-config.js (loaded before this script) so
// validation can never drift out of sync with the server.
const POSTER_PATTERN = MOVIEBOARD_POSTER_PATTERN;
const POSTER_MAX_LENGTH = MOVIEBOARD_POSTER_MAX_LENGTH;

const form = document.getElementById('submit-form');
const $btn = document.getElementById('submit-btn');
const $btnText = document.getElementById('btn-text');
const $btnLoader = document.getElementById('btn-loader');
const $msg = document.getElementById('form-message');
const $overlay = document.getElementById('success-overlay');

const $title = document.getElementById('title');
const $pitch = document.getElementById('pitch');
const $poster = document.getElementById('poster');

const $titleErr = document.getElementById('title-error');
const $genreErr = document.getElementById('genre-error');
const $pitchErr = document.getElementById('pitch-error');
const $posterErr = document.getElementById('poster-error');
const $titleCnt = document.getElementById('title-count');
const $pitchCnt = document.getElementById('pitch-count');
const $genreCnt = document.getElementById('genre-count');

const MAX_GENRES = 3;
let selectedGenres = [];

const $preview = document.getElementById('preview-wrap');
const $pTitle = document.getElementById('preview-title');
const $pGenre = document.getElementById('preview-genre');
const $pPitch = document.getElementById('preview-pitch');
const $pPosterWrap = document.getElementById('preview-poster');
const $pPosterImg = document.getElementById('preview-poster-img');

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
function bigConfetti() {
  const cv = document.getElementById('confetti-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const ps = [], cols = ['#a855f7','#ec4899','#fbbf24','#06b6d4','#10b981','#3b82f6','#f87171'];
  for (let i = 0; i < 120; i++) ps.push({
    x: cv.width/2 + (Math.random()-0.5)*300,
    y: cv.height/2,
    vx: (Math.random()-0.5)*22,
    vy: Math.random()*-20 - 5,
    c: cols[~~(Math.random()*cols.length)],
    s: Math.random()*9+3,
    r: Math.random()*360,
    rs: (Math.random()-0.5)*18,
    o: 1,
    d: 0.006 + Math.random()*0.005
  });
  (function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    let alive = false;
    ps.forEach(p => {
      if (p.o <= 0) return; alive = true;
      p.x += p.vx; p.y += p.vy; p.vy += 0.4; p.vx *= 0.99;
      p.r += p.rs; p.o -= p.d;
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

// ─── Build genre picker buttons from shared config ───
(function initGenrePicker() {
  const container = document.getElementById('genre-picker');
  if (!container || typeof MOVIEBOARD_GENRES === 'undefined') return;
  MOVIEBOARD_GENRES.forEach(g => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gpick';
    btn.dataset.value = g;
    btn.textContent = `${MOVIEBOARD_GENRE_EMOJI[g] || ''} ${g}`.trim();
    container.appendChild(btn);
  });
})();

// ─── Genre Picker (multi-select, max 3) ───
function updateGenreLockState() {
  const atMax = selectedGenres.length >= MAX_GENRES;
  document.querySelectorAll('.gpick').forEach(btn => {
    if (!btn.classList.contains('selected')) btn.disabled = atMax;
  });
  if ($genreCnt) $genreCnt.textContent = `${selectedGenres.length}/${MAX_GENRES} selected`;
}

document.querySelectorAll('.gpick').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.value;
    const idx = selectedGenres.indexOf(val);
    if (idx > -1) {
      selectedGenres.splice(idx, 1);
      btn.classList.remove('selected');
    } else {
      if (selectedGenres.length >= MAX_GENRES) return;
      selectedGenres.push(val);
      btn.classList.add('selected');
    }
    $genreErr.textContent = '';
    updateGenreLockState();
    updatePreview();
  });
});

// ─── Char Counts ───
$title.addEventListener('input', () => {
  const l = $title.value.length;
  $titleCnt.textContent = `${l}/100`;
  $titleCnt.className = 'char-count' + (l > 100 ? ' over' : l > 80 ? ' warn' : '');
  $titleErr.textContent = '';
  updatePreview();
});

$pitch.addEventListener('input', () => {
  const l = $pitch.value.length;
  $pitchCnt.textContent = `${l}/300`;
  $pitchCnt.className = 'char-count' + (l > 300 ? ' over' : l > 250 ? ' warn' : '');
  $pitchErr.textContent = '';
  updatePreview();
});

// ─── Poster field ───
if ($poster) {
  $poster.addEventListener('input', () => {
    $posterErr.textContent = '';
    updatePreview();
  });
}

// ─── Live Preview ───
function updatePreview() {
  const t = $title.value.trim();
  const p = $pitch.value.trim();
  const posterUrl = $poster ? $poster.value.trim() : '';

  if (t || selectedGenres.length || p) {
    $preview.style.display = 'block';
    $pTitle.textContent = t || 'Title';
    $pPitch.textContent = p || 'Pitch';
    $pGenre.innerHTML = '';
    selectedGenres.forEach(g => {
      const span = document.createElement('span');
      span.className = `genre-badge genre-${g}`;
      span.textContent = g;
      $pGenre.appendChild(span);
    });
  } else { $preview.style.display = 'none'; }

  if ($pPosterWrap && $pPosterImg) {
    if (posterUrl && POSTER_PATTERN.test(posterUrl)) {
      $pPosterImg.src = posterUrl;
      $pPosterImg.onerror = () => { $pPosterWrap.style.display = 'none'; };
      $pPosterImg.onload = () => { $pPosterWrap.style.display = 'block'; };
    } else {
      $pPosterWrap.style.display = 'none';
    }
  }
}

// ─── Submit ───
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  $titleErr.textContent = $genreErr.textContent = $pitchErr.textContent = '';
  if ($posterErr) $posterErr.textContent = '';

  const title = $title.value.trim();
  const pitch = $pitch.value.trim();
  const posterUrl = $poster ? $poster.value.trim() : '';
  let ok = true;

  if (!title) { $titleErr.textContent = 'Enter a title'; ok = false; }
  if (selectedGenres.length === 0) { $genreErr.textContent = 'Pick at least 1 genre'; ok = false; }
  else if (selectedGenres.length > 3) { $genreErr.textContent = 'Pick up to 3 genres only'; ok = false; }
  if (!pitch) { $pitchErr.textContent = 'Write a pitch'; ok = false; }
  else if (pitch.length < 10) { $pitchErr.textContent = 'At least 10 characters'; ok = false; }
  if (posterUrl && (posterUrl.length > POSTER_MAX_LENGTH || !POSTER_PATTERN.test(posterUrl))) {
    if ($posterErr) $posterErr.textContent = 'Must be a valid link starting with http:// or https://';
    ok = false;
  }
  if (!ok) return;

  $btn.disabled = true;
  $btnText.style.display = 'none';
  $btnLoader.style.display = 'inline-flex';
  $msg.className = 'form-message';
  $msg.textContent = '';

  const payload = { title, genres: selectedGenres, pitch };
  if (posterUrl) payload.poster = posterUrl;

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      let message = 'Something went wrong. Try again.';
      try {
        const data = await res.json();
        if (data && data.error) message = data.error;
      } catch {}
      throw new Error(message);
    }

    $overlay.style.display = 'flex';
    bigConfetti();

    let sec = 3;
    const cd = document.getElementById('countdown');
    const timer = setInterval(() => {
      sec--;
      if (cd) cd.textContent = sec;
      if (sec <= 0) { clearInterval(timer); window.location.href = 'index.html'; }
    }, 1000);

  } catch (err) {
    $msg.className = 'form-message error';
    $msg.textContent = (err && err.message) || 'Something went wrong. Try again.';
    $btn.disabled = false;
    $btnText.style.display = 'inline';
    $btnLoader.style.display = 'none';
  }
});

// ─── Init ───
document.addEventListener('DOMContentLoaded', createStars);
