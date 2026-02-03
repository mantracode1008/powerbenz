const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config({ path: '../server/.env' });

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

const checkRecentUser = async () => {
    try {
        await sequelize.authenticate();
        console.log('--- Checking Last 3 Users ---');

        const users = await Staff.findAll({
            limit: 3,
            order: [['createdAt', 'DESC']]
        });

        users.forEach(u => {
            console.log(`
            ID: ${u.id}
            Name: ${u.name}
            Email: '${u.email}'  <-- Check for spaces or casing
            Role: ${u.role}
            Password Hash: ${u.password ? (u.password.length > 20 ? 'Present (Hashed)' : u.password) : 'MISSING'}
            Active: ${u.isActive}
            -------------------------`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
};

checkRecentUser();
