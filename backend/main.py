import io
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# Always load backend/.env, regardless of the folder uvicorn is started from.
# override=True => the .env file wins over any stale GOOGLE_PLACES_API_KEY
# that may be set in your Windows environment variables.
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"), override=True)

GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY", "").strip()

# Comma-separated list, e.g. ALLOWED_ORIGINS=https://my-app.vercel.app
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

# Protect your Google bill on a public site
RATE_LIMIT_PER_HOUR = int(os.getenv("RATE_LIMIT_PER_HOUR", "35"))   # searches per IP per hour
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "3600"))     # repeat searches are free
_hits: dict = {}
_cache: dict = {}


def check_rate_limit(ip: str):
    now = time.time()
    recent = [t for t in _hits.get(ip, []) if now - t < 3600]
    if len(recent) >= RATE_LIMIT_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many searches from your network. Please try again later.")
    recent.append(now)
    _hits[ip] = recent


app = FastAPI(title="Restaurant Finder API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join([
    "places.displayName",
    "places.formattedAddress",
    "places.rating",
    "places.userRatingCount",
    "places.nationalPhoneNumber",
    "places.websiteUri",
    "places.googleMapsUri",
])
EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")


def scrape_email_from_url(url: str) -> str:
    if not url or url == "N/A":
        return "N/A"
    if not url.startswith("http"):
        url = "https://" + url

    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        response = requests.get(url, headers=headers, timeout=4)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, "html.parser")

            for a in soup.find_all("a", href=True):
                if a["href"].startswith("mailto:"):
                    email = a["href"].replace("mailto:", "").split("?")[0].strip()
                    if "@" in email and len(email) < 50:
                        return email

            for match in EMAIL_RE.findall(soup.get_text()):
                if not match.lower().endswith(IMAGE_EXT):
                    return match.lower()
    except Exception:
        pass
    return "N/A"


def friendly_google_error(status: int, body: dict) -> str:
    """Turn Google's raw error JSON into something readable on screen."""
    err = (body or {}).get("error", {})
    message = err.get("message", "Unknown error from Google Places API")
    reason = next((d.get("reason") for d in err.get("details", []) if d.get("reason")), "")
    text = message.lower()

    if reason == "API_KEY_INVALID" or "api key" in text and ("expired" in text or "not valid" in text):
        return ("Google rejected the API key (invalid or expired). Create a new key, put it in "
                "backend/.env as GOOGLE_PLACES_API_KEY=..., and restart the backend. "
                f"Google said: {message}")
    if "has not been used" in text or "is disabled" in text or reason == "SERVICE_DISABLED":
        return ("'Places API (New)' is not enabled for this Google Cloud project. "
                "Enable it in Google Cloud Console > APIs & Services > Library.")
    if "billing" in text or reason == "BILLING_DISABLED":
        return "Billing is not enabled on the Google Cloud project for this key."
    if status == 403 or reason in ("API_KEY_SERVICE_BLOCKED", "API_KEY_IP_ADDRESS_BLOCKED",
                                   "API_KEY_HTTP_REFERRER_BLOCKED"):
        return ("The key's restrictions are blocking this call. For a backend key use "
                "'None' or 'IP addresses' as application restriction and allow 'Places API (New)'. "
                f"Google said: {message}")
    return f"Google Places API error ({status}): {message}"


@app.get("/api/health")
def health():
    return {"ok": True, "key_configured": bool(GOOGLE_PLACES_API_KEY)}


@app.get("/api/restaurants")
def get_restaurants(request: Request, query: str = Query(..., min_length=2, max_length=100, description="City, pincode or area name")):
    cache_key = query.strip().lower()
    cached = _cache.get(cache_key)
    if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    # Behind Render's proxy the real client IP is the first X-Forwarded-For entry
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else "unknown"))
    check_rate_limit(ip)

    if not GOOGLE_PLACES_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Google Places API key is not configured. Add GOOGLE_PLACES_API_KEY=... to backend/.env and restart.",
        )

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    payload = {"textQuery": f"best restaurants in {query}", "includedType": "restaurant", "pageSize": 20}

    try:
        response = requests.post(PLACES_URL, json=payload, headers=headers, timeout=15)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Google Places API: {exc}")

    if response.status_code != 200:
        try:
            body = response.json()
        except ValueError:
            body = {}
        print("GOOGLE API ERROR RESPONSE:", response.text)  # full detail stays in the terminal
        # 502 = upstream failed. Do not echo Google's 400 back as our own 400.
        raise HTTPException(status_code=502, detail=friendly_google_error(response.status_code, body))

    places = response.json().get("places", [])

    # Scrape websites in parallel (was sequential: up to 20 x 4s = 80s)
    websites = [p.get("websiteUri", "N/A") for p in places]
    with ThreadPoolExecutor(max_workers=10) as pool:
        emails = list(pool.map(scrape_email_from_url, websites))

    results = []
    for place, website, email in zip(places, websites, emails):
        results.append({
            "name": place.get("displayName", {}).get("text", "Unknown Restaurant"),
            "address": place.get("formattedAddress", "N/A"),
            "rating": place.get("rating", "N/A"),
            "reviews_count": place.get("userRatingCount", 0),
            "phone": place.get("nationalPhoneNumber", "N/A"),
            "website": website,
            "email": email,
            "maps_link": place.get("googleMapsUri", "https://maps.google.com"),
        })

    result = {"area": query, "count": len(results), "restaurants": results}
    _cache[cache_key] = (time.time(), result)
    return result


@app.post("/api/export")
def export_excel(payload: dict):
    area = payload.get("area", "restaurants")
    restaurants = payload.get("restaurants", [])

    if not restaurants:
        raise HTTPException(status_code=400, detail="No restaurant data provided for export.")

    df = pd.DataFrame(restaurants).rename(columns={
        "name": "Restaurant Name",
        "address": "Address",
        "rating": "Rating",
        "reviews_count": "Total Reviews",
        "phone": "Phone Number",
        "website": "Website",
        "email": "Email Address",
        "maps_link": "Google Maps Link",
    })

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Restaurants")
    output.seek(0)

    safe_area_name = re.sub(r"[^a-zA-Z0-9]", "_", area)
    filename = f"{safe_area_name}_Restaurants.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
