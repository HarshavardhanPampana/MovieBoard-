// ============================================================
// Shared config — the single source of truth for genre names/emoji
// and poster URL validation rules.
//
// Loaded two ways with zero build tooling:
//   - In the browser: included via a plain <script> tag, before
//     script.js / submit.js, so these become ordinary globals.
//   - In Node: required directly by server.js.
//
// Change a genre here and the submit picker, the feed filter chips,
// and server-side validation all stay in sync automatically.
// ============================================================

const MOVIEBOARD_GENRES = ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Thriller', 'Romance', 'Documentary', 'Animation'];

const MOVIEBOARD_GENRE_EMOJI = {
  Action: '💥',
  Comedy: '😂',
  Drama: '🎭',
  Horror: '👻',
  'Sci-Fi': '🚀',
  Thriller: '🔪',
  Romance: '💕',
  Documentary: '📽️',
  Animation: '🎨'
};

// Any well-formed http(s) URL, no quotes/angle-brackets/whitespace.
// Deliberately no file-extension requirement — many legitimate image
// hosts serve extensionless URLs, and an extension proves nothing
// about the actual response anyway. See server.js POST handler for
// the full reasoning; the frontend's onerror fallback handles any
// URL that turns out not to be an image.
const MOVIEBOARD_POSTER_PATTERN = /^https?:\/\/[^\s"'<>]+$/i;
const MOVIEBOARD_POSTER_MAX_LENGTH = 2000;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GENRES: MOVIEBOARD_GENRES,
    GENRE_EMOJI: MOVIEBOARD_GENRE_EMOJI,
    POSTER_PATTERN: MOVIEBOARD_POSTER_PATTERN,
    POSTER_MAX_LENGTH: MOVIEBOARD_POSTER_MAX_LENGTH
  };
}
