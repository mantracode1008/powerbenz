async function setupDemo() {
    try {
        console.log('Attempting to create demo admin user...');
        const response = await fetch('http://127.0.0.1:5000/api/auth/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'admin',
                password: 'admin123'
            })
        });

        const data = await response.json();

        if (response.ok) {
            console.log('Success:', data);
        } else {
            console.log('Server Response:', data);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

setupDemo();
