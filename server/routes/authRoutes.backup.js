const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Staff = require('../models/Staff');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const logAction = require('../utils/logger');

// Configure Nodemailer
// For now, we will log to console if no credentials
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Use STARTTLS
    requireTLS: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Helper to generate 6 digit code
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// 1. Send OTP
router.post('/send-otp', async (req, res) => {
    try {
        const { email } = req.body;

        const staff = await Staff.findOne({ where: { email } });
        if (!staff) {
            return res.status(404).json({ message: 'Email not found in system.' });
        }

        if (!staff.isActive) {
            return res.status(403).json({ message: 'Account is deactivated.' });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        // Save to DB
        staff.otp = otp;
        staff.otpExpires = otpExpires;
        await staff.save();

        console.log(`[OTP DEBUG] OTP for ${email}: ${otp}`);

        // Try to send email if creds exist, else just log
        // Try to send email (Fire-and-Forget for speed)
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Scrap System Login OTP',
                text: `Your Login OTP is: ${otp}. Valid for 10 minutes.`
            }).catch(err => console.error('Background Email Error:', err));

            // Return success immediately without waiting for email
            res.json({ message: 'OTP sending in background.' });
        } else {
            res.json({ message: 'OTP generated (Check Console).' });
        }

    } catch (error) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ message: 'Failed to send OTP' });
    }
});

// 2. Login (Password)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const staff = await Staff.findOne({ where: { email } });
        if (!staff) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (!staff.isActive) {
            return res.status(403).json({ message: 'Account is deactivated.' });
        }

        // Check if user has a password set (might be Google Auth user)
        if (!staff.password) {
            return res.status(400).json({ message: 'No password set. Please login with Google or reset password.' });
        }

        // Compare Password (using bcrypt)
        const isMatch = await bcrypt.compare(password, staff.password);
        console.log(`[LOGIN DEBUG] Email: ${email}, Match: ${isMatch}`);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Password' });
        }

        // Generate JWT
        const sessionToken = jwt.sign(
            { id: staff.id, role: staff.role, email: staff.email, name: staff.name },
            process.env.JWT_SECRET || 'fallback_secret_key_change_in_prod',
            { expiresIn: '24h' }
        );

        // Log Action
        req.user = staff; // Attach user to req for logger to pick up Name and ID
        await logAction(req, 'LOGIN', 'Auth', staff.id, { email: staff.email, role: staff.role });

        res.json({
            token: sessionToken,
            user: {
                id: staff.id,
                name: staff.name,
                role: staff.role,
                email: staff.email
            }
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Login failed' });
    }
});

// 3. Register (Public)
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        // Check if email already exists
        const existingStaff = await Staff.findOne({ where: { email } });
        if (existingStaff) {
            return res.status(400).json({ message: 'Email already registered.' });
        }

        // Hash Password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create User (Default Role: Client)
        const staff = await Staff.create({
            name,
            email,
            password: hashedPassword,
            phone,
            role: 'Client', // Default public role
            workerNo: 'C-' + Math.floor(Math.random() * 10000), // Generate temp ID
            isActive: true
        });

        // Generate Token
        const sessionToken = jwt.sign(
            { id: staff.id, role: staff.role, email: staff.email, name: staff.name },
            process.env.JWT_SECRET || 'fallback_secret_key_change_in_prod',
            { expiresIn: '24h' }
        );

        // Log Action
        await logAction({ user: staff, headers: req.headers, socket: req.socket }, 'REGISTER', 'Auth', staff.id, { email, role: 'Client' });

        res.status(201).json({
            message: 'Registration successful',
            token: sessionToken,
            user: {
                id: staff.id,
                name: staff.name,
                role: staff.role,
                email: staff.email
            }
        });

    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ message: 'Registration failed' });
    }
});

module.exports = router;
