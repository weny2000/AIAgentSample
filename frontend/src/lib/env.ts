// Environment variable utility that works in both browser and test environments

// For Jest compatibility, we'll use process.env and provide fallbacks
export const env = {
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || '/api',
  VITE_WS_URL: process.env.VITE_WS_URL || 'wss://api.example.com',
  NODE_ENV: process.env.NODE_ENV || 'development'
};