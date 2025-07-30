require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise'); // Using promise-based MySQL
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// Initialize Express app
const app = express();

// Security Middleware (NFR3) - CONFIGURED for TheDormHotel.local
app.use(helmet({
  // Disable problematic headers for local domain development
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
    },
  },
}));

app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));

// CORS Configuration - CONFIGURED for TheDormHotel.local
app.use(cors({
  origin: [
    'http://localhost:3000',                    // VM internal access
    'http://127.0.0.1:3000',                   // VM internal access
    'http://192.168.115.130:3000',             // Direct IP access
    'http://TheDormHotel.local:3000',          // Custom domain access
    'http://thedormhotel.local:3000',          // Lowercase version
    /^http:\/\/.*\.local:3000$/,               // Any .local domain fallback
  ],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Additional middleware for domain handling
app.use((req, res, next) => {
  // Set headers for better cross-origin support with custom domain
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Vary', 'Origin');
  
  // Log the host for debugging
  console.log(`🔍 Request from: ${req.headers.host} | Origin: ${req.headers.origin}`);
  next();
});

// Rate Limiting (NFR1)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP'
});
app.use('/api', apiLimiter);

// Database Connection Pool (FR7)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'db',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'example',
  database: process.env.DB_NAME || 'hotel_booking',
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 60000, // 60 seconds connection timeout
  acquireTimeout: 60000, // 60 seconds acquire timeout
  timeout: 60000
});

// Initialize Database Tables with Retry Logic
async function initializeDB() {
  const MAX_RETRIES = 10;
  const RETRY_DELAY = 5000; // 5 seconds
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Database initialization attempt ${attempt}/${MAX_RETRIES}`);
      
      // Verify connection first
      await pool.query('SELECT 1');
      console.log('✅ Database connection successful');
      
      // Create tables transactionally
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          role ENUM('user','admin') NOT NULL DEFAULT 'user',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS bookings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          check_in DATE NOT NULL,
          check_out DATE NOT NULL,
          room_type ENUM('single','double','suite') NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_dates (check_in, check_out)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Upsert default admin
      const hashedPassword = await bcrypt.hash('admin123', 12);
      await pool.query(`
        INSERT INTO users (email, password, role) 
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role)
      `, ['admin@thedormhotel.com', hashedPassword, 'admin']);

      console.log('✅ Database initialized successfully');
      console.log('🏨 Default admin: admin@thedormhotel.com / admin123');
      return;
      
    } catch (err) {
      console.error(`⚠️ Initialization attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
      
      if (attempt === MAX_RETRIES) {
        console.error('❌ Maximum retries reached. Exiting...');
        process.exit(1);
      }
      
      console.log(`Retrying in ${RETRY_DELAY/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
}

// Authentication Middleware
function authenticate(roles = []) {
  return async (req, res, next) => {
    try {
      const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ error: 'Authentication required' });

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const [user] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
      if (!user.length) return res.status(401).json({ error: 'User not found' });

      req.user = user[0];
      next();
    } catch (err) {
      console.error('Authentication error:', err);
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

// API Routes
const router = express.Router();

// Auth Endpoints
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await pool.query(
      'INSERT INTO users (email, password) VALUES (?, ?)',
      [email, hashedPassword]
    );

    console.log(`🎉 New user registered: ${email} from ${req.headers.host}`);
    res.status(201).json({ message: 'Registration successful' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!users.length || !(await bcrypt.compare(password, users[0].password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '8h' }
    );

    // TheDormHotel.local friendly cookie settings
    const hostHeader = req.headers.host || '';
    const isDormHotelDomain = hostHeader.toLowerCase().includes('thedormhotel.local');
    
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // Allow HTTP for local development
      sameSite: 'lax', // Works well with custom local domains
      domain: isDormHotelDomain ? undefined : undefined, // Let browser handle domain
      maxAge: 8 * 60 * 60 * 1000,
      path: '/'
    });

    console.log(`✅ Login successful for ${email} from ${req.headers.host}`);

    res.json({ 
      id: user.id,
      email: user.email,
      role: user.role 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  console.log(`👋 User logged out from ${req.headers.host}`);
  res.json({ message: 'Logged out successfully' });
});

// Booking Endpoints
router.get('/bookings', authenticate(['user', 'admin']), async (req, res) => {
  try {
    let query = 'SELECT * FROM bookings ORDER BY created_at DESC';
    const params = [];
    
    if (req.user.role === 'user') {
      query = 'SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC';
      params.push(req.user.id);
    }

    const [bookings] = await pool.query(query, params);
    res.json(bookings);
  } catch (err) {
    console.error('Fetch bookings error:', err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

router.post('/bookings', authenticate(['user']), async (req, res) => {
  try {
    const { name, email, check_in, check_out, room_type } = req.body;
    
    if (!name || !email || !check_in || !check_out || !room_type) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate dates
    const checkinDate = new Date(check_in);
    const checkoutDate = new Date(check_out);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (checkinDate < today) {
      return res.status(400).json({ error: 'Check-in date cannot be in the past' });
    }

    if (checkoutDate <= checkinDate) {
      return res.status(400).json({ error: 'Check-out date must be after check-in date' });
    }

    const [result] = await pool.query(
      `INSERT INTO bookings 
       (user_id, name, email, check_in, check_out, room_type) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, email, check_in, check_out, room_type]
    );

    console.log(`🏨 New booking created: ${name} (${room_type}) from ${req.headers.host}`);

    res.status(201).json({ 
      id: result.insertId,
      message: 'Booking confirmed' 
    });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Booking failed' });
  }
});

// Delete Booking from admin and allow users to delete their own bookings
router.delete('/bookings/:id', authenticate(['user', 'admin']), async (req, res) => {
  try {
    const bookingId = req.params.id;
    
    // First, get the booking to check ownership
    const [booking] = await pool.query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    
    if (!booking.length) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Check permissions:
    // - Admins can delete any booking
    // - Users can only delete their own bookings
    if (req.user.role !== 'admin' && booking[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own bookings' });
    }
    
    // Delete the booking
    const [result] = await pool.query('DELETE FROM bookings WHERE id = ?', [bookingId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    console.log(`🗑️ Booking ${bookingId} deleted by ${req.user.role} (${req.user.email})`);
    res.status(204).end();
  } catch (err) {
    console.error('Delete booking error:', err);
    res.status(500).json({ error: 'Deletion failed' });
  }
});

// Admin Endpoints
router.get('/admin/users', authenticate(['admin']), async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, email, role, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/admin/stats', authenticate(['admin']), async (req, res) => {
  try {
    const [userCount] = await pool.query('SELECT COUNT(*) as count FROM users');
    const [bookingCount] = await pool.query('SELECT COUNT(*) as count FROM bookings');
    const [roomStats] = await pool.query(`
      SELECT room_type, COUNT(*) as count 
      FROM bookings 
      GROUP BY room_type
    `);

    res.json({
      totalUsers: userCount[0].count,
      totalBookings: bookingCount[0].count,
      roomStats: roomStats
    });
  } catch (err) {
    console.error('Fetch stats error:', err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Default credentials endpoint
router.get('/default-credentials', (req, res) => {
  res.json({
    message: 'TheDormHotel default admin account',
    email: 'admin@thedormhotel.com',
    password: 'admin123',
    domain: 'http://TheDormHotel.local:3000',
    note: 'Change password after first login'
  });
});

// Apply API routes
app.use('/api', router);

// Health Check Endpoint (MUST be before static files)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    domain: req.headers.host,
    hotel: 'TheDormHotel.local'
  });
});

// Serve Frontend Files
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Error Handling (NFR5)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  try {
    await pool.end();
  } catch (err) {
    console.error('Error closing database pool:', err);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  try {
    await pool.end();
  } catch (err) {
    console.error('Error closing database pool:', err);
  }
  process.exit(0);
});

// Start Server
const PORT = process.env.PORT || 3000;
console.log('🏨 Starting TheDormHotel server initialization...');

initializeDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ TheDormHotel server running on port ${PORT}`);
    console.log(`🌐 Access the hotel at: http://TheDormHotel.local:${PORT}`);
    console.log(`🔐 Default admin: admin@thedormhotel.com / admin123`);
    console.log(`📊 Health check: http://TheDormHotel.local:${PORT}/health`);
    console.log(`🛠️ phpMyAdmin: http://TheDormHotel.local:8080`);
  });
}).catch((err) => {
  console.error('❌ Failed to start TheDormHotel server:', err);
  process.exit(1);
});