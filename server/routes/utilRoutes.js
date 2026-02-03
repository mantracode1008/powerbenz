const express = require('express');
const router = express.Router();
const utilController = require('../controllers/utilController');

router.get('/unique-values', utilController.getUniqueValues);

module.exports = router;
