import json
import urllib.request
from pathlib import Path

url = "https://boxofficetw.tfai.org.tw/OpenData/statistic/since2016"
req = urllib.request.Request(
    url,
    headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://data.gov.tw/",
        "Accept": "application/json,text/plain,*/*",
    },
)
out = Path(__file__).resolve().parent.parent / "data" / "boxoffice_raw.json"
with urllib.request.urlopen(req, timeout=180) as r:
    raw = r.read()
out.write_bytes(raw)
data = json.loads(raw)
print("saved", out, "bytes", len(raw))
print("records", len(data["List"]))
print("sample", json.dumps(data["List"][0], ensure_ascii=False)[:400])
