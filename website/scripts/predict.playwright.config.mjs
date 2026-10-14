const config = {
 testDir: '.', testMatch: 'predict.spec.mjs', workers: 1, timeout: 60000,
 use: { baseURL: 'http://127.0.0.1:3101', locale: 'en-US' },
 webServer: { command: 'npm run preview:predict', url: 'http://127.0.0.1:3101/predict', reuseExistingServer: true, timeout: 120000 },
};

export default config;
