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

  /** 歷年合併：同片名跨年度在映時加總票房（避免殘餘週次變成假低票房點） */
  function mergeMoviesByName(movies) {
    const map = new Map();
    (movies || []).forEach((m) => {
      const key = m.name;
      if (!key) return;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { ...m });
        return;
      }
      prev.value = (prev.value || 0) + (m.value || 0);
      prev.tickets = (prev.tickets || 0) + (m.tickets || 0);
      prev.weeks = (prev.weeks || 0) + (m.weeks || 0);
      prev.streak = Math.max(prev.streak || 0, m.streak || 0);
      prev.crownWeeks = Math.max(prev.crownWeeks || 0, m.crownWeeks || 0);
      if ((m.value || 0) >= (prev._peakValue || 0)) {
        prev.country = m.country || prev.country;
        prev.genre = m.genre || prev.genre;
        prev._peakValue = m.value || 0;
      }
    });
    return [...map.values()].map(({ _peakValue, ...rest }) => rest);
  }

  const WAN_PER_YI = 10000;

  /** 票房顯示：≥1 億（10000 萬）改為「X 億」 */
  function formatBoxOffice(valueInWan) {
    const n = Number(valueInWan);
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= WAN_PER_YI) {
      const yi = n / WAN_PER_YI;
      if (yi >= 100) return `${Math.round(yi).toLocaleString()} 億`;
      const digits = yi >= 10 ? 1 : 2;
      const text = yi.toFixed(digits).replace(/\.?0+$/, "");
      return `${text} 億`;
    }
    return `${Math.round(n).toLocaleString()} 萬`;
  }

  /** 圖表座標軸用（較短） */
  function formatBoxOfficeAxis(valueInWan) {
    const n = Number(valueInWan);
    if (!Number.isFinite(n)) return "";
    if (Math.abs(n) >= WAN_PER_YI) {
      const yi = n / WAN_PER_YI;
      if (yi >= 10) return `${Math.round(yi)}億`;
      return `${yi.toFixed(1).replace(/\.0$/, "")}億`;
    }
    if (n >= 1000) return `${Math.round(n / 1000)}千萬`;
    return String(Math.round(n));
  }

  function escapeAttr(text) {
    return String(text).replace(/"/g, "&quot;");
  }

  /** 主要列顯示常用國別，其餘收在「更多國家」 */
  function splitCountriesForDisplay(countries, maxPrimary = 8) {
    const sorted = sortCountries(countries);
    const primaryNames = new Set();
    const primary = [];

    for (const c of PRIORITY_COUNTRIES) {
      if (sorted.includes(c) && primary.length < maxPrimary) {
        primary.push(c);
        primaryNames.add(c);
      }
    }
    for (const c of sorted) {
      if (primary.length >= maxPrimary) break;
      if (!primaryNames.has(c)) {
        primary.push(c);
        primaryNames.add(c);
      }
    }

    const more = sorted.filter((c) => !primaryNames.has(c));
    return { primary, more };
  }

  class CountryMultiSelect {
    constructor(container, options = {}) {
      this.container =
        typeof container === "string" ? document.getElementById(container) : container;
      this.onChange = options.onChange || (() => {});
      this.countries = [];
      this.selected = new Set();
      this.moreExpanded = false;
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

      const { primary, more } = splitCountriesForDisplay(this.countries);
      const moreSelected = more.filter((c) => this.selected.has(c)).length;
      if (moreSelected > 0) this.moreExpanded = true;

      const chipHtml = (c) => {
        const active = this.selected.has(c) ? " bcr-filter-chip--active" : "";
        return `<button type="button" class="bcr-filter-chip${active}" data-country="${escapeAttr(c)}">${c}</button>`;
      };

      const moreBtn =
        more.length > 0
          ? `<button type="button" class="bcr-filter-chip bcr-filter-chip--more${
              this.moreExpanded ? " bcr-filter-chip--more-open" : ""
            }${moreSelected ? " bcr-filter-chip--more-selected" : ""}" data-action="toggle-more" aria-expanded="${
              this.moreExpanded ? "true" : "false"
            }">更多國家 (${more.length})${moreSelected ? ` · 已選 ${moreSelected}` : ""}</button>`
          : "";

      const morePanel =
        more.length && this.moreExpanded
          ? `<div class="bcr-multi-filter-more" role="group" aria-label="更多國別">${more
              .map(chipHtml)
              .join("")}</div>`
          : "";

      this.container.innerHTML = `
        <div class="bcr-multi-filter">
          <div class="bcr-multi-filter-head">
            <button type="button" class="bcr-filter-preset-btn${allActive}" data-action="all">全部</button>
            ${hint}
          </div>
          <div class="bcr-multi-filter-chips bcr-multi-filter-chips--primary" role="group" aria-label="常用國別">
            ${primary.map(chipHtml).join("")}
            ${moreBtn}
          </div>
          ${morePanel}
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

      if (btn.dataset.action === "toggle-more") {
        this.moreExpanded = !this.moreExpanded;
        this.render();
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
    splitCountriesForDisplay,
    collectCountries,
    collectGenres,
    matchesCountries,
    formatCountryFilterNote,
    mergeMoviesByName,
    formatBoxOffice,
    formatBoxOfficeAxis,
    CountryMultiSelect,
  };
})(typeof window !== "undefined" ? window : globalThis);
