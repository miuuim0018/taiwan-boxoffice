"""產生台灣電影二十年累計票房 Bar Chart Race 資料（僅上映後才入榜）。"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "bar_chart_race" / "data.json"

# lifetime：台灣累計票房終值（萬元，約略參考公開報導）
# run_days：院線主要售票期（之後累計持平）
FILMS = [
    {"name": "變形金剛", "year": 2007, "release": "2007-07-03", "lifetime": 6800, "run_days": 45, "avatar": "🤖", "color": "#9ec5e8"},
    {"name": "海角七號", "year": 2008, "release": "2008-08-22", "lifetime": 52300, "run_days": 140, "avatar": "🏖️", "color": "#78d8b3"},
    {"name": "阿凡達", "year": 2009, "release": "2009-12-18", "lifetime": 15800, "run_days": 90, "avatar": "🌿", "color": "#76cfd0"},
    {"name": "神隱少女", "year": 2011, "release": "2011-07-14", "lifetime": 7200, "run_days": 50, "avatar": "👧", "color": "#c9b8e8"},
    {"name": "復仇者聯盟", "year": 2012, "release": "2012-05-04", "lifetime": 11800, "run_days": 55, "avatar": "🦸", "color": "#e8a8a8"},
    {"name": "少年Pi的奇幻漂流", "year": 2012, "release": "2012-11-21", "lifetime": 8500, "run_days": 50, "avatar": "🐯", "color": "#a8d8ea"},
    {"name": "玩命關頭7", "year": 2015, "release": "2015-04-10", "lifetime": 13200, "run_days": 50, "avatar": "🏎️", "color": "#f7c59f"},
    {"name": "侏羅紀世界", "year": 2015, "release": "2015-06-11", "lifetime": 12500, "run_days": 55, "avatar": "🦖", "color": "#b5e8a8"},
    {"name": "動物方城市", "year": 2016, "release": "2016-03-04", "lifetime": 10800, "run_days": 60, "avatar": "🐰", "color": "#ffe08a"},
    {"name": "美女與野獸", "year": 2017, "release": "2017-03-16", "lifetime": 9800, "run_days": 55, "avatar": "🌹", "color": "#f5b8c8"},
    {"name": "復仇者聯盟3：無限之戰", "year": 2018, "release": "2018-04-25", "lifetime": 19800, "run_days": 55, "avatar": "💎", "color": "#d4c4a8"},
    {"name": "復仇者聯盟：終局之戰", "year": 2019, "release": "2019-04-24", "lifetime": 42800, "run_days": 60, "avatar": "⚡", "color": "#e8c9a8"},
    {"name": "冰雪奇緣2", "year": 2019, "release": "2019-11-21", "lifetime": 12600, "run_days": 55, "avatar": "❄️", "color": "#b8e0d2"},
    {"name": "鬼滅之刃 無限列車篇", "year": 2020, "release": "2020-10-30", "lifetime": 23500, "run_days": 65, "avatar": "🔥", "color": "#88d4b8"},
    {"name": "蜘蛛人：無家日", "year": 2021, "release": "2021-12-15", "lifetime": 15600, "run_days": 50, "avatar": "🕷️", "color": "#8ec8e0"},
    {"name": "捍衛戰士：獨行俠", "year": 2022, "release": "2022-05-25", "lifetime": 14200, "run_days": 55, "avatar": "✈️", "color": "#7eb8d4"},
    {"name": "媽的多重宇宙", "year": 2022, "release": "2022-04-22", "lifetime": 6200, "run_days": 45, "avatar": "🥯", "color": "#c4a8e8"},
    {"name": "灌籃高手 THE FIRST", "year": 2023, "release": "2023-01-13", "lifetime": 19200, "run_days": 60, "avatar": "🏀", "color": "#a8c8e8"},
    {"name": "周處除三害", "year": 2023, "release": "2023-03-10", "lifetime": 9100, "run_days": 50, "avatar": "🐷", "color": "#78d8b3"},
    {"name": "奧本海默", "year": 2023, "release": "2023-07-19", "lifetime": 7800, "run_days": 45, "avatar": "💣", "color": "#b8e0d2"},
    {"name": "鬼滅之刃 無限城篇", "year": 2024, "release": "2024-11-08", "lifetime": 28500, "run_days": 60, "avatar": "⚔️", "color": "#76cfd0"},
    {"name": "死侍與金鋼狼", "year": 2024, "release": "2024-07-24", "lifetime": 12400, "run_days": 50, "avatar": "🦹", "color": "#f7c59f"},
    {"name": "沙丘：第二部分", "year": 2024, "release": "2024-02-28", "lifetime": 5800, "run_days": 40, "avatar": "🏜️", "color": "#d4c4a8"},
    {"name": "美國隊長：無畏新世界", "year": 2025, "release": "2025-02-12", "lifetime": 8900, "run_days": 45, "avatar": "🛡️", "color": "#9ec5e8"},
    {"name": "不可能的任務：最終清算", "year": 2025, "release": "2025-05-21", "lifetime": 7600, "run_days": 45, "avatar": "🕶️", "color": "#a8d8ea"},
    {"name": "賽德克·巴萊", "year": 2011, "release": "2011-09-09", "lifetime": 8800, "run_days": 55, "avatar": "🏹", "color": "#c4e8b8"},
    {"name": "那些年，我們一起追的女孩", "year": 2011, "release": "2011-08-19", "lifetime": 4200, "run_days": 45, "avatar": "📚", "color": "#e8c4d8"},
    {"name": "星際大戰：原力覺醒", "year": 2015, "release": "2015-12-17", "lifetime": 11200, "run_days": 50, "avatar": "🚀", "color": "#9eb8e8"},
    {"name": "你的名字", "year": 2016, "release": "2016-12-02", "lifetime": 10500, "run_days": 55, "avatar": "☄️", "color": "#b8d4f0"},
    {"name": "與神同行", "year": 2017, "release": "2017-12-22", "lifetime": 18600, "run_days": 60, "avatar": "⚖️", "color": "#d8c4a8"},
    {"name": "阿拉丁", "year": 2019, "release": "2019-05-22", "lifetime": 7200, "run_days": 45, "avatar": "🧞", "color": "#f0d878"},
    {"name": "小美人魚", "year": 2023, "release": "2023-05-24", "lifetime": 4100, "run_days": 40, "avatar": "🧜", "color": "#88c8e8"},
]


def _parse_date(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%d")


def _cumulative(film: dict, day: datetime) -> int | None:
    """上映前回傳 None（不入榜）；上映後依售票曲線累積至終值。"""
    release = _parse_date(film["release"])
    if day < release:
        return None

    elapsed = (day - release).days
    lifetime = film["lifetime"]
    run = film["run_days"]

    if elapsed >= run:
        return lifetime

    # 前快後慢，模擬院線票房走勢
    t = elapsed / run
    curve = 1 - (1 - t) ** 2.4
    return max(1, int(lifetime * curve))


def _month_ends(start_year: int, end_year: int) -> list[datetime]:
    dates: list[datetime] = []
    for y in range(start_year, end_year + 1):
        for m in range(1, 13):
            if m == 12:
                nxt = datetime(y + 1, 1, 1)
            else:
                nxt = datetime(y, m + 1, 1)
            dates.append(nxt - __import__("datetime").timedelta(days=1))
    return dates


def generate() -> dict:
    frames = []
    for day in _month_ends(2006, 2025):
        items = []
        for f in FILMS:
            val = _cumulative(f, day)
            if val is None:
                continue
            items.append(
                {
                    "name": f"{f['name']} ({f['year']})",
                    "value": val,
                    "avatar": f["avatar"],
                    "color": f["color"],
                }
            )
        total = sum(i["value"] for i in items)
        frames.append(
            {
                "date": day.strftime("%Y/%m/%d"),
                "total": total,
                "items": items,
            }
        )

    return {
        "defaultMode": "boxoffice",
        "valueSuffix": " 萬",
        "modes": {
            "boxoffice": {
                "label": "台灣累計票房",
                "title": "【2006–2025】二十年 台灣電影 累計票房排行榜",
                "subtitle": "當月累計票房總計（萬元）",
                "frames": frames,
            },
        },
    }


def main() -> None:
    data = generate()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    js_out = OUT.parent / "data.js"
    js_out.write_text(
        "window.BCR_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    n = len(data["modes"]["boxoffice"]["frames"])
    sample = data["modes"]["boxoffice"]["frames"][0]
    print(f"[OK] {OUT}（{n} 個月 × {len(sample['items'])} 部已上映）")
    print(f"[OK] {js_out}")


if __name__ == "__main__":
    main()
