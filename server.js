require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const smpp = require('smpp');

const PORT = Number(process.env.PORT || 3000);

function sendSMPPMessage(payload) {
  return new Promise((resolve, reject) => {
    const session = smpp.connect({
      host: payload.host || process.env.SMPP_HOST,
      port: Number(payload.port || process.env.SMPP_PORT)
    });

    let settled = false;

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      try {
        session.close();
      } catch (closeErr) {
        // Ignore close errors
      }
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    };

    session.on('connect', () => {
      session.bind_transceiver(
        {
          system_id: payload.systemId || process.env.SMPP_SYSTEM_ID,
          password: payload.password || process.env.SMPP_PASSWORD
        },
        (pdu) => {
          if (pdu.command_status !== 0) {
            finish(new Error(`Bind failed with status ${pdu.command_status}`));
            return;
          }

          session.submit_sm(
            {
              source_addr: payload.sourceAddr || process.env.SMPP_SOURCE_ADDR,
              destination_addr: payload.destinationAddr || process.env.SMPP_DESTINATION_ADDR,
              short_message: payload.shortMessage || process.env.SMPP_SHORT_MESSAGE
            },
            (submitPdu) => {
              if (submitPdu.command_status !== 0) {
                finish(new Error(`Submit failed with status ${submitPdu.command_status}`));
                return;
              }

              finish(null, {
                success: true,
                messageId: submitPdu.message_id || null
              });
            }
          );
        }
      );
    });

    session.on('error', (err) => {
      finish(err);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  const pathname = (requestUrl.pathname || '/').replace(/\/+$/, '') || '/';
  const isHealthRoute = pathname === '/health' || pathname === '/healthz';
  const isRootRoute = pathname === '' || pathname === '/';
  const isSendRoute = [
    '/send-sms',
    '/sendSMS',
    '/sms',
    '/api/send-sms',
    '/api/sendSMS',
    '/api/sms',
    '/api/send'
  ].includes(pathname);

  if (req.method === 'GET' && isHealthRoute) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'GET' && isRootRoute) {
    const htmlPath = path.join(__dirname, 'index.html');
    fs.readFile(htmlPath, 'utf8', (err, html) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Failed to load UI');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    return;
  }

  if ((req.method === 'GET' || req.method === 'POST') && isSendRoute) {
    const parsePayload = async () => {
      if (req.method === 'GET') {
        return {
          destinationAddr: requestUrl.searchParams.get('destinationAddr') || undefined,
          shortMessage: requestUrl.searchParams.get('shortMessage') || undefined,
          sourceAddr: requestUrl.searchParams.get('sourceAddr') || undefined,
          host: requestUrl.searchParams.get('host') || undefined,
          port: requestUrl.searchParams.get('port') || undefined,
          systemId: requestUrl.searchParams.get('systemId') || undefined,
          password: requestUrl.searchParams.get('password') || undefined
        };
      }

      let body = '';
      req.setEncoding('utf8');
      for await (const chunk of req) {
        body += chunk;
      }

      if (!body) {
        return {};
      }

      try {
        return JSON.parse(body);
      } catch (error) {
        throw new Error('Invalid JSON body');
      }
    };

    try {
      const payload = await parsePayload();
      const result = await sendSMPPMessage(payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }

    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`SMS API server listening on port ${PORT}`);
  console.log('Use POST /send-sms with JSON body to send an SMS');
});