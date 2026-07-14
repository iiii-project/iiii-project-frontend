<script setup lang="ts">
import { computed, ref } from 'vue'

const amounts = [100, 300, 600, 1200]
const selectedAmount = ref(300)
const showDialog = ref(false)
const paymentMessage = ref('')

const formattedAmount = computed(() => `NT$ ${selectedAmount.value.toLocaleString('zh-TW')}`)

function openDonationDialog() {
  paymentMessage.value = ''
  showDialog.value = true
}

function startApplePay() {
  if (!('ApplePaySession' in window)) {
    paymentMessage.value = '這台裝置目前不支援 Apple Pay，請改用 LINE Pay。'
    return
  }
  paymentMessage.value = 'Apple Pay 付款服務尚未設定商家憑證與 HTTPS 網域驗證。'
}

function startLinePay() {
  paymentMessage.value = 'LINE Pay 付款服務尚未設定商家憑證。完成後會由 Django 建立付款請求並導向 LINE Pay。'
}
</script>

<template>
  <div class="donation-page">
    <header class="donation-header">
      <RouterLink class="donation-brand" to="/">籤好運 <span>TAIWAN TEMPLE ONLINE</span></RouterLink>
      <nav aria-label="主要導覽">
        <RouterLink to="/">首頁</RouterLink>
        <RouterLink to="/temple-map">廟宇地圖</RouterLink>
      </nav>
    </header>

    <main class="donation-main">
      <section class="donation-hero">
        <div class="hero-copy">
          <p class="eyebrow">SUPPORT THE EXPERIENCE</p>
          <h1>留一盞燈，<br><span>讓文化繼續發光</span></h1>
          <p class="lede">你的支持會用在籤詩資料整理、互動技術維護，以及讓更多人能靠近台灣廟宇文化的體驗設計。</p>
          <button type="button" class="donate-button" @click="openDonationDialog">功德隨喜</button>
        </div>
        <div class="offering" aria-hidden="true">
          <div class="halo"></div>
          <div class="lamp"><i></i><i></i><i></i></div>
          <p>一點心意<br>一份光亮</p>
        </div>
      </section>

      <section class="support-section">
        <p class="eyebrow">WHERE IT GOES</p>
        <div class="section-heading">
          <h2>支持一段可以慢慢走近的文化旅程</h2>
          <p>每筆捐款都會成為系統與內容持續完善的養分。</p>
        </div>
        <div class="support-grid">
          <article><span>01</span><h3>數位維護</h3><p>維持伺服器、資料庫和前後端服務穩定，讓每次互動都能順利完成。</p></article>
          <article><span>02</span><h3>文化內容</h3><p>整理籤詩資料、校對說明文字，讓資訊有依據也更容易親近。</p></article>
          <article><span>03</span><h3>展示體驗</h3><p>改善動作辨識、互動畫面與無障礙細節，讓不同使用者都能自在參與。</p></article>
        </div>
      </section>

      <p class="donation-note">本頁為付款流程介面。正式收款前，仍需要在 Django 後端設定綠界、LINE Pay 或 Apple Pay 的商家金鑰與付款通知驗證。</p>
    </main>

    <Teleport to="body">
      <Transition name="donation-fade">
        <div v-if="showDialog" class="dialog-backdrop" @click.self="showDialog = false">
          <section class="donation-dialog" role="dialog" aria-modal="true" aria-labelledby="donation-title">
            <button class="close-button" type="button" aria-label="關閉捐款視窗" @click="showDialog = false">×</button>
            <p class="eyebrow">MAKE A DONATION</p>
            <h2 id="donation-title">功德隨喜</h2>
            <p>選擇一個金額，支持籤好運的文化內容與數位體驗。</p>
            <div class="amounts" aria-label="捐款金額">
              <button v-for="amount in amounts" :key="amount" type="button" :class="{ selected: amount === selectedAmount }" @click="selectedAmount = amount">NT$ {{ amount }}</button>
            </div>
            <div class="total"><span>本次捐款</span><strong>{{ formattedAmount }}</strong></div>
            <div class="pay-actions">
              <button type="button" class="apple-pay" @click="startApplePay">Apple Pay</button>
              <button type="button" class="line-pay" @click="startLinePay">LINE Pay</button>
            </div>
            <p v-if="paymentMessage" class="payment-message">{{ paymentMessage }}</p>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.donation-page { min-height: 100vh; color: #3a2c22; background: #fbf9f5; }
.donation-header { height: 78px; display: flex; align-items: center; justify-content: space-between; padding: 0 clamp(22px, 5vw, 72px); border-bottom: 1px solid rgba(212,175,55,.4); background: rgba(251,249,245,.92); }
.donation-brand { color: #3a2c22; font-size: 20px; font-weight: 700; letter-spacing: .16em; }.donation-brand span { display: block; margin-top: 3px; color: #9c8b76; font-size: 9px; font-weight: 500; letter-spacing: .26em; }
nav { display: flex; gap: 28px; font-size: 14px; color: #6f5d4c; } nav a.router-link-active { color: #a63a3a; }
.donation-main { width: min(1160px, calc(100% - 40px)); margin: 0 auto; padding: 58px 0 36px; }.eyebrow { margin: 0 0 12px; color: #a63a3a; font-size: 11px; font-weight: 600; letter-spacing: .3em; }
.donation-hero { min-height: 500px; display: grid; grid-template-columns: 1.15fr .85fr; align-items: center; gap: 32px; padding: clamp(35px, 7vw, 88px); border: 1px solid rgba(212,175,55,.45); border-radius: 8px; background: linear-gradient(115deg, #fffdf8 15%, #f4e6c9 100%); overflow: hidden; position: relative; }.donation-hero::after { content: ''; position: absolute; inset: auto -80px -110px auto; width: 340px; height: 340px; border: 1px solid rgba(166,58,58,.16); border-radius: 50%; }
h1 { margin: 0; font-size: clamp(42px, 5.6vw, 72px); line-height: 1.24; font-weight: 600; letter-spacing: .1em; } h1 span { color: #a63a3a; }.lede { max-width: 510px; margin: 28px 0; color: #6f5d4c; font-size: 16px; line-height: 2; }.donate-button { border: 0; border-radius: 3px; padding: 15px 36px; color: #fffaf0; background: #9a3032; box-shadow: 0 13px 27px rgba(122,38,38,.23); font: inherit; letter-spacing: .14em; cursor: pointer; }.donate-button:hover { background: #7a2626; transform: translateY(-1px); }
.offering { min-height: 320px; display: grid; place-items: center; position: relative; z-index: 1; }.halo { position: absolute; width: 270px; height: 270px; border: 1px solid rgba(212,175,55,.6); border-radius: 50%; box-shadow: 0 0 0 24px rgba(255,250,235,.35), 0 0 0 48px rgba(212,175,55,.12); }.lamp { width: 155px; height: 100px; display: flex; align-items: end; justify-content: center; gap: 7px; padding-bottom: 20px; border-radius: 50% 50% 38% 38%; background: #b6453d; box-shadow: inset 0 -18px #7c2525, 0 18px 25px rgba(103,45,23,.24); z-index: 1; }.lamp::before { content: ''; position: absolute; width: 128px; height: 16px; margin-top: 100px; border-radius: 50%; background: #d5ad45; }.lamp i { width: 16px; height: 55px; border-radius: 70% 20% 70% 20%; transform: rotate(45deg); background: linear-gradient(#fff4bd, #e8a73b 65%, #bc4925); box-shadow: 0 0 20px rgba(255,199,81,.75); }.offering p { position: absolute; bottom: -28px; color: #8d7055; font-size: 13px; letter-spacing: .18em; line-height: 1.8; text-align: center; }
.support-section { padding: 98px 0 44px; }.section-heading { display: flex; justify-content: space-between; align-items: end; gap: 30px; }.section-heading h2 { max-width: 590px; margin: 0; font-size: clamp(27px, 3.5vw, 42px); font-weight: 600; letter-spacing: .07em; }.section-heading p { max-width: 350px; margin: 0; color: #806c59; line-height: 1.8; }.support-grid { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 38px; border-top: 1px solid rgba(212,175,55,.48); }.support-grid article { padding: 29px 30px 18px 0; border-right: 1px solid rgba(212,175,55,.34); }.support-grid article + article { padding-left: 30px; }.support-grid article:last-child { border-right: 0; }.support-grid span { color: #b38b35; font-size: 12px; letter-spacing: .16em; }.support-grid h3 { margin: 14px 0 10px; color: #7a2626; font-size: 22px; font-weight: 600; }.support-grid p { margin: 0; color: #6f5d4c; line-height: 1.85; }.donation-note { margin: 34px 0 0; padding: 17px 20px; color: #826d58; font-size: 13px; line-height: 1.8; border-left: 2px solid #d4af37; background: #f5eddf; }
.dialog-backdrop { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 20px; background: rgba(42,28,18,.5); backdrop-filter: blur(8px); }.donation-dialog { width: min(490px, 100%); position: relative; padding: 40px; border: 1px solid rgba(212,175,55,.6); border-radius: 8px; color: #3a2c22; background: #fffdf8; box-shadow: 0 28px 80px rgba(34,18,8,.32); }.close-button { position: absolute; top: 14px; right: 17px; width: 32px; height: 32px; border: 0; color: #8d7055; background: none; font-size: 27px; cursor: pointer; }.donation-dialog h2 { margin: 0; font-size: 34px; color: #7a2626; letter-spacing: .08em; }.donation-dialog > p:not(.eyebrow):not(.payment-message) { color: #74604e; line-height: 1.8; }.amounts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 24px 0; }.amounts button { min-height: 49px; border: 1px solid #d8c49c; border-radius: 3px; color: #6b5140; background: #fffaf1; font: inherit; cursor: pointer; }.amounts button.selected { color: #fffaf0; border-color: #9a3032; background: #9a3032; }.total { display: flex; align-items: center; justify-content: space-between; padding: 17px 0; border-top: 1px solid #eadbbd; border-bottom: 1px solid #eadbbd; color: #806c59; }.total strong { color: #7a2626; font-size: 23px; }.pay-actions { display: grid; gap: 10px; margin-top: 22px; }.pay-actions button { min-height: 50px; border: 0; border-radius: 4px; font: inherit; font-weight: 600; cursor: pointer; }.apple-pay { color: #fff; background: #161616; }.line-pay { color: #fff; background: #06b53b; }.payment-message { margin: 17px 0 0; color: #8d4b30; font-size: 13px; line-height: 1.7; }.donation-fade-enter-active,.donation-fade-leave-active { transition: opacity .2s ease; }.donation-fade-enter-from,.donation-fade-leave-to { opacity: 0; }
@media (max-width: 720px) { .donation-header { height: 70px; } nav { gap: 15px; font-size: 13px; }.donation-main { width: min(100% - 24px, 1160px); padding-top: 28px; }.donation-hero { grid-template-columns: 1fr; padding: 45px 27px 72px; }.offering { min-height: 230px; transform: scale(.8); margin: -25px 0 -50px; }.section-heading { display: block; }.section-heading p { margin-top: 14px; }.support-grid { grid-template-columns: 1fr; }.support-grid article,.support-grid article + article { padding: 25px 0; border-right: 0; border-bottom: 1px solid rgba(212,175,55,.34); }.donation-dialog { padding: 32px 24px; } }
</style>
