const sequelize = require('../server/config/database');
const ContainerItem = require('../server/models/ContainerItem');

const listItems = async () => {
    try {
        await sequelize.authenticate();
        const items = await ContainerItem.findAll({
            attributes: ['itemName'],
            group: ['itemName']
        });
        console.log('Distinct Item Names in DB:');
        items.forEach(i => console.log(`"${i.itemName}"`));
    } catch (e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
};
listItems();
