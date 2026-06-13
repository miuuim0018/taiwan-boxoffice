/**
 * TMDB 評分：排行排序、相關係數、四象限
 */
(function (global) {
  function attachRating(items, movieMeta) {
    return (items || []).map((item) => {
      const meta = movieMeta?.[item.name];
      const rating = meta?.vote_average;
      return {
        ...item,
        rating: rating != null && rating > 0 ? Number(rating) : null,
        voteCount: meta?.vote_count || 0,
      };
    });
  }

  function sortByRating(items, minRating = 0) {
    return [...items]
      .filter((item) => item.rating != null && item.rating >= minRating)
      .sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return (b.value || 0) - (a.value || 0);
      });
  }

  function pearsonR(points) {
    const n = points.length;
    if (n < 3) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const mx = xs.reduce((s, v) => s + v, 0) / n;
    const my = ys.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < n; i += 1) {
      const vx = xs[i] - mx;
      const vy = ys[i] - my;
      num += vx * vy;
      dx += vx * vx;
      dy += vy * vy;
    }
    const den = Math.sqrt(dx * dy);
    if (!den) return null;
    return num / den;
  }

  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (!sorted.length) return 0;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function buildScatterPoints(items, movieMeta, minValue = 0, maxValue = 0) {
    return attachRating(items, movieMeta)
      .filter((item) => {
        if (item.rating == null) return false;
        const value = item.value || 0;
        if (minValue > 0 && value < minValue) return false;
        if (maxValue > 0 && value > maxValue) return false;
        return true;
      })
      .map((item) => ({
        name: item.name,
        x: item.value || 0,
        y: item.rating,
        country: item.country || "",
        genre: item.genre || "",
        tickets: item.tickets || 0,
      }));
  }

  function quadrantStats(points) {
    if (!points.length) {
      return { mx: 0, my: 0, counts: {}, highlights: {} };
    }
    const mx = median(points.map((p) => p.x));
    const my = median(points.map((p) => p.y));
    const counts = {
      star: 0,
      hit: 0,
      niche: 0,
      flop: 0,
    };
    const highlights = {
      hit: [],
      niche: [],
    };

    points.forEach((p) => {
      const highBox = p.x >= mx;
      const highRate = p.y >= my;
      if (highBox && highRate) counts.star += 1;
      else if (highBox && !highRate) {
        counts.hit += 1;
        highlights.hit.push(p);
      } else if (!highBox && highRate) {
        counts.niche += 1;
        highlights.niche.push(p);
      } else counts.flop += 1;
    });

    highlights.hit.sort((a, b) => b.x - a.x || a.y - b.y);
    highlights.niche.sort((a, b) => b.y - a.y || b.x - a.x);

    return { mx, my, counts, highlights };
  }

  function interpretCorrelation(r) {
    if (r == null) return "樣本不足，無法計算相關性。";
    const abs = Math.abs(r);
    let strength = "幾乎無";
    if (abs >= 0.7) strength = "強";
    else if (abs >= 0.4) strength = "中等";
    else if (abs >= 0.2) strength = "弱";
    const dir = r > 0 ? "正" : r < 0 ? "負" : "無";
    if (dir === "無") return `樣本間幾乎沒有線性關係（r ≈ 0）。`;
    return `${strength}${dir}相關（r = ${r.toFixed(2)}）：評分越高，票房${r > 0 ? "傾向" : "未必"}越高，但整體${abs < 0.3 ? "關聯不大" : "仍受片種、檔期影響"}。`;
  }

  function shortName(name) {
    return String(name).replace(/\s*\(\d{4}\)\s*$/, "");
  }

  global.BCR_RATING = {
    attachRati