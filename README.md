# Movie Recommendation Board

A community-driven web application where users recommend movies and TV shows.

## Team
- Pampana Komala Sai Harshavardhan
- Lasya Priya Katkam
- Harshitha Kasu

## Project Structure
```
MovieBoard/
├── backend/
│   ├── server.js          # Express server (frontend + API)
│   ├── package.json       # Dependencies
│   ├── .env.example       # Template for required environment variables
│   ├── test/
│   │   └── server.test.js # Unit tests (Node's built-in test runner)
│   └── public/            # Static frontend files
│       ├── index.html     # Feed page (browse + vote)
│       ├── submit.html    # Submit recommendation page
│       ├── style.css      # Styling
│       ├── script.js      # Feed page JS
│       ├── submit.js      # Submit page JS
│       └── shared-config.js # Genre list + poster validation (shared by frontend and server)
└── README.md
```

## AWS Architecture
- Custom VPC (10.0.0.0/16) in us-east-1
- 2 Public Subnets across us-east-1a and us-east-1b
- Internet Gateway + Route 53
- Application Load Balancer (port 80)
- Auto Scaling Group with EC2 Ubuntu instances
- DynamoDB (Movies table)

## EC2 Setup
```bash
sudo apt update && sudo apt install -y nodejs npm
cd MovieBoard/backend
npm install
```

Create a `.env` file (see `.env.example`) with real values before starting:
```bash
cp .env.example .env
nano .env   # set PORT=3000, AWS_REGION, and a real random SESSION_SECRET
```

Generate a random `SESSION_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the app on an unprivileged port - **no `sudo` needed**, since the
ALB target group (not the app itself) is what listens on port 80 for
visitors:
```bash
npm install -g pm2
pm2 start server.js --name movieboard
pm2 startup
pm2 save
```

**ALB target group:** point it at port `3000` (or whatever `PORT` is
set to) on each instance, with the health check path set to `/health`
instead of `/` - that endpoint actually verifies DynamoDB connectivity,
not just that the Node process is alive.

## Tests
```bash
npm test
```
Runs unit tests (`test/server.test.js`) with Node's built-in test
runner - no extra dependencies required. Covers poster URL validation,
genre validation, cookie signing/verification, the vote rate limiter,
and the client-facing movie data transform. Requires Node 18+.

## API Endpoints
- GET    /api/movies          - Fetch all movies (?genre=&sort=top|new); search is client-side only
- POST   /api/movies          - Submit a new recommendation
- PUT    /api/movies/:id/vote - Upvote or downvote
- DELETE /api/movies/:id      - Delete your own recommendation
- GET    /health              - DynamoDB connectivity check (for the ALB target group)
