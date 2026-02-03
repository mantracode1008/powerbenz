require('dotenv').config({ path: 'server/.env' });

console.log('--- CHECKING ENV ---');
if (process.env.DATABASE_URL) {
    console.log('DATABASE_URL is SET. App uses Postgres (Live).');
} else {
    console.log('DATABASE_URL is MISSING. App uses SQLite (Local).');
}

if (process.env.EMAIL_USER) {
    console.log('EMAIL_USER is SET.');
} else {
    console.log('EMAIL_USER is MISSING.');
}
