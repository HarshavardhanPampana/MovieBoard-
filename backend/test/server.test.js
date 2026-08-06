// ============================================================
// Unit tests for the pure/testable logic in server.js.
// Run with: npm test  (or directly: node --test)
// Uses Node's built-in test runner - no extra dependencies needed.
//
// Deliberately does NOT test the DynamoDB-backed route handlers
// end-to-end (that would need a real or mocked table and a library
// like supertest). This covers the validation and security logic
// that's easiest to get subtly wrong and hardest to catch by eye -
// exactly the kind of things that were actually broken before this
// review (the poster regex, the forgeable cookie).
// ============================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Requiring server.js does NOT start the server or bind a port -
// app.listen() only runs when server.js is executed directly
// (require.main === module), not when it's require()'d from here.
const {
  isValidPosterUrl,
  validateGenres,
  signValue,
  verifySignedValue,
  checkVoteRateLimit,
  toClientMovie
} = require('../server.js');

describe('isValidPosterUrl', () => {
  test('accepts a standard image URL with an extension', () => {
    assert.equal(isValidPosterUrl('https://example.com/poster.jpg'), true);
  });

  test('accepts an extensionless CDN-style URL (e.g. Unsplash)', () => {
    assert.equal(isValidPosterUrl('https://images.unsplash.com/photo-1234567890'), true);
  });

  test('accepts a URL with a query string', () => {
    assert.equal(isValidPosterUrl('https://cdn.example.com/img?id=99&fmt=webp'), true);
  });

  test('rejects non-http(s) schemes', () => {
    assert.equal(isValidPosterUrl('ftp://example.com/poster.jpg'), false);
    assert.equal(isValidPosterUrl('javascript:alert(1)'), false);
  });

  test('rejects URLs containing quotes or angle brackets (attribute-breakout attempt)', () => {
    assert.equal(isValidPosterUrl('https://evil.com/x.jpg?"onerror="alert(1)'), false);
    assert.equal(isValidPosterUrl('https://evil.com/<script>'), false);
  });

  test('rejects URLs with embedded whitespace', () => {
    assert.equal(isValidPosterUrl('https://example.com/my poster.jpg'), false);
  });

  test('rejects non-string input without throwing', () => {
    assert.equal(isValidPosterUrl(undefined), false);
    assert.equal(isValidPosterUrl(null), false);
    assert.equal(isValidPosterUrl(12345), false);
  });

  test('rejects URLs over the max length', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2000) + '.jpg';
    assert.equal(isValidPosterUrl(longUrl), false);
  });
});

describe('validateGenres', () => {
  test('accepts a single valid genre', () => {
    const result = validateGenres(['Action']);
    assert.equal(result.valid, true);
    assert.deepEqual(result.cleaned, ['Action']);
  });

  test('accepts up to 3 valid genres', () => {
    const result = validateGenres(['Action', 'Comedy', 'Drama']);
    assert.equal(result.valid, true);
    assert.equal(result.cleaned.length, 3);
  });

  test('rejects more than 3 genres', () => {
    const result = validateGenres(['Action', 'Comedy', 'Drama', 'Horror']);
    assert.equal(result.valid, false);
  });

  test('rejects an empty array', () => {
    const result = validateGenres([]);
    assert.equal(result.valid, false);
  });

  test('rejects a non-array value', () => {
    const result = validateGenres('Action');
    assert.equal(result.valid, false);
  });

  test('rejects an unrecognized genre', () => {
    const result = validateGenres(['Action', 'MadeUpGenre']);
    assert.equal(result.valid, false);
  });

  test('deduplicates repeated genres', () => {
    const result = validateGenres(['Action', 'Action', 'Comedy']);
    assert.equal(result.valid, true);
    assert.deepEqual(result.cleaned, ['Action', 'Comedy']);
  });

  test('trims whitespace around genre names', () => {
    const result = validateGenres([' Action ', 'Comedy']);
    assert.equal(result.valid, true);
    assert.deepEqual(result.cleaned, ['Action', 'Comedy']);
  });
});

describe('signValue / verifySignedValue (cookie identity)', () => {
  test('a freshly signed value verifies back to the original', () => {
    const signed = signValue('some-client-id');
    assert.equal(verifySignedValue(signed), 'some-client-id');
  });

  test('a tampered signature fails verification', () => {
    const signed = signValue('some-client-id');
    const lastChar = signed.slice(-1);
    const flipped = lastChar === 'a' ? 'b' : 'a';
    const tampered = signed.slice(0, -1) + flipped;
    assert.equal(verifySignedValue(tampered), null);
  });

  test('a forged id with a fake signature is rejected (cannot impersonate)', () => {
    assert.equal(verifySignedValue('someone-elses-id.0000000000000000000000000000000a'), null);
  });

  test('a value with no signature separator fails', () => {
    assert.equal(verifySignedValue('not-a-signed-value'), null);
  });

  test('empty or non-string input fails safely without throwing', () => {
    assert.equal(verifySignedValue(''), null);
    assert.equal(verifySignedValue(null), null);
    assert.equal(verifySignedValue(undefined), null);
  });
});

describe('checkVoteRateLimit', () => {
  test('allows requests up to the limit for a given IP', () => {
    const ip = `test-ip-${Date.now()}-a`; // unique per run to avoid cross-test interference
    for (let i = 0; i < 20; i++) {
      assert.equal(checkVoteRateLimit(ip), true, `request ${i + 1} should be allowed`);
    }
  });

  test('blocks requests past the limit for the same IP', () => {
    const ip = `test-ip-${Date.now()}-b`;
    for (let i = 0; i < 20; i++) checkVoteRateLimit(ip);
    assert.equal(checkVoteRateLimit(ip), false);
  });

  test('tracks different IPs independently', () => {
    const ipA = `test-ip-${Date.now()}-c1`;
    const ipB = `test-ip-${Date.now()}-c2`;
    for (let i = 0; i < 20; i++) checkVoteRateLimit(ipA);
    // ipA is now at its limit, but ipB should be completely unaffected
    assert.equal(checkVoteRateLimit(ipB), true);
  });
});

describe('toClientMovie', () => {
  test('wraps an old single-genre item into a genres array', () => {
    const oldItem = {
      movieId: 'abc',
      title: 'Old Movie',
      genre: 'Action',
      pitch: 'test',
      upvotes: 0,
      downvotes: 0
    };
    const result = toClientMovie(oldItem, 'viewer-1');
    assert.deepEqual(result.genres, ['Action']);
    assert.equal(result.genre, undefined); // old field stripped, not just left alongside
  });

  test('passes through a new multi-genre item unchanged', () => {
    const newItem = {
      movieId: 'def',
      title: 'New Movie',
      genres: ['Action', 'Comedy'],
      pitch: 'test',
      upvotes: 0,
      downvotes: 0
    };
    const result = toClientMovie(newItem, 'viewer-1');
    assert.deepEqual(result.genres, ['Action', 'Comedy']);
  });

  test('computes hasVoted correctly from the voters set', () => {
    const item = {
      movieId: 'ghi',
      genres: ['Drama'],
      voters: { values: ['viewer-1', 'viewer-2'] },
      upvotes: 2,
      downvotes: 0
    };
    assert.equal(toClientMovie(item, 'viewer-1').hasVoted, true);
    assert.equal(toClientMovie(item, 'viewer-3').hasVoted, false);
  });

  test('computes isOwner correctly from submitterId', () => {
    const item = { movieId: 'jkl', genres: ['Horror'], submitterId: 'owner-1', upvotes: 0, downvotes: 0 };
    assert.equal(toClientMovie(item, 'owner-1').isOwner, true);
    assert.equal(toClientMovie(item, 'someone-else').isOwner, false);
  });

  test('never leaks the raw voters set or submitterId to the client', () => {
    const item = {
      movieId: 'mno',
      genres: ['Sci-Fi'],
      voters: { values: ['a', 'b'] },
      submitterId: 'owner-1',
      upvotes: 0,
      downvotes: 0
    };
    const result = toClientMovie(item, 'owner-1');
    assert.equal('voters' in result, false);
    assert.equal('submitterId' in result, false);
  });

  test('handles an item with no genres or genre field at all', () => {
    const item = { movieId: 'pqr', upvotes: 0, downvotes: 0 };
    const result = toClientMovie(item, 'viewer-1');
    assert.deepEqual(result.genres, []);
  });
});
