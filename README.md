# GastroScout AI – Restaurant Finder

## Backend (terminal 1)
```
cd backend
python -m venv venv
venv\Scripts\activate            (Windows)   |   source venv/bin/activate  (mac/linux)
pip install -r requirements.txt
copy .env.example .env           (then edit .env and paste your NEW Google key)
uvicorn main:app --reload --port 8000
```
Check: http://127.0.0.1:8000/api/health  ->  {"ok": true, "key_configured": true}

## Frontend (terminal 2)
```
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

Never put the API key in source code and never put files (like main.py) inside the venv folder.

## Deploy for free
1. Push to GitHub (the .gitignore keeps .env, venv and node_modules out - never commit your key).
2. Backend -> Render (free web service, uses render.yaml). Set env vars GOOGLE_PLACES_API_KEY and ALLOWED_ORIGINS.
3. Frontend -> Vercel (Root Directory: frontend). Set env var VITE_API_URL to your Render URL.
4. Put the final Vercel URL into ALLOWED_ORIGINS on Render, and cap your Google quota.
