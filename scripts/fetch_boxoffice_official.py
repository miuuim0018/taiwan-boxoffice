"""從政府開放資料下載官方每週票房，產生 Bar Chart Race 真實資料。"""

from __future__ import annotations

import csv
import io
import json
import re
import time
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "boxoffice_weekly"
USER_WEEK_DIR = ROOT / "data" / "week"
WEEKLY_DIRS = (RAW_DIR, USER_WEEK_DIR)
RAW_JSON = ROOT / "data" / "boxoffice_raw.json"
RAW_JSON_ALT = ROOT / "data" / "databoxoffice_raw.json"
# 注意：此 URL 下載的是「2016至今累計總榜」快照，不是每週時間序列。
TFAI_SNAPSHOT_URL = "https://boxofficetw.tfai.org.tw/OpenData/statistic/since2016"
TFAI_WEEKLY_ARCHIVE = "https://www.tfai.org.tw/zh/boxOffice/weekly"
OUT_JSON = ROOT / "bar_chart_race" / "data.json"
OUT_JS = ROOT / "bar_chart_race" / "data.js"
DATASET_PAGE = "https://data.gov.tw/dataset/94224"
PHATE_INDEX = "https://phate334.github.io/box-office-tw/json/"
PHATE_OPENDATA_INDEX = "https://phate334.github.io/box-office-tw/source/opendata/"

# 柔和色盤（依排名輪替）
COLORS = [
    "#78d8b3", "#76cfd0", "#a8d8ea", "#f7c59f", "#c9b8e8", "#b5e8a8",
    "#ffe08a", "#f5b8c8", "#d4c4a8", "#9ec5e8", "#e8a8a8", "#b8e0d2",
]
EMOJI = ["🎬", "🍿", "🎞️", "📽️", "🌟", "🏆", "🎭", "🎪", "✨", "🔥", "💫", "🎥"]


def parse_ntd(raw) -> int:
    """解析票房金額（新台幣元）；避免 650836998.0 被誤讀成 6508369980。"""
    if raw is None:
        return 0
    if isinstance(raw, (int, float)):
        return int(raw)
    s = str(raw).strip().replace(",", "")
    if not s:
        return 0
    try:
        return int(float(s))
    except ValueError:
        return int(re.sub(r"[^\d]", "", s) or "0")


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Mozilla/5.0",
            "Accept": "*/*",
            "Referer": "https://data.gov.tw/",
        }
    )
    return s


def discover_csv_urls(sess: requests.Session) -> dict[str, str]:
    """week_key -> csv url。優先 Phate334 索引，再補 data.gov.tw 頁面連結。"""
    mapping: dict[str, str] = {}

    try:
        idx = sess.get(PHATE_OPENDATA_INDEX, timeout=60)
        idx.raise_for_status()
        for week, info in json.loads(idx.text).items():
            if isinstance(info, dict) and info.get("csv"):
                mapping[week] = info["csv"]
    except Exception as exc:
        print(f"[WARN] Phate334 opendata 索引失敗: {exc}")

    try:
        html = sess.get(DATASET_PAGE, timeout=60).text
        for url in set(re.findall(r"https://opendata\.culture\.tw/upload/[^\s\"']+\.csv", html)):
            # 從檔名或鄰近文字推 week key 較困難；保留 URL 供去重合併
            mapping.setdefault(url.rsplit("/", 1)[-1], url)
    except Exception as exc:
        print(f"[WARN] data.gov.tw 頁面解析失敗: {exc}")

    # 若 Phate334 json 週次有對應 opendata csv
    try:
        weeks = sess.get(PHATE_INDEX, timeout=60).json()
        od = sess.get(PHATE_OPENDATA_INDEX, timeout=60).json()
        for week in weeks:
            if week in od and od[week].get("csv"):
                mapping[week] = od[week]["csv"]
    except Exception:
        pass

    # 只保留 week_key 格式 YYYYMMDD-YYYYMMDD
    cleaned: dict[str, str] = {}
    for k, v in mapping.items():
        if re.fullmatch(r"\d{8}-\d{8}", k):
            cleaned[k] = v
        elif v.startswith("http"):
            # 無法對應週次則略過
            continue
    return dict(sorted(cleaned.items()))


def parse_week_csv(text: str) -> list[dict]:
    text = text.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        if not row:
            continue
        # 欄位名稱可能略有差異
        name = (
            row.get("電影名稱")
            or row.get("中文片名")
            or row.get("片名")
            or ""
        ).strip()
        if not name:
            continue
        release = (row.get("上映日期") or "").strip()
        total_raw = (
            row.get("累計銷售金額")
            or row.get("累計金額")
            or row.get("totalAmounts")
            or "0"
        )
        week_raw = row.get("銷售金額") or row.get("Amounts") or row.get("amounts") or "0"
        ticket_raw = row.get("銷售票數") or row.get("售票數") or row.get("Tickets") or row.get("tickets") or "0"
        country_raw = row.get("國別地區") or row.get("Country") or ""
        rows.append(
            _parse_week_row_fields(name, release, total_raw, country_raw, week_raw, ticket_raw)
        )
    return rows


def extract_week_key(filename: str) -> str | None:
    """從 TFAI 檔名解析週次 key（YYYYMMDD-YYYYMMDD）。"""
    m = re.search(r"(\d{8}-\d{8})", filename)
    if m:
        return m.group(1)
    # 2019年1230-2020年0105
    m = re.search(r"(\d{4})年(\d{4})-(\d{4})年(\d{4})", filename)
    if m:
        y1, s, y2, e = m.groups()
        return f"{y1}{s}-{y2}{e}"
    # 2018年0820-0826
    m = re.search(r"(\d{4})年(\d{4})-(\d{4})", filename)
    if m:
        y, s, e = m.groups()
        return f"{y}{s}-{y}{e}"
    # 113年1230-114年0105（民國跨年）
    m = re.search(r"(\d{2,3})年(\d{4})-(\d{2,3})年(\d{4})", filename)
    if m:
        r1, s, r2, e = m.groups()
        return f"{int(r1) + 1911}{s}-{int(r2) + 1911}{e}"
    # 112年0710-0716（民國）
    m = re.search(r"(\d{2,3})年(\d{4})-(\d{4})", filename)
    if m:
        r, s, e = m.groups()
        y = int(r) + 1911
        return f"{y}{s}-{y}{e}"
    return None


NAME_COLUMNS = ("中文片名", "電影名稱", "片名", "Name", "name")
RELEASE_COLUMNS = ("上映日期", "ReleaseDate", "releaseDate")
TOTAL_COLUMNS = ("累計銷售金額", "累計金額", "TotalAmounts", "totalAmounts")
COUNTRY_COLUMNS = ("國別地區", "Country", "country")
WEEK_SALE_COLUMNS = ("銷售金額", "Amounts", "amounts", "本週銷售金額")
WEEK_TICKET_COLUMNS = ("銷售票數", "售票數", "Tickets", "tickets", "本週售票數")
WEEK_CHANGE_COLUMNS = ("週票數變動率", "週票房增幅", "WeekChange", "weekChange")
OUT_MONTHLY = ROOT / "bar_chart_race" / "monthly.json"
OUT_INSIGHTS = ROOT / "bar_chart_race" / "insights.json"
OUT_YEARLY_RANKINGS = ROOT / "bar_chart_race" / "yearly_rankings.json"
OUT_ANALYTICS = ROOT / "bar_chart_race" / "analytics.json"
OUT_MARKET = ROOT / "bar_chart_race" / "market.json"
DOMESTIC_COUNTRIES = {"台灣", "中華民國", "中华民国"}


def normalize_country(raw: str) -> str:
    c = (raw or "").strip()
    if c in ("中華民國", "中华民国"):
        return "台灣"
    return c or "未知"


def film_type(country: str) -> str:
    return "本國片" if normalize_country(country) == "台灣" else "外片"


def _row_country(raw) -> str:
    return normalize_country(str(raw or "").strip())


def _parse_week_row_fields(
    name: str,
    release: str,
    total_raw,
    country_raw="",
    week_raw=0,
    ticket_raw=0,
) -> dict:
    country = _row_country(country_raw)
    return {
        "name": name,
        "release": release,
        "total_ntd": parse_ntd(total_raw),
        "week_ntd": parse_ntd(week_raw),
        "week_tickets": parse_ntd(ticket_raw),
        "country": country,
    }


def _xlsx_header_row(path: Path) -> int | None:
    """新版 TFAI xlsx 表頭前常有標題列，需定位含「中文片名」的那一行。"""
    import pandas as pd

    preview = pd.read_excel(path, header=None, nrows=15)
    for i in range(len(preview)):
        cells = {str(v).strip() for v in preview.iloc[i].values if pd.notna(v)}
        if cells.intersection(NAME_COLUMNS):
            return i
    return None


def _looks_like_percent(raw) -> bool:
    return raw is not None and "%" in str(raw).strip()


def _week_sale_raw(row, df) -> object:
    """本週銷售金額；少數 xlsx 的「銷售金額」與「週票數變動率」內容對調。"""
    import pandas as pd

    week_raw = None
    for col in WEEK_SALE_COLUMNS:
        if col in df.columns and pd.notna(row.get(col)):
            week_raw = row[col]
            break
    if week_raw is not None and _looks_like_percent(week_raw):
        for col in WEEK_CHANGE_COLUMNS:
            if col in df.columns and pd.notna(row.get(col)):
                alt = row[col]
                if not _looks_like_percent(alt):
                    return alt
    return week_raw if week_raw is not None else 0


def parse_week_xlsx(path: Path) -> list[dict]:
    import pandas as pd

    header_row = _xlsx_header_row(path)
    df = pd.read_excel(path, header=header_row if header_row is not None else 0)
    df.columns = [str(c).strip() for c in df.columns]
    rows = []
    for _, row in df.iterrows():
        name = ""
        for col in NAME_COLUMNS:
            if col in df.columns and pd.notna(row.get(col)):
                name = str(row[col]).strip()
                break
        if not name or name == "nan":
            continue
        release = ""
        for col in RELEASE_COLUMNS:
            if col in df.columns and pd.notna(row.get(col)):
                release = str(row[col])[:10].replace("-", "/")
                break
        total_raw = 0
        for col in TOTAL_COLUMNS:
            if col in df.columns and pd.notna(row.get(col)):
                total_raw = row[col]
                break
        week_raw = _week_sale_raw(row, df)
        ticket_raw = 0
        for col in WEEK_TICKET_COLUMNS:
            if col in df.columns and pd.notna(row.get(col)):
                ticket_raw = row[col]
                break
        if not ticket_raw and len(df.columns) >= 9:
            val = row.iloc[7]
            if pd.notna(val):
                ticket_raw = val
        country_raw = ""
        for col in COUNTRY_COLUMNS:
            if col in df.columns and pd.notna(row.get(col)):
                country_raw = row[col]
                break
        rows.append(
            _parse_week_row_fields(name, release, total_raw, country_raw, week_raw, ticket_raw)
        )
    return rows


def parse_week_file(path: Path) -> list[dict]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return parse_week_csv(path.read_text(encoding="utf-8-sig"))
    if suffix in (".xlsx", ".xls"):
        return parse_week_xlsx(path)
    return []


def load_local_weekly_dirs() -> dict[str, list[dict]] | None:
    """讀取 data/week/ 與 data/boxoffice_weekly/ 內的每週檔。"""
    weekly: dict[str, list[dict]] = {}
    used_dirs: list[str] = []
    for folder in WEEKLY_DIRS:
        if not folder.is_dir():
            continue
        count_before = len(weekly)
        for path in sorted(folder.iterdir()):
            if not path.is_file():
                continue
            week_key = extract_week_key(path.name)
            if not week_key:
                continue
            try:
                rows = parse_week_file(path)
            except Exception as exc:
                print(f"[WARN] 略過 {path.name}: {exc}")
                continue
            if rows:
                weekly[week_key] = rows
        if len(weekly) > count_before:
            used_dirs.append(folder.name)
    if weekly:
        dirs = "、".join(used_dirs)
        print(f"      讀取本機每週檔 {len(weekly)} 週（data/{dirs}/）")
    return weekly or None


def week_end_date(week_key: str) -> str:
    end = week_key.split("-")[1]
    return datetime.strptime(end, "%Y%m%d").strftime("%Y/%m/%d")


def movie_label(name: str, release: str) -> str:
    year = ""
    if release:
        try:
            year = str(datetime.strptime(release.replace("-", "/"), "%Y/%m/%d").year)
        except ValueError:
            m = re.search(r"(20\d{2})", release)
            year = m.group(1) if m else ""
    return f"{name} ({year})" if year else name


def _frame_item(name: str, row: dict, idx: int) -> dict:
    country = row.get("country", "未知")
    return {
        "name": movie_label(name, row.get("release", "")),
        "value": round(row["total_ntd"] / 10_000),
        "avatar": EMOJI[idx % len(EMOJI)],
        "color": COLORS[idx % len(COLORS)],
        "country": country if country != "未知" else "",
        "genre": row.get("genre", "劇情片"),
    }


def build_frames(weekly: dict[str, list[dict]], pool_size: int = 80) -> list[dict]:
    """每週一幀：當週院線在映電影，依該週累計票房排名（單位：萬元）。"""
    style_idx: dict[str, int] = {}
    frames = []

    for week_key in sorted(weekly.keys()):
        items = []
        for row in weekly[week_key]:
            ntd = row["total_ntd"]
            if ntd <= 0:
                continue
            name = row["name"]
            if name not in style_idx:
                style_idx[name] = len(style_idx)
            idx = style_idx[name]
            items.append(_frame_item(name, row, idx))

        ranked = sorted(items, key=lambda x: x["value"], reverse=True)[:pool_size]
        total_wan = sum(x["value"] for x in ranked[:50])

        frames.append(
            {
                "date": week_end_date(week_key),
                "week": week_key,
                "total": total_wan,
                "items": ranked,
            }
        )

    return frames


def download_weekly(sess: requests.Session, week_urls: dict[str, str]) -> dict[str, list[dict]]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    weekly: dict[str, list[dict]] = {}
    for i, (week, url) in enumerate(week_urls.items()):
        cache = RAW_DIR / f"{week}.csv"
        if cache.exists():
            text = cache.read_text(encoding="utf-8-sig")
        else:
            try:
                r = sess.get(url, timeout=60)
                r.raise_for_status()
                text = r.content.decode("utf-8-sig", errors="replace")
                cache.write_text(text, encoding="utf-8")
            except Exception as exc:
                print(f"[SKIP] {week}: {exc}")
                continue
            time.sleep(0.15)
        rows = parse_week_csv(text)
        if rows:
            weekly[week] = rows
        if (i + 1) % 20 == 0:
            print(f"  已處理 {i + 1}/{len(week_urls)} 週…")
    return weekly


def parse_since2016_payload(payload: dict) -> dict[str, list[dict]]:
    """TFAI since2016 JSON → week_key → rows。"""
    by_week: dict[str, list[dict]] = defaultdict(list)
    for row in payload.get("List", []):
        stat_date = row.get("StatisticsDate") or row.get("Date") or row.get("WeekEnd")
        if not stat_date:
            continue
        if isinstance(stat_date, str) and "T" in stat_date:
            dt = datetime.fromisoformat(stat_date.replace("Z", "+00:00").replace("+00:00", ""))
        else:
            dt = datetime.strptime(str(stat_date)[:10], "%Y-%m-%d")
        week_end = dt.strftime("%Y%m%d")
        week_start = (dt - timedelta(days=6)).strftime("%Y%m%d")
        week_key = f"{week_start}-{week_end}"
        name = (row.get("Name") or row.get("name") or "").strip()
        if not name:
            continue
        release = row.get("ReleaseDate") or row.get("releaseDate") or ""
        total_raw = row.get("TotalAmounts") or row.get("totalAmounts") or 0
        total = parse_ntd(total_raw)
        by_week[week_key].append(
            {"name": name, "release": str(release)[:10].replace("-", "/"), "total_ntd": total}
        )
    return dict(by_week)


def find_raw_json_path() -> Path | None:
    for path in (RAW_JSON, RAW_JSON_ALT):
        if path.exists():
            return path
    return None


def is_weekly_payload(payload: dict) -> bool:
    rows = payload.get("List") or []
    if not rows:
        return False
    sample = rows[0]
    return bool(sample.get("StatisticsDate") or sample.get("Date") or sample.get("WeekEnd"))


def load_raw_json_payload() -> tuple[Path, dict] | None:
    path = find_raw_json_path()
    if not path:
        return None
    try:
        return path, json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[WARN] 無法解析 {path}: {exc}")
        return None


def load_since2016_local() -> dict[str, list[dict]] | None:
    """讀取含 StatisticsDate 的每週 JSON（非「2016至今」快照）。"""
    loaded = load_raw_json_payload()
    if not loaded:
        return None
    path, payload = loaded
    if not is_weekly_payload(payload):
        return None
    weekly = parse_since2016_payload(payload)
    if weekly:
        print(f"      使用本機每週 JSON {path.name}（{len(weekly)} 週）")
    return weekly or None


def _parse_release_date(raw: str) -> datetime | None:
    if not raw:
        return None
    s = str(raw).strip()[:10].replace("/", "-")
    try:
        return datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        return None


def load_snapshot_payload() -> dict | None:
    """讀取 since2016 總榜快照 JSON（非每週序列）。"""
    loaded = load_raw_json_payload()
    if not loaded:
        return None
    _, payload = loaded
    if is_weekly_payload(payload):
        return None
    return payload


def build_alltime_frames(
    weekly: dict[str, list[dict]],
    snapshot: dict | None = None,
    pool_size: int = 80,
) -> tuple[list[dict], str, str]:
    """每週一幀：各片歷史最高累計票房總榜（單位：萬元）。

    2016 以前已下映的片，以 since2016 快照在首週前預載；
    之後依每週官方累計更新，取歷史最大值。
    """
    if not weekly:
        return [], "", ""

    style_idx: dict[str, int] = {}
    lifetime: dict[str, int] = {}
    release_map: dict[str, str] = {}
    country_map: dict[str, str] = {}
    genre_map: dict[str, str] = {}

    week_keys = sorted(weekly.keys())
    first_end = datetime.strptime(week_keys[0].split("-")[1], "%Y%m%d")
    snap_start = ""
    snap_end = ""

    if snapshot:
        snap_start_raw = str(snapshot.get("Start") or "")[:10]
        snap_end_raw = str(snapshot.get("End") or "")[:10]
        if snap_start_raw:
            snap_start = snap_start_raw.replace("-", "/")
        if snap_end_raw:
            snap_end = datetime.strptime(snap_end_raw, "%Y-%m-%d").strftime("%Y/%m/%d")

        for row in snapshot.get("List", []):
            name = (row.get("Name") or "").strip()
            if not name:
                continue
            release_dt = _parse_release_date(row.get("ReleaseDate") or "")
            if not release_dt or release_dt > first_end:
                continue
            total = parse_ntd(row.get("TotalAmounts"))
            if total <= 0:
                continue
            lifetime[name] = max(lifetime.get(name, 0), total)
            release_map[name] = release_dt.strftime("%Y/%m/%d")
            country_map[name] = normalize_country(row.get("Country") or "")

    frames: list[dict] = []
    for week_key in week_keys:
        for row in weekly[week_key]:
            name = row["name"]
            ntd = row["total_ntd"]
            if ntd <= 0:
                continue
            lifetime[name] = max(lifetime.get(name, 0), ntd)
            if row.get("release"):
                release_map[name] = row["release"]
            if row.get("country") and row["country"] != "未知":
                country_map[name] = row["country"]
            if row.get("genre"):
                genre_map[name] = row["genre"]

        items = []
        for name, ntd in lifetime.items():
            if ntd <= 0:
                continue
            if name not in style_idx:
                style_idx[name] = len(style_idx)
            idx = style_idx[name]
            country = country_map.get(name, "")
            items.append(
                {
                    "name": movie_label(name, release_map.get(name, "")),
                    "value": round(ntd / 10_000),
                    "avatar": EMOJI[idx % len(EMOJI)],
                    "color": COLORS[idx % len(COLORS)],
                    "country": country,
                    "genre": genre_map.get(name, "劇情片"),
                }
            )

        ranked = sorted(items, key=lambda x: x["value"], reverse=True)[:pool_size]
        total_wan = sum(x["value"] for x in ranked[:50])
        frames.append(
            {
                "date": week_end_date(week_key),
                "week": week_key,
                "total": total_wan,
                "items": ranked,
            }
        )

    start = snap_start or (frames[0]["date"] if frames else "")
    end = snap_end or (frames[-1]["date"] if frames else "")
    return frames, start, end


def collect_meta(weekly: dict[str, list[dict]], frames: list[dict]) -> dict:
    countries: set[str] = set()
    genres: set[str] = set()
    for frame in frames:
        for item in frame.get("items", []):
            c = (item.get("country") or "").strip()
            if c and c != "未知":
                countries.add(c)
            g = (item.get("genre") or "").strip()
            if g:
                genres.add(g)
    years = sorted({f["date"][:4] for f in frames if f.get("date")})
    genre_order = [
        "動畫片", "動作片", "科幻片", "喜劇片", "愛情片", "恐怖片",
        "懸疑片", "驚悚片", "奇幻片", "冒險片", "劇情片", "戰爭片",
        "紀錄片", "歷史片", "音樂片", "犯罪片", "家庭片", "西部片",
    ]
    sorted_genres = [g for g in genre_order if g in genres]
    sorted_genres.extend(sorted(genres - set(sorted_genres)))
    return {
        "years": years,
        "countries": sorted(countries),
        "genres": sorted_genres,
    }


def build_monthly_data(weekly: dict[str, list[dict]], top_n: int = 20) -> dict:
    """依週次終點日期歸月，加總各片「當週銷售金額」。"""
    buckets: dict[str, dict[str, dict]] = defaultdict(dict)

    for week_key in sorted(weekly.keys()):
        end = week_key.split("-")[1]
        ym = f"{end[:4]}-{end[4:6]}"
        for row in weekly[week_key]:
            wntd = row.get("week_ntd", 0)
            wtix = row.get("week_tickets", 0)
            if wntd <= 0 and wtix <= 0:
                continue
            label = movie_label(row["name"], row.get("release", ""))
            slot = buckets[ym].setdefault(
                label,
                {
                    "name": label,
                    "week_ntd": 0,
                    "week_tickets": 0,
                    "country": row.get("country", "") if row.get("country") != "未知" else "",
                    "genre": row.get("genre", "劇情片"),
                },
            )
            slot["week_ntd"] += wntd
            slot["week_tickets"] += wtix

    result: dict = {}
    for ym in sorted(buckets.keys()):
        year, month = ym.split("-")
        items = []
        for slot in buckets[ym].values():
            items.append(
                {
                    "name": slot["name"],
                    "value": round(slot["week_ntd"] / 10_000),
                    "tickets": int(slot["week_tickets"]),
                    "country": slot["country"],
                    "genre": slot["genre"],
                }
            )
        all_items = sorted(items, key=lambda x: x["value"], reverse=True)
        ranked = all_items[:top_n]
        by_country: dict[str, int] = defaultdict(int)
        for item in all_items:
            c = (item.get("country") or "").strip() or "其他"
            by_country[c] += item["value"]
        by_country_list = [
            {"country": k, "value": v}
            for k, v in sorted(by_country.items(), key=lambda x: -x[1])
        ]
        by_country_movies: dict[str, list] = defaultdict(list)
        for item in all_items:
            c = (item.get("country") or "").strip() or "其他"
            by_country_movies[c].append(item)
        by_country_movies_sorted = {
            k: sorted(v, key=lambda x: x["value"], reverse=True)
            for k, v in by_country_movies.items()
        }
        result.setdefault(year, {})[month] = {
            "label": f"{year}年{int(month)}月",
            "total": sum(x["value"] for x in all_items),
            "items": ranked,
            "byCountry": by_country_list,
            "byCountryMovies": by_country_movies_sorted,
        }
    return result


def build_yearly_champions(weekly: dict[str, list[dict]]) -> dict:
    """各年度票房冠軍：全年、各片種、各國別最高單片。"""
    year_buckets: dict[str, dict[str, dict]] = defaultdict(dict)

    for week_key in sorted(weekly.keys()):
        end = week_key.split("-")[1]
        year = end[:4]
        for row in weekly[week_key]:
            wntd = row.get("week_ntd", 0)
            if wntd <= 0:
                continue
            label = movie_label(row["name"], row.get("release", ""))
            slot = year_buckets[year].setdefault(
                label,
                {
                    "name": label,
                    "week_ntd": 0,
                    "country": row.get("country", "") if row.get("country") != "未知" else "",
                    "genre": row.get("genre", "劇情片"),
                },
            )
            slot["week_ntd"] += wntd

    champions: dict = {}
    for year in sorted(year_buckets.keys()):
        movies = []
        for slot in year_buckets[year].values():
            movies.append(
                {
                    "name": slot["name"],
                    "value": round(slot["week_ntd"] / 10_000),
                    "country": slot["country"],
                    "genre": slot["genre"],
                }
            )
        if not movies:
            continue
        movies.sort(key=lambda x: x["value"], reverse=True)
        overall = movies[0]

        by_genre: dict[str, dict] = {}
        for m in movies:
            g = m.get("genre") or "劇情片"
            if g not in by_genre or m["value"] > by_genre[g]["value"]:
                by_genre[g] = m

        by_country: dict[str, dict] = {}
        for m in movies:
            c = (m.get("country") or "").strip() or "其他"
            if c not in by_country or m["value"] > by_country[c]["value"]:
                by_country[c] = m

        champions[year] = {
            "overall": overall,
            "byGenre": dict(sorted(by_genre.items(), key=lambda x: -x[1]["value"])),
            "byCountry": dict(sorted(by_country.items(), key=lambda x: -x[1]["value"])),
        }
    return champions


def _max_streak(champions: list[str]) -> dict[str, int]:
    """連續週冠的最長週數。"""
    best: dict[str, int] = {}
    if not champions:
        return best
    current = champions[0]
    length = 1
    for champ in champions[1:]:
        if champ == current:
            length += 1
        else:
            best[current] = max(best.get(current, 0), length)
            current = champ
            length = 1
    best[current] = max(best.get(current, 0), length)
    return best


def build_yearly_rankings(weekly: dict[str, list[dict]]) -> dict:
    """各年度多維度排行：票房、在映週數、蟬聯週冠、週冠次數。"""
    year_weeks: dict[str, list[list[dict]]] = defaultdict(list)

    for week_key in sorted(weekly.keys()):
        end = week_key.split("-")[1]
        year = end[:4]
        year_weeks[year].append(weekly[week_key])

    countries: set[str] = set()
    genres: set[str] = set()
    by_year: dict[str, list[dict]] = {}

    for year in sorted(year_weeks.keys()):
        movie_stats: dict[str, dict] = {}
        weekly_champions: list[str] = []

        for rows in year_weeks[year]:
            week_best: str | None = None
            week_best_val = -1

            for row in rows:
                wntd = row.get("week_ntd", 0)
                wtix = row.get("week_tickets", 0)
                if wntd <= 0 and wtix <= 0:
                    continue

                label = movie_label(row["name"], row.get("release", ""))
                country = row.get("country", "") if row.get("country") != "未知" else ""
                genre = row.get("genre", "劇情片")

                slot = movie_stats.setdefault(
                    label,
                    {
                        "name": label,
                        "value": 0,
                        "tickets": 0,
                        "weeks": 0,
                        "country": country,
                        "genre": genre,
                    },
                )
                slot["value"] += round(wntd / 10_000)
                slot["tickets"] += int(wtix)
                slot["weeks"] += 1
                if country:
                    slot["country"] = country
                slot["genre"] = genre

                if wntd > week_best_val:
                    week_best_val = wntd
                    week_best = label

            if week_best:
                weekly_champions.append(week_best)

        streak_map = _max_streak(weekly_champions)
        crown_counts: dict[str, int] = defaultdict(int)
        for champ in weekly_champions:
            crown_counts[champ] += 1

        items = []
        for slot in movie_stats.values():
            if slot["country"]:
                countries.add(slot["country"])
            if slot["genre"]:
                genres.add(slot["genre"])
            items.append(
                {
                    **slot,
                    "streak": streak_map.get(slot["name"], 0),
                    "crownWeeks": crown_counts.get(slot["name"], 0),
                }
            )
        by_year[year] = items

    sorted_genres = [g for g in GENRE_ORDER if g in genres]
    sorted_genres.extend(sorted(genres - set(sorted_genres)))

    return {
        "valueSuffix": " 萬",
        "years": sorted(by_year.keys()),
        "meta": {
            "countries": sorted(countries),
            "genres": sorted_genres,
        },
        "movies": by_year,
    }


def export_yearly_rankings(data: dict) -> None:
    OUT_YEARLY_RANKINGS.parent.mkdir(parents=True, exist_ok=True)
    OUT_YEARLY_RANKINGS.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


GENRE_ORDER = [
    "動畫片", "動作片", "科幻片", "喜劇片", "愛情片", "恐怖片",
    "懸疑片", "驚悚片", "奇幻片", "冒險片", "劇情片", "戰爭片",
    "紀錄片", "歷史片", "音樂片", "犯罪片", "家庭片", "西部片",
]


def is_domestic(country: str) -> bool:
    return normalize_country(country) == "台灣"


def _empty_period_bucket() -> dict:
    return {
        "domestic_ntd": 0,
        "foreign_ntd": 0,
        "domestic_tix": 0,
        "foreign_tix": 0,
        "genres_ntd": defaultdict(int),
        "genres_tix": defaultdict(int),
        "movies": defaultdict(lambda: {"week_ntd": 0, "week_tickets": 0, "country": "", "genre": ""}),
    }


def _merge_period_buckets(buckets: list[dict]) -> dict:
    merged = _empty_period_bucket()
    for bucket in buckets:
        merged["domestic_ntd"] += bucket["domestic_ntd"]
        merged["foreign_ntd"] += bucket["foreign_ntd"]
        merged["domestic_tix"] += bucket["domestic_tix"]
        merged["foreign_tix"] += bucket["foreign_tix"]
        for g, v in bucket["genres_ntd"].items():
            merged["genres_ntd"][g] += v
        for g, v in bucket["genres_tix"].items():
            merged["genres_tix"][g] += v
        for name, slot in bucket["movies"].items():
            ms = merged["movies"][name]
            ms["week_ntd"] += slot["week_ntd"]
            ms["week_tickets"] += slot["week_tickets"]
            if slot.get("country"):
                ms["country"] = slot["country"]
            if slot.get("genre"):
                ms["genre"] = slot["genre"]
    return merged


def _finalize_period_bucket(bucket: dict, top_n: int = 10) -> dict:
    total_ntd = bucket["domestic_ntd"] + bucket["foreign_ntd"]
    total_tix = bucket["domestic_tix"] + bucket["foreign_tix"]
    genres_ntd = dict(bucket["genres_ntd"])
    genres_tix = dict(bucket["genres_tix"])
    by_genre_share = {
        g: round(v / total_ntd, 4) if total_ntd else 0
        for g, v in sorted(genres_ntd.items(), key=lambda x: -x[1])
    }
    movies = []
    for name, slot in bucket["movies"].items():
        if slot["week_ntd"] <= 0 and slot["week_tickets"] <= 0:
            continue
        movies.append(
            {
                "name": name,
                "value": round(slot["week_ntd"] / 10_000),
                "tickets": int(slot["week_tickets"]),
                "country": slot["country"],
                "genre": slot["genre"],
            }
        )
    movies.sort(key=lambda x: x["value"], reverse=True)

    by_country_ntd: dict[str, int] = defaultdict(int)
    by_country_tix: dict[str, int] = defaultdict(int)
    rep_by_country: dict[str, dict] = {}
    for name, slot in bucket["movies"].items():
        if slot["week_ntd"] <= 0 and slot["week_tickets"] <= 0:
            continue
        c = (slot["country"] or "").strip() or "其他"
        by_country_ntd[c] += slot["week_ntd"]
        by_country_tix[c] += slot["week_tickets"]
        val = round(slot["week_ntd"] / 10_000)
        rep = rep_by_country.get(c)
        if not rep or val > rep["value"]:
            rep_by_country[c] = {
                "name": name,
                "value": val,
                "tickets": int(slot["week_tickets"]),
                "genre": slot["genre"],
            }

    by_country_list = []
    for c, ntd in sorted(by_country_ntd.items(), key=lambda x: -x[1]):
        total_val = round(ntd / 10_000)
        rep = rep_by_country.get(c) or {}
        by_country_list.append(
            {
                "country": c,
                "value": total_val,
                "tickets": int(by_country_tix[c]),
                "share": round(ntd / total_ntd, 4) if total_ntd else 0,
                "rep": {
                    "name": rep.get("name", ""),
                    "value": rep.get("value", 0),
                    "tickets": rep.get("tickets", 0),
                    "genre": rep.get("genre", ""),
                }
                if rep.get("name")
                else None,
            }
        )

    return {
        "totalValue": round(total_ntd / 10_000),
        "totalTickets": int(total_tix),
        "domesticValue": round(bucket["domestic_ntd"] / 10_000),
        "foreignValue": round(bucket["foreign_ntd"] / 10_000),
        "domesticTickets": int(bucket["domestic_tix"]),
        "foreignTickets": int(bucket["foreign_tix"]),
        "domesticShare": round(bucket["domestic_ntd"] / total_ntd, 4) if total_ntd else 0,
        "domesticTicketsShare": round(bucket["domestic_tix"] / total_tix, 4) if total_tix else 0,
        "byGenre": {g: round(v / 10_000) for g, v in genres_ntd.items()},
        "byGenreShare": by_genre_share,
        "byCountry": by_country_list,
        "top": movies[:top_n],
    }


def _accumulate_row(bucket: dict, row: dict, label: str) -> None:
    wntd = row.get("week_ntd", 0)
    wtix = row.get("week_tickets", 0)
    if wntd <= 0 and wtix <= 0:
        return
    country = row.get("country", "")
    genre = row.get("genre", "劇情片")
    if is_domestic(country):
        bucket["domestic_ntd"] += wntd
        bucket["domestic_tix"] += wtix
    else:
        bucket["foreign_ntd"] += wntd
        bucket["foreign_tix"] += wtix
    bucket["genres_ntd"][genre] += wntd
    bucket["genres_tix"][genre] += wtix
    slot = bucket["movies"][label]
    slot["week_ntd"] += wntd
    slot["week_tickets"] += wtix
    slot["country"] = country if country != "未知" else slot["country"]
    slot["genre"] = genre


def build_analytics_data(weekly: dict[str, list[dict]]) -> dict:
    """深度分析：單片週次序列、國片占比、片種熱度、檔期專題。"""
    from scripts.classify_film_genre import apply_genres_to_weekly, build_genre_map
    from scripts.scrape_tmdb import _api_key

    labels = {
        movie_label(row["name"], row.get("release", ""))
        for rows in weekly.values()
        for row in rows
    }
    apply_genres_to_weekly(weekly, build_genre_map(labels, _api_key(), use_tmdb=False))

    week_dates: list[str] = []
    movies: dict[str, dict] = {}
    monthly_raw: dict[str, dict] = defaultdict(_empty_period_bucket)
    yearly_raw: dict[str, dict] = defaultdict(_empty_period_bucket)
    spring_raw: dict[str, dict] = defaultdict(_empty_period_bucket)
    summer_raw: dict[str, dict] = defaultdict(_empty_period_bucket)

    for week_idx, week_key in enumerate(sorted(weekly.keys())):
        end = week_key.split("-")[1]
        date = week_end_date(week_key)
        week_dates.append(date)
        year = end[:4]
        month = int(end[4:6])
        ym = f"{year}-{end[4:6]}"
        is_spring = month in (1, 2)
        is_summer = month in (7, 8)

        for row in weekly[week_key]:
            wntd = row.get("week_ntd", 0)
            wtix = row.get("week_tickets", 0)
            total_ntd = row.get("total_ntd", 0)
            if wntd <= 0 and wtix <= 0 and total_ntd <= 0:
                continue

            label = movie_label(row["name"], row.get("release", ""))
            country = row.get("country", "")
            genre = row.get("genre", "劇情片")

            if label not in movies:
                movies[label] = {
                    "c": country if country != "未知" else "",
                    "g": genre,
                    "s": [],
                }
            meta = movies[label]
            if country and country != "未知":
                meta["c"] = country
            meta["g"] = genre
            meta["s"].append(
                [
                    week_idx,
                    round(wntd / 10_000),
                    round(total_ntd / 10_000),
                    int(wtix),
                    date,
                ]
            )

            if wntd > 0 or wtix > 0:
                _accumulate_row(monthly_raw[ym], row, label)
                _accumulate_row(yearly_raw[year], row, label)
                if is_spring:
                    _accumulate_row(spring_raw[year], row, label)
                if is_summer:
                    _accumulate_row(summer_raw[year], row, label)

    monthly_trends = []
    for ym in sorted(monthly_raw.keys()):
        y, m = ym.split("-")
        monthly_trends.append(
            {"month": ym, "label": f"{y}年{int(m)}月", **_finalize_period_bucket(monthly_raw[ym])}
        )

    yearly_trends = []
    for year in sorted(yearly_raw.keys()):
        yearly_trends.append(
            {"year": year, "label": f"{year} 年", **_finalize_period_bucket(yearly_raw[year])}
        )

    spring_seasons = []
    for year in sorted(spring_raw.keys()):
        spring_seasons.append(
            {
                "year": year,
                "label": f"{year} 春節檔",
                "period": "1–2 月週次加總（近似春節賀歲檔）",
                **_finalize_period_bucket(spring_raw[year], top_n=12),
            }
        )

    summer_seasons = []
    for year in sorted(summer_raw.keys()):
        summer_seasons.append(
            {
                "year": year,
                "label": f"{year} 暑假檔",
                "period": "7–8 月週次加總",
                **_finalize_period_bucket(summer_raw[year], top_n=12),
            }
        )

    season_all: dict[str, dict | None] = {"spring": None, "summer": None}
    if spring_raw:
        ys = sorted(spring_raw.keys())
        season_all["spring"] = {
            "year": "all",
            "label": f"{ys[0]}–{ys[-1]} 歷年春節檔",
            "period": "各年度 1–2 月週次加總合併",
            **_finalize_period_bucket(_merge_period_buckets(list(spring_raw.values())), top_n=15),
        }
    if summer_raw:
        ys = sorted(summer_raw.keys())
        season_all["summer"] = {
            "year": "all",
            "label": f"{ys[0]}–{ys[-1]} 歷年暑假檔",
            "period": "各年度 7–8 月週次加總合併",
            **_finalize_period_bucket(_merge_period_buckets(list(summer_raw.values())), top_n=15),
        }

    genres_seen: set[str] = set()
    countries_seen: set[str] = set()
    for bucket in list(monthly_raw.values()) + list(yearly_raw.values()):
        genres_seen.update(bucket["genres_ntd"].keys())
    genre_order = [g for g in GENRE_ORDER if g in genres_seen]
    genre_order.extend(sorted(genres_seen - set(genre_order)))

    for trend in monthly_trends + yearly_trends:
        for row in trend.get("byCountry") or []:
            c = (row.get("country") or "").strip()
            if c:
                countries_seen.add(c)

    return {
        "valueSuffix": " 萬",
        "subtitle": "官方每週票房深度分析（週銷售金額與售票數）",
        "weekDates": week_dates,
        "movieList": sorted(movies.keys()),
        "movies": movies,
        "monthlyTrends": monthly_trends,
        "yearlyTrends": yearly_trends,
        "countries": sorted(countries_seen),
        "seasons": {
            "spring": spring_seasons,
            "summer": summer_seasons,
            "all": season_all,
        },
        "genreOrder": genre_order,
    }


def export_analytics(data: dict) -> None:
    OUT_ANALYTICS.parent.mkdir(parents=True, exist_ok=True)
    OUT_ANALYTICS.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def build_market_trends(weekly: dict[str, list[dict]]) -> dict:
    """全台院線週／月總票房、總售票數、平均票價（元／張）。"""
    weekly_series: list[dict] = []
    monthly_raw: dict[str, dict] = defaultdict(lambda: {"ntd": 0, "tickets": 0})

    for week_key in sorted(weekly.keys()):
        end = week_key.split("-")[1]
        date = week_end_date(week_key)
        ym = f"{end[:4]}-{end[4:6]}"
        total_ntd = 0
        total_tix = 0
        for row in weekly[week_key]:
            total_ntd += row.get("week_ntd", 0)
            total_tix += row.get("week_tickets", 0)
        avg_price = round(total_ntd / total_tix) if total_tix > 0 else None
        weekly_series.append(
            {
                "date": date,
                "totalValue": round(total_ntd / 10_000),
                "totalTickets": int(total_tix),
                "avgPrice": avg_price,
            }
        )
        monthly_raw[ym]["ntd"] += total_ntd
        monthly_raw[ym]["tickets"] += total_tix

    monthly_series: list[dict] = []
    for ym in sorted(monthly_raw.keys()):
        y, m = ym.split("-")
        slot = monthly_raw[ym]
        avg_price = round(slot["ntd"] / slot["tickets"]) if slot["tickets"] > 0 else None
        monthly_series.append(
            {
                "month": ym,
                "label": f"{y}年{int(m)}月",
                "totalValue": round(slot["ntd"] / 10_000),
                "totalTickets": int(slot["tickets"]),
                "avgPrice": avg_price,
            }
        )

    start = weekly_series[0]["date"] if weekly_series else ""
    end = weekly_series[-1]["date"] if weekly_series else ""
    return {
        "valueSuffix": " 萬",
        "subtitle": "全台院線週票房加總（官方銷售金額）",
        "avgPriceNote": "平均票價 = 當期銷售金額 ÷ 售票數（元／張，含各票種加權）",
        "coverage": {
            "start": start,
            "end": end,
            "weeks": len(weekly_series),
            "months": len(monthly_series),
        },
        "weekly": weekly_series,
        "monthly": monthly_series,
    }


def export_market(data: dict) -> None:
    OUT_MARKET.parent.mkdir(parents=True, exist_ok=True)
    OUT_MARKET.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def collect_monthly_meta(months: dict) -> dict:
    countries: set[str] = set()
    genres: set[str] = set()
    for year_obj in months.values():
        for month in year_obj.values():
            for item in month.get("items", []):
                c = (item.get("country") or "").strip()
                if c:
                    countries.add(c)
                g = (item.get("genre") or "").strip()
                if g:
                    genres.add(g)
    sorted_genres = [g for g in GENRE_ORDER if g in genres]
    sorted_genres.extend(sorted(genres - set(sorted_genres)))
    return {"countries": sorted(countries), "genres": sorted_genres}


def export_monthly(data: dict) -> None:
    OUT_MONTHLY.parent.mkdir(parents=True, exist_ok=True)
    OUT_MONTHLY.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def export_insights(data: dict) -> None:
    OUT_INSIGHTS.parent.mkdir(parents=True, exist_ok=True)
    OUT_INSIGHTS.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def build_snapshot_frames(payload: dict, pool_size: int = 80) -> list[dict]:
    """「2016至今票房」快照：單一時間點的歷史累計總榜（非每週動畫）。"""
    end_raw = str(payload.get("End") or "")[:10]
    end_date = (
        datetime.strptime(end_raw, "%Y-%m-%d").strftime("%Y/%m/%d") if end_raw else ""
    )
    style_idx: dict[str, int] = {}
    items = []
    for row in payload.get("List", []):
        name = (row.get("Name") or "").strip()
        if not name:
            continue
        total = parse_ntd(row.get("TotalAmounts"))
        if total <= 0:
            continue
        release = str(row.get("ReleaseDate") or "")[:10].replace("-", "/")
        if name not in style_idx:
            style_idx[name] = len(style_idx)
        idx = style_idx[name]
        items.append(
            {
                "name": movie_label(name, release),
                "value": round(total / 10_000),
                "avatar": EMOJI[idx % len(EMOJI)],
                "color": COLORS[idx % len(COLORS)],
            }
        )
    ranked = sorted(items, key=lambda x: x["value"], reverse=True)[:pool_size]
    return [
        {
            "date": end_date,
            "total": sum(x["value"] for x in ranked[:50]),
            "items": ranked,
        }
    ]


def load_snapshot_frames() -> tuple[list[dict], str, str] | None:
    payload = load_snapshot_payload()
    if not payload:
        return None
    frames = build_snapshot_frames(payload)
    if not frames:
        return None
    start = str(payload.get("Start") or "")[:10].replace("-", "/")
    end = frames[0]["date"]
    print(
        f"      讀取「2016至今」快照 {find_raw_json_path().name}（"
        f"{len(payload.get('List', []))} 部 → Top {len(frames[0]['items'])}）"
    )
    return frames, start, end


def try_fetch_since2016(sess: requests.Session) -> dict[str, list[dict]] | None:
    """嘗試一次下載 since2016 全量 JSON（若環境可連線）。"""
    try:
        r = sess.get(TFAI_SNAPSHOT_URL, timeout=180)
        if r.status_code != 200 or r.text.strip().startswith("<!"):
            return None
        weekly = parse_since2016_payload(r.json())
        if weekly:
            RAW_JSON.parent.mkdir(parents=True, exist_ok=True)
            RAW_JSON.write_text(r.text, encoding="utf-8")
            print(f"      已快取至 {RAW_JSON}")
        return weekly or None
    except Exception as exc:
        print(f"[INFO] since2016 線上下載失敗: {exc}")
        return None


def load_official_weekly(sess: requests.Session | None = None) -> dict[str, list[dict]]:
    """官方每週票房：本機 week 資料夾 → 每週 JSON → 線上 → CSV 鏡像。"""
    sess = sess or _session()

    weekly = load_local_weekly_dirs()
    if weekly:
        return weekly

    weekly = load_since2016_local()
    if weekly:
        return weekly

    print("      嘗試 TFAI since2016 全量 JSON…")
    weekly = try_fetch_since2016(sess)
    if weekly:
        return weekly

    print("      改從 culture.tw 逐週下載 CSV（約 2018/08–2020/06）…")
    week_urls = discover_csv_urls(sess)
    print(f"      找到 {len(week_urls)} 週 CSV")
    weekly = download_weekly(sess, week_urls)
    if not weekly:
        raise SystemExit(
            "無法取得官方每週票房資料。\n"
            "注意：「2016至今票房」下載的 JSON 是累計總榜快照，無法做每週動畫。\n"
            "每週動畫需含 StatisticsDate 的每週 JSON，或先使用內建 CSV（2018–2020）。"
        )
    return weekly


def export(data: dict) -> None:
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_JS.write_text(
        "window.BCR_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )


def main() -> None:
    print("[1/2] 載入官方每週票房…")
    weekly = load_official_weekly()

    print(f"[2/2] 產生 Bar Chart Race（{len(weekly)} 週）…")
    frames = build_frames(weekly)
    start = frames[0]["date"] if frames else ""
    end = frames[-1]["date"] if frames else ""

    payload = {
        "defaultMode": "boxoffice",
        "valueSuffix": " 萬",
        "source": "國家電影及視聽文化中心｜政府資料開放平臺 dataset/94224",
        "sourceUrl": "https://data.gov.tw/dataset/94224",
        "modes": {
            "boxoffice": {
                "label": "台灣累計票房（官方）",
                "title": f"【{start[:4]}–{end[:4]}】台灣電影 官方累計票房排行榜",
                "subtitle": "全國院線累計票房總計（萬元）",
                "frames": frames,
            },
        },
    }
    export(payload)
    print(f"[OK] {OUT_JSON}（{len(frames)} 週）")
    print(f"[OK] {OUT_JS}")


if __name__ == "__main__":
    main()
