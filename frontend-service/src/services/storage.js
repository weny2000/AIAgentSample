import { ApiService } from './auth.js'

// Storage API service
export const StorageService = {
  async handleApiResponse(response, operation = 'API call') {
    console.log(`[${operation}] Response status:`, response.status, response.statusText)
    console.log(`[${operation}] Response headers:`, Object.fromEntries(response.headers.entries()))
    
    if (!response.ok) {
      let errorMessage = `${operation} failed`
      let responseBody = ''
      
      try {
        responseBody = await response.text()
        console.log(`[${operation}] Error response body:`, responseBody)
        
        // Try to parse as JSON first
        try {
          const errorData = JSON.parse(responseBody)
          errorMessage = errorData.detail?.[0]?.msg || errorData.message || errorData.error || `${operation} failed`
        } catch (jsonError) {
          // If not JSON, use the text content
          errorMessage = responseBody || `HTTP ${response.status}: ${response.statusText}`
        }
      } catch (textError) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`
      }
      
      console.error(`[${operation}] Error:`, errorMessage)
      throw new Error(errorMessage)
    }

    try {
      const responseText = await response.text()
      console.log(`[${operation}] Response body:`, responseText)
      
      // Try to parse as JSON
      if (responseText.trim()) {
        try {
          return JSON.parse(responseText)
        } catch (parseError) {
          console.log(`[${operation}] Response is not JSON, returning as text`)
          return responseText
        }
      } else {
        console.log(`[${operation}] Empty response`)
        return null
      }
    } catch (error) {
      console.error(`[${operation}] Failed to read response:`, error)
      throw new Error('Failed to read server response')
    }
  },

  // Get all accessible directories
  async getDirectories() {
    const response = await ApiService.request('/api/storage/directories')
    return this.handleApiResponse(response, 'Fetch directories')
  },

  // Get directory contents
  async getDirectoryContents(directoryId, path = '') {
    const url = `/api/storage/directories/${directoryId}/contents${path ? `?path=${encodeURIComponent(path)}` : ''}`
    const response = await ApiService.request(url)
    return this.handleApiResponse(response, 'Fetch directory contents')
  },

  // Get directory info
  async getDirectoryInfo(directoryId) {
    const response = await ApiService.request(`/api/storage/directories/${directoryId}`)
    return this.handleApiResponse(response, 'Fetch directory info')
  },

  // Refresh directory size
  async refreshDirectorySize(directoryId) {
    const response = await ApiService.request(`/api/storage/directories/${directoryId}/refresh-size`, {
      method: 'POST'
    })
    return this.handleApiResponse(response, 'Refresh directory size')
  },

  // Get user's storage summary
  async getMyStorage() {
    const response = await ApiService.request('/api/storage/my-storage')
    return this.handleApiResponse(response, 'Fetch storage summary')
  },

  // Get storage statistics
  async getStorageStatistics() {
    const response = await ApiService.request('/api/storage/statistics')
    return this.handleApiResponse(response, 'Fetch storage statistics')
  }
}