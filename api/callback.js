//import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'netlify-cms-default-secret'; // ⚠️ 生产环境务必设置强密钥

// 纯 Node.js 实现 JWT 签发（无需 jsonwebtoken 库）
function signJWT(payload, secret, expiresInSec = 604800) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now

// ✅ 带重试 + 超时的安全 fetch
async function exchangeCodeForToken(code) {
  const url = 'https://github.com/login/oauth/access_token';
  const payload = {
    client_id: GITHUB_CLIENT_ID,
    client_secret: GITHUB_CLIENT_SECRET,
    code
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s 超时

    try {
      console.log(`[OAuth] Attempt ${attempt}: POST ${url}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[OAuth] GitHub API HTTP ${res.status}:`, errText);
        throw new Error(`GitHub OAuth HTTP error: ${res.status}`);
      }

      const data = await res.json();
      console.log('[OAuth] Token Response:', JSON.stringify(data));

      if (data.error) {
        throw new Error(`GitHub OAuth error: ${data.error} - ${data.error_description || ''}`);
      }

      return data.access_token;
    } catch (err) {
      clearTimeout(timeout);
      console.error(`[OAuth] Attempt ${attempt} failed:`, err.message);

      if (attempt < 3) {
        const delay = attempt * 2000; // 2s, 4s 指数退避
        console.log(`[OAuth] Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err; // 最后一次仍失败，抛出原始错误
      }
    }
  }
}

export default async function handler(req, res) {
  // ✅ ENV 诊断日志（部署后第一时间检查）
  console.log('[ENV Check]', {
    hasClientId: !!GITHUB_CLIENT_ID,
    hasClientSecret: !!GITHUB_CLIENT_SECRET,
    hasJwtSecret: !!process.env.JWT_SECRET,
    clientIdPrefix: GITHUB_CLIENT_ID ? GITHUB_CLIENT_ID.substring(0, 6) + '...' : 'MISSING'
  });

  // 仅允许 GET 请求（OAuth 回调）
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state } = req.query;

  if (!code) {
    console.error('[OAuth] Missing code parameter');
    return res.status(400).send('Missing authorization code');
  }

  try {
    // 1. 用 code 换取 access_token
    const accessToken = await exchangeCodeForToken(code);

    if (!accessToken) {
      throw new Error('No access_token received from GitHub');
    }

    // 2. 签发 JWT（Netlify CMS 要求）
    const token = jwt.sign(
      { token: accessToken, provider: 'github' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // 3. 设置 HttpOnly Cookie + Max-Age
    res.setHeader(
      'Set-Cookie',
      `nf_jwt=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
    );

    // 4. 重定向回 CMS admin 页面
    const redirectUrl = state || '/admin/';
    console.log('[OAuth] Success, redirecting to:', redirectUrl);
    res.redirect(302, redirectUrl);
  } catch (err) {
    console.error('[OAuth] Fatal Error:', err.message, err.cause || '');
    res.status(500).send(`OAuth callback failed: ${err.message}`);
  }
}
