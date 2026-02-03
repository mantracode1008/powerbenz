const express = require('express');
const router = express.Router();
const ScrapType = require('../models/ScrapType');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

// Get all scrap types with pagination and search
router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const where = {};
        if (search) {
            where.name = sequelize.where(
                sequelize.fn('lower', sequelize.col('name')),
                'LIKE',
                `%${search.toLowerCase()}%`
            );
        }

        const { count, rows } = await ScrapType.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['name', 'ASC']]
        });

        res.json({
            scrapTypes: rows,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalScrapTypes: count
        });
    } catch (error) {
        console.error('Error searching scrap types:', error);
        res.status(500).json({ message: error.message });
    }
});

// Create a new scrap type
router.post('/', async (req, res) => {
    try {
        const { name, description } = req.body;

        // Check if scrap type already exists (case-insensitive)
        const existingType = await ScrapType.findOne({
            where: sequelize.where(
                sequelize.fn('lower', sequelize.col('name')),
                sequelize.fn('lower', name)
            )
        });

        if (existingType) {
            return res.status(409).json({ message: 'Scrap Type with this name already exists' });
        }

        const newType = await ScrapType.create({ name, description });
        res.status(201).json(newType);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;
