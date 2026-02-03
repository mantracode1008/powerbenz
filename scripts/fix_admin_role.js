require('dotenv').config({ path: 'server/.env' });
const sequelize = require('../server/config/database');

async function fixRole() {
    console.log('--- FIXING ADMIN ROLE (Admin -> admin) ---');
    try {
        await sequelize.authenticate();

        // 1. Check current
        const [users] = await sequelize.query(`SELECT email, role FROM "Staffs" WHERE email = 'admin@admin.com'`);
        console.log('Before:', users);

        // 2. Update to lowercase 'admin'
        await sequelize.query(`UPDATE "Staffs" SET role = 'admin' WHERE email = 'admin@admin.com'`);
        console.log('Update executed.');

        // 3. Verify
        const [usersUpdated] = await sequelize.query(`SELECT email, role FROM "Staffs" WHERE email = 'admin@admin.com'`);
        console.log('After:', usersUpdated);

    } catch (error) {
        console.error('SQL Error:', error);
    } finally {
        await sequelize.close();
    }
}

fixRole();
