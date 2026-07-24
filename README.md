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
│   └── public/            # Static frontend files
│       ├── index.html     # Feed page (browse + vote)
│       ├── submit.html    # Submit recommendation page
│       ├── style.css      # Styling
│       ├── script.js      # Feed page JS
│       └── submit.js      # Submit page JS
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
sudo npm install -g pm2
sudo pm2 start server.js
sudo pm2 startup
sudo pm2 save
```

## API Endpoints
- GET  /api/movies         — Fetch all movies (?genre=&sort=top|new)
- POST /api/movies         — Submit a new recommendation
- PUT  /api/movies/:id/vote — Upvote or downvote
