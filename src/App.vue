<template>
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
