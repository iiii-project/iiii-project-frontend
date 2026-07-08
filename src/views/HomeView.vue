<template>
  <div class="home-flow home-immersive">
    <section class="home-stage" aria-labelledby="home-title">
      <div class="home-copy">
        <p class="home-kicker">六十甲子籤 · Motion Oracle</p>
        <h1 id="home-title">把手伸進畫面，完成一段線上求籤</h1>
        <p class="home-lede">
          從立願、點香、搖籤到擲筊，鏡頭只在瀏覽器中辨識手勢；結果與 AI 解籤由後端產生，前端負責讓每個儀式階段清楚可感。
        </p>
        <div class="home-actions">
          <RouterLink class="primary-button" to="/question">開始求籤</RouterLink>
          <RouterLink class="secondary-button" to="/donation">功德捐款</RouterLink>
          <RouterLink class="secondary-button" to="/history">查看歷史</RouterLink>
        </div>
        <p class="home-privacy">攝影機影像不會上傳或保存，動作失敗時可隨時改用點擊。</p>
      </div>

      <div class="home-oracle" aria-hidden="true">
        <div class="oracle-halo"></div>
        <div class="oracle-stick stick-a"></div>
        <div class="oracle-stick stick-b"></div>
        <div class="oracle-stick stick-c"></div>
        <div class="oracle-tube"><span>籤</span></div>
        <div class="oracle-cups">
          <span></span>
          <span></span>
        </div>
      </div>
    </section>

    <section class="home-ritual-path" aria-label="求籤流程">
      <ol>
        <li><strong>立願</strong><span>輸入問題</span></li>
        <li><strong>點香</strong><span>合十祈求</span></li>
        <li><strong>抽籤</strong><span>搖籤捏取</span></li>
        <li><strong>請示</strong><span>自動擲筊</span></li>
        <li><strong>解籤</strong><span>AI 回覆</span></li>
      </ol>
    </section>
  </div>
</template>
