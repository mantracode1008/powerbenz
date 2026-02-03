const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Container = sequelize.define('Container', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    containerNo: {
        type: DataTypes.STRING,
        allowNull: false
    },
    date: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    firm: {
        type: DataTypes.STRING,
        allowNull: false
    },
    firmId: {
        type: DataTypes.UUID
    },
    worker: {
        type: DataTypes.STRING
    },
    workerCount: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    containerWeight: {
        type: DataTypes.FLOAT
    },
    assortmentWeight: {
        type: DataTypes.FLOAT
    },
    lrNo: {
        type: DataTypes.STRING
    },
    blNo: {
        type: DataTypes.STRING
    },
    unloadDate: {
        type: DataTypes.DATE
    },
    remarks: {
        type: DataTypes.TEXT
    },
    totalAmount: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
        validate: {
            min: 0
        }
    }
}, {
    indexes: [
        {
            fields: ['date']
        },
        {
            fields: ['containerNo']
        },
        {
            fields: ['firm']
        },
        {
            fields: ['updatedAt']
        }
    ]
});

module.exports = Container;
