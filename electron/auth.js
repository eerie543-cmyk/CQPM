const { safeStorage, app } = require('electron');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const SECRET_FILE  = path.join(app.getPath('userData'), '.cqpm_jwt_secret');
const SESSION_HOURS = 10;

let _secret = null;

function loadOrCreateSecret() {
  if (_secret) return _secret;

  const encrypted = safeStorage.isEncryptionAvailable();

  if (encrypted && fs.existsSync(SECRET_FILE)) {
    try {
      const buf = fs.readFileSync(SECRET_FILE);
      _secret = safeStorage.decryptString(buf);
      return _secret;
    } catch {
      // Corrupted — fall through to regenerate
    }
  }

  const secret = crypto.randomBytes(48).toString('hex');

  if (encrypted) {
    const buf = safeStorage.encryptString(secret);
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, buf);
  }

  _secret = secret;
  return _secret;
}

function signToken(payload) {
  return jwt.sign(payload, loadOrCreateSecret(), {
    expiresIn: `${SESSION_HOURS}h`,
    issuer:   'cqpm',
    audience: 'cqpm-app',
  });
}

function verifyToken(token) {
  // Throws if invalid or expired — callers must catch
  return jwt.verify(token, loadOrCreateSecret(), {
    issuer:   'cqpm',
    audience: 'cqpm-app',
  });
}

module.exports = { signToken, verifyToken, SESSION_HOURS };
