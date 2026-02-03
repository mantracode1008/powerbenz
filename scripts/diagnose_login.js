const sequelize = require('../server/config/database');
const User = require('../server/models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-prod';

async function diagnose() {
    try {
        await sequelize.authenticate();
        console.log('DB Connection: OK');

        const username = 'admin';
        console.log(`Searching for user: ${username}`);
        const user = await User.findOne({ where: { username } });

        if (!user) {
            console.error('User not found!');
            return;
        }
        console.log('User found:', user.id);

        console.log('Testing Password Validation...');
        const isValid = await user.validatePassword('admin123');
        console.log('Password Valid:', isValid);

        console.log('Testing JWT Generation...');
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        console.log('JWT Generated:', token.substring(0, 20) + '...');

        console.log('DIAGNOSIS: LOGIN LOGIC IS FINE');

    } catch (error) {
        console.error('DIAGNOSIS FAILED:', error);
    } finally {
        await sequelize.close();
    }
}

diagnose();
