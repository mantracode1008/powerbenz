const app = require('../server/index');

module.exports = (req, res) => {
    // Vercel Serverless Entry
    console.log(`[VERCEL] ${req.method} ${req.url}`);
    return app(req, res);
};
