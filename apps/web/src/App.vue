<template>
  <main class="mx-auto min-h-screen max-w-3xl px-6 py-16">
    <header class="mb-12 flex items-center justify-between">
      <RouterLink class="text-xl font-semibold text-slate-900" to="/">
        New Messenger
      </RouterLink>
      <nav>
        <RouterLink class="text-sm font-medium text-slate-600" to="/login">
          Log in
        </RouterLink>
      </nav>
    </header>
    <RouterView />
  </main>
</template>
