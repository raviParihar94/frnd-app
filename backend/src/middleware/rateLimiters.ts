import rateLimit from 'express-rate-limit';

// Coarse IP-based limiter on top of the phone-based cooldown in otp.service.ts.
// Two independent layers: this stops one IP hammering many phone numbers,
// the DB-backed cooldown stops one phone number being hammered from many IPs.
export const otpRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests from this network. Please try again later.' },
});

export const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP verification attempts. Please try again later.' },
});
