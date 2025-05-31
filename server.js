require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

const config = {
  tenantId: process.env.TENANT_ID,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  scope: process.env.SCOPE,
  tokenEndpoint: `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
};

console.log('Config:', config); // Debug log to check environment variables

let accessToken = '';
let tokenExpiry = Date.now();

async function refreshToken() {
  try {
    if (!config.clientSecret) {
      throw new Error('Client secret is missing or undefined');
    }

    const response = await axios.post(config.tokenEndpoint, {
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: config.scope,
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + response.data.expires_in * 1000;
    console.log('Token refreshed. Expiry:', new Date(tokenExpiry));
  } catch (error) {
    console.error('Error refreshing token:', error.response?.data || error.message);
  }
}

setInterval(refreshToken, 60 * 60 * 1000); // Refresh every hour
refreshToken(); // Initial refresh

app.get('/get-token', (req, res) => {
  if (Date.now() > tokenExpiry - 5 * 60 * 1000) {
    refreshToken();
  }
  res.json({ access_token: accessToken });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));