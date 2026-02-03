const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Staff = require('./Staff');

const Attendance = sequelize.define('Attendance', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    status: {
        type: DataTypes.ENUM('Present', 'Absent', 'Half Day', 'Leave'),
        defaultValue: 'Present'
    },
    remarks: {
        type: DataTypes.STRING
    }
});

// Define Association
Staff.hasMany(Attendance, { foreignKey: 'staffId' });
Attendance.belongsTo(Staff, { foreignKey: 'staffId' });

module.exports = Attendance;
