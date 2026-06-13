/**
 * 共用篩選：國別排序與多選 chip
 */
(function (global) {
  /** 台灣觀眾常用國別（依序；其餘依筆畫／字母排在後面） */
  const PRIORITY_COUNTRIES = [
    "台灣",
    "美國",
    "日本",
    "南韓",
    "韓國",
    "香港",
    "中國大陸",
    "法國",
    "英國",
    "德國",
    "泰國",
    "新加坡",
    "馬來西亞",
    "澳洲",
    "加拿大",
    "印度",
    "義大利",
    "西班牙",
    "荷蘭",
    "俄羅斯",
    "墨西哥",
    "巴西",
    "紐西蘭",
    "澳門",
    "菲律賓",
    "越南",
    "印尼",
  ];

  const priorityRank = new Map(PRIORITY_COUNTRIES.map((c, i) => [c, i]));

  function sortCountries(list) {
    const uniq = [...new Set((list || []).filter(Boolean))];
    return uniq.sort((a, b) => {
      const ra = priorityRank.has(a) ? priorityRank.get(a) : 9999;
      const rb = priorityRank.has(b) ? priorityRank.get(b) : 9999;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b, "zh-Hant");
    });
  }

  /** 從資料列收集有出現的國別（已排序、去重） */
  function collectCountries(items, getCountry = (item) => item.country) {
    const set = new Set();
    (items || []).forEach((item) => {
      const c = getCountry(item);
      if (c) set.add(c);
    });
    return sortCountries([...set]);
  }

  /** 從資料列收集有出現的片種（已排序、去重） */
  function collectGenres(items, getGenre = (item) => item.genre) {
    const set = new Set();
    (items || []).forEach((item) => {
      const g = getGenre(item);
      if (g) set.add(g);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }

  function matchesCountries(itemCountry, selected) {
    if (!selected || !selected.size) return true;
    return selected.has(itemCountry);
  }

  function formatCountryFilterNote(selected) {
    if (!selected || !selected.size) return "";
    const names = sortCountries([...selected]);
    if (names.length <= 3) return `（已篩選 ${names.join("、")}）`;
    return `（已篩選 ${names.slice(0, 3).join("、")} 等 ${names.length} 國）`;
  }

  function escapeAttr(text) {
    return String(text).replace(/"/g, "&quot;");
  }

  class CountryMultiSelect {
    constructor(container, options = {}) {
      this.container =
        typeof container === "string" ? document.getElementById(container) : container;
      this.onChange = options.onChange || (() => {});
      this.countries = [];
      this.selected = new Set();
      this._bound = false;
    }

    getSelected() {
      return new Set(this.selected);
    }

    isAll() {
      return this.selected.size === 0;
    }

    setCountries(countries) {
      const sorted = sortCountries(countries);
      this.selected = new Set([...this.selected].filter((c) => sorted.includes(c)));
      this.countries = sorted;
      this.render();
    }

    clear() {
      this.selected.clear();
      this.render();
      this.onChange(this.getSelected());
    }

    render() {
      if (!this.container) return;

      const allActive = this.selected.size === 0 ? " bcr-filter-preset-btn--active" : "";
      const hint = this.selected.size
        ? `<span class="bcr-multi-filter-hint">已選 ${this.selected.size} 國</span>`
        : `<span class="bcr-multi-filter-hint bcr-multi-filter-hint--muted">未選＝全部國別</span>`;

      this.container.innerHTML = `
        <div class="bcr-multi-filter">
          <div class="bcr-multi-filter-head">
            <button type="button" class="bcr-filter-preset-btn${allActive}" data-action="all">全部</button>
            ${hint}
          </div>
          <div class="bcr-multi-filter-chips" role="group" aria-label="國別多選">
            ${this.countries
              .map((c) => {
                const active = this.selected.has(c) ? " bcr-filter-chip--active" : "";
                return `<button type="button" class="bcr-filter-chip${active}" data-country="${escapeAttr(c)}">${c}</button>`;
              })
              .join("")}
          </div>
        </div>`;

      if (!this._bound) {
        this.container.addEventListener("click", (e) => this._onClick(e));
        this._bound = true;
      }
    }

    _onClick(e) {
      const btn = e.target.closest("button");
      if (!btn || !this.container.contains(btn)) return;

      if (btn.dataset.action === "all") {
        this.clear();
        return;
      }

      const country = btn.dataset.country;
      if (!country) return;

      if (this.selected.has(country)) {
        this.selected.delete(country);
      } else {
        this.selected.add(country);
      }
      this.render();
      this.onChange(this.getSelected());
    }
  }

  global.BCR_FILTER = {
    PRIORITY_COUNTRIES,
    sortCountries,
    collectCountries,
    collectGenres,
    matchesCountries,
    formatCountryFilterNote,
    CountryMultiSelect,
  };
})(typeof window !== "undefined" ? window : globalThis);
