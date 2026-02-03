const Sale = require('../models/Sale');
const Item = require('../models/Item');
const sequelize = require('../config/database');

exports.getUniqueValues = async (req, res) => {
    try {
        const { field, search, limit = 10 } = req.query;

        console.log(`Getting unique values for field: ${field}, search: ${search}`);

        if (!field) {
            return res.status(400).json({ message: 'Field parameter is required' });
        }

        // Allow-list for security to prevent arbitrary column access
        const allowedFields = ['buyerName', 'hsnCode', 'invoiceNo', 'remarks', 'category'];
        if (!allowedFields.includes(field)) {
            return res.status(400).json({ message: `Invalid field: ${field}` });
        }

        const where = {};
        if (search) {
            where[field] = sequelize.where(
                sequelize.fn('lower', sequelize.col(field)),
                'LIKE',
                `%${search.toLowerCase()}%`
            );
        }

        // Find distinct values
        let model = Sale;
        if (field === 'category') {
            model = Item;
        }

        const distinctValues = await model.findAll({
            attributes: [[sequelize.fn('DISTINCT', sequelize.col(field)), field]],
            where: where,
            limit: parseInt(limit),
            order: [[field, 'ASC']],
            raw: true
        });

        // Map to simple array of strings, filtering out nulls/empty
        const values = distinctValues
            .map(item => item[field])
            .filter(val => val && val.trim().length > 0);

        res.json(values);
    } catch (error) {
        console.error('Error fetching unique values:', error);
        res.status(500).json({ message: error.message });
    }
};
