"""從 TMDB（The Movie Database）擷取電影評論 — 公信力較高的國際電影資料庫。"""

from __future__ import annotations

import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

from scripts.config import MOVIES, REQUEST_DELAY_SEC, ROOT

load_dotenv(ROOT / ".env")

TMDB_API = "https://api.themoviedb.org/3"


def _api_key() -> str | None:
    key = os.getenv("TMDB_API_KEY")
    return key if key and key != "your_api_key_here" else None


def _rating_to_tag(rating: float | None) -> str:
    if rating is None:
        return "→"
    if rating >= 7:
        return "推"
    if rating <= 4:
        return "噓"
    return "→"


def search_movie_id(title: str, api_key: str, year: int | None = None) -> int | None:
    hit = search_movie(title, api_key, year)
    return hit["id"] if hit else None


def _pick_best_result(results: list[dict], year: int | None) -> dict | None:
    if not results:
        return None
    if year:
        for row in results:
            release = (row.get("release_date") or "")[:4]
            if release == str(year):
                return row
        for row in results:
            release = (row.get("release_date") or "")[:4]
            if release.isdigit() and abs(int(release) - year) <= 1:
                return row
    return results[0]


def search_movie(
    title: str, api_key: str, year: int | None = None, language: str = "zh-TW"
) -> dict | None:
    params: dict = {
        "api_key": api_key,
        "query": title,
        "language": language,
        "include_adult": False,
    }
    if year:
        params["year"] = year
    resp = requests.get(f"{TMDB_API}/search/movie", params=params, timeout=30)
    resp.raise_for_status()
    results = resp.json().get("results", [])
    picked = _pick_best_result(results, year)
    if not picked:
        return None
    return {
        "id": int(picked["id"]),
        "poster_path": picked.get("poster_path"),
        "title": picked.get("title") or picked.get("original_title"),
        "genre_ids": picked.get("genre_ids") or [],
    }


def poster_url(poster_path: str | None, size: str = "w154") -> str | None:
    if not poster_path:
        return None
    return f"https://image.tmdb.org/t/p/{size}{poster_path}"


def find_poster_url(title: str, api_key: str, year: int | None = None) -> str | None:
    for lang in ("zh-TW", "en-US"):
        hit = search_movie(title, api_key, year, language=lang)
        if hit:
            url = poster_url(hit.get("poster_path"))
            if url:
                return url
        time.sleep(0.2)
    return None


def find_movie_id(title: str, api_key: str, year: int | None = None) -> int | None:
    for lang in ("zh-TW", "en-US"):
        hit = search_movie(title, api_key, year, language=lang)
        if hit:
            return int(hit["id"])
        time.sleep(0.2)
    return None


def fetch_movie_details(
    movie_id: int, api_key: str, language: str = "zh-TW"
) -> dict | None:
    resp = requests.get(
        f"{TMDB_API}/movie/{movie_id}",
        params={"api_key": api_key, "language": language},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    overview = (data.get("overview") or "").strip()
    if not overview and language != "en-US":
        return fetch_movie_details(movie_id, api_key, language="en-US")
    return {
        "tmdb_id": movie_id,
        "title": data.get("title") or data.get("original_title") or "",
        "overview": overview,
        "vote_average": data.get("vote_average"),
        "vote_count": data.get("vote_count") or 0,
        "release_date": data.get("release_date") or "",
        "runtime": data.get("runtime") or 0,
        "poster": poster_url(data.get("poster_path"), size="w342"),
    }


def fetch_reviews(movie: dict, api_key: str | None = None) -> list[dict]:
    api_key = api_key or _api_key()
    if not api_key:
        return []

    movie_id = movie.get("tmdb_id")
    if not movie_id:
        for q in [movie.get("tmdb_search"), movie["name"], *movie.get("keywords", [])]:
            if not q:
                continue
            movie_id = search_movie_id(q, api_key)
            if movie_id:
                break
            time.sleep(0.5)
    if not movie_id:
        print(f"  [TMDB] 找不到《{movie['name']}》")
        return []

    comments: list[dict] = []
    seen_text: set[str] = set()
    # 中文評論較少，先抓 zh-TW 再補 en-US
    for lang in ("zh-TW", "en-US"):
        page = 1
        while page <= 5:
            resp = requests.get(
                f"{TMDB_API}/movie/{movie_id}/reviews",
                params={"api_key": api_key, "language": lang, "page": page},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            for item in data.get("results", []):
                content = (item.get("content") or "").strip()
                if len(content) < 10 or content in seen_text:
                    continue
                seen_text.add(content)
                rating = (item.get("author_details") or {}).get("rating")
                tag = _rating_to_tag(rating)
                comments.append(
                    {
                        "type": "review",
                        "tag": tag,
                        "text": content[:2000],
                        "source": "tmdb",
                        "source_title": f"TMDB 評論 by {item.get('author', '匿名')}",
                        "source_url": item.get("url", f"https://www.themoviedb.org/movie/{movie_id}"),
                        "rating": rating,
                    }
                )
            if page >= data.get("total_pages", 1):
                break
            page += 1
            time.sleep(REQUEST_DELAY_SEC)
        if len(comments) >= 20:
            break

    print(f"  [TMDB] 《{movie['name']}》→ {len(comments)} 則評論（ID: {movie_id}）")
    return comments


if __name__ == "__main__":
    key = _api_key()
    if not key:
        print("請在 .env 設定 TMDB_API_KEY（免費申請：https://www.themoviedb.org/settings/api）")
    else:
        m = MOVIES[0]
        print(len(fetch_reviews(m, key)), "reviews")
