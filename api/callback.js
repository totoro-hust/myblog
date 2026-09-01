import querystring from 'querystring';

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    const resp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const data = await resp.json();
    const token = data.access_token;
    if (!token) return res.status(400).send('Token exchange failed: ' + JSON.stringify(data));
    const html = `<!DOCTYPE html><html><body><script>
      if (window.opener) {
        window.opener.postMessage({ token: "${token}", provider: "github" }, "*");
        window.close();
      } else { document.body.innerText = "授权成功，请关闭此窗口。"; }
    </script></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  } catch (e) {
    return res.status(500).send('Error: ' + e.message);
  }
}
