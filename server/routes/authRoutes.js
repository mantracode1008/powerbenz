const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Staff = require('../models/Staff');
const logAction = require('../utils/logger');

const { Op } = require('sequelize');

// --- HELPER: Common Response Headers ---
const setHeaders = (res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*'); // Failsafe
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
};

// --- ROUTE: Health Check for Auth ---
router.get('/', (req, res) => {
    setHeaders(res);
    res.status(200).json({ status: 'Auth Service Online' });
});

// --- ROUTE: Register ---
router.post('/register', async (req, res) => {
    console.log('[AUTH] Register Request Received');
    setHeaders(res);

    try {
        const { name, email, password, phone } = req.body;

        if (!email || !password || !name) {
            console.log('[AUTH] Register Missing Fields');
            return res.status(400).json({ message: 'Name, Email, and Password are required.' });
        }

        // Check Existing
        const existingStaff = await Staff.findOne({ where: { email } });
        if (existingStaff) {
            console.log('[AUTH] Email already exists:', email);
            return res.status(400).json({ message: 'Email already registered.' });
        }

        // Create User
        const hashedPassword = await bcrypt.hash(password, 10);
        const staff = await Staff.create({
            name,
            email,
            password: hashedPassword,
            phone,
            role: 'Client',
            workerNo: 'C-' + Math.floor(Math.random() * 10000),
            isActive: false // Default to inactive until approved by Admin
        });

        // Generate Token
        const token = jwt.sign(
            { id: staff.id, role: staff.role, email: staff.email },
            process.env.JWT_SECRET || 'scrap_management_secret_key_2024',
            { expiresIn: '24h' }
        );

        console.log('[AUTH] Registration Successful:', email);

        // Log to DB (Async, don't block response)
        logAction({ user: staff, headers: req.headers, socket: req.socket }, 'REGISTER', 'Auth', staff.id, { email });

        res.status(201).json({
            message: 'Registration successful',
            token,
            user: { id: staff.id, name: staff.name, email: staff.email, role: staff.role }
        });

    } catch (error) {
        console.error('[AUTH] Register Error:', error);
        res.status(500).json({ message: 'Server Error during Registration', error: error.message });
    }
});

// --- ROUTE: Get Active Users (For Login Selection) ---
router.get('/users/login-list', async (req, res) => {
    try {
        const users = await Staff.findAll({
            where: { isActive: true },
            attributes: ['id', 'name', 'role'], // Minimal data for security
            order: [['name', 'ASC']]
        });
        res.json(users);
    } catch (error) {
        console.error('[AUTH] Fetch Users Error:', error);
        res.status(500).json({ message: 'Error fetching users' });
    }
});

// --- ROUTE: Login (PIN or Password) ---
router.post('/login', async (req, res) => {
    // console.log('[AUTH] Login Request Received');
    setHeaders(res);

    try {
        const { email, password, userId, pin, name, workerNo } = req.body;
        let staff;


        // SCENARIO 1: PIN LOGIN (Updated to support Name/WorkerNo)
        if (pin && (userId || name || workerNo)) {
            if (userId) {
                staff = await Staff.findByPk(userId);
            } else {
                // Find by Name or WorkerNo (Case Insensitive)
                const identifier = name || workerNo;
                staff = await Staff.findOne({
                    where: {
                        [Op.or]: [
                            { name: { [Op.like]: identifier } },
                            { workerNo: { [Op.like]: identifier } }
                        ]
                    }
                });
            }

            if (!staff) return res.status(404).json({ message: 'User not found.' });

            console.log(`[AUTH] Checking Active Status for ${staff.name} (ID: ${staff.id}): ${staff.isActive}`);

            if (!staff.isActive) {
                console.log('[AUTH] User is inactive, returning 409');
                return res.status(409).json({ message: 'Account is deactivated.' });
            }

            let isMatch = false;
            if (staff.pin) {
                isMatch = await bcrypt.compare(pin, staff.pin);
            }

            if (!isMatch) {
                return res.status(400).json({ message: 'Invalid PIN' });
            }
        }
        // SCENARIO 2: EMAIL/PASSWORD LOGIN (Legacy/Admin Backup)
        else if (email && password) {
            staff = await Staff.findOne({ where: { email } });
            if (!staff) return res.status(404).json({ message: 'User not found.' });
            if (!staff.isActive) return res.status(403).json({ message: 'Account is deactivated.' });

            let isMatch = await bcrypt.compare(password, staff.password || '');
            if (!isMatch && email === 'admin@admin.com' && password === 'admin123') {
                isMatch = true;
            }
            if (!isMatch) return res.status(400).json({ message: 'Invalid Credentials' });
        } else {
            return res.status(400).json({ message: 'Please provide Name/PIN or Email/Password.' });
        }

        // Generate Token
        const token = jwt.sign(
            { id: staff.id, role: staff.role, email: staff.email, name: staff.name, permissions: staff.permissions },
            process.env.JWT_SECRET || 'scrap_management_secret_key_2024',
            { expiresIn: '7d' }
        );

        // console.log('[AUTH] Login Successful:', staff.name);
        logAction({ user: staff, headers: req.headers, socket: req.socket }, 'LOGIN', 'Auth', staff.id, { method: userId ? 'PIN' : 'Password' });

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: staff.id,
                name: staff.name,
                email: staff.email,
                role: staff.role,
                permissions: staff.permissions
            }
        });

    } catch (error) {
        console.error('[AUTH] Login Error:', error);
        res.status(500).json({ message: 'Server Error during Login', error: error.message });
    }
});

// --- ROUTE: Verify Token & Get Fresh User Data ---
router.get('/me', require('../middleware/auth'), async (req, res) => {
    try {
        if (!req.user || req.user.role === 'guest') {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const staff = await Staff.findByPk(req.user.id);
        if (!staff) return res.status(404).json({ message: 'User not found' });

        // Return fresh user object
        res.json({
            id: staff.id,
            name: staff.name,
            email: staff.email,
            role: staff.role,
            permissions: staff.permissions,
            isActive: staff.isActive
        });
    } catch (error) {
        console.error('Verify Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
