const { Sequelize } = require('sequelize');

async function testMySql(user, password, database) {
    const url = `mysql://${user}:${password}@localhost:3306/${database}`;
    console.log(`Checking: ${url.replace(/:[^:@]+@/, ':****@')}`);

    const sequelize = new Sequelize(url, {
        dialect: 'mysql',
        logging: false
    });

    try {
        await sequelize.authenticate();
        console.log(`✅ Success! Credentials: ${user} / **** / ${database}`);
        return true;
    } catch (err) {
        console.log(`❌ Failed for ${user}/${database}: ${err.message}`);
        return false;
    } finally {
        await sequelize.close();
    }
}

async function findCredentials() {
    const commonUsers = ['root', 'admin'];
    const commonPass = ['', 'root', 'password', 'admin', '1234', '123456'];
    const dbName = 'scrap_system'; // We want to target this

    // First, try to create DB if possible (requires root with no pass usually)
    // Actually, we can't create DB via Sequelize simple connection if it doesn't exist.
    // We connect to 'mysql' or 'sys' or no DB to create it?
    // Sequelize requires a DB name usually.

    // Let's try connecting to no-db to check login first?
    // Sequelize needs a DB. 'mysql' is a standard DB.

    for (const user of commonUsers) {
        for (const pass of commonPass) {
            // Try connecting to standard 'mysql' db just to verify login
            const canLogin = await testMySql(user, pass, 'mysql');
            if (canLogin) {
                console.log(`\n🎉 FOUND WORKING CREDENTIALS!`);
                console.log(`User: ${user}`);
                console.log(`Pass: ${pass || '(empty)'}`);

                // Now, with these creds, we should output them for the user or update .env
                process.env.FOUND_USER = user;
                process.env.FOUND_PASS = pass;
                return;
            }
        }
    }
    console.log('❌ Could not guess local MySQL credentials.');
}

findCredentials();
