const { Sequelize } = require('sequelize');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Use persistent data directory in project
const dbPath = path.join(__dirname, '../data/scrap.sqlite');


let sequelize;

console.log('--- Database Config Init ---');
console.log('DATABASE_URL Present:', !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) console.log('DATABASE_URL Ptr:', process.env.DATABASE_URL.substring(0, 10) + '...');


if (process.env.DATABASE_URL) {
    // Production/Migration - Check URL Protocol
    if (process.env.DATABASE_URL.startsWith('mysql')) {
        console.log('Using MySQL Database');
        sequelize = new Sequelize(process.env.DATABASE_URL, {
            dialect: 'mysql',
            logging: false,
            dialectOptions: {
                // SSL logic if needed, usually not for local
            }
        });
    } else {
        // Postgres (Neon/Vercel)
        sequelize = new Sequelize(process.env.DATABASE_URL, {
            dialect: 'postgres',
            protocol: 'postgres',
            logging: false,
            dialectOptions: {
                ssl: {
                    require: true,
                    rejectUnauthorized: false
                }
            },
            logging: false
        });
    }
} else {
    console.error('CRITICAL: DATABASE_URL is missing. SQLite fallback has been removed.');
    process.exit(1);
}

module.exports = sequelize;
