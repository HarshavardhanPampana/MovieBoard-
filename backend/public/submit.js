// ============================================================
// MOVIEBOARD — Submit Page (Cinematic)
// Genre picker, live preview, confetti on success, countdown
// ============================================================

const API = '/api/movies';
const form = document.getElementById('submit-form');
const $btn = document.getElementById('submit-btn');
const $btnText = document.getElementById('btn-text');
const $btnLoader = document.getElementById('btn-loader');
const $msg = document.getElementById('form-message');
const $overlay = document.getElementById('success-overlay');

const $title = document.getElementById('title');
const $genre = document.getElementById('genre');
const $pitch = document.getElementById('pitch');

const $titleErr = document.getElementById('title-error');
const $genreErr = document.getElementById('genre-error');
const $pitchErr = document.getElementById('pitch-error');
const $titleCnt = document.getElementById('title-count');
const $pitchCnt = document.getElementById('pitch-count');

const $preview = document.getElementById('preview-wrap');
const $pTitle = document.getElementById('preview-title');
const $pGenre = document.getElementById('preview-genre');
const $pPitch = document.getElementById('preview-pitch');

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

// ─── Genre Picker ───
document.querySelectorAll('.gpick').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gpick').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    $genre.value = btn.dataset.value;
    $genreErr.textContent = '';
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

// ─── Live Preview ───
function updatePreview() {
  const t = $title.value.trim();
  const g = $genre.value;
  const p = $pitch.value.trim();
  if (t || g || p) {
    $preview.style.display = 'block';
    $pTitle.textContent = t || 'Title';
    $pPitch.textContent = p || 'Pitch';
    if (g) {
      $pGenre.textContent = g;
      $pGenre.className = `genre-badge genre-${g}`;
      $pGenre.style.display = 'inline-block';
    } else { $pGenre.style.display = 'none'; }
  } else { $preview.style.display = 'none'; }
}

// ─── Submit ───
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  $titleErr.textContent = $genreErr.textContent = $pitchErr.textContent = '';

  const title = $title.value.trim();
  const genre = $genre.value;
  const pitch = $pitch.value.trim();
  let ok = true;

  if (!title) { $titleErr.textContent = 'Enter a title'; ok = false; }
  if (!genre) { $genreErr.textContent = 'Pick a genre'; ok = false; }
  if (!pitch) { $pitchErr.textContent = 'Write a pitch'; ok = false; }
  else if (pitch.length < 10) { $pitchErr.textContent = 'At least 10 characters'; ok = false; }
  if (!ok) return;

  $btn.disabled = true;
  $btnText.style.display = 'none';
  $btnLoader.style.display = 'inline-flex';
  $msg.className = 'form-message';
  $msg.textContent = '';

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, genre, pitch })
    });
    if (!res.ok) throw new Error();

    $overlay.style.display = 'flex';
    bigConfetti();

    let sec = 3;
    const cd = document.getElementById('countdown');
    const timer = setInterval(() => {
      sec--;
      if (cd) cd.textContent = sec;
      if (sec <= 0) { clearInterval(timer); window.location.href = 'index.html'; }
    }, 1000);

  } catch {
    $msg.className = 'form-message error';
    $msg.textContent = 'Something went wrong. Try again.';
    $btn.disabled = false;
    $btnText.style.display = 'inline';
    $btnLoader.style.display = 'none';
  }
});

// ─── Init ───
document.addEventListener('DOMContentLoaded', createStars);
