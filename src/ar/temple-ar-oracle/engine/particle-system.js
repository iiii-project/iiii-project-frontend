/* =========================================================================
   ParticleSystem — 金色香灰粒子 / 裊裊香煙 Canvas 特效
   來源：temple_oracle_v17.html 1637–1717行，邏輯與數值完全未更動。

   【封裝調整說明（僅此兩處，其餘皆逐行相同）】
   1. 原本直接讀取全域 `els.particleCanvas`，改為由外部呼叫 createParticleSystem(canvas)
      時傳入 canvas 元素，因為Web Component裡沒有全域 els 物件。
   2. spawnLightBurst() 原本 document.body.appendChild(...)、screenShakeOnce() 原本
      document.body.classList.toggle(...) 都是對「整個頁面」動手，這樣會跳出Shadow DOM
      去影響宿主頁面。改為對呼叫時傳入的 rootEl（元件自己的容器）動手，效果完全相同，
      只是作用範圍從「整個網頁」限縮成「元件自己」，避免污染宿主頁面其他區域。
   ========================================================================= */

export function createParticleSystem(canvas) {
  const ctx = canvas.getContext('2d');
  let ash = [], smoke = [];
  function resize(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize); resize();
  function spawnAsh(){ return { x: Math.random()*canvas.width, y: Math.random()*canvas.height + canvas.height*0.2, r: 0.7+Math.random()*1.8, speedY: 0.12+Math.random()*0.28, drift:(Math.random()-0.5)*0.35, phase: Math.random()*Math.PI*2, alpha: 0.18+Math.random()*0.35 }; }
  function spawnSmoke(){ return { x: canvas.width*(0.3+Math.random()*0.4), y: canvas.height*(0.9+Math.random()*0.1), r: 30+Math.random()*50, speedY: 0.22+Math.random()*0.25, drift:(Math.random()-0.5)*0.25, alpha: 0.04+Math.random()*0.05, growth: 0.04+Math.random()*0.06 }; }
  ash = Array.from({length:55}, spawnAsh); smoke = Array.from({length:8}, spawnSmoke);
  let rafId = null;
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    smoke.forEach(p=>{
      const grad = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
      grad.addColorStop(0,`rgba(220,195,150,${p.alpha})`); grad.addColorStop(1,`rgba(220,195,150,0)`);
      ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      p.y-=p.speedY; p.x+=p.drift; p.r+=p.growth; p.alpha*=0.997;
      if (p.r>140||p.alpha<0.004) Object.assign(p, spawnSmoke());
    });
    ctx.restore();
    ash.forEach(p=>{
      p.phase+=0.02; const flicker=0.6+0.4*Math.sin(p.phase);
      ctx.beginPath(); ctx.fillStyle=`rgba(242,226,179,${p.alpha*flicker})`;
      ctx.shadowColor='rgba(255,207,122,0.7)'; ctx.shadowBlur=3;
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      p.y-=p.speedY; p.x+=p.drift+Math.sin(p.phase)*0.12;
      if (p.y<-10) Object.assign(p, spawnAsh(), {y:canvas.height+10});
    });
    rafId = requestAnimationFrame(draw);
  }
  draw();

  return {
    // 過場影片播放期間停止重繪，把資源讓給影片解碼
    pause(){ if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } },
    resume(){ if (!rafId) draw(); },
    burst(x,y,count=16){ for(let i=0;i<count;i++){ ash.push({ x,y, r:1+Math.random()*2, speedY:0.5+Math.random()*1.2, drift:(Math.random()-0.5)*2, phase:Math.random()*Math.PI*2, alpha:0.6+Math.random()*0.3 }); } },
    // 手部經過時，把附近的金色香灰粒子輕輕撥開（依距離反比施加一次性位移）
    repel(x, y, radius){
      ash.forEach(p => {
        const dx = p.x-x, dy = p.y-y;
        const d = Math.hypot(dx,dy);
        if (d < radius && d > 0.001){
          const force = (1 - d/radius) * 6;
          p.x += (dx/d) * force;
          p.y += (dy/d) * force;
        }
      });
    },
    // 誠心默念感應時，讓周圍的香灰粒子緩緩向雙手中心匯聚，強度隨感應進度增強
    converge(x, y, radius, strength){
      ash.forEach(p => {
        const dx = x-p.x, dy = y-p.y;
        const d = Math.hypot(dx,dy);
        if (d < radius && d > 4){
          const force = (1 - d/radius) * strength;
          p.x += (dx/d) * force;
          p.y += (dy/d) * force;
        }
      });
    },
    // 新增：釋放資源用（原始版本活在單頁iframe裡，卸載時瀏覽器會整包回收，
    // 沒有這支函式；元件化之後需要能主動停止動畫迴圈，避免切走畫面後仍在背景空轉）
    destroy(){
      window.removeEventListener('resize', resize);
      if (rafId) cancelAnimationFrame(rafId);
    }
  };
}

// 擲筊/抽籤命中瞬間的金色光爆效果。rootEl 為元件自己的容器（取代原本的 document.body）。
export function spawnLightBurst(rootEl, x, y){
  const wrap = document.createElement('div'); wrap.className = 'light-burst';
  wrap.style.left = x + 'px'; wrap.style.top = y + 'px';
  wrap.innerHTML = `<svg viewBox="0 0 200 200" width="100%" height="100%">
    <circle cx="100" cy="100" r="14" fill="#fff8e6"/>
    <g stroke="var(--gold-soft)" stroke-width="4" stroke-linecap="round">
      ${Array.from({length:12}).map((_,i)=>{
        const ang=(i/12)*Math.PI*2; const x1=100+Math.cos(ang)*22, y1=100+Math.sin(ang)*22;
        const x2=100+Math.cos(ang)*(70+(i%2===0?20:0)), y2=100+Math.sin(ang)*(70+(i%2===0?20:0));
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" opacity="${i%2===0?0.95:0.6}"/>`;
      }).join('')}
    </g></svg>`;
  rootEl.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('play'));
  setTimeout(() => wrap.remove(), 800);
}

// 畫面震動一次（例如擲出聖筊時的回饋）。rootEl 為元件自己的容器（取代原本的 document.body）。
export function screenShakeOnce(rootEl){
  rootEl.classList.remove('screen-shake'); void rootEl.offsetWidth;
  rootEl.classList.add('screen-shake');
  setTimeout(() => rootEl.classList.remove('screen-shake'), 460);
}
