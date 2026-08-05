// ============================================================
// Fetch TMDB posters for all movies in DynamoDB
// Run this on EC2: node fetch-posters.js
// ============================================================

const AWS = require('aws-sdk');
const https = require('https');

AWS.config.update({ region: 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = 'Movies';
const TMDB_API_KEY = '2e6ea43c745eef9d85553ef30a1b0484';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// Rate limit: TMDB allows ~40 requests per 10 seconds
const DELAY_MS = 300;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Search TMDB for a movie poster
function searchTMDB(title) {
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent(title);
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${query}&page=1`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.results && json.results.length > 0 && json.results[0].poster_path) {
            resolve(TMDB_IMAGE_BASE + json.results[0].poster_path);
          } else {
            // Try TV search if movie search fails
            searchTMDB_TV(title).then(resolve).catch(() => resolve(null));
          }
        } catch (e) {
          resolve(null);
        }
      });
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

// Search TMDB TV shows (for shows like The Office)
function searchTMDB_TV(title) {
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent(title);
    const url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${query}&page=1`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.results && json.results.length > 0 && json.results[0].poster_path) {
            resolve(TMDB_IMAGE_BASE + json.results[0].poster_path);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

// Update poster in DynamoDB
async function updatePoster(movieId, posterUrl) {
  const params = {
    TableName: TABLE_NAME,
    Key: { movieId },
    UpdateExpression: 'SET poster = :poster',
    ExpressionAttributeValues: { ':poster': posterUrl }
  };
  await docClient.update(params).promise();
}

// Get all movies from DynamoDB
async function getAllMovies() {
  let items = [];
  let lastKey = null;
  do {
    const params = { TableName: TABLE_NAME };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const result = await docClient.scan(params).promise();
    items = items.concat(result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// Main
async function main() {
  console.log('Fetching all movies from DynamoDB...');
  const movies = await getAllMovies();
  console.log(`Found ${movies.length} movies.\n`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    const title = movie.title;

    // Skip if poster already exists
    if (movie.poster && movie.poster.startsWith('http')) {
      skipped++;
      console.log(`[${i + 1}/${movies.length}] SKIP: "${title}" (already has poster)`);
      continue;
    }

    console.log(`[${i + 1}/${movies.length}] Searching: "${title}"...`);
    const posterUrl = await searchTMDB(title);

    if (posterUrl) {
      await updatePoster(movie.movieId, posterUrl);
      updated++;
      console.log(`  ✅ Found: ${posterUrl}`);
    } else {
      notFound++;
      console.log(`  ❌ No poster found`);
    }

    // Rate limit delay
    await sleep(DELAY_MS);
  }

  console.log('\n========== DONE ==========');
  console.log(`Total:     ${movies.length}`);
  console.log(`Updated:   ${updated}`);
  console.log(`Skipped:   ${skipped} (already had poster)`);
  console.log(`Not found: ${notFound}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
