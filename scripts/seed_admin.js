const sequelize = require('../server/config/database');
const User = require('../server/models/User');

async function seedAdmin() {
    try {
        await sequelize.sync(); // Ensure tables exist

        const count = await User.count({ where: { username: 'admin' } });
        if (count > 0) {
            console.log('Admin user already exists.');
        } else {
            console.log('Creating admin user...');
            await User.create({
                username: 'admin',
                password: 'admin123',
                role: 'admin'
            });
            console.log('Admin user created successfully.');
        }
    } catch (error) {
        console.error('Error seeding admin:', error);
    } finally {
        // Close connection to allow script to exit (Sequelize keeps connection open)
        await sequelize.close();
    }
}

seedAdmin();
