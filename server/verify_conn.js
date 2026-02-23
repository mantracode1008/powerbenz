const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sequelize = require('./config/database');

(async () => {
    try {
        console.log('Testing connection to DATABASE_URL...');
        console.log('URL:', process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@'));
        await sequelize.authenticate();
        console.log('✅ Connection has been established successfully.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Unable to connect to the database:', error);
        process.exit(1);
    }
})();
