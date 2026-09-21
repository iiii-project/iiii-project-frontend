/* =========================================================================
   主要使用者判定

   畫面中可能同時出現多人，系統只認定一位「使用者」：整體占畫面比例最大、
   且最靠近螢幕中央的那個人。其他人的手一律丟掉，不觸發任何手勢、也不影響手部圖。

   限制：MediaPipe Hands 只回傳「手」，不回傳「人」，也不知道哪兩隻手屬於同一個人。
   所以這裡用下面兩個近似：
   1. 人占畫面的比例 ≈ 手的大小（手的 21 個關鍵點外框對角線；人越靠近鏡頭、手越大）。
   2. 同一個人的雙手 ≈ 大小相近、且彼此距離在「幾個手掌」之內的兩隻手。
   人與人貼很近、又大小相近時可能誤判；要更準需要另外跑人體偵測（Pose）。

   每一格畫面呼叫 select(multiHandLandmarks)，回傳「使用者的手」（1 或 2 隻），
   其餘手已被濾掉；回傳的手依畫面 x 座標由小到大排序，讓 [0] 在相鄰影格間指的是同一隻手。
   ========================================================================= */
export function createPrimaryUserSelector(CONFIG) {
  let last = null; // 上一格選定的使用者中心 {x,y}，用來避免兩人差不多大時來回切換

  function measure(lm) {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of lm) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      lm,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      size: Math.hypot(maxX - minX, maxY - minY) || 0.0001,
    };
  }

  function byX(a, b) { return a.cx - b.cx; }

  // 把手分組成「人」：大的先挑，每隻手最多配一隻大小相近、距離最近的手
  function groupIntoPeople(hands) {
    const sorted = hands.slice().sort((a, b) => b.size - a.size);
    const used = new Set();
    const people = [];
    for (const a of sorted) {
      if (used.has(a)) continue;
      used.add(a);
      let best = null;
      let bestDist = Infinity;
      for (const b of sorted) {
        if (used.has(b)) continue;
        const ratio = a.size / b.size;
        if (ratio > CONFIG.USER_PAIR_SIZE_RATIO || ratio < 1 / CONFIG.USER_PAIR_SIZE_RATIO) continue;
        const d = Math.hypot(a.cx - b.cx, a.cy - b.cy) / ((a.size + b.size) / 2);
        if (d < CONFIG.USER_PAIR_MAX_DIST && d < bestDist) { best = b; bestDist = d; }
      }
      const members = [a];
      if (best) { used.add(best); members.push(best); }
      members.sort(byX);
      people.push({
        hands: members,
        size: members.reduce((s, h) => s + h.size, 0) / members.length,
        cx: members.reduce((s, h) => s + h.cx, 0) / members.length,
        cy: members.reduce((s, h) => s + h.cy, 0) / members.length,
      });
    }
    return people;
  }

  function score(person) {
    // 離畫面中心越遠扣越多：最遠（角落）約為 0.7071
    const d = Math.min(1, Math.hypot(person.cx - 0.5, person.cy - 0.5) / 0.7071);
    let s = person.size * (1 - CONFIG.USER_CENTER_WEIGHT * d);
    if (last && Math.hypot(person.cx - last.x, person.cy - last.y) < CONFIG.USER_STICKY_DIST) {
      s *= CONFIG.USER_STICKY_BONUS;
    }
    return s;
  }

  function select(multiHandLandmarks) {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) { last = null; return []; }
    const hands = multiHandLandmarks.map(measure);
    if (hands.length === 1) { last = { x: hands[0].cx, y: hands[0].cy }; return [hands[0].lm]; }

    const people = groupIntoPeople(hands);
    let chosen = people[0];
    let chosenScore = score(chosen);
    for (let i = 1; i < people.length; i++) {
      const s = score(people[i]);
      if (s > chosenScore) { chosen = people[i]; chosenScore = s; }
    }
    last = { x: chosen.cx, y: chosen.cy };
    return chosen.hands.map((h) => h.lm);
  }

  function reset() { last = null; }

  return { select, reset };
}
