/* =========================================================================
   AudioEngine — 以 WebAudio 合成木質敲擊聲，無需外部音檔
   來源：temple_oracle_v17.html 1719–1784行，逐行原封不動搬遷（本模組完全
   self-contained，沒有任何 els/document 全域參照，因此不需要做任何封裝調整）。

   - 平面觸地：短促高頻（清脆 Tap）
   - 凸面觸地：低頻厚實 + 噪訊（沉厚 Thud）
   AudioContext 需在使用者手勢（點擊教學層按鈕）後才 resume，符合瀏覽器自動播放政策
   ========================================================================= */
export const AudioEngine = (() => {
  let ctx = null;
  function ensure(){ if (!ctx){ try { ctx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){ ctx = null; } } return ctx; }
  function unlock(){ const c = ensure(); if (c && c.state === 'suspended') c.resume(); }

  function tap(){
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator(); const gain = c.createGain();
    osc.type = 'triangle'; osc.frequency.setValueAtTime(1500, t0); osc.frequency.exponentialRampToValueAtTime(700, t0+0.08);
    gain.gain.setValueAtTime(0.22, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0+0.09);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(t0); osc.stop(t0+0.1);
  }
  function thud(){
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator(); const gain = c.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(180, t0); osc.frequency.exponentialRampToValueAtTime(60, t0+0.16);
    gain.gain.setValueAtTime(0.35, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0+0.2);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(t0); osc.stop(t0+0.22);
    // 疊加一層短噪訊，讓木質厚實感更明顯
    const bufSize = c.sampleRate*0.06;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<bufSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufSize);
    const noise = c.createBufferSource(); noise.buffer = buf;
    const ngain = c.createGain(); ngain.gain.setValueAtTime(0.12, t0);
    noise.connect(ngain); ngain.connect(c.destination); noise.start(t0);
  }
  // 依籤詩吉凶等級播放對應音色：上籤明亮鐘聲、中籤溫潤缽音、下籤低沉靜音，
  // 全部以 WebAudio 即時合成，無需外部音檔。
  function bellTone(freq, t0, dur, gainPeak){
    const c = ensure(); if (!c) return;
    const osc = c.createOscillator(); const gain = c.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainPeak, t0+0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(t0); osc.stop(t0+dur+0.05);
  }
  function resultChime(tier){
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime;
    if (tier === 'tier-auspicious'){
      // 明亮上升三音鐘聲，疊出金色喜悅感
      [880, 1108, 1318.5].forEach((f,i) => bellTone(f, t0 + i*0.11, 1.1, 0.16));
    } else if (tier === 'tier-caution'){
      // 低沉單音，沉穩而不刺耳，提醒靜心以對
      bellTone(196, t0, 1.3, 0.14);
    } else {
      // 中性溫潤缽音
      bellTone(523.25, t0, 0.9, 0.13);
      bellTone(659.25, t0+0.05, 0.9, 0.09);
    }
  }
  return { unlock, tap, thud, resultChime };
})();
