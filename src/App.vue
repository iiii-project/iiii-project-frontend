<template>
  <div class="temple-backdrop" aria-hidden="true">
    <div class="temple-vignette"></div>
    <div class="temple-cloud temple-cloud-left"></div>
    <div class="temple-cloud temple-cloud-right"></div>
    <div class="temple-dragon temple-dragon-left"></div>
    <div class="temple-dragon temple-dragon-right"></div>
  </div>
  <header class="app-header">
    <RouterLink class="brand" to="/">AI 求籤互動系統</RouterLink>
    <nav>
      <RouterLink to="/mode">求籤</RouterLink>
      <RouterLink to="/history">歷史</RouterLink>
    </nav>
  </header>
  <main>
    <RouterView />
  </main>
</template>
