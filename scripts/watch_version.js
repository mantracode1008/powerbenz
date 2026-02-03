
const https = require('https');

const TARGET_VERSION = '1.5.8';
const URL = 'https://scrap-server-60pw.onrender.com/api/version';

function checkVersion() {
    return new Promise((resolve, reject) => {
        https.get(URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`Current Version: ${json.version} (Time: ${json.timestamp})`);
                    resolve(json.version);
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', (e) => resolve(null));
    });
}


(async () => {
    console.log(`Waiting for version ${TARGET_VERSION}...`);
    let attempts = 0;
    while (attempts < 120) { // Try for ~20 minutes
        const version = await checkVersion();

        if (version === TARGET_VERSION) {
            console.log('>>> UPDATE DETECTED! <<<');
            process.exit(0);
        }
        await new Promise(r => setTimeout(r, 10000)); // Wait 10s
        attempts++;
    }
    console.log('Timeout waiting for update.');
    process.exit(1);
})();
