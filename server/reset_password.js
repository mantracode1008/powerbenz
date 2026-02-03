require('dotenv').config();
const Staff = require('./models/Staff');
const sequelize = require('./config/database');
const bcrypt = require('bcryptjs');

(async () => {
    try {
        // FORCE SQLITE for local debug if needed, but let's check what's configured
        // actually, if the user says "local", they usually mean the local SQLite DB.
        // BUT my previous debug showed "DATABASE_URL Present: true", which means it's trying to connect to Postgres even locally if .env has it.

        console.log('--- Checking DB Connection ---');
        // Check if we can connect
        await sequelize.authenticate();
        console.log('Connected to:', sequelize.getDialect());

        const users = await Staff.findAll();
        console.log(`Found ${users.length} users.`);

        // Let's reset the password for 'admin@powerbenz.com' to '123456' just in case
        const targetEmail = 'admin@powerbenz.com';
        const user = users.find(u => u.email === targetEmail);

        if (user) {
            console.log(`Resetting password for ${targetEmail}...`);
            const hash = await bcrypt.hash('123456', 10);
            user.password = hash;
            user.isActive = true; // FORCE ACTIVE
            await user.save();
            console.log('Password reset to: 123456');
            console.log('User Active Status Set to TRUE');
        } else {
            console.log(`User ${targetEmail} not found. Creating admin...`);
            const hash = await bcrypt.hash('admin123', 10);
            await Staff.create({
                name: 'Local Admin',
                email: 'admin@admin.com',
                password: hash,
                role: 'Admin',
                isActive: true
            });
            console.log('Created admin@admin.com / admin123');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sequelize.close();
    }
})();
