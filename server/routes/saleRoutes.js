const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');

// Public/View: Read-only access
const protect = require('../middleware/auth');

// Public/View: Read-only access
router.get('/', saleController.getSales);

// Write access (Authenticated Users)
const safeGuard = (req, res, next) => {
    if (!req.user) req.user = { role: 'guest', id: 'guest', name: 'Guest' };
    if (!req.user.role) req.user.role = 'guest';
    next();
};

router.post('/', protect, safeGuard, saleController.createSale);

router.put('/:id', protect, safeGuard, saleController.updateSale);

router.delete('/:id', protect, safeGuard, saleController.deleteSale);

// Emergency Fix Route
router.post('/fix-stock', saleController.fixStock);

module.exports = router;
