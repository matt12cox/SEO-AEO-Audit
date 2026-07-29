// Thin wrapper around Google Identity Services (GIS) token client.
// Runs entirely client-side: the user brings their own OAuth Client ID
// (created in Google Cloud Console), and we request a short-lived access
// token directly in the browser. No server, no client secret.

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
].join(' ');

let tokenClient = null;
let currentToken = null;

function gisReady() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      resolve();
      return;
    }
    const check = setInterval(() => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        clearInterval(check);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(check);
      reject(new Error('Google Identity Services script failed to load.'));
    }, 10000);
  });
}

export async function initAuth(clientId) {
  await gisReady();
  return new Promise((resolve, reject) => {
    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: () => {}, // overridden per-request in signIn()
        error_callback: (err) => reject(err),
      });
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

export function signIn() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Auth not initialized. Call initAuth first.'));
      return;
    }
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error_description || resp.error));
        return;
      }
      currentToken = resp.access_token;
      resolve(currentToken);
    };
    tokenClient.requestAccessToken({ prompt: currentToken ? '' : 'consent' });
  });
}

export function getToken() {
  return currentToken;
}

export function signOut() {
  if (currentToken && window.google?.accounts?.oauth2?.revoke) {
    window.google.accounts.oauth2.revoke(currentToken, () => {});
  }
  currentToken = null;
}
