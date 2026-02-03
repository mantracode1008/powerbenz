async function testEndpoint() {
    console.log('Waiting for server to start...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s for startup

    console.log('Hitting endpoint...');
    try {
        const res = await fetch('http://localhost:5000/api/containers/summary/items?month=2026-01');

        if (res.ok) {
            console.log('✅ Endpoint Success:', res.status);
            const data = await res.json();
            // Check if it's the new object structure or array
            if (Array.isArray(data)) {
                console.log('Data Length (Array):', data.length);
            } else {
                console.log('Data Length (Object.items):', data.items ? data.items.length : 'N/A');
            }
        } else {
            console.log('❌ Endpoint Failed:', res.status, res.statusText);
            const text = await res.text();
            console.log('Error Body:', text.substring(0, 500)); // Show preview of error
        }
    } catch (err) {
        console.log('❌ Network Error:', err.message);
    }
}

testEndpoint();
