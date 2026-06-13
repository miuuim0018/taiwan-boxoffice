from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUTPUT_DIR = ROOT / "output"

PTT_BOARD = "Movie"
PTT_BASE = "https://www.ptt.cc"
MAX_ARTICLES_PER_MOVIE = 5
MAX_COMMENTS_PER_MOVIE = 400
REQUEST_DELAY_SEC = 1.2

# 可在此新增想分析的電影
# keywords：PTT 搜尋｜tmdb_id / tmdb_search：TMDB 國際電影資料庫（公信力較高）
MOVIES = [
    {
        "id": "pig_snake_pigeon",
        "name": "周處除三害",
        "keywords": ["周處除三害"],
        "tmdb_id": 1008042,
        "tmdb_search": "The Pig, The Snake and The Pigeon",
    },
    {
        "id": "demon_slayer",
        "name": "鬼滅之刃 無限城篇",
        "keywords": ["鬼滅", "無限城"],
        "tmdb_id": 1311031,
        "tmdb_search": "Demon Slayer Kimetsu no Yaiba Infinity Castle",
    },
    {
        "id": "big_trick",
        "name": "大絕招",
        "keywords": ["大絕招"],
        "tmdb_search": "Big Trick",
    },
    {
        "id": "mission_impossible",
        "name": "不可能的任務：最終清算",
        "keywords": ["不可能的任務", "最終清算"],
        "tmdb_id": 575264,
        "tmdb_search": "Mission Impossible The Final Reckoning",
    },
    {
        "id": "captain_america",
        "name": "美國隊長：無畏新世界",
        "keywords": ["美國隊長", "無畏新世界"],
        "tmdb_id": 822119,
        "tmdb_search": "Captain America Brave New World",
    },
]

STOPWORDS = {
    "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一", "一個",
    "上", "也", "很", "到", "說", "要", "去", "你", "會", "著", "沒有", "看", "好",
    "自己", "這", "那", "嗎", "吧", "啊", "還", "又", "但", "因為", "所以", "如果",
    "可以", "覺得", "真的", "怎麼", "什麼", "這個", "那個", "就是", "不是", "應該",
    "可能", "已經", "一直", "其實", "然後", "而且", "或是", "只是", "這樣", "這部",
    "電影", "片子", "片", "劇情", "角色", "演員", "導演", "場", "版", "ptt", "bbs",
    "movie", "推", "噓", "→", "留言", "文章", "原po", "版主", "八卦", "新聞",
    "http", "https", "com", "www", "tw", "img", "src", "alt", "br", "div", "span",
    "10", "20", "30", "100", "xd", "XDD", "xdd", "XD",
}

POSITIVE_HINTS = {
    "神作", "好看", "推薦", "精彩", "感動", "完美", "優秀", "喜歡", "值得", "爆笑",
    "震撼", "經典", "出色", "厲害", "超棒", "必看", "佳作", "神級", "頂尖", "爽",
}

NEGATIVE_HINTS = {
    "爛", "難看", "失望", "无聊", "無聊", "浪費", "尷尬", "崩壞", "雷", "垃圾",
    "爛片", "踩雷", "後悔", "枯燥", "乏味", "尷", "噓", "差", "糟", "爛尾",
}

DATA_FILES = {
    "reviews_dir": DATA_DIR / "reviews",
    "analysis_dir": DATA_DIR / "analysis",
}
