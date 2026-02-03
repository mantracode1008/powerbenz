const sequelize = require('../server/config/database');
const Staff = require('../server/models/Staff');

async function checkStaff() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const allStaff = await Staff.findAll();
        console.log(`Found ${allStaff.length} staff members.`);

        allStaff.forEach(s => {
            console.log(`- ID: ${s.id}, Name: ${s.name}, Email: ${s.email}, Role: ${s.role}, Active: ${s.isActive}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkStaff();
