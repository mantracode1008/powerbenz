require('dotenv').config({ path: '../server/.env' });
const Staff = require('../server/models/Staff');
const sequelize = require('../server/config/database');
const bcrypt = require('bcryptjs');

const resetPassword = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database Connected.');

        const email = 'admin@powerbenz.com';
        const newPassword = 'admin123';

        const admin = await Staff.findOne({ where: { email } });

        if (!admin) {
            console.log(`❌ No user found with email: ${email}`);
            return;
        }

        console.log(`User Found: ${admin.name} (${admin.role})`);

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        admin.password = hashedPassword;
        await admin.save();

        console.log(`✅ PASSWORD RESET SUCCESSFUL!`);
        console.log(`New Password: ${newPassword}`);

    } catch (error) {
        console.error('Error reset:', error);
    } finally {
        await sequelize.close();
    }
};

resetPassword();
