const utilController = require('../server/controllers/utilController');
// Mock request and response
const req = { query: { field: 'buyerName', search: '', limit: 10 } };
const res = {
    json: (data) => console.log('JSON Output:', data),
    status: (code) => ({ json: (data) => console.log(`Status ${code}:`, data) })
};

// Check if we can run it
if (utilController.getUniqueValues) {
    console.log('Running getUniqueValues...');
    utilController.getUniqueValues(req, res).catch(console.error);
} else {
    console.log('Controller function not found!');
}
