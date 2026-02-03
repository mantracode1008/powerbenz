const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const bcrypt = require('bcryptjs');
const protect = require('../middleware/auth');
const logAction = require('../utils/logger');
const getDiff = require('../utils/diff');

// Apply protection to all staff management routes
router.use(protect);

// Get all staff
router.get('/', async (req, res) => {
    try {
        const staff = await Staff.findAll({
            // where: { isActive: true }, // Removed to allow Admin to see Pending Approvals
            order: [['name', 'ASC']]
        });
        res.json(staff);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create new staff
router.post('/', async (req, res) => {
    try {
        const { password, ...otherData } = req.body;
        let staffData = { ...otherData };

        if (staffData.password && staffData.password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(staffData.password, 10);
            staffData.password = hashedPassword;
        }

        if (staffData.pin && staffData.pin.trim() !== '') {
            const hashedPin = await bcrypt.hash(staffData.pin, 10);
            staffData.pin = hashedPin;
        }

        // Sanitize dailyWage
        if (staffData.dailyWage === '' || staffData.dailyWage === null || staffData.dailyWage === undefined) {
            staffData.dailyWage = 0;
        } else {
            staffData.dailyWage = parseFloat(staffData.dailyWage) || 0;
        }

        const staff = await Staff.create(staffData);

        // Log Action
        await logAction(req, 'CREATE', 'Staff', staff.id, {
            name: staff.name,
            role: staff.role,
            email: staff.email
        });

        res.status(201).json(staff);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update staff
router.put('/:id', async (req, res) => {
    try {
        const staff = await Staff.findByPk(req.params.id);
        if (!staff) return res.status(404).json({ message: 'Staff not found' });

        const { password, ...otherData } = req.body;
        let updateData = { ...otherData };

        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateData.password = hashedPassword;
        }

        if (updateData.pin && updateData.pin.trim() !== '') {
            const hashedPin = await bcrypt.hash(updateData.pin, 10);
            updateData.pin = hashedPin;
        } else {
            delete updateData.pin; // Don't overwrite with empty string
        }

        // Sanitize dailyWage
        if (updateData.dailyWage !== undefined) {
            if (updateData.dailyWage === '' || updateData.dailyWage === null) {
                updateData.dailyWage = 0;
            } else {
                updateData.dailyWage = parseFloat(updateData.dailyWage) || 0;
            }
        }

        await staff.update(updateData);

        // Log Action
        const changes = getDiff(staff.toJSON(), updateData);
        await logAction(req, 'UPDATE', 'Staff', staff.id, {
            name: staff.name,
            changes: changes || 'No changes detected'
        });

        res.json(staff);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete staff (Soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const staff = await Staff.findByPk(req.params.id);
        if (!staff) return res.status(404).json({ message: 'Staff not found' });

        await staff.destroy();

        // Log Action (Try-Catch in case logging fails after user is gone, though details are preserved)
        try {
            await logAction(req, 'DELETE', 'Staff', staff.id, {
                name: staff.name,
                deleted: true
            });
        } catch (logErr) {
            console.warn('Logging delete failed:', logErr);
        }

        res.json({ message: 'Staff deleted permanently' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
