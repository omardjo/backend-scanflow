require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const qs = require('querystring');

const app = express();

// Consolidated CORS configuration
const allowedOrigins = [
  'https://omardjo.github.io',
  'https://backend-scanflow.onrender.com',
  'http://localhost:80', 
  'http://localhost',                   // Covers http://localhost (no port)
  'http://localhost:80',                // Explicit port 80
  'http://127.0.0.1',                   // IP alias without port
  'http://127.0.0.1:80',       
  ...(process.env.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : []),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Validate environment variables
const requiredEnvVars = ['TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET', 'SCOPE', 'REFRESH_TOKEN'];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const config = {
  tenantId: process.env.TENANT_ID,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  scope: process.env.SCOPE,
  refreshToken: process.env.REFRESH_TOKEN,
  tokenEndpoint: `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
};

let accessToken = '';
let tokenExpiry = Date.now();
let currentRefreshToken = config.refreshToken;

async function refreshToken() {
  try {
    if (!config.clientSecret) {
      throw new Error('Client secret is missing or undefined');
    }
    if (!currentRefreshToken) {
      throw new Error('Refresh token is missing or undefined');
    }

    const formData = qs.stringify({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: config.scope,
      refresh_token: currentRefreshToken,
    });

    const response = await axios.post(config.tokenEndpoint, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + response.data.expires_in * 1000;

    if (response.data.refresh_token) {
      currentRefreshToken = response.data.refresh_token;
      console.log('New refresh token received');
    }

    // Log token payload only in development
    if (process.env.NODE_ENV === 'development') {
      try {
        const tokenParts = accessToken.split('.');
        if (tokenParts.length !== 3) throw new Error('Invalid JWT format');
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        console.log('Token payload:', payload);
      } catch (error) {
        console.error('Error decoding token payload:', error.message);
      }
    }

    console.log('Token refreshed. Expiry:', new Date(tokenExpiry));

    // Schedule next refresh based on expires_in (minus 5 minutes for safety)
    setTimeout(refreshToken, (response.data.expires_in - 300) * 1000);
  } catch (error) {
    console.error('Error refreshing token:', error.response?.data || error.message);
    throw error;
  }
}

// Initialize token refresh before starting the server
async function startServer() {
  try {
    await refreshToken();
    const port = process.env.PORT || 3000;
    app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));
  } catch (error) {
    console.error('Failed to initialize token refresh:', error.message);
    process.exit(1);
  }
}

app.get('/get-token', async (req, res) => {
  console.log('Received request for /get-token from:', req.headers.origin);
  try {
    // Refresh token if close to expiry
    if (Date.now() > tokenExpiry - 5 * 60 * 1000) {
      await refreshToken();
    }

    if (!accessToken) {
      throw new Error('Access token not available');
    }

    res.json({ access_token: accessToken });
  } catch (error) {
    console.error('Error in /get-token:', error.message);
    res.status(500).json({ error: 'Failed to fetch token', details: error.message });
  }
});

startServer();