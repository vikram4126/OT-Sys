const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'https://arc.customappsteam.co.uk',
      changeOrigin: true,
      secure: false,
      cookieDomainRewrite: 'localhost',
      headers: {
        Connection: 'keep-alive',
      },
    })
  );
};
