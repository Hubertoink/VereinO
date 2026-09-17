import config from './playwright.config'
export default { ...config, use: { ...config.use, launchOptions: { executablePath: '/usr/bin/chromium' } } }
