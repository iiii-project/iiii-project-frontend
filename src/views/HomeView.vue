<template>
  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">目前使用：六十甲子籤</p>
      <h1>AI 求籤互動系統</h1>
      <p>
        以網頁互動、動作辨識與 AI 解說重現求籤流程，作為傳統文化展示、教育與娛樂參考。
      </p>
      <div class="button-row">
        <RouterLink class="primary-button" to="/mode">開始求籤</RouterLink>
        <RouterLink class="secondary-button" to="/history">查看歷史</RouterLink>
      </div>
    </div>
    <div class="ritual-mark" aria-hidden="true">籤</div>
  </section>

  <section class="content-band">
    <h2>流程</h2>
    <ol class="flow-list">
      <li>選擇模式</li>
      <li>輸入問題</li>
      <li>燒香祈求</li>
      <li>搖籤</li>
      <li>擲筊確認</li>
      <li>AI 解籤</li>
    </ol>
    <p class="notice">
      攝影機影像只在瀏覽器內處理，不會上傳後端。系統不宣稱預測未來，AI 回答僅供文化體驗及參考。
    </p>
  </section>
</template>
