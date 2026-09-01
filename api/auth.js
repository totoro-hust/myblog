export default function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  //const redirectUri = 'https://blog.luckdove.com/api/callback';
  
  // 动态获取当前访问的域名，这样在 vercel.app 和 luckdove.com 都能用
  const host = req.headers.host; 
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${protocol}://${host}/api/callback`;
  const scope = 'repo';
  const state = Math.random().toString(36).slice(2);
  const url =
    `https://github.com/login/oauth/authorize?` +
    `client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;
  res.redirect(url);
}
