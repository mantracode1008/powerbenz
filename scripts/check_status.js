const sequelize = require('../server/config/database');

(async () => {
    try {
        await sequelize.authenticate();
        const [res] = await sequelize.query("SELECT count(*) as count FROM Containers");
        console.log('Container Count:', res[0].count);

        if (res[0].count > 0) {
            const dates = await sequelize.query("SELECT date FROM Containers ORDER BY date DESC LIMIT 5", { type: sequelize.QueryTypes.SELECT });
            console.log('Recent Dates:', dates);
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await sequelize.close();
    }
})();
