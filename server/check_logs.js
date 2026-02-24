require('dotenv').config();
const sequelize = require('./config/database');
const AuditLog = require('./models/AuditLog');

async function check() {
    try {
        await sequelize.authenticate();
        const count = await AuditLog.count();
        console.log('Total Audit Logs:', count);
        const latest = await AuditLog.findOne({ order: [['createdAt', 'DESC']] });
        console.log('Latest Log:', latest ? JSON.stringify(latest, null, 2) : 'None');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
