export default {
  server: {
    host: true,
    allowedHosts: true,
  },
  plugins: [
    {
      name: 'mock-hrv-api',
      configureServer(server) {
        server.middlewares.use('/api/hrv/measurements', (req, res, next) => {
          if (req.method !== 'POST') return next();
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            console.log('[HRV 수신 데이터 길이]', body.length, 'bytes');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              measurementId: 123,
              status: 'OK',
              retryReason: null,
              rmssdMs: 41.2,
              hrBpm: 64
            }));
          });
        });
      },
    },
  ],
};