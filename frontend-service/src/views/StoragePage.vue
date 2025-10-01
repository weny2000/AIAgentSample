<template>
  <div class="storage-container">
    <div class="storage-header">
      <h1>Storage Management</h1>
      <div class="header-actions">
        <button @click="testConnection" class="test-button" :disabled="isLoading">
          <svg class="test-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M9 12l2 2 4-4"></path>
            <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"></path>
            <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"></path>
            <path d="M12 3c0 1-1 3-3 3s-3-2-3-3 1-3 3-3 3 2 3 3"></path>
            <path d="M12 21c0-1 1-3 3-3s3 2 3 3-1 3-3 3-3-2-3-3"></path>
          </svg>
          Test API
        </button>
        <button @click="goToDashboard" class="back-button">
          <svg class="back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          Back to Dashboard
        </button>
        <button @click="refreshData" class="refresh-button" :disabled="isLoading">
          <svg class="refresh-icon" :class="{ 'spinning': isLoading }" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="m3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <div v-if="errorMessage" class="error-message">
      <div class="error-header">
        <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>API Error</span>
      </div>
      <div class="error-details">{{ errorMessage }}</div>
      <div class="error-actions">
        <button @click="clearError" class="clear-error-button">Clear</button>
        <button @click="runApiTests" class="test-api-button">Test APIs</button>
      </div>
    </div>

    <!-- API Test Results -->
    <div v-if="apiTestResults.length > 0" class="api-test-section">
      <h2>API Test Results</h2>
      <div class="test-results">
        <div v-for="result in apiTestResults" :key="result.name || result.path" 
             class="test-result" :class="{ 'success': result.success, 'error': !result.success }">
          <div class="test-header">
            <span class="test-name">{{ result.name || `${result.method} ${result.path}` }}</span>
            <span class="test-status">{{ result.success ? '✓' : '✗' }}</span>
          </div>
          <div class="test-details">
            <p><strong>Status:</strong> {{ result.status || 'N/A' }} {{ result.statusText || '' }}</p>
            <p v-if="result.error"><strong>Error:</strong> {{ result.error }}</p>
            <details v-if="result.body">
              <summary>Response Body</summary>
              <pre>{{ result.body }}</pre>
            </details>
          </div>
        </div>
      </div>
    </div>

    <!-- Storage Summary -->
    <div class="storage-summary-section">
      <h2>Storage Summary</h2>
      <div class="storage-cards">
        <div class="storage-card">
          <h3>My Storage</h3>
          <div v-if="myStorage" class="storage-info">
            <pre>{{ JSON.stringify(myStorage, null, 2) }}</pre>
          </div>
          <div v-else class="loading">Loading...</div>
        </div>
        
        <div class="storage-card">
          <h3>Storage Statistics</h3>
          <div v-if="storageStats" class="storage-info">
            <pre>{{ JSON.stringify(storageStats, null, 2) }}</pre>
          </div>
          <div v-else class="loading">Loading...</div>
        </div>
      </div>
    </div>

    <!-- Directories -->
    <div class="directories-section">
      <h2>Accessible Directories</h2>
      <div v-if="directories.length > 0" class="directories-grid">
        <div 
          v-for="directory in directories" 
          :key="directory.id" 
          class="directory-card"
          @click="selectDirectory(directory)"
        >
          <div class="directory-header">
            <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"></path>
            </svg>
            <h3>{{ directory.name || directory.id }}</h3>
          </div>
          <div class="directory-info">
            <p><strong>ID:</strong> {{ directory.id }}</p>
            <p v-if="directory.size"><strong>Size:</strong> {{ formatFileSize(directory.size) }}</p>
            <p v-if="directory.type"><strong>Type:</strong> {{ directory.type }}</p>
          </div>
          <div class="directory-actions">
            <button @click.stop="refreshDirectorySize(directory.id)" class="action-button">
              Refresh Size
            </button>
          </div>
        </div>
      </div>
      <div v-else-if="!isLoading" class="no-data">
        No directories found
      </div>
    </div>

    <!-- Directory Contents -->
    <div v-if="selectedDirectory" class="contents-section">
      <div class="contents-header">
        <h2>{{ selectedDirectory.name || selectedDirectory.id }} Contents</h2>
        <div class="breadcrumb">
          <span @click="currentPath = ''" class="breadcrumb-item">Root</span>
          <span v-for="(part, index) in pathParts" :key="index" class="breadcrumb-separator">/</span>
          <span v-for="(part, index) in pathParts" :key="index" 
                @click="navigateToPath(index)" 
                class="breadcrumb-item">{{ part }}</span>
        </div>
      </div>
      
      <div v-if="directoryContents" class="contents-list">
        <div v-if="typeof directoryContents === 'string'" class="content-text">
          <pre>{{ directoryContents }}</pre>
        </div>
        <div v-else-if="Array.isArray(directoryContents)" class="content-items">
          <div v-for="item in directoryContents" :key="item.name || item" 
               class="content-item"
               @click="handleItemClick(item)">
            <svg v-if="item.type === 'directory'" class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"></path>
            </svg>
            <svg v-else class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14,2 14,8 20,8"></polyline>
            </svg>
            <span class="item-name">{{ item.name || item }}</span>
            <span v-if="item.size" class="item-size">{{ formatFileSize(item.size) }}</span>
          </div>
        </div>
        <div v-else class="content-object">
          <pre>{{ JSON.stringify(directoryContents, null, 2) }}</pre>
        </div>
      </div>
      <div v-else class="loading">Loading contents...</div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { StorageService } from '../services/storage.js'
import { ApiTestService } from '../services/apiTest.js'

export default {
  name: 'StoragePage',
  setup() {
    const router = useRouter()
    
    const isLoading = ref(false)
    const errorMessage = ref('')
    const directories = ref([])
    const myStorage = ref(null)
    const storageStats = ref(null)
    const selectedDirectory = ref(null)
    const directoryContents = ref(null)
    const currentPath = ref('')
    const apiTestResults = ref([])

    const pathParts = computed(() => {
      return currentPath.value ? currentPath.value.split('/').filter(part => part) : []
    })

    const goToDashboard = () => {
      router.push('/dashboard')
    }

    const clearError = () => {
      errorMessage.value = ''
    }

    const runApiTests = async () => {
      isLoading.value = true
      try {
        console.log('Running comprehensive API tests...')
        
        // Test backend connectivity first
        const connectivityResults = await ApiTestService.checkBackendConnectivity()
        console.log('Connectivity test results:', connectivityResults)
        
        // Test storage endpoints
        const storageResults = await ApiTestService.testAllStorageEndpoints()
        console.log('Storage API test results:', storageResults)
        
        apiTestResults.value = [...connectivityResults, ...storageResults]
        
      } catch (error) {
        console.error('API test failed:', error)
        errorMessage.value = `API test failed: ${error.message}`
      } finally {
        isLoading.value = false
      }
    }

    const testConnection = async () => {
      isLoading.value = true
      errorMessage.value = ''
      
      try {
        console.log('Testing API connection...')
        await runApiTests()
        
      } catch (error) {
        console.error('Connection test failed:', error)
        errorMessage.value = `Connection test failed: ${error.message}`
      } finally {
        isLoading.value = false
      }
    }

    const formatFileSize = (bytes) => {
      if (!bytes) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const loadDirectories = async () => {
      try {
        console.log('Loading directories...')
        const data = await StorageService.getDirectories()
        console.log('Directories loaded:', data)
        directories.value = Array.isArray(data) ? data : []
      } catch (error) {
        console.error('Failed to load directories:', error)
        errorMessage.value = `Failed to load directories: ${error.message}`
      }
    }

    const loadMyStorage = async () => {
      try {
        console.log('Loading my storage...')
        const data = await StorageService.getMyStorage()
        console.log('My storage loaded:', data)
        myStorage.value = data
      } catch (error) {
        console.error('Failed to load my storage:', error)
        // Don't set error message for this, as it's optional
      }
    }

    const loadStorageStats = async () => {
      try {
        console.log('Loading storage stats...')
        const data = await StorageService.getStorageStatistics()
        console.log('Storage stats loaded:', data)
        storageStats.value = data
      } catch (error) {
        console.error('Failed to load storage stats:', error)
        // Don't set error message for this, as it's optional
      }
    }

    const selectDirectory = async (directory) => {
      selectedDirectory.value = directory
      currentPath.value = ''
      await loadDirectoryContents(directory.id, '')
    }

    const loadDirectoryContents = async (directoryId, path = '') => {
      try {
        const data = await StorageService.getDirectoryContents(directoryId, path)
        directoryContents.value = data
      } catch (error) {
        console.error('Failed to load directory contents:', error)
        errorMessage.value = error.message
      }
    }

    const refreshDirectorySize = async (directoryId) => {
      try {
        await StorageService.refreshDirectorySize(directoryId)
        // Reload directory info after refresh
        await loadDirectories()
        errorMessage.value = ''
      } catch (error) {
        console.error('Failed to refresh directory size:', error)
        errorMessage.value = error.message
      }
    }

    const navigateToPath = (index) => {
      const newPath = pathParts.value.slice(0, index + 1).join('/')
      currentPath.value = newPath
      if (selectedDirectory.value) {
        loadDirectoryContents(selectedDirectory.value.id, newPath)
      }
    }

    const handleItemClick = (item) => {
      if (typeof item === 'object' && item.type === 'directory') {
        const newPath = currentPath.value ? `${currentPath.value}/${item.name}` : item.name
        currentPath.value = newPath
        loadDirectoryContents(selectedDirectory.value.id, newPath)
      }
    }

    const refreshData = async () => {
      isLoading.value = true
      errorMessage.value = ''
      
      try {
        await Promise.all([
          loadDirectories(),
          loadMyStorage(),
          loadStorageStats()
        ])
      } catch (error) {
        console.error('Failed to refresh data:', error)
        errorMessage.value = 'Failed to refresh data'
      } finally {
        isLoading.value = false
      }
    }

    onMounted(() => {
      refreshData()
    })

    return {
      isLoading,
      errorMessage,
      directories,
      myStorage,
      storageStats,
      selectedDirectory,
      directoryContents,
      currentPath,
      pathParts,
      apiTestResults,
      goToDashboard,
      clearError,
      runApiTests,
      testConnection,
      formatFileSize,
      selectDirectory,
      refreshDirectorySize,
      navigateToPath,
      handleItemClick,
      refreshData
    }
  }
}
</script>

<style scoped>
.storage-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.storage-header {
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

.storage-header h1 {
  margin: 0;
  color: #333;
  font-size: 24px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.refresh-button {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s ease;
}

.back-button {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #6c757d;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s ease;
}

.back-button:hover {
  background: #5a6268;
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(108, 117, 125, 0.3);
}

.back-icon {
  width: 16px;
  height: 16px;
}

.test-button {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s ease;
}

.test-button:hover:not(:disabled) {
  background: #218838;
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);
}

.test-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.test-icon {
  width: 16px;
  height: 16px;
}

.refresh-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.refresh-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.refresh-icon {
  width: 16px;
  height: 16px;
}

.refresh-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  background-color: #fee2e2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 8px;
}

.error-icon {
  width: 20px;
  height: 20px;
}

.error-details {
  margin-bottom: 12px;
  font-family: monospace;
  background: rgba(255, 255, 255, 0.7);
  padding: 8px;
  border-radius: 4px;
  word-break: break-all;
}

.error-actions {
  display: flex;
  gap: 8px;
}

.clear-error-button,
.test-api-button {
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.3s ease;
}

.test-api-button {
  background: #2563eb;
}

.clear-error-button:hover {
  background: #b91c1c;
}

.test-api-button:hover {
  background: #1d4ed8;
}

.api-test-section {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.api-test-section h2 {
  margin: 0 0 20px 0;
  color: #333;
  font-size: 20px;
}

.test-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.test-result {
  border: 2px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  background: #f8f9fa;
}

.test-result.success {
  border-color: #28a745;
  background: #f8fff9;
}

.test-result.error {
  border-color: #dc3545;
  background: #fff8f8;
}

.test-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.test-name {
  font-weight: 600;
  color: #333;
}

.test-status {
  font-size: 18px;
  font-weight: bold;
}

.test-result.success .test-status {
  color: #28a745;
}

.test-result.error .test-status {
  color: #dc3545;
}

.test-details p {
  margin: 4px 0;
  font-size: 14px;
  color: #666;
}

.test-details details {
  margin-top: 8px;
}

.test-details summary {
  cursor: pointer;
  font-weight: 500;
  color: #495057;
}

.test-details pre {
  background: white;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 11px;
  border: 1px solid #dee2e6;
  margin: 4px 0 0 0;
}

.storage-summary-section,
.directories-section,
.contents-section {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.storage-summary-section h2,
.directories-section h2,
.contents-section h2 {
  margin: 0 0 20px 0;
  color: #333;
  font-size: 20px;
}

.storage-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 20px;
}

.storage-card {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
}

.storage-card h3 {
  margin: 0 0 16px 0;
  color: #495057;
  font-size: 16px;
}

.storage-info pre {
  background: white;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
  border: 1px solid #dee2e6;
  margin: 0;
}

.directories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.directory-card {
  background: #f8f9fa;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.directory-card:hover {
  border-color: #667eea;
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.2);
}

.directory-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.folder-icon {
  width: 24px;
  height: 24px;
  color: #667eea;
}

.directory-header h3 {
  margin: 0;
  color: #333;
  font-size: 16px;
}

.directory-info p {
  margin: 4px 0;
  font-size: 14px;
  color: #666;
}

.directory-actions {
  margin-top: 12px;
}

.action-button {
  background: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.3s ease;
}

.action-button:hover {
  background: #5a6268;
}

.contents-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.breadcrumb {
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #666;
}

.breadcrumb-item {
  cursor: pointer;
  color: #667eea;
  text-decoration: underline;
}

.breadcrumb-item:hover {
  color: #5a67d8;
}

.breadcrumb-separator {
  margin: 0 8px;
  color: #adb5bd;
}

.contents-list {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 16px;
}

.content-text pre,
.content-object pre {
  background: white;
  padding: 16px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
  border: 1px solid #dee2e6;
  margin: 0;
}

.content-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.content-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.content-item:hover {
  border-color: #667eea;
  background: #f8f9ff;
}

.item-icon {
  width: 20px;
  height: 20px;
  color: #6c757d;
}

.item-name {
  flex: 1;
  font-weight: 500;
  color: #333;
}

.item-size {
  font-size: 12px;
  color: #6c757d;
}

.loading {
  text-align: center;
  color: #6c757d;
  font-style: italic;
  padding: 20px;
}

.no-data {
  text-align: center;
  color: #6c757d;
  font-style: italic;
  padding: 40px;
}

@media (max-width: 768px) {
  .storage-header {
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }
  
  .storage-cards {
    grid-template-columns: 1fr;
  }
  
  .directories-grid {
    grid-template-columns: 1fr;
  }
  
  .contents-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>