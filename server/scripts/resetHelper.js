const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '../server/.env' });

// Setup Sequelize
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    }
});

const Staff = sequelize.define('Staff', {
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    role: DataTypes.STRING,
    password: DataTypes.STRING,
    isActive: DataTypes.BOOLEAN
});

const resetPassword = async () => {
    try {
        await sequelize.authenticate();
        console.log('Connected to DB.');

        const email = 'Eagle@gmail.com';
        const user = await Staff.findOne({ where: { email } });

        if (!user) {
            console.log(`User ${email} not found.`);
            return;
        }

        console.log(`Found User: ${user.name} (${user.role})`);

        const hash = await bcrypt.hash('123456', 10);
        user.password = hash;
        await user.save();

        console.log(`✅ Password for ${email} has been reset to: 123456`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
};

resetPassword();
