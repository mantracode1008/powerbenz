const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
// Connection string from user (with & properly handled as string)
const dbUrl = 'postgresql://neondb_owner:npg_6QEiln8syktO@ep-tiny-bush-adyk95h2-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

let content = '';
if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
}

if (!content.includes('DATABASE_URL')) {
    content += `\nDATABASE_URL=${dbUrl}\n`;
    fs.writeFileSync(envPath, content);
    console.log('Successfully added DATABASE_URL to .env');
} else {
    console.log('DATABASE_URL already exists in .env');
}
