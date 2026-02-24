const sequelize = require('./config/database');
async function check() {
    try {
        await sequelize.authenticate();
        const [results] = await sequelize.query('SHOW TABLES');
        console.log('Tables:', JSON.stringify(results, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
