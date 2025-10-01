import { ApiService } from './auth.js'

// API Testing and Debug service
export const ApiTestService = {
  async testApiEndpoint(endpoint, method = 'GET', body = null) {
    console.log(`Testing API endpoint: ${method} ${endpoint}`)
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    }
    
    if (body) {
      options.body = JSON.stringify(body)
    }
    
    try {
      const response = await ApiService.request(endpoint, options)
      
      console.log(`Test result for ${endpoint}:`, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      })
      
      const responseText = await response.text()
      console.log(`Response body:`, responseText)
      
      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        body: responseText,
        headers: Object.fromEntries(response.headers.entries())
      }
    } catch (error) {
      console.error(`Test failed for ${endpoint}:`, error)
      return {
        success: false,
        error: error.message,
        endpoint
      }
    }
  },

  async testAllStorageEndpoints() {
    console.log('Testing all storage API endpoints...')
    
    const endpoints = [
      { path: '/api/storage/directories', method: 'GET' },
      { path: '/api/storage/my-storage', method: 'GET' },
      { path: '/api/storage/statistics', method: 'GET' }
    ]
    
    const results = []
    
    for (const endpoint of endpoints) {
      const result = await this.testApiEndpoint(endpoint.path, endpoint.method)
      results.push({
        ...endpoint,
        ...result
      })
    }
    
    return results
  },

  async checkBackendConnectivity() {
    console.log('Checking backend connectivity...')
    
    // Test basic connectivity
    const tests = [
      { name: 'Health Check', path: '/health', method: 'GET' },
      { name: 'Auth Options', path: '/auth/login', method: 'OPTIONS' },
      { name: 'API Root', path: '/api/', method: 'GET' },
      { name: 'Storage Root', path: '/api/storage/', method: 'GET' }
    ]
    
    const results = []
    
    for (const test of tests) {
      try {
        const result = await this.testApiEndpoint(test.path, test.method)
        results.push({
          name: test.name,
          ...result
        })
      } catch (error) {
        results.push({
          name: test.name,
          success: false,
          error: error.message
        })
      }
    }
    
    return results
  }
}