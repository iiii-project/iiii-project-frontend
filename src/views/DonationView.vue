<script setup lang="ts">
import { computed, ref } from 'vue'

const donationAmounts = [100, 300, 600, 1200]
const selectedAmount = ref(300)
const showDialog = ref(false)
const paymentMessage = ref('')

const formattedAmount = computed(() => `NT$ ${selectedAmount.value.toLocaleString('zh-TW')}`)

function openDonationDialog() {
  paymentMessage.value = ''
  showDialog.value = true
}

function closeDonationDialog() {
  showDialog.value = false
}

function chooseAmount(amount: number) {
  selectedAmount.value = amount
  paymentMessage.value = ''
}

function startApplePay() {
  if (!('ApplePaySession' in window)) {
    paymentMessage.value = '這台裝置或瀏覽器目前不支援 Apple Pay。請改用 LINE Pay，或在 Safari 與支援 Apple Pay 的裝置上開啟。'
    return
  }

  paymentMessage.value = 'Apple Pay 需要 Apple merchant ID、HTTPS 網域驗證與後端付款憑證。UI 已準備好，接上付款服務後即可啟用。'
}

function startLinePay() {
  paymentMessage.value = 'LINE Pay 需要後端建立付款請求並導向 LINE Pay 付款頁。請將這裡接到你的 /api/v1/donations/line-pay/ endpoint。'
}
</script>

<template>
  <div class="page-shell donation-page">
    <section class="glass-panel donation-hero">
      <div>
        <div class="ornament-row">
          <span></span>
          <p class="eyebrow">SUPPORT THE TEMPLE ORACLE</p>
          <span></span>
        </div>
        <h1>功德捐款</h1>
        <div class="hairline"></div>
        <p>
          若你喜歡這個 AI 求籤互動系統，可以透過捐款支持後續開發、維護、內容整理與展示設備更新。
        </p>
        <div class="button-row">
          <button class="secondary-button" type="button" @click="openDonationDialog">
            前往捐款
          </button>
          <RouterLink class="primary-button" to="/question">先去求籤</RouterLink>
        </div>
      </div>
      <div class="donation-seal" aria-hidden="true">福</div>
    </section>

    <section class="content-band donation-details">
      <div class="ornament-row">
        <span></span>
        <h2>支持項目</h2>
        <span></span>
      </div>
      <div class="donation-grid">
        <article>
          <strong>系統維護</strong>
          <p>伺服器、資料庫與前後端功能更新。</p>
        </article>
        <article>
          <strong>文化內容</strong>
          <p>籤詩資料整理、解說文字校對與體驗設計。</p>
        </article>
        <article>
          <strong>展示體驗</strong>
          <p>動作辨識、互動畫面與展場使用流程優化。</p>
        </article>
      </div>
      <p class="notice">
        付款按鈕目前是前端流程示範，正式收款前需要串接 Apple Pay 或 LINE Pay 的商家憑證與後端付款 API。
      </p>
    </section>

    <Teleport to="body">
      <Transition name="page-fade">
        <div v-if="showDialog" class="donation-dialog-backdrop" role="presentation" @click.self="closeDonationDialog">
          <section
            class="donation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="donation-dialog-title"
          >
            <button class="dialog-close" type="button" aria-label="關閉捐款視窗" @click="closeDonationDialog">×</button>
            <p class="eyebrow">CHOOSE PAYMENT</p>
            <h2 id="donation-dialog-title">選擇捐款方式</h2>
            <p class="dialog-copy">選擇金額後使用 Apple Pay 或 LINE Pay 支持專案。</p>

            <div class="amount-grid" aria-label="捐款金額">
              <button
                v-for="amount in donationAmounts"
                :key="amount"
                type="button"
                class="amount-button"
                :class="{ 'is-selected': selectedAmount === amount }"
                @click="chooseAmount(amount)"
              >
                NT$ {{ amount.toLocaleString('zh-TW') }}
              </button>
            </div>

            <div class="payment-total">
              <span>本次捐款</span>
              <strong>{{ formattedAmount }}</strong>
            </div>

            <div class="payment-actions">
              <button class="pay-button apple-pay-button" type="button" @click="startApplePay">
                Apple Pay
              </button>
              <button class="pay-button line-pay-button" type="button" @click="startLinePay">
                LINE Pay
              </button>
            </div>

            <p v-if="paymentMessage" class="status-message donation-payment-message">
              {{ paymentMessage }}
            </p>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
