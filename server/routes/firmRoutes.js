const express = require('express');
const router = express.Router();
const Firm = require('../models/Firm');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

// Get all firms with pagination and search
router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        console.log(`Searching firms with term: "${search}"`);

        const where = {};
        if (search) {
            where.name = sequelize.where(
                sequelize.fn('lower', sequelize.col('name')),
                'LIKE',
                `%${search.toLowerCase()}%`
            );
        }

        const { count, rows } = await Firm.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['name', 'ASC']]
        });

        console.log(`Found ${count} firms matching "${search}"`);

        res.json({
            firms: rows,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalFirms: count
        });
    } catch (error) {
        console.error('Error searching firms:', error);
        res.status(500).json({ message: error.message });
    }
});

// Create a new firm
router.post('/', async (req, res) => {
    try {
        const { name, shortCode, notes } = req.body;

        // Check if firm already exists (case-insensitive)
        const existingFirm = await Firm.findOne({
            where: sequelize.where(
                sequelize.fn('lower', sequelize.col('name')),
                sequelize.fn('lower', name)
            )
        });

        if (existingFirm) {
            return res.status(409).json({ message: 'Firm with this name already exists' });
        }

        const newFirm = await Firm.create({ name, shortCode, notes });
        res.status(201).json(newFirm);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;
