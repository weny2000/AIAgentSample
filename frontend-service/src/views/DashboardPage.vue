<template>
  <div class="dashboard-container">
    <div class="dashboard-header">
      <h1>Dashboard</h1>
      <div class="user-info">
        <span>Welcome, {{ userInfo?.username || 'User' }}!</span>
        <button @click="handleLogout" class="logout-button">Logout</button>
      </div>
    </div>
    
    <div class="dashboard-content">
      <div class="card">
        <h2>Navigation</h2>
        <div class="nav-buttons">
          <button @click="$router.push('/storage')" class="nav-button">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"></path>
            </svg>
            Storage Management
          </button>
        </div>
      </div>
      
      <div class="card">
        <h2>User Information</h2>
        <div v-if="userInfo" class="user-details">
          <p><strong>Welcome:</strong> {{ userInfo?.username || 'User' }}</p>
          <p v-if="userInfo?.email"><strong>Email:</strong> {{ userInfo.email }}</p>
          <p v-if="userInfo?.role"><strong>Role:</strong> {{ userInfo.role }}</p>
        </div>
        <div v-else class="loading">Loading user information...</div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { TokenManager, ApiService } from '../services/auth.js'

export default {
  name: 'DashboardPage',
  setup() {
    const userInfo = ref(null)

    onMounted(() => {
      // Check if user is authenticated
      if (!TokenManager.isAuthenticated()) {
        // Redirect to login if not authenticated
        window.location.href = '/'
        return
      }

      // Load user information
      userInfo.value = TokenManager.getUserInfo() || TokenManager.getUserInfo(true)
    })

    const handleLogout = async () => {
      try {
        await ApiService.logout()
        // Redirect to login page
        window.location.href = '/'
      } catch (error) {
        console.error('Logout error:', error)
        // Clear tokens and redirect anyway
        TokenManager.clearTokens()
        window.location.href = '/'
      }
    }

    return {
      userInfo,
      handleLogout
    }
  }
}
</script>

<style scoped>
.dashboard-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.dashboard-header h1 {
  margin: 0;
  color: #333;
  font-size: 24px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 16px;
  color: #666;
}

.logout-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s ease;
}

.logout-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.dashboard-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
}

.card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.card h2 {
  margin: 0 0 16px 0;
  color: #333;
  font-size: 18px;
}

.card pre {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 12px;
  border: 1px solid #e9ecef;
}

.card p {
  margin: 8px 0;
  color: #555;
}

.user-details {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.user-details p {
  margin: 8px 0;
  color: #495057;
}

.loading {
  text-align: center;
  color: #6c757d;
  font-style: italic;
  padding: 20px;
}

.nav-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nav-button {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 16px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s ease;
  text-align: left;
}

.nav-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.nav-icon {
  width: 20px;
  height: 20px;
}

@media (max-width: 768px) {
  .dashboard-header {
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }
  
  .dashboard-content {
    grid-template-columns: 1fr;
  }
}
</style>