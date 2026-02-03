const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');

// Routes (Public Loop)
router.get('/', itemController.getItems);
router.get('/:id/containers', itemController.getAvailableContainers);
router.post('/', itemController.createItem);
router.put('/batch-update', itemController.batchUpdateItems); // New Batch Update Endpoint
router.put('/:id', itemController.updateItem);
router.put('/:id/bulk-rate', itemController.bulkUpdateRate); // Bulk Update
router.get('/history/log', itemController.getRateHistory); // Specific path to avoid ID collision
router.delete('/:id', itemController.deleteItem);

module.exports = router;
