const express = require('express');
const router = express.Router();
const containerController = require('../controllers/containerController');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });


// Routes
const protect = require('../middleware/auth');

// Routes
router.get('/', containerController.getContainers);
router.get('/check-active', containerController.checkActiveContainer);
router.get('/summary/items', containerController.getItemSummary);
router.get('/export-matrix', containerController.exportRateMatrix); // New Matrix Export

router.get('/:id', containerController.getContainerById);
// router.post('/', protect, containerController.createContainer); // Create (Protected - Non-Blocking)
router.post('/', containerController.createContainer); // Create (Public - Emergency Fix)
// router.post('/upload', protect, upload.single('file'), containerController.uploadExcel); // Upload (Protected - Non-Blocking)
router.post('/upload', upload.single('file'), containerController.uploadExcel); // Upload (Public - Emergency Fix)
// router.put('/:id', protect, containerController.updateContainer); // Update (Protected - Non-Blocking)
router.put('/:id', containerController.updateContainer); // Update (Public - Emergency Fix)
// router.delete('/:id', protect, containerController.deleteContainer); // Delete (Protected - Non-Blocking)
router.delete('/:id', containerController.deleteContainer); // Delete (Public - Emergency Fix)

router.put('/summary/items/:id', containerController.updateContainerItem); // New: Edit Item from Summary

module.exports = router;
