module.exports = (req, res, next) => {
    // 1. Ensure User is authenticated (auth middleware must run first)
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    // 2. striclty check for Admin rule
    // Normalize role to lowercase to handle 'Admin'/'admin'
    const role = req.user.role ? req.user.role.toLowerCase() : '';

    if (role !== 'admin') {
        console.warn(`[ACCESS DENIED] IP: ${req.ip} - User: ${req.user.name} (${req.user.id}) - Role: ${req.user.role} - Path: ${req.originalUrl}`);
        return res.status(403).json({
            message: 'Access Denied: You do not have permission to view this resource.'
        });
    }

    next();
};
