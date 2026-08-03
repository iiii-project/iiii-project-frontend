/* =========================================================================
   DivinationApi（AR核心子集）— 完成插香/搖籤/擲筊儀式所必須呼叫的後端端點
   來源：temple_oracle_v17.html 2560–2646行。

   ⚠️ 這不是原始 DivinationApi 的完整搬遷，是刻意做過的子集：
   原始模組還有 getChat / sendChat / history / getFortune（手動查籤號用）
   這幾支方法，分別是「延續提問聊天室」「籤詩收藏本」「手動查籤」在用的，
   全部屬於前面分析階段就歸類為「周邊功能／交給新前端」的部分，
   所以沒有包在這裡。如果新前端要做這些功能，需要自己另外接這幾支API
   （呼叫方式與這裡的 request() 完全相同，可以直接參考複製）。

   保留的 create / prayer / draw / blocks / interpret 這五支，
   是插香→搖籤→擲筊→取得解籤這個核心儀式流程「不能沒有」的後端呼叫，
   邏輯與原始碼逐行相同。

   【封裝調整說明】
   1. `apiBaseUrl` 原本寫死判斷 `window.location.hostname === 'iii.gdtumn.com'`，
      這是專案原本部署網域的特判。改為由外部呼叫 createDivinationApi(apiBase)
      時傳入，不再寫死網域，新前端部署到任何網域都要自己決定 apiBase。
   2. CATEGORY_API_MAP 只保留 create() 會用到的分類代碼對照表（原始碼同一份，
      未增刪任何一組對照值）。
   ========================================================================= */

import { OFFLINE_FORTUNES } from './offline-fortunes.js';

const CATEGORY_API_MAP = {
  '工作事業': 'career', '感情婚姻': 'love', '財運投資': 'wealth', '健康平安': 'health',
  '考試學業': 'study', '家庭生活': 'family', '綜合運勢': 'other', '求財運': 'wealth',
  '問姻緣': 'love', '拼事業': 'career', '求健康': 'health', '學業功名': 'study'
};

export function createDivinationApi(apiBase, options = {}) {
  const anonymousKey = 'temple-oracle-anonymous-user-id';
  const apiBaseUrl = apiBase || '/api/v1';
  const onOffline = typeof options.onOffline === 'function' ? options.onOffline : () => {};
  const timeoutMs = options.timeoutMs || 8000;

  /* ── 離線備援狀態 ──
     一旦任何一支 API 連不上（斷網／逾時／5xx／CORS），就切進離線模式：
     整個儀式改由本地資料驅動繼續跑完，不讓使用者卡在中途。
     切換只發生一次，之後不再重試，避免每一步都等 8 秒逾時。 */
  let offline = false;
  const local = {
    fortune: null,      // 本地抽到的籤
    shengStreak: 0,     // 連續聖筊次數
    attempts: 0,
  };

  function goOffline(reason) {
    if (offline) return;
    offline = true;
    try { onOffline({ reason }); } catch (e) {}
  }

  /* 抽籤袋：把 60 首洗成一袋，抽完整袋才重新洗。
     這樣離線模擬一定會走遍全部 60 支籤，而不是純亂數導致有些籤一直抽不到、
     有些連續重複。籤袋存在 sessionStorage，同一個分頁多次求籤也能接續。 */
  const BAG_KEY = 'temple-oracle-offline-bag';

  function refillBag() {
    const bag = OFFLINE_FORTUNES.map((f) => f.no);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  }

  function readBag() {
    try {
      const raw = sessionStorage.getItem(BAG_KEY);
      const bag = raw ? JSON.parse(raw) : null;
      return Array.isArray(bag) && bag.length ? bag : refillBag();
    } catch (e) {
      return refillBag();
    }
  }

  function pickLocalFortune() {
    const bag = readBag();
    const no = bag.pop();
    try { sessionStorage.setItem(BAG_KEY, JSON.stringify(bag.length ? bag : refillBag())); } catch (e) {}
    local.fortune = OFFLINE_FORTUNES.find((f) => f.no === no) || OFFLINE_FORTUNES[0];
    return local.fortune;
  }

  /* 擲筊：兩顆筊各自平／凸，機率與實體擲筊相同（聖 1/2、笑 1/4、陰 1/4） */
  function localBlocks() {
    const a = Math.random() < 0.5 ? 'flat' : 'domed';
    const b = Math.random() < 0.5 ? 'flat' : 'domed';
    const result = a !== b ? 'sheng' : (a === 'flat' ? 'xiao' : 'yin');
    const resultName = result === 'sheng' ? '聖筊' : result === 'xiao' ? '笑筊' : '陰筊';
    local.attempts += 1;
    local.shengStreak = result === 'sheng' ? local.shengStreak + 1 : 0;
    // 離線時只要求一次聖筊即確認，避免在沒有後端的情況下反覆重抽
    const confirmed = local.shengStreak >= 1;
    return {
      result,
      result_name: resultName,
      confirmed,
      attempt_number: local.attempts,
      remaining_attempts: confirmed ? 0 : 1,
      offline: true,
    };
  }

  /* 預設解籤：不假裝是 AI 產生的，內容依籤詩本身的吉凶等級與使用者提問組出來 */
  function localInterpretation(question, category) {
    const fortune = local.fortune || pickLocalFortune();
    const grade = fortune.grade || '';
    const tone = grade.includes('上')
      ? '整體方向是順的，適合順勢推進。'
      : grade.includes('下')
        ? '眼下阻力較明顯，宜守不宜攻。'
        : '目前處於持平的階段，穩住比求快重要。';
    return {
      overall_meaning: `${fortune.explain || ''}${fortune.explain ? '' : tone}`.trim() || tone,
      relation_to_question: question
        ? `你問的是「${question}」。${fortune.modern || tone}`
        : `就「${category || '這件事'}」而言，${fortune.modern || tone}`,
      suggested_actions: [
        '把眼前能掌握的事先做穩，不必急著求一個明確答案',
        '找一位信得過的人聊聊，把想法說出口往往就清楚了',
        '網路恢復後可以重新求籤，取得完整的 AI 解籤',
      ],
      warnings: ['此為離線時的預設解說，並非 AI 依你的處境即時生成'],
      offline: true,
    };
  }

  function anonymousUserId(){
    let value = localStorage.getItem(anonymousKey);
    if (!value){ value = crypto.randomUUID(); localStorage.setItem(anonymousKey, value); }
    return value;
  }

  /* 加上逾時控制：原本沒有 AbortController，後端沒回應時會一直吊著，
     使用者會停在「正在請示…」不動。 */
  async function request(path, options = {}){
    const accessToken = localStorage.getItem('ai-fortune-access-token');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(options.headers || {})
        }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || '後端暫時無法處理這次求籤');
      return body.data || body;
    } finally {
      clearTimeout(timer);
    }
  }

  function mapFortune(fortune){
    return {
      no: fortune.number,
      ganzhi: fortune.ganzhi || '',
      grade: fortune.fortune_level || '',
      poem: fortune.poem,
      explain: fortune.translation || '',
      modern: fortune.general_meaning || ''
    };
  }

  async function create(question, category, interactionMode = 'motion', fortuneNumber = null){
    return request('/divinations/', {
      method: 'POST',
      body: JSON.stringify({
        question,
        categories: [CATEGORY_API_MAP[category] || 'other'], interaction_mode: interactionMode, anonymous_user_id: anonymousUserId(),
        ...(fortuneNumber === null ? {} : { fortune_number: fortuneNumber })
      })
    });
  }

  /* ── 對外的五支 API ──
     每一支都是「先試後端，失敗就地降級」，回傳形狀與線上模式完全相同，
     所以 flow-controller 不需要知道自己正在離線，儀式照常跑完。 */
  let lastQuestion = '';
  let lastCategory = '';

  return {
    isOffline: () => offline,

    async create(question, category, interactionMode = 'motion', fortuneNumber = null) {
      lastQuestion = question;
      lastCategory = category;
      if (offline) return { session_id: `offline-${Date.now()}`, share_token: null, offline: true };
      try {
        return await create(question, category, interactionMode, fortuneNumber);
      } catch (error) {
        goOffline(error);
        return { session_id: `offline-${Date.now()}`, share_token: null, offline: true };
      }
    },

    async prayer(id) {
      if (offline) return { status: 'praying', offline: true };
      try {
        return await request(`/divinations/${id}/prayer-complete/`, { method: 'POST' });
      } catch (error) {
        goOffline(error);
        return { status: 'praying', offline: true };
      }
    },

    async draw(id) {
      if (offline) return pickLocalFortune();
      try {
        return mapFortune((await request(`/divinations/${id}/draw/`, { method: 'POST' })).fortune);
      } catch (error) {
        goOffline(error);
        return pickLocalFortune();
      }
    },

    async blocks(id) {
      if (offline) return localBlocks();
      try {
        return await request(`/divinations/${id}/blocks/`, { method: 'POST' });
      } catch (error) {
        goOffline(error);
        return localBlocks();
      }
    },

    async interpret(id) {
      if (offline) {
        return {
          fortune: local.fortune || pickLocalFortune(),
          interpretation: localInterpretation(lastQuestion, lastCategory),
          offline: true,
        };
      }
      try {
        const session = await request(`/divinations/${id}/interpret/`, { method: 'POST' });
        return { ...session, fortune: mapFortune(session.fortune) };
      } catch (error) {
        goOffline(error);
        return {
          fortune: local.fortune || pickLocalFortune(),
          interpretation: localInterpretation(lastQuestion, lastCategory),
          offline: true,
        };
      }
    },
  };
}
