/* =========================================================================
   StageGuide — 每個階段開始前的操作教學
   原本畫面上方的標題卡會擋到神明，已移除；改成進入階段時先跳出這個框，
   說明下一步要做的動作，使用者按下確認後才開始該階段（等人進入主要位置 →
   播放動畫）。內容全是固定字串，沒有使用者輸入。
   ========================================================================= */

// 共用的人形示意：虛線框代表「畫面中央的主要位置」，差別只在手部動作。
const FIGURE_BASE = `
  <rect x="24" y="8" width="152" height="144" rx="14" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 6" opacity="0.55"/>
  <circle cx="100" cy="46" r="15" fill="currentColor" opacity="0.9"/>
  <path d="M66,152 C66,100 78,70 100,70 C122,70 134,100 134,152 Z" fill="currentColor" opacity="0.22"/>`;

const FIGURES = {
  // 雙手合十於胸前
  incense: `
    <path d="M78,90 Q82,112 97,106" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <path d="M122,90 Q118,112 103,106" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="100" cy="96" rx="5" ry="13" fill="currentColor"/>`,
  // 雙手握籤筒上下搖動
  draw: `
    <path d="M78,90 Q82,114 94,110" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <path d="M122,90 Q118,114 106,110" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <rect x="91" y="80" width="18" height="36" rx="4" fill="currentColor" transform="rotate(-10 100 98)"/>
    <path d="M62,82 q-10,14 0,28 M138,82 q10,14 0,28" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  // 雙手捧筊往上輕拋
  bwa: `
    <path d="M78,90 Q84,112 96,104" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <path d="M122,90 Q116,112 104,104" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <path d="M78,34 a12,7 0 0 1 20,0 a12,3 0 0 0 -20,0 Z" fill="currentColor"/>
    <path d="M102,34 a12,7 0 0 1 20,0 a12,3 0 0 0 -20,0 Z" fill="currentColor"/>
    <path d="M100,98 L100,66 M92,74 L100,64 L108,74" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>`,
};

const GUIDES = {
  incense: {
    title: '誠　心　默　念',
    camera: [
      '站到螢幕前方，讓自己出現在神明下方的畫面中央',
      '雙手在胸前合十，心中默念所求之事',
      '進度環跑滿（約 5 秒）後自動進入抽籤',
    ],
  },
  draw: {
    title: '祈　願　抽　籤',
    camera: [
      '站在畫面中央，雙手在胸前握住籤筒的位置',
      '上下搖動雙手，像在搖籤筒一樣',
      '搖籤約 3 秒後，籤條會自動抽出',
    ],
    manual: [
      '籤筒會自動搖動並抽出籤條',
      '也可以直接點畫面下方的「手動抽籤」',
    ],
  },
  bwa: {
    title: '擲　筊　請　示',
    camera: [
      '站在畫面中央，雙手在胸前捧起筊杯',
      '雙手往上輕輕一拋，做出擲筊的動作',
      '約 2 秒後筊杯擲出；需取得聖筊才算允准，否則會重新抽籤',
    ],
    manual: [
      '筊杯會自動擲出，也可以直接點擊筊杯',
      '需取得聖筊才算允准，否則會重新抽籤',
    ],
  },
};

export function createStageGuide(els) {
  let onConfirm = null;

  els.stageGuideConfirm.addEventListener('click', () => {
    const callback = onConfirm;
    hide();
    callback?.();
  });

  /** 顯示某階段的教學；按下確認才呼叫 confirm。沒有對應內容就直接開始。 */
  function show(name, mode, confirm) {
    const guide = GUIDES[name];
    const steps = guide && ((mode === 'manual' && guide.manual) || guide.camera);
    if (!steps) {
      confirm();
      return;
    }
    els.stageGuideTitle.textContent = guide.title;
    els.stageGuideFigure.innerHTML =
      `<svg viewBox="0 0 200 160" aria-hidden="true">${FIGURE_BASE}${FIGURES[name]}</svg>`;
    els.stageGuideSteps.replaceChildren(
      ...steps.map((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      }),
    );
    onConfirm = confirm;
    els.stageGuide.classList.remove('hidden');
    els.stageGuideConfirm.focus({ preventScroll: true });
  }

  function hide() {
    onConfirm = null;
    els.stageGuide.classList.add('hidden');
  }

  return { show, hide };
}
