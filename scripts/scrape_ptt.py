"""從 PTT 電影版擷取指定電影相關文章與推文。"""

from __future__ import annotations

import json
import re
import time
from urllib.parse import quote, urljoin

import requests
from bs4 import BeautifulSoup

from scripts.config import (
    DATA_FILES,
    MAX_ARTICLES_PER_MOVIE,
    MAX_COMMENTS_PER_MOVIE,
    MOVIES,
    PTT_BASE,
    PTT_BOARD,
    REQUEST_DELAY_SEC,
)


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "zh-TW,zh;q=0.9",
        }
    )
    s.cookies.set("over18", "1", domain=".ptt.cc")
    return s


def _clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"※ 發信站.*", "", text)
    return text.strip()


def search_articles(session: requests.Session, keyword: str, limit: int = 20) -> list[dict]:
    url = f"{PTT_BASE}/bbs/{PTT_BOARD}/search?q={quote(keyword)}"
    resp = session.get(url, timeout=30)
    resp.encoding = "utf-8"
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    articles = []
    for ent in soup.select("div.r-ent"):
        title_a = ent.select_one(".title a")
        if not title_a or not title_a.get("href"):
            continue
        href = title_a["href"]
        if not href.startswith("/bbs/"):
            continue
        articles.append(
            {
                "title": title_a.get_text(strip=True),
                "url": urljoin(PTT_BASE, href),
            }
        )
        if len(articles) >= limit:
            break
    return articles


def fetch_article_comments(session: requests.Session, url: str) -> dict:
    resp = session.get(url, timeout=30)
    resp.encoding = "utf-8"
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    main = soup.select_one("#main-content")
    main_text = _clean_text(main.get_text("\n")) if main else ""

    comments = []
    if main_text:
        comments.append({"type": "article", "tag": "文", "text": main_text[:2000]})

    for push in soup.select("div.push"):
        tag_el = push.select_one(".push-tag")
        content_el = push.select_one(".push-content")
        if not content_el:
            continue
        tag = tag_el.get_text(strip=True) if tag_el else "→"
        text = _clean_text(content_el.get_text())
        if len(text) < 2:
            continue
        comments.append({"type": "push", "tag": tag, "text": text})

    return {"url": url, "comments": comments}


def scrape_movie(session: requests.Session, movie: dict) -> dict:
    seen_urls: set[str] = set()
    article_list: list[dict] = []
    all_comments: list[dict] = []

    for keyword in movie["keywords"]:
        if len(article_list) >= MAX_ARTICLES_PER_MOVIE:
            break
        try:
            found = search_articles(session, keyword, limit=MAX_ARTICLES_PER_MOVIE * 2)
        except requests.RequestException as exc:
            print(f"  [警告] 搜尋「{keyword}」失敗：{exc}")
            continue

        for art in found:
            if art["url"] in seen_urls:
                continue
            seen_urls.add(art["url"])
            time.sleep(REQUEST_DELAY_SEC)
            try:
                detail = fetch_article_comments(session, art["url"])
            except requests.RequestException as exc:
                print(f"  [警告] 讀取文章失敗：{exc}")
                continue

            article_list.append({**art, "comment_count": len(detail["comments"])})
            for c in detail["comments"]:
                all_comments.append({**c, "source_url": art["url"], "source_title": art["title"]})
                if len(all_comments) >= MAX_COMMENTS_PER_MOVIE:
                    break
            if len(article_list) >= MAX_ARTICLES_PER_MOVIE:
                break
            if len(all_comments) >= MAX_COMMENTS_PER_MOVIE:
                break

    return {
        "id": movie["id"],
        "name": movie["name"],
        "keywords": movie["keywords"],
        "articles": article_list,
        "comments": all_comments[:MAX_COMMENTS_PER_MOVIE],
        "total_comments": len(all_comments[:MAX_COMMENTS_PER_MOVIE]),
    }


def scrape_all_movies(movies: list[dict] | None = None) -> list[dict]:
    movies = movies or MOVIES
    DATA_FILES["reviews_dir"].mkdir(parents=True, exist_ok=True)
    session = _session()
    results = []

    for movie in movies:
        print(f"[擷取] {movie['name']} …")
        data = scrape_movie(session, movie)
        out = DATA_FILES["reviews_dir"] / f"{movie['id']}.json"
        out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  → {data['total_comments']} 則留言，{len(data['articles'])} 篇文章")
        results.append(data)
        time.sleep(REQUEST_DELAY_SEC)

    return results


def load_movie_reviews(movie_id: str) -> dict:
    path = DATA_FILES["reviews_dir"] / f"{movie_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"找不到 {path}，請先執行 scrape_all_movies()")
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    scrape_all_movies()
