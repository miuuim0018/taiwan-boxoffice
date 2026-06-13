import json
import re
import requests

s = requests.Session()
s.headers["User-Agent"] = "Mozilla/5.0"

od = s.get("https://phate334.github.io/box-office-tw/source/opendata/", timeout=60).json()
print("phate weeks", len(od))

html = s.get("https://data.gov.tw/dataset/94224", timeout=60).text
urls = sorted(set(re.findall(r"https://opendata\.culture\.tw/upload/[^\s\"']+\.csv", html)))
print("gov page csv", len(urls))

# try metadata API v1
for ep in [
    "https://data.gov.tw/api/v1/dataset/94224",
    "https://data.gov.tw/api/v2/rest/dataset/94224/resource",
]:
    try:
        r = s.get(ep, timeout=30)
        print(ep, r.status_code, len(r.text))
    except Exception as e:
        print(ep, e)
