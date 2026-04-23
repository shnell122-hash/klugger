'use strict';

module.exports = function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  // API callers get JSON; browser requests get a redirect hint
  res.status(401).json({ error: 'No autenticado', redirect: '/login' });
};
