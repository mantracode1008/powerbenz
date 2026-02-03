const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const sequelize = require('../server/config/database');
const Container = require('../server/models/Container');
const ContainerItem = require('../server/models/ContainerItem');

async function mergeContainers() {
    const t = await sequelize.transaction();
    try {
        await sequelize.authenticate();

        const targetId = '89d81720-f795-4612-b964-768e0d147fe8'; // The one with 10 items (Keep this)
        const sourceId = 'c03dac42-3e14-45fb-aad9-0d202212e0f0'; // The one with 2 items (Merge checks then delete)

        console.log(`Merging items from ${sourceId} into ${targetId}...`);

        // 1. Update items
        const [updatedCount] = await ContainerItem.update(
            { containerId: targetId },
            {
                where: { containerId: sourceId },
                transaction: t
            }
        );

        console.log(`Moved ${updatedCount} items.`);

        // 2. Delete source container
        await Container.destroy({
            where: { id: sourceId },
            transaction: t
        });

        console.log('Deleted source container.');

        // 3. Update target container totals (optional but good practice)
        // We can just sum the counts if needed, or leave it if it's dynamic
        // But let's just commit for now as the user primarily asked for container count fix.

        await t.commit();
        console.log('SUCCESS: Merge Complete. Total containers should now be 3.');

    } catch (error) {
        if (t) await t.rollback();
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

mergeContainers();
