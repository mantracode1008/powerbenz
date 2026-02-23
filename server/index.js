const path = require('path');
// Trigger restart for env change
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');

const cors = require('cors');
const sequelize = require('./config/database');

const app = express();

// Trust Proxy (Required for Rate Limiting behind proxy like Render/Vercel)
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5001;

// Sentry Initialization (Disabled for v10 compatibility fix)
// const Sentry = require('@sentry/node');
// const { nodeProfilingIntegration } = require('@sentry/profiling-node');

// Sentry.init({
//     dsn: process.env.SENTRY_DSN,
//     integrations: [
//         nodeProfilingIntegration(),
//     ],
//     tracesSampleRate: 1.0,
//     profilesSampleRate: 1.0,
// });

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression'); // New: Gzip Compression

// Middleware
// The request handler must be the first middleware on the app
// app.use(Sentry.Handlers.requestHandler());
// app.use(Sentry.Handlers.tracingHandler());

app.use(compression()); // Apply compression globally
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.set('trust proxy', 1); // Trust first proxy (Render/Vercel)
app.use(cors({
    origin: (origin, callback) => callback(null, true), // Dynamic origin to fix all
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 200
}));
app.options(/(.*)/, cors()); // FIXED: Regex path avoids Express 5 PathError while handling OPTIONS
app.use(express.json());

// Rate Limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3000, // limit each IP to 3000 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    validate: { xForwardedForHeader: false } // Force disable this validation check
});
app.use('/api/', apiLimiter);

// Routes
const containerRoutes = require('./routes/containerRoutes');
const itemRoutes = require('./routes/itemRoutes');
const staffRoutes = require('./routes/staffRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const saleRoutes = require('./routes/saleRoutes');
const authRoutes = require('./routes/authRoutes');

// Routes Configuration
const apiRouter = express.Router();


// Version Check
apiRouter.get('/version', (req, res) => {
    res.json({

        version: '1.7.0', // WEIGHT-GAIN-FIX-UPDATE
        timestamp: new Date().toISOString(),
        auth_status: 'Active',
        deploy_id: 'VPS-CLIENT-FIX'
    });
});


const firmRoutes = require('./routes/firmRoutes');
const scrapTypeRoutes = require('./routes/scrapTypeRoutes');
const auditRoutes = require('./routes/auditRoutes'); // RESTORED

// Middleware for Strict Access Control
const auth = require('./middleware/auth');
const adminOnly = require('./middleware/adminOnly');

// EMERGENCY STOCK FIX ROUTE
app.post('/api/fix-stock-emergency', require('./controllers/saleController').fixStock);

// --- Routes Configuration (Direct Mount for Clarity) ---

// Public Routes (Auth must remain accessible)
app.use('/auth', authRoutes);

// Protected Routes (Strict Admin Only)
// Protected Routes
app.use('/containers', auth, containerRoutes);
app.use('/items', auth, itemRoutes);
app.use('/staff', auth, staffRoutes); // Allow viewing staff? Maybe
app.use('/attendance', auth, attendanceRoutes);
app.use('/dashboard', auth, dashboardRoutes);
app.use('/sales', auth, saleRoutes);
app.use('/firms', auth, firmRoutes);
app.use('/scrap-types', auth, scrapTypeRoutes);
app.use('/logs', auth, auditRoutes); // Keep Logs Admin Only
app.use('/utils', auth, require('./routes/utilRoutes'));

// Compatibility: Also support /api/* for existing clients/hooks
app.use('/api/auth', authRoutes); // Public

// Compatibility: Also support /api/* for existing clients/hooks


app.use('/api/containers', auth, containerRoutes);
app.use('/api/items', auth, itemRoutes);
app.use('/api/staff', auth, staffRoutes);
app.use('/api/attendance', auth, attendanceRoutes);
app.use('/api/dashboard', auth, dashboardRoutes);
app.use('/api/sales', auth, saleRoutes);
app.use('/api/firms', auth, firmRoutes);
app.use('/api/scrap-types', auth, scrapTypeRoutes);
app.use('/api', apiRouter);
app.use('/api/utils', auth, require('./routes/utilRoutes'));

// Database Connection & Server Start
app.use((err, req, res, next) => {
    console.error('GLOBAL ERROR HANDLER:', err);
    res.status(500).json({
        message: 'GLOBAL_HANDLER_CAUGHT: ' + err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// --- SERVE FRONTEND (Hostinger/VPS Support) ---
// This allows the Node server to host the React app directly
const distPath = path.join(__dirname, '../web/dist');
if (fs.existsSync(distPath)) {
    console.log('📂 Serving Frontend from:', distPath);
    app.use(express.static(distPath));
    // Handle React Routing (return index.html for unknown routes)
    app.get(/(.*)/, (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(distPath, 'index.html'));
        }
    });
} else {
    console.log('⚠️ Frontend build not found at:', distPath);
    console.log('   (Run "npm run build" in web folder for production)');
}

// Database Connection & Server Start
console.log('--- Server Restarted (Env Updated) ---');
console.log('--- Force Deploy: Auth Fix 401 ---');
(async () => {

    try {
        // PERF: Skip Sync on Local Dev to prevent hanging with remote DB
        if (process.env.SKIP_SYNC === 'true') {
            await sequelize.authenticate();
            console.log('Database Connection Authenticated (Sync Skipped for Speed)');
        } else {
            try {
                await sequelize.sync({ alter: true });
                console.log('SQLite/Postgres Database Connected & Synced');
            } catch (syncError) {
                if (syncError.name === 'SequelizeUnknownConstraintError' || syncError.code === 'ER_FK_DUP_NAME' || (syncError.parent && syncError.parent.code === 'ER_FK_DUP_NAME')) {
                    console.warn('⚠️ Warning: Ignoring Constraint Error during Sync (Harmless):', syncError.message);
                } else {
                    console.error('Sync Error Details:', syncError);
                    throw syncError; // Rethrow real errors
                }
            }
        }


        // Auto-seed Admin
        require('./models/AuditLog'); // Ensure model is loaded for sync
        const Staff = require('./models/Staff');
        const bcrypt = require('bcryptjs');

        const adminEmail = process.env.EMAIL_USER || 'admin@admin.com';
        if (adminEmail) {
            const admin = await Staff.findOne({ where: { email: adminEmail } });
            if (!admin) {
                console.log('Auto-Seeding Admin User...');
                const hashedPassword = await bcrypt.hash('admin123', 10);
                await Staff.create({
                    name: 'Admin User',
                    email: adminEmail,
                    role: 'Admin',
                    password: hashedPassword
                });
            } else if (!admin.password) {
                // If admin exists from old system (Google/OTP) but has no password, set one
                console.log('Updating Admin with Default Password...');
                const hashedPassword = await bcrypt.hash('admin123', 10);
                admin.password = hashedPassword;
                await admin.save();
            }
        }
    } catch (err) {
        console.error('Database Connection Error:', err);
    }

    // Only listen if running directly (Local/Render)
    // Vercel imports 'app' instead
    if (require.main === module) {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    }
})();

// Export for Vercel
module.exports = app;
