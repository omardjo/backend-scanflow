require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const qs = require('querystring'); // For URL-encoded form data

const app = express();

// Allow all origins for debugging (or specify dynamically)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const config = {
  tenantId: process.env.TENANT_ID,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  scope: process.env.SCOPE,
  refreshToken: process.env.REFRESH_TOKEN,
  tokenEndpoint: `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
};

console.log('Config:', config);

let accessToken = '';
let tokenExpiry = Date.now();
let currentRefreshToken = config.refreshToken; // Store the refresh token dynamically

async function refreshToken() {
  try {
    if (!config.clientSecret) {
      throw new Error('Client secret is missing or undefined');
    }

    if (!currentRefreshToken) {
      throw new Error('Refresh token is missing or undefined');
    }

    // Prepare the form data as URL-encoded string
    const formData = qs.stringify({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: config.scope,
      refresh_token: currentRefreshToken, // Use the current refresh token
    });

    const response = await axios.post(config.tokenEndpoint, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + response.data.expires_in * 1000;

    // Update the refresh token if a new one is provided
    if (response.data.refresh_token) {
      currentRefreshToken = response.data.refresh_token;
      console.log('New refresh token received:', currentRefreshToken);
    }

    // Decode the token to log its contents (for debugging)
    const tokenParts = accessToken.split('.');
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    console.log('Token payload:', payload);

    console.log('Token refreshed. Expiry:', new Date(tokenExpiry));
  } catch (error) {
    console.error('Error refreshing token:', error.response?.data || error.message);
    throw error; // Re-throw to handle in the endpoint
  }
}

// Refresh token every hour
setInterval(refreshToken, 60 * 60 * 1000);
refreshToken();

app.get('/get-token', async (req, res) => {
  console.log('Received request for /get-token from:', req.headers.origin);
  try {
    // Refresh the token if it's close to expiry (within 5 minutes)
    if (Date.now() > tokenExpiry - 5 * 60 * 1000) {
      await refreshToken();
    }

    if (!accessToken) {
      throw new Error('Access token not available');
    }

    res.json({ access_token: accessToken });
  } catch (error) {
    console.error('Error in /get-token:', error.message);
    res.status(500).json({ error: 'Failed to fetch token' });
  }
});





const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));