// API configuration
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '' // Use relative URLs in production 
  : 'http://localhost:8000' // Backend API URL for development

// Token management
export const TokenManager = {
  getToken(useSession = false) {
    const storage = useSession ? sessionStorage : localStorage
    return storage.getItem('access_token')
  },

  getTokenType(useSession = false) {
    const storage = useSession ? sessionStorage : localStorage
    return storage.getItem('token_type') || 'Bearer'
  },

  getUserInfo(useSession = false) {
    const storage = useSession ? sessionStorage : localStorage
    const userInfo = storage.getItem('user_info')
    return userInfo ? JSON.parse(userInfo) : null
  },

  setTokens(data, remember = false) {
    const storage = remember ? localStorage : sessionStorage
    storage.setItem('access_token', data.access_token)
    storage.setItem('token_type', data.token_type)
    storage.setItem('expires_in', data.expires_in.toString())
    storage.setItem('user_info', JSON.stringify(data.user_info))
  },

  clearTokens() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('token_type')
    localStorage.removeItem('expires_in')
    localStorage.removeItem('user_info')
    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('token_type')
    sessionStorage.removeItem('expires_in')
    sessionStorage.removeItem('user_info')
  },

  isAuthenticated() {
    return !!(this.getToken() || this.getToken(true))
  },

  getAuthHeader() {
    const token = this.getToken() || this.getToken(true)
    const tokenType = this.getTokenType() || this.getTokenType(true)
    return token ? `${tokenType} ${token}` : null
  }
}

// API service
export const ApiService = {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    }

    // Add auth header if available
    const authHeader = TokenManager.getAuthHeader()
    if (authHeader) {
      config.headers.Authorization = authHeader
    }

    console.log('API Request:', {
      url,
      method: config.method || 'GET',
      headers: config.headers,
      body: config.body
    })

    try {
      const response = await fetch(url, config)
      console.log('API Response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      })
      return response
    } catch (error) {
      console.error('API request failed:', error)
      throw error
    }
  },

  async login(username, password) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })

    if (!response.ok) {
      let errorMessage = 'Login failed'
      try {
        const errorData = await response.json()
        errorMessage = errorData.detail?.[0]?.msg || errorData.message || 'Login failed'
      } catch (parseError) {
        // If response is not JSON, get the text content
        try {
          const errorText = await response.text()
          errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`
        } catch (textError) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`
        }
      }
      throw new Error(errorMessage)
    }

    try {
      return await response.json()
    } catch (parseError) {
      throw new Error('Server returned invalid response format')
    }
  },

  async logout() {
    // Call logout endpoint if available
    try {
      await this.request('/auth/logout', {
        method: 'POST'
      })
    } catch (error) {
      console.warn('Logout API call failed:', error)
    }
    
    // Clear tokens regardless of API call result
    TokenManager.clearTokens()
  }
}