require('dotenv').config();
const nodemailer = require('nodemailer');

async function run() {
  console.log('--- DIAGNOSTIC ---');
  console.log('GMAIL_USER:', process.env.GMAIL_USER);
  console.log('PASSWORD LENGTH:', process.env.GMAIL_APP_PASSWORD ? process.env.GMAIL_APP_PASSWORD.length : 'NOT SET');

  // Step 1: Test Gmail
  console.log('\n[1] Testing Gmail SMTP...');
  const gmail = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    tls: { rejectUnauthorized: false }
  });

  try {
    await gmail.verify();
    console.log('[1] Gmail: CREDENTIALS ACCEPTED!');
    // Send test mail
    const info = await gmail.sendMail({
      from: `"Smart Athlete" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: 'DIAGNOSTIC - Reset Code Test',
      html: '<h2>Your test reset code: <span style="color:#FF6B6B;font-size:32px">847291</span></h2>'
    });
    console.log('[1] Gmail send SUCCESS! Message ID:', info.messageId);
  } catch (e) {
    console.log('[1] Gmail FAILED reason:', e.message);
    console.log('\n[2] Testing Ethereal fallback...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      console.log('[2] Ethereal account created:', testAccount.user);
      const ethereal = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass }
      });
      const info = await ethereal.sendMail({
        from: '"Smart Athlete" <noreply@smartathlete.dev>',
        to: process.env.GMAIL_USER,
        subject: 'Smart Athlete - Password Reset Code',
        html: '<div style="font-family:Arial;padding:32px"><h2>Your Reset Code</h2><p style="font-size:40px;color:#FF6B6B;font-weight:900;letter-spacing:8px">847291</p></div>'
      });
      console.log('[2] Ethereal send SUCCESS!');
      console.log('[2] >>> PREVIEW URL (open in browser) <<<');
      console.log(nodemailer.getTestMessageUrl(info));
    } catch (e2) {
      console.log('[2] Ethereal also FAILED:', e2.message);
    }
  }
}

run().catch(e => console.error('FATAL:', e.message));
