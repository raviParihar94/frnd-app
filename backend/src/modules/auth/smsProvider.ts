import { env } from '../../config/env';

export interface SmsProvider {
  sendOtp(phone: string, otp: string): Promise<void>;
}

/**
 * Dev/local default: logs the OTP instead of sending a real SMS, so the
 * whole auth flow (including verification) is runnable without any
 * third-party account. Swap SMS_PROVIDER in .env and implement the
 * corresponding class below to go live with MSG91 / Fast2SMS / Firebase.
 */
class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(phone: string, otp: string): Promise<void> {
    console.log(`[ConsoleSmsProvider] OTP for ${phone}: ${otp}`);
  }
}

/**
 * Example MSG91 implementation — fill in MSG91_AUTH_KEY / MSG91_TEMPLATE_ID
 * in .env and flip SMS_PROVIDER=msg91 to use it. Left as a documented stub
 * (throws until configured) rather than a silently-broken fake, since this
 * project intentionally ships with ConsoleSmsProvider as the working default.
 */
class Msg91SmsProvider implements SmsProvider {
  async sendOtp(phone: string, otp: string): Promise<void> {
    if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID) {
      throw new Error('MSG91_AUTH_KEY / MSG91_TEMPLATE_ID not configured');
    }
    const res = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: process.env.MSG91_AUTH_KEY,
      },
      body: JSON.stringify({
        template_id: process.env.MSG91_TEMPLATE_ID,
        mobile: phone.replace('+', ''),
        otp,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`MSG91 send failed (${res.status}): ${body}`);
    }
  }
}

export function getSmsProvider(): SmsProvider {
  switch (env.SMS_PROVIDER) {
    case 'msg91':
      return new Msg91SmsProvider();
    case 'console':
    default:
      return new ConsoleSmsProvider();
  }
}
