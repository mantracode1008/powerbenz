
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

if (process.env.FORCE_SQLITE === 'true') {
    delete process.env.DATABASE_URL;
}

const Staff = require('./models/Staff');
const sequelize = require('./config/database');
const bcrypt = require('bcryptjs');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('Connected to SQLite DB');

        const adminEmail = 'admin@admin.com';
        const existing = await Staff.findOne({ where: { email: adminEmail } });

        if (existing) {
            console.log('Admin already exists.');
        } else {
            console.log('Seeding Admin...');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await Staff.create({
                name: 'Local Admin',
                email: adminEmail,
                password: hashedPassword,
                role: 'Admin',
                isActive: true,
                workerNo: 'A-001'
            });
            console.log('Admin Seeding Complete: admin@admin.com / admin123');
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        try { await sequelize.close(); } catch (e) { }
    }
})();
