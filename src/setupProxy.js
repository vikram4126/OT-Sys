const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
      secure: false,
      cookieDomainRewrite: 'localhost',
      headers: {
        Connection: 'keep-alive',
      },
    })
  );
};
