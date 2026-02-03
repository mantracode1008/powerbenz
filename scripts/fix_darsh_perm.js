const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const sequelize = require('../server/config/database');
const Staff = require('../server/models/Staff');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('DB Connected.');
        const users = await Staff.findAll();
        for (const user of users) {
            // Target user "Darsh" or similar
            if (user.name.toLowerCase().includes('darsh')) {
                console.log(`Checking ${user.name} (${user.role})...`);
                if (user.role === 'Admin') {
                    console.log('Is Admin, ok.');
                    continue;
                }

                let perms = user.permissions;
                // Ensure array
                if (typeof perms === 'string') {
                    try { perms = JSON.parse(perms); } catch (e) { perms = []; }
                }
                if (!Array.isArray(perms)) perms = [];

                if (!perms.includes('/rates')) {
                    console.log('Adding /rates...');
                    perms.push('/rates');
                    user.permissions = perms;
                    await user.save();
                    console.log('Saved.');
                } else {
                    console.log('Already has /rates.');
                }
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
})();
