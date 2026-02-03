require('dotenv').config({ path: 'server/.env' });
const { Sequelize, Op } = require('sequelize');
const sequelize = require('../server/config/database');
const Container = require('../server/models/Container');
const ContainerItem = require('../server/models/ContainerItem');

async function debugRefactor() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // Verify the logic implemented in controller:
        const startDate = '2023-01-01';
        const endDate = '2030-12-31';

        const whereClause = {
            [Op.and]: []
        };

        whereClause[Op.and].push(
            sequelize.where(
                sequelize.fn('COALESCE',
                    sequelize.col('ContainerItem.unloadDate'),
                    sequelize.col('Container.date')
                ),
                {
                    [Op.between]: [startDate, endDate]
                }
            )
        );

        const includeContainer = {
            model: Container,
            attributes: [],
            where: {}
        };

        const items = await ContainerItem.findAll({
            attributes: [
                'itemName',
                [sequelize.fn('SUM', sequelize.col('ContainerItem.quantity')), 'totalQty'],
                [sequelize.fn('AVG', sequelize.col('ContainerItem.rate')), 'avgRate'],
                [sequelize.fn('SUM', sequelize.col('ContainerItem.amount')), 'totalAmount']
            ],
            include: [includeContainer],
            where: whereClause,
            group: ['itemName'],
            order: [[sequelize.literal('"totalAmount"'), 'DESC']],
            raw: true
        });

        console.log(`Query Successful. Rows: ${items.length}`);
        if (items.length > 0) {
            console.table(items.slice(0, 5));
        }

    } catch (error) {
        console.error('Refactor Logic Error:', error);
    } finally {
        await sequelize.close();
    }
}

debugRefactor();
