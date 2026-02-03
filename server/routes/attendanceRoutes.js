const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Staff = require('../models/Staff');
const { Op } = require('sequelize');

// Get attendance for a specific date or range
router.get('/', async (req, res) => {
    try {
        const { date, month, year, startDate, endDate } = req.query;
        let whereClause = {};

        if (date) {
            whereClause.date = date;
        } else if (startDate && endDate) {
            whereClause.date = {
                [Op.between]: [startDate, endDate]
            };
        } else if (month && year) {
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0);
            whereClause.date = {
                [Op.between]: [start, end]
            };
        }

        const attendance = await Attendance.findAll({
            where: whereClause,
            include: [{
                model: Staff,
                attributes: ['name', 'role']
            }],
            order: [['date', 'DESC'], [Staff, 'name', 'ASC']]
        });
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Mark attendance (Bulk or Single)
router.post('/', async (req, res) => {
    try {
        const { date, records } = req.body;
        // records: [{ staffId, status, remarks }]

        if (!records || !Array.isArray(records)) {
            return res.status(400).json({ message: 'Invalid data format' });
        }

        const results = [];
        for (const record of records) {
            // Check if attendance already exists for this staff on this date
            const existing = await Attendance.findOne({
                where: {
                    staffId: record.staffId,
                    date: date
                }
            });

            if (existing) {
                await existing.update({
                    status: record.status,
                    remarks: record.remarks
                });
                results.push(existing);
            } else {
                const newRecord = await Attendance.create({
                    staffId: record.staffId,
                    date: date,
                    status: record.status,
                    remarks: record.remarks
                });
                results.push(newRecord);
            }
        }

        res.status(201).json(results);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Get attendance stats for a specific staff member
router.get('/stats/:staffId', async (req, res) => {
    try {
        const { staffId } = req.params;
        const { month, year } = req.query;

        const staff = await Staff.findByPk(staffId);
        if (!staff) {
            return res.status(404).json({ message: 'Staff not found' });
        }

        let whereClause = { staffId };

        if (month && year) {
            const startDate = new Date(year, month - 1, 1);
            // Set end date to the last day of the month
            const endDate = new Date(year, month, 0);
            // Adjust to include the full last day if needed, but for DATEONLY it's fine

            // SQLite specific date filtering might be needed if using DATEONLY with standard operators
            // But Sequelize usually handles this. Let's stick to standard Op.between
            whereClause.date = {
                [Op.between]: [
                    `${year}-${month.toString().padStart(2, '0')}-01`,
                    `${year}-${month.toString().padStart(2, '0')}-${endDate.getDate()}`
                ]
            };
        }

        const attendanceRecords = await Attendance.findAll({
            where: whereClause,
            order: [['date', 'DESC']]
        });

        // Calculate stats
        const stats = {
            Present: 0,
            Absent: 0,
            'Half Day': 0,
            Leave: 0
        };

        attendanceRecords.forEach(record => {
            if (stats[record.status] !== undefined) {
                stats[record.status]++;
            }
        });

        res.json({
            staff,
            stats,
            history: attendanceRecords
        });

    } catch (error) {
        console.error('Error fetching staff stats:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
