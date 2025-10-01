import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from '../views/LoginPage.vue'
import DashboardPage from '../views/DashboardPage.vue'
import StoragePage from '../views/StoragePage.vue'
import { TokenManager } from '../services/auth.js'

const routes = [
  {
    path: '/',
    name: 'Login',
    component: LoginPage
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: DashboardPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/storage',
    name: 'Storage',
    component: StoragePage,
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard for protected routes
router.beforeEach((to, from, next) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  const isAuthenticated = TokenManager.isAuthenticated()

  if (requiresAuth && !isAuthenticated) {
    // Redirect to login if not authenticated
    next('/')
  } else if (to.path === '/' && isAuthenticated) {
    // Redirect to dashboard if already authenticated
    next('/dashboard')
  } else {
    next()
  }
})

export default router