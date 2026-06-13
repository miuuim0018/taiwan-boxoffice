"""電影片種分類：TMDB 類型 + 中文片名關鍵字（輸出：動作片、動畫片…）。"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE_PATH = ROOT / "data" / "bar_race_genres.json"

# TMDB genre_id → 中文片種（取第一個符合的優先類型）
TMDB_GENRE_ZH: dict[int, str] = {
    16: "動畫片",
    878: "科幻片",
    28: "動作片",
    27: "恐怖片",
    35: "喜劇片",
    10749: "愛情片",
    53: "驚悚片",
    9648: "懸疑片",
    14: "奇幻片",
    12: "冒險片",
    18: "劇情片",
    10752: "戰爭片",
    99: "紀錄片",
    36: "歷史片",
    10402: "音樂片",
    80: "犯罪片",
    10751: "家庭片",
    37: "西部片",
}

GENRE_PRIORITY = (
    16, 878, 28, 27, 35, 10749, 53, 9648, 14, 12, 10752, 99, 36, 10402, 80, 10751, 18, 37
)

# 關鍵字規則（順序重要：動畫優先於動作）
KEYWORD_RULES: list[tuple[str, str]] = [
    ("動畫片", r"動畫|ANIME|卡通|Disney|迪士尼|Pixar|皮克斯|吉卜力|宮崎|龙猫|龍貓|柯南|鬼滅|火影|海賊|七龍珠|寶可夢|Pokemon|蜡笔|蠟筆|名偵探|灌籃|SPY.?FAMILY|間諜家家酒|你的名字|天氣之子|鈴芽|咒術|鏈鋸|進擊|巨人|刀塔|聲之形|魔雪|冰雪|玩具總動員|動物方城市|魔髮|尋找|NEMO|海底總動員|優獸|小黃人|Minions|史瑞克|夢工廠"),
    ("紀錄片", r"紀錄|纪录片|Documentary|IMAX.?Nature"),
    ("恐怖片", r"恐怖|驚悚|厉|厲|咒|鬼|僵|屍|尸|招魂|紅衣|咒怨|驚聲|Anabelle|Conjuring|Horror|潘朵拉|粽|筷|哭|魅|凶|兇|魔傀|飛頭"),
    ("科幻片", r"科幻|星際|Star.?Wars|星球|銀河|Galaxy|阿凡達|Avatar|Matrix|駭客|黑客|異形|Alien|Predator|沙丘|Transformer|變形金剛|Transformers|Marvel|復仇者|Iron.?Man|鋼鐵|队长|隊長|Ant.?Man|蟻人|Guardians|银河护卫|銀河護衛|Independence|明日|太空|Star.?Trek|瓦力|WALL.?E"),
    ("動作片", r"動作|特攻|特工|諜|Mission.?Impossible|Fast.?Furious|速度|玩命|John.?Wick|叶问|葉問|猛龍|追緝|追擊|戰狼|叶问|殺手|Kick.?Ass|Kingsman|金牌|特務|007|Bond|Expendables|浴血|極限|突擊|重案|飛車|拳|戰|對決|決戰|Mission|Tom.?Cruise"),
    ("喜劇片", r"喜劇|搞笑|Comedy|死侍|Deadpool|熊貨|疯狂|瘋狂|歡樂|開心|笨|囧|王.*牌|宿醉|Party|單身|相亲|相親"),
    ("愛情片", r"愛情|戀|恋|Love|Romance|真愛|伴侶|婚|嫁|娶|情|520|比悲傷|悲傷"),
    ("懸疑片", r"懸疑|謎|偵探|侦探|追兇|追凶|調查|调查|解碼|罪|嫌疑|凶手|兇手|目擊|消失|失蹤|失踪|說謊|谎言|謊言|無聲|誰先|殺"),
    ("戰爭片", r"戰爭|敦克|Dunkirk|钢锯|鋼鋸|800|坦克|Normandy|硫磺|Pearl|珍珠港|1917|拯救大兵"),
    ("奇幻片", r"奇幻|Fantasy|魔法|Harry.?Potter|哈利|魔戒|Lord.?of.?the.?Rings|霍比特|Hobbit|神奇|Fantastic|纳尼亚|納尼亞|仙境"),
    ("劇情片", r"劇情|Drama|人生|故事|物語|記|傳|歲月|時光|家族|母|父|女|男|我們|你|的|記憶"),
]

DEFAULT_GENRE = "劇情片"


def parse_label(name: str) -> tuple[str, int | None]:
    m = re.match(r"^(.+?)\s*\((\d{4})\)\s*$", name)
    if m:
        return m.group(1).strip(), int(m.group(2))
    return name.strip(), None


def classify_by_keywords(title: str) -> str:
    for genre, pattern in KEYWORD_RULES:
        if re.search(pattern, title, re.IGNORECASE):
            return genre
    return DEFAULT_GENRE


def pick_tmdb_genre(genre_ids: list[int]) -> str:
    ids = set(genre_ids or [])
    for gid in GENRE_PRIORITY:
        if gid in ids:
            return TMDB_GENRE_ZH.get(gid, DEFAULT_GENRE)
    return DEFAULT_GENRE


def load_cache() -> dict[str, str]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict[str, str]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def resolve_genre(label: str, api_key: str | None, cache: dict[str, str]) -> str:
    if label in cache:
        return cache[label]

    title, year = parse_label(label)
    genre = classify_by_keywords(title)

    if api_key:
        try:
            from scripts.enrich_bar_race_posters import TITLE_OVERRIDES
            from scripts.scrape_tmdb import search_movie

            queries = []
            if title in TITLE_OVERRIDES:
                queries.append(TITLE_OVERRIDES[title])
            queries.append(title)
            short = re.split(r"[:：]", title)[0].strip()
            if short and short not in queries:
                queries.append(short)

            for q in queries:
                hit = search_movie(q, api_key, year)
                if hit and hit.get("genre_ids"):
                    genre = pick_tmdb_genre(hit["genre_ids"])
                    break
                time.sleep(0.12)
        except Exception:
            pass

    cache[label] = genre
    return genre


def build_genre_map(labels: set[str], api_key: str | None = None, use_tmdb: bool = False) -> dict[str, str]:
    cache = load_cache()
    todo = sorted(l for l in labels if l not in cache)
    if todo:
        print(f"[genre] 待分類 {len(todo)} / 共 {len(labels)} 部（快取 {len(cache)}）")
    tmdb_key = api_key if use_tmdb else None
    for i, label in enumerate(todo, 1):
        resolve_genre(label, tmdb_key, cache)
        if i % 200 == 0 or i == len(todo):
            save_cache(cache)
            print(f"  [genre] {i}/{len(todo)}")
    save_cache(cache)
    return {label: cache.get(label, DEFAULT_GENRE) for label in labels}


def apply_genres_to_weekly(weekly: dict[str, list[dict]], genre_map: dict[str, str]) -> None:
    from scripts.fetch_boxoffice_official import movie_label

    for rows in weekly.values():
        for row in rows:
            label = movie_label(row["name"], row.get("release", ""))
            row["genre"] = genre_map.get(label, classify_by_keywords(row["name"]))
