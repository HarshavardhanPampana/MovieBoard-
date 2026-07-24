// ============================================================
// Movie Recommendation Board — Express Server
// Serves static frontend + REST API
// Connects to DynamoDB (Movies table) via AWS SDK
// ============================================================

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const path = require('path');

const app = express();
const PORT = 80;

// ─── Middleware ───
app.use(cors());
app.use(express.json());

// Serve static frontend files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ─── AWS DynamoDB Setup ───
// Region must match where the table was created
AWS.config.update({ region: 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = 'Movies';


// ============================================================
// GET /api/movies
// Retrieves all movies. Supports optional query params:
//   ?genre=Action   — filter by genre
//   ?sort=top       — sort by (upvotes - downvotes) descending
//   ?sort=new       — sort by createdAt descending (default)
// ============================================================
app.get('/api/movies', async (req, res) => {
  try {
    const params = { TableName: TABLE_NAME };

    // If genre filter is provided, use a FilterExpression
    if (req.query.genre && req.query.genre !== 'All') {
      params.FilterExpression = 'genre = :genre';
      params.ExpressionAttributeValues = { ':genre': req.query.genre };
    }

    const data = await docClient.scan(params).promise();
    let movies = data.Items;

    // Sort the results
    const sortBy = req.query.sort || 'new';
    if (sortBy === 'top') {
      // Sort by net votes (upvotes - downvotes), highest first
      movies.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
    } else {
      // Sort by newest first (createdAt descending)
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
// Request body: { title, genre, pitch }
// ============================================================
app.post('/api/movies', async (req, res) => {
  try {
    const { title, genre, pitch } = req.body;

    // Validate required fields
    if (!title || !genre || !pitch) {
      return res.status(400).json({ error: 'Missing required fields: title, genre, pitch' });
    }

    const movie = {
      movieId: uuidv4(),
      title: title.trim(),
      genre: genre.trim(),
      pitch: pitch.trim(),
      upvotes: 0,
      downvotes: 0,
      createdAt: new Date().toISOString()
    };

    const params = {
      TableName: TABLE_NAME,
      Item: movie
    };

    await docClient.put(params).promise();
    res.status(201).json(movie);
  } catch (error) {
    console.error('Error creating movie:', error);
    res.status(500).json({ error: 'Failed to create movie' });
  }
});


// ============================================================
// PUT /api/movies/:id/vote
// Upvote or downvote a movie.
// Request body: { "vote": "up" } or { "vote": "down" }
// ============================================================
app.put('/api/movies/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { vote } = req.body;

    // Validate vote value
    if (!vote || (vote !== 'up' && vote !== 'down')) {
      return res.status(400).json({ error: 'Invalid vote. Use "up" or "down".' });
    }

    // Determine which field to increment
    const field = vote === 'up' ? 'upvotes' : 'downvotes';

    const params = {
      TableName: TABLE_NAME,
      Key: { movieId: id },
      UpdateExpression: `SET ${field} = ${field} + :val`,
      ExpressionAttributeValues: { ':val': 1 },
      ReturnValues: 'ALL_NEW'
    };

    const data = await docClient.update(params).promise();

    if (!data.Attributes) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    res.status(200).json(data.Attributes);
  } catch (error) {
    console.error('Error voting:', error);
    res.status(500).json({ error: 'Failed to register vote' });
  }
});


// ─── Catch-all: serve index.html for any other route ───
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ─── Start Server ───
app.listen(PORT, () => {
  console.log(`Movie Recommendation Board running on port ${PORT}`);
  console.log(`Frontend: http://localhost:${PORT}`);
  console.log(`API:      http://localhost:${PORT}/api/movies`);
});
