// ============================================================
// Movie Recommendation Board — Express Server
// Serves static frontend + REST API
// Connects to DynamoDB (Movies table) via AWS SDK
// ============================================================

require('dotenv').config();

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const path = require('path');
const crypto = require('crypto');
const sharedConfig = require('./public/shared-config.js');

const app = express();
const PORT = process.env.PORT || 80;

// Trust the first proxy hop (the ALB) so req.ip reflects the real visitor
// IP from X-Forwarded-For instead of the load balancer's internal IP.
app.set('trust proxy', 1);

// ─── Middleware ───
// No cors() middleware: the frontend (index.html/submit.html) and this
// API are served from the same Express app, so same-origin requests
// never need CORS at all. Leaving CORS wide open would only ever serve
// to let *other* websites call the vote/delete/submit endpoints from
// their own JS — there's no current use case for that. If a separate
// admin dashboard or mobile client on another domain ever needs to
// call this API, add a scoped cors({ origin: '<trusted domain>' })
// then, rather than leaving it open by default now.
app.use(express.json());

// Serve static frontend files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ─── AWS DynamoDB Setup ───
// Region must match where the table was created
AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = 'Movies';

// ─── Anonymous client identity (signed cookie) ───
// No login system — each browser gets a random ID stored in an httpOnly
// cookie. The ID is HMAC-signed with a server-only secret so a visitor
// can't edit the cookie value to impersonate someone else's ID (which
// would otherwise let them delete another person's post or appear to
// have voted when they haven't). Clearing cookies still resets a
// visitor to a fresh anonymous ID — that's an accepted limitation of
// any identity system that doesn't require creating an account.
const CLIENT_COOKIE = 'mb_client_id';
const CLIENT_COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 365; // 1 year

const SESSION_SECRET = process.env.SESSION_SECRET || 'movieboard-dev-secret-change-in-production';
if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET is not set — using an insecure default. Set SESSION_SECRET as an environment variable in production.');
}

function signValue(value) {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex').slice(0, 32);
  return `${value}.${sig}`;
}

function verifySignedValue(signed) {
  if (!signed || typeof signed !== 'string') return null;
  const idx = signed.lastIndexOf('.');
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex').slice(0, 32);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  return value;
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (!key) return;
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  });
  return cookies;
}

function getOrCreateClientId(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const signedCookie = cookies[CLIENT_COOKIE];
  let clientId = signedCookie ? verifySignedValue(signedCookie) : null;
  if (!clientId) {
    clientId = uuidv4();
    res.cookie(CLIENT_COOKIE, signValue(clientId), {
      maxAge: CLIENT_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax'
    });
  }
  return clientId;
}

// Strip internal-only fields (voters set, submitterId) before sending a
// movie to the browser, and attach computed flags for the current client.
function toClientMovie(item, clientId) {
  const votersArr = (item.voters && item.voters.values) ? item.voters.values : [];
  const { voters, submitterId, genre, genres, ...rest } = item;
  // Older items only have a single "genre" string — wrap it into an array
  // so the frontend can treat every movie the same way.
  const genreList = Array.isArray(genres) && genres.length ? genres : (genre ? [genre] : []);
  return {
    ...rest,
    genres: genreList,
    hasVoted: votersArr.includes(clientId),
    isOwner: Boolean(submitterId) && submitterId === clientId
  };
}

const VALID_GENRES = sharedConfig.GENRES;
const POSTER_URL_PATTERN = sharedConfig.POSTER_PATTERN;
const POSTER_URL_MAX_LENGTH = sharedConfig.POSTER_MAX_LENGTH;

function isValidPosterUrl(url) {
  return typeof url === 'string'
    && url.length <= POSTER_URL_MAX_LENGTH
    && POSTER_URL_PATTERN.test(url);
}

// ─── Rate limiting for votes (per IP) ───
// A soft, supplementary layer on top of the signed cookie: blunts fast,
// automated vote-spamming without hard-blocking normal use. In-memory,
// so it resets on server restart and is tracked per-instance — with
// more than one EC2 instance behind the ALB, a determined user could
// roughly double their effective limit by landing on both. A shared
// store (e.g. DynamoDB or Redis) would close that gap if it ever
// becomes a real problem, but is overkill for this project's scale.
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_VOTES = 20; // max votes per IP per window
const voteRateLimitMap = new Map(); // ip -> { count, windowStart }

function checkVoteRateLimit(ip) {
  const now = Date.now();
  const entry = voteRateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    voteRateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX_VOTES;
}

// Periodically clear out stale entries so the map doesn't grow forever
// on a long-running server. unref() so this timer never blocks shutdown.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of voteRateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) voteRateLimitMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// ─── Fetching all movies ───
// DynamoDB's Scan returns at most ~1MB per call and signals more data
// via LastEvaluatedKey — without following it, items past that first
// page would silently disappear once the table grows. scanAllMovies()
// loops until the whole table has been read, regardless of size.
async function scanAllMovies() {
  let items = [];
  let lastKey;
  do {
    const params = { TableName: TABLE_NAME };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const data = await docClient.scan(params).promise();
    items = items.concat(data.Items);
    lastKey = data.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// A short-lived cache of the raw (pre-per-client-processing) movie
// list, shared across all visitors. Cuts down repeated full scans when
// several people are browsing at once. Cleared immediately on any
// write so changes always show up right away — the TTL below is only
// a ceiling for how stale a read can be between writes, not how fresh
// writes appear.
const MOVIES_CACHE_TTL_MS = 8000; // 8 seconds
let moviesCache = { data: null, expiresAt: 0 };

async function getAllMoviesRaw() {
  const now = Date.now();
  if (moviesCache.data && moviesCache.expiresAt > now) {
    return moviesCache.data;
  }
  const items = await scanAllMovies();
  moviesCache = { data: items, expiresAt: now + MOVIES_CACHE_TTL_MS };
  return items;
}

function invalidateMoviesCache() {
  moviesCache = { data: null, expiresAt: 0 };
}


// ============================================================
// GET /api/movies
// Retrieves all movies. Supports optional query params:
//   ?genre=Action        — filter by genre
//   ?sort=top            — sort by (upvotes - downvotes) descending
//   ?sort=new            — sort by createdAt descending (default)
// Search is handled entirely client-side (script.js) since the full
// filtered/sorted list is already sent to the browser in one request —
// a server-side search param would only add a network round-trip for
// data the client already has.
// ============================================================
app.get('/api/movies', async (req, res) => {
  try {
    const clientId = getOrCreateClientId(req, res);
    const items = await getAllMoviesRaw();
    let movies = items.map(item => toClientMovie(item, clientId));

    if (req.query.genre && req.query.genre !== 'All') {
      movies = movies.filter(m => Array.isArray(m.genres) && m.genres.includes(req.query.genre));
    }

    const sortBy = req.query.sort || 'new';
    if (sortBy === 'top') {
      movies.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
    } else {
      movies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    res.status(200).json(movies);
  } catch (error) {
    console.error('Error fetching movies:', error);
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});


// ============================================================
// POST /api/movies
// Creates a new movie recommendation.
// Request body: { title, genre, pitch, poster? }
// ============================================================
app.post('/api/movies', async (req, res) => {
  try {
    const { title, genres, pitch, poster } = req.body || {};

    const cleanTitle = (title || '').trim();
    const cleanPitch = (pitch || '').trim();

    if (!cleanTitle || !cleanPitch) {
      return res.status(400).json({ error: 'Title and pitch are required.' });
    }
    if (cleanTitle.length > 100) {
      return res.status(400).json({ error: 'Title must be 100 characters or fewer.' });
    }
    if (cleanPitch.length < 10) {
      return res.status(400).json({ error: 'Pitch must be at least 10 characters.' });
    }
    if (cleanPitch.length > 300) {
      return res.status(400).json({ error: 'Pitch must be 300 characters or fewer.' });
    }
    if (!Array.isArray(genres)) {
      return res.status(400).json({ error: 'Choose 1 to 3 genres.' });
    }
    const cleanGenres = [...new Set(genres.map(g => String(g).trim()).filter(Boolean))];
    if (cleanGenres.length === 0 || cleanGenres.length > 3) {
      return res.status(400).json({ error: 'Choose 1 to 3 genres.' });
    }
    if (cleanGenres.some(g => !VALID_GENRES.includes(g))) {
      return res.status(400).json({ error: 'Please choose valid genres only.' });
    }

    let posterUrl;
    if (poster && String(poster).trim()) {
      const cleanPoster = String(poster).trim();
      if (!isValidPosterUrl(cleanPoster)) {
        return res.status(400).json({ error: 'Poster must be a valid http(s) image link.' });
      }
      posterUrl = cleanPoster;
    }

    const clientId = getOrCreateClientId(req, res);

    const movie = {
      movieId: uuidv4(),
      title: cleanTitle,
      genres: cleanGenres,
      pitch: cleanPitch,
      upvotes: 0,
      downvotes: 0,
      submitterId: clientId,
      createdAt: new Date().toISOString(),
      ...(posterUrl ? { poster: posterUrl } : {})
    };

    await docClient.put({ TableName: TABLE_NAME, Item: movie }).promise();
    invalidateMoviesCache();
    res.status(201).json(toClientMovie(movie, clientId));
  } catch (error) {
    console.error('Error creating movie:', error);
    res.status(500).json({ error: 'Failed to create movie' });
  }
});


// ============================================================
// PUT /api/movies/:id/vote
// Upvote or downvote a movie. One vote per browser per movie —
// enforced server-side via a "voters" String Set on the item, so it
// can't be bypassed by clearing localStorage or reloading the page.
// Request body: { "vote": "up" } or { "vote": "down" }
// ============================================================
app.put('/api/movies/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { vote } = req.body || {};

    if (!vote || (vote !== 'up' && vote !== 'down')) {
      return res.status(400).json({ error: 'Invalid vote. Use "up" or "down".' });
    }

    if (!checkVoteRateLimit(req.ip)) {
      return res.status(429).json({ error: 'Too many votes too quickly — please slow down and try again in a minute.' });
    }

    const clientId = getOrCreateClientId(req, res);
    const field = vote === 'up' ? 'upvotes' : 'downvotes';

    const params = {
      TableName: TABLE_NAME,
      Key: { movieId: id },
      UpdateExpression: 'ADD #field :one, voters :voterSet',
      ConditionExpression: 'attribute_exists(movieId) AND (attribute_not_exists(voters) OR NOT contains(voters, :voterId))',
      ExpressionAttributeNames: {
        '#field': field
      },
      ExpressionAttributeValues: {
        ':one': 1,
        ':voterSet': docClient.createSet([clientId]),
        ':voterId': clientId
      },
      ReturnValues: 'ALL_NEW'
    };

    const data = await docClient.update(params).promise();
    invalidateMoviesCache();
    res.status(200).json(toClientMovie(data.Attributes, clientId));
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      return res.status(409).json({ error: 'You have already voted on this movie, or it no longer exists.' });
    }
    console.error('Error voting:', error);
    res.status(500).json({ error: 'Failed to register vote' });
  }
});


// ============================================================
// DELETE /api/movies/:id
// Deletes a movie recommendation — only allowed for the browser
// (cookie identity) that originally submitted it.
// ============================================================
app.delete('/api/movies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = getOrCreateClientId(req, res);

    const params = {
      TableName: TABLE_NAME,
      Key: { movieId: id },
      ConditionExpression: 'submitterId = :clientId',
      ExpressionAttributeValues: { ':clientId': clientId },
      ReturnValues: 'ALL_OLD'
    };

    await docClient.delete(params).promise();
    invalidateMoviesCache();
    res.status(200).json({ success: true });
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      return res.status(403).json({ error: 'You can only delete your own recommendations.' });
    }
    console.error('Error deleting movie:', error);
    res.status(500).json({ error: 'Failed to delete movie' });
  }
});


// ============================================================
// GET /health
// Liveness/readiness check for the ALB target group. Actually
// verifies DynamoDB is reachable (not just "the Node process didn't
// crash") — a broken IAM role, wrong region, or deleted table would
// otherwise go undetected while the ALB keeps routing real traffic
// to an instance that can't actually serve requests. Uses a Limit:1
// scan so the check itself stays cheap.
// ============================================================
app.get('/health', async (req, res) => {
  try {
    await docClient.scan({ TableName: TABLE_NAME, Limit: 1 }).promise();
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ status: 'error', error: 'DynamoDB unreachable' });
  }
});


// ─── Catch-all: serve index.html for any other route ───
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ─── Start Server ───
const server = app.listen(PORT, () => {
  console.log(`Movie Recommendation Board running on port ${PORT}`);
  console.log(`Frontend: http://localhost:${PORT}`);
  console.log(`API:      http://localhost:${PORT}/api/movies`);
});

// ─── Graceful shutdown ───
// When the Auto Scaling Group scales in, it sends SIGTERM before
// killing an instance. Without handling it, in-flight requests get
// dropped mid-response. This lets the server finish serving whatever
// it's already working on (up to 10s) before actually exiting.
function gracefulShutdown(signal) {
  console.log(`${signal} received: closing server gracefully...`);
  server.close(() => {
    console.log('Server closed. Exiting process.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout — a connection did not close in time.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
