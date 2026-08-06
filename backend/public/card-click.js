// ============================================================
// Card Click - Navigate to movie detail page
// Loaded on the feed page (index.html)
// ============================================================
document.addEventListener('click', (e) => {
  const card = e.target.closest('.movie-card');
  if (!card) return;
  // Don't navigate if clicking vote buttons, delete, or links
  if (e.target.closest('.vote-btn') || e.target.closest('.delete-btn') || e.target.closest('a')) return;
  const id = card.dataset.id;
  if (id) window.location.href = `movie.html?id=${id}`;
});

// Add pointer cursor to card body
document.head.insertAdjacentHTML('beforeend',
  '<style>.movie-card .card-body{cursor:pointer;} .movie-card .card-body:hover .card-title{color:#a855f7;transition:color 0.3s;}</style>'
);
