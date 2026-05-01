# PulseDate - Full-Stack Dating App

PulseDate is a social dating platform inspired by classic community-heavy apps with modern features:

- Profile creation (bio, location, interests, dating goals)
- Discover and browse people
- Upload photos and videos to profiles
- Real-time chat (global and per-profile threads)
- Live stream rooms with realtime viewer updates
- Mobile-friendly React UI + Node.js API backend

## Tech Stack

- Frontend: React, Vite, React Router, Axios, Socket.IO client
- Backend: Node.js, Express, Socket.IO, Multer
- Storage: In-memory demo store + local uploaded files

## Project Structure

- `client/` - React frontend
- `server/` - Express + Socket.IO backend
- `server/uploads/` - Uploaded media files

## Run Locally

1. Install dependencies (already done if you used setup commands):

```bash
npm install
npm install --prefix server
npm install --prefix client
```

2. Start backend + frontend together:

```bash
npm run dev
```

3. Open the app:

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000/api/health

## Core API Endpoints

- `GET /api/profiles`
- `POST /api/profiles`
- `GET /api/profiles/:id`
- `POST /api/profiles/:id/media`
- `GET /api/messages?roomId=<id>`
- `POST /api/messages`
- `GET /api/live/rooms`
- `POST /api/live/start`

## Notes

This build is designed as an MVP foundation. For production, the next upgrades are:

- Real auth and user accounts (JWT/OAuth)
- Persistent database (PostgreSQL/MongoDB)
- Cloud media storage + CDN
- Moderation tools and safety systems
- Full WebRTC media streaming server topology
